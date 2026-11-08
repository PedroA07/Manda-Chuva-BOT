// API que a interface web (repositório Interface-Manda-Chuva-Bot) usa pra configurar o bot
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { criarEstado, criarSessao, lerEstado, lerSessao, linkDoDiscord, trocarCodigo, voltaPermitida } from './lib/sessao.js';
import { VERSAO } from './lib/versao.js';

const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ORIGEM_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
// Quem entra com a senha do painel (ou no PC sem senha) é admin; com o Discord, o bot vê o papel no servidor
const NIVEL = { membro: 1, staff: 2, admin: 3 };
const comStatus = (status, mensagem) => Object.assign(new Error(mensagem), { status });

/**
 * Sem senha: só aceita acesso do próprio PC (localhost).
 * Com senha: aceita acesso de fora, e a interface manda a senha no cabeçalho Authorization ("Bearer <senha>").
 * Login com Discord: a interface manda "Sessao <token>" (lib/sessao.js); precisa de DISCORD_CLIENT_SECRET.
 * origens: sites que podem chamar a API pelo navegador (CORS). Endereços localhost sempre podem.
 */
export function iniciarApi({ porta, senha, origens, api, silencioso = false }) {
  // [quem pode, ação(corpo, url, quem), antes de ler o corpo(quem)]
  const rotas = {
    'GET /api/eu': ['membro', (_, __, quem) => api.eu(quem)],
    'POST /api/eu/perfil': ['membro', (corpo, _, quem) => api.salvarPerfil(quem, corpo)],
    'POST /api/eu/anexo': ['membro', (corpo, _, quem) => api.anexoDoPerfil(quem, corpo), (quem) => api.podeEnviarAnexo(quem)],
    'POST /api/eu/favoritos': ['membro', (corpo, _, quem) => api.favorito(quem, corpo)],
    'GET /api/publico': ['membro', () => api.publico()],
    'GET /api/turma': ['membro', (_, url) => api.turma(url.searchParams)],
    'GET /api/estado': ['staff', (_, url) => api.estado(url.searchParams.get('servidor'))],
    'POST /api/salvar': ['staff', (corpo, _, quem) => api.salvar(corpo, quem)],
    'POST /api/enviar': ['staff', (corpo) => api.enviar(corpo?.canalId)],
    'POST /api/apagar': ['staff', (corpo) => api.apagar(corpo?.mensagemId)],
    'POST /api/anexo': ['staff', (corpo) => api.anexo(corpo)],
    'POST /api/portaria/testar': ['staff', (corpo) => api.testarPortaria(corpo?.evento)],
    'POST /api/aniversarios': ['staff', (corpo) => api.aniversario(corpo)],
    'GET /api/membros': ['staff', (_, url) => api.membros(url.searchParams)],
    'POST /api/membros/acao': ['staff', (corpo, _, quem) => api.acaoMembro(corpo, quem)],
    'POST /api/medalhas': ['staff', (corpo) => api.darMedalha(corpo)],
    'POST /api/ocorrencias/desfazer': ['staff', (corpo) => api.desfazer(corpo)],
    'POST /api/tickets/acao': ['staff', (corpo, _, quem) => api.ticketAcao(corpo, quem)],
    'POST /api/regras/enviar': ['staff', () => api.enviarRegras()],
    // Montar e renomear mexem no servidor inteiro: só quem gerencia o servidor (ou a senha do painel)
    'POST /api/servidor/montar': ['admin', () => api.montarServidor()],
    'POST /api/servidor/renomear': ['admin', () => api.renomearServidor()],
    'GET /api/servidor/andamento': ['staff', () => api.andamentoServidor()],
  };
  // Imagem em base64 (até 8 MB) fica maior que o limite normal
  const limites = { 'POST /api/anexo': 12_000_000, 'POST /api/eu/anexo': 12_000_000 };
  const permitida = (origem) => ORIGEM_LOCAL.test(origem) || origens.includes(origem);
  const segredo = () => process.env.DISCORD_CLIENT_SECRET ?? '';
  const clientId = () => process.env.DISCORD_CLIENT_ID || api.clientId?.() || null;
  const loginLigado = () => !!(segredo() && clientId());

  /** Quem está chamando: senha (admin) ou sessão do Discord (papel no servidor) */
  async function identificar(req) {
    const cab = String(req.headers.authorization ?? '');
    const token = /^Sessao (.+)$/.exec(cab)?.[1];
    if (token) {
      const s = lerSessao(token);
      if (!s) throw comStatus(401, 'Sua sessão acabou. Entre com o Discord de novo.');
      const papel = await api.papelDe?.(s.id);
      if (!papel) throw comStatus(403, 'Você não está no servidor do bot (ou ele está dormindo). Entre no servidor e tente de novo.');
      return { tipo: 'discord', id: s.id, nome: s.nome, usuario: s.usuario, avatar: s.avatar, papel };
    }
    if (senha && !senhaConfere(cab, senha)) throw comStatus(401, 'Senha errada.');
    return { tipo: 'senha', papel: 'admin' };
  }

  const servidor = createServer(async (req, res) => {
    try {
      // Sem senha, bloqueia qualquer endereço que não seja localhost (protege contra "DNS rebinding")
      const host = (req.headers.host ?? '').replace(/:\d+$/, '');
      if (!senha && !LOCAIS.has(host)) return responder(res, 403, { erro: 'Acesso negado.' });

      const origem = req.headers.origin;
      if (origem && permitida(origem)) {
        res.setHeader('Access-Control-Allow-Origin', origem);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(origem && permitida(origem) ? 204 : 403, {
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Painel',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }

      const url = new URL(req.url ?? '/', 'http://api');
      // A hospedagem usa pra ver se o bot está vivo (e o MANTER_ACORDADO também). login = o site pode mostrar "Entrar com Discord"
      // HEAD também: monitores de status (e o selo do README) perguntam só se está de pé
      if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/saude')) {
        if (req.method === 'HEAD') return res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end();
        return responder(res, 200, { ...api.saude(), versao: VERSAO, login: loginLigado() });
      }

      // ---------- Login com Discord (navegação do navegador, não é fetch) ----------
      if (req.method === 'GET' && url.pathname === '/auth/entrar') {
        const volta = String(url.searchParams.get('volta') ?? '').split('#')[0];
        if (!voltaPermitida(volta, origens)) return responder(res, 400, { erro: 'Endereço de volta não liberado no PAINEL_ORIGENS.' });
        if (!loginLigado()) return redirecionar(res, `${volta}#erro=login-desligado`);
        return redirecionar(res, linkDoDiscord({ clientId: clientId(), redirect: retorno(req), estado: criarEstado(volta) }));
      }
      if (req.method === 'GET' && url.pathname === '/auth/callback') {
        const e = lerEstado(url.searchParams.get('state'));
        // Aberto direto (sem o state do botão) ou depois de 10 min: página com o caminho de volta, não um JSON cru
        if (!e || !voltaPermitida(e.volta, origens)) {
          const texto = url.searchParams.has('state')
            ? 'Esse login demorou demais (o link vale 10 minutos).'
            : 'Esta página é só a volta do login do Discord: ela não abre sozinha.';
          return paginaDeVolta(res, texto);
        }
        if (url.searchParams.get('error') || !url.searchParams.get('code')) return redirecionar(res, `${e.volta}#erro=cancelado`);
        try {
          const u = await trocarCodigo({ code: url.searchParams.get('code'), clientId: clientId(), segredo: segredo(), redirect: retorno(req) });
          if (!(await api.papelDe?.(u.id))) return redirecionar(res, `${e.volta}#erro=fora-do-servidor`);
          return redirecionar(res, `${e.volta}#sessao=${criarSessao(u)}`);
        } catch (erro) {
          console.error('Login com Discord:', erro.message);
          return redirecionar(res, `${e.volta}#erro=discord`);
        }
      }

      // Imagens enviadas pelo painel: públicas (vão pro Discord de qualquer jeito) pra <img> conseguir mostrar
      const anexo = req.method === 'GET' && /^\/anexos\/([0-9a-f]{16})(\.\w+)?$/.exec(url.pathname);
      if (anexo) {
        const a = await api.lerAnexo?.(anexo[1]);
        if (!a) return responder(res, 404, { erro: 'Imagem não encontrada.' });
        res.writeHead(200, { 'Content-Type': a.tipo, 'Cache-Control': 'public, max-age=86400, immutable' });
        return res.end(a.buffer);
      }

      // Banner e foto de perfil que vêm de link: o site mostra por aqui, e não direto do link, pra quem escolheu a imagem
      // não conseguir ver o IP de quem abre a lista de membros
      const doPerfil = req.method === 'GET' && /^\/perfis\/(\d{15,25})\/(banner|foto)$/.exec(url.pathname);
      if (doPerfil) {
        const a = await api.imagemDoPerfil?.(doPerfil[1], doPerfil[2]);
        if (!a) return responder(res, 404, { erro: 'Imagem não encontrada.' });
        res.writeHead(200, { 'Content-Type': a.tipo, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        return res.end(a.buffer);
      }

      // Banners "Eventos" com a placa desenhada pelo bot (nome do servidor de verdade)
      const placa = req.method === 'GET' && /^\/placas\/([a-z]+)\.jpg$/.exec(url.pathname);
      if (placa) {
        const jpg = await api.placa?.(placa[1]);
        if (!jpg) return responder(res, 404, { erro: 'Placa não encontrada.' });
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' });
        return res.end(jpg);
      }

      const chave = `${req.method} ${url.pathname}`;
      const rota = rotas[chave];
      if (!rota) return responder(res, 404, { erro: 'Não encontrado.' });
      if (origem && !permitida(origem)) return responder(res, 403, { erro: `O site ${origem} não está no PAINEL_ORIGENS do bot.` });
      // Cabeçalho próprio: um site qualquer aberto no navegador não consegue chamar a API
      if (req.headers['x-painel'] !== '1') return responder(res, 403, { erro: 'Requisição bloqueada.' });
      const quem = await identificar(req);
      const [precisa, acao, antes] = rota;
      if (NIVEL[quem.papel] < NIVEL[precisa]) return responder(res, 403, { erro: 'Essa parte é só pra staff.' });
      antes?.(quem);
      const corpo = req.method === 'POST' ? await lerCorpo(req, limites[chave]) : null;
      responder(res, 200, await acao(corpo, url, quem));
    } catch (erro) {
      if (!erro.status) console.error(erro);
      responder(res, erro.status ?? 500, { erro: erro.message ?? 'Erro interno.' });
    }
  });

  servidor.on('error', (erro) => console.error(`❌ Não consegui abrir a API na porta ${porta}:`, erro.message));
  servidor.listen(porta, senha ? '0.0.0.0' : '127.0.0.1', () => {
    if (silencioso) return;
    console.log(`🖥️  API do painel: http://localhost:${porta}${senha ? ' (com senha, aceita acesso de fora)' : ' (sem senha, só deste computador)'}`);
    if (origens.length) console.log(`🌐 Sites liberados: ${origens.join(', ')}`);
    if (!segredo()) console.log('🔑 Login com Discord desligado: defina DISCORD_CLIENT_SECRET pra ligar.');
  });
  return servidor;
}

/** Endereço do /auth/callback (precisa estar nos Redirects do OAuth2 no Developer Portal) */
function retorno(req) {
  const base = process.env.URL_PUBLICA || process.env.RENDER_EXTERNAL_URL || `http://${req.headers.host}`;
  return new URL('/auth/callback', base).href;
}

/** Página simples (no visual do painel) com o botão pra voltar e entrar de novo */
function paginaDeVolta(res, texto) {
  const painel = process.env.URL_PAINEL_PAGINA || 'https://pedroa07.github.io/Interface-Manda-Chuva-Bot/painel.html';
  res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Manda Chuva · login</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1f2a5c;font:500 16px/1.5 system-ui,sans-serif;color:#1b1f33">
<div style="max-width:420px;margin:20px;padding:28px;background:#fffcf4;border:3px solid #1b1f33;border-radius:18px;box-shadow:8px 8px 0 #0e1430;display:grid;gap:14px">
<b style="font-size:22px">Quase lá!</b><span>${texto} Volte pro painel e clique em <b>Entrar com Discord</b>.</span>
<a href="${painel}" style="padding:12px;text-align:center;background:#5865f2;color:#fff;border:2px solid #1b1f33;border-radius:12px;font-weight:800;text-decoration:none">Voltar pro painel</a>
</div></body></html>`);
}

function redirecionar(res, para) {
  res.writeHead(302, { Location: para, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end();
}

function responder(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}

function senhaConfere(cabecalho, senha) {
  const recebida = /^Bearer (.+)$/.exec(String(cabecalho ?? ''))?.[1];
  if (!recebida) return false;
  const resumo = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(resumo(recebida), resumo(senha));
}

function lerCorpo(req, limite = 1_000_000) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > limite) {
        reject(Object.assign(new Error('Requisição grande demais.'), { status: 413 }));
        req.destroy();
      } else partes.push(parte);
    });
    req.on('end', () => {
      try {
        resolve(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
