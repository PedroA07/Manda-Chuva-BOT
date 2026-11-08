// API que a interface web (repositório Interface-Manda-Chuva-Bot) usa pra configurar o bot
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { noServidor } from './lib/contexto.js';
import { conferirSteam, linkDaSteam } from './lib/redes.js';
import { confirmarConvite, criarEstado, criarEstadoConvite, criarEstadoSteam, criarSessao, lerEstado, lerEstadoConvite, lerEstadoSteam, lerSessao, linkDoConvite, linkDoDiscord, trocarCodigo, voltaPermitida } from './lib/sessao.js';
import { VERSAO } from './lib/versao.js';

const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ORIGEM_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
// Quem entra com a senha do painel (ou no PC sem senha) é admin; com o Discord, o bot vê o papel no servidor da vez.
// qualquer = só precisa estar logado (a lista de servidores da pessoa)
const NIVEL = { qualquer: 0, membro: 1, staff: 2, admin: 3 };
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
    // Servidores do bot em que a pessoa está, com o papel em cada um (o seletor do topo do painel)
    'GET /api/servidores': ['qualquer', (_, __, quem) => (quem.tipo === 'senha' ? api.servidoresDe?.(null) : api.servidoresDe?.(quem.id)) ?? []],
    'GET /api/eu': ['membro', (_, __, quem) => api.eu(quem)],
    'POST /api/eu/perfil': ['membro', (corpo, _, quem) => api.salvarPerfil(quem, corpo)],
    'POST /api/eu/anexo': ['membro', (corpo, _, quem) => api.anexoDoPerfil(quem, corpo), (quem) => api.podeEnviarAnexo(quem)],
    'POST /api/eu/favoritos': ['membro', (corpo, _, quem) => api.favorito(quem, corpo)],
    // Vincular: o mesmo perfil em vários servidores ({ on })
    'POST /api/eu/vinculo': ['membro', (corpo, _, quem) => api.vincularPerfil(quem, corpo)],
    'GET /api/favoritos/sugestoes': ['membro', (_, url, quem) => api.sugestoesDeFavorito(quem, url.searchParams)],
    // Redes: Letterboxd e Instagram pelo nome; Steam pelo login da própria Steam (volta em /auth/steam/volta)
    'POST /api/eu/redes': ['membro', (corpo, _, quem) => api.rede(quem, corpo)],
    'POST /api/eu/redes/steam': ['membro', (corpo, _, quem) => {
      if (quem.tipo !== 'discord') throw comStatus(400, 'Entre com o Discord pra ter perfil.');
      const volta = String(corpo?.volta ?? '').split('#')[0];
      if (!voltaPermitida(volta, origens)) throw comStatus(400, 'Endereço de volta não liberado no PAINEL_ORIGENS.');
      return { link: linkDaSteam(`${voltaDaSteam()}?estado=${encodeURIComponent(criarEstadoSteam(quem.id, volta))}`) };
    }],
    'GET /api/redes': ['membro', (_, url) => api.cartoesDe(url.searchParams.get('id'))],
    'GET /api/publico': ['membro', () => api.publico()],
    'GET /api/turma': ['membro', (_, url) => api.turma(url.searchParams)],
    'GET /api/estado': ['staff', () => api.estado()],
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
    // Copiar a config de outro servidor que a pessoa também gerencia (só mostra; vale no Salvar)
    'POST /api/servidor/copiar': ['admin', (corpo, _, quem) => api.copiarConfig(corpo, quem)],
  };
  // Imagem em base64 (até 8 MB) fica maior que o limite normal
  const limites = { 'POST /api/anexo': 12_000_000, 'POST /api/eu/anexo': 12_000_000 };
  const permitida = (origem) => ORIGEM_LOCAL.test(origem) || origens.includes(origem);
  const segredo = () => process.env.DISCORD_CLIENT_SECRET ?? '';
  const clientId = () => process.env.DISCORD_CLIENT_ID || api.clientId?.() || null;
  const loginLigado = () => !!(segredo() && clientId());
  // Volta do login da Steam: endereço público do bot (o mesmo que a Steam devolve no openid.return_to)
  const voltaDaSteam = () => new URL('/auth/steam/volta', process.env.URL_PUBLICA || process.env.RENDER_EXTERNAL_URL || `http://localhost:${porta}`).href;

  /** Quem está chamando: senha (admin) ou sessão do Discord (papel no servidor da vez; livre = só precisa estar logado) */
  async function identificar(req, livre = false) {
    const cab = String(req.headers.authorization ?? '');
    const token = /^Sessao (.+)$/.exec(cab)?.[1];
    if (token) {
      const s = lerSessao(token);
      if (!s) throw comStatus(401, 'Sua sessão acabou. Entre com o Discord de novo.');
      const papel = livre ? 'membro' : await api.papelDe?.(s.id);
      if (!papel) throw comStatus(403, 'Você não está nesse servidor (ou o bot está dormindo). Escolha outro lá em cima ou tente de novo.');
      return { tipo: 'discord', id: s.id, nome: s.nome, usuario: s.usuario, avatar: s.avatar, papel };
    }
    if (senha && !senhaConfere(cab, senha)) throw comStatus(401, 'Senha errada.');
    return { tipo: 'senha', papel: 'admin' };
  }

  /** Atende um pedido, já dentro do servidor escolhido (lib/contexto.js) */
  async function atender(req, res, url, origem) {
    // A hospedagem usa pra ver se o bot está vivo (e o MANTER_ACORDADO também). login = o site pode mostrar "Entrar com Discord"
    // HEAD também: monitores de status (e o selo do README) perguntam só se está de pé
    if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/saude')) {
      if (req.method === 'HEAD') return res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end();
      return responder(res, 200, { ...api.saude(), versao: VERSAO, login: loginLigado() });
    }

    // ---------- Convite do bot (navegação do navegador): monta o link do Discord na hora ----------
    if (req.method === 'GET' && url.pathname === '/convite') {
      const d = api.dadosDoConvite?.();
      if (!d) return pagina(res, 503, 'O bot está acordando', 'Na hospedagem grátis ele leva até 1 minuto pra acordar. Atualize esta página daqui a pouco.');
      // Sem o segredo do OAuth não dá pra confirmar o código: vai o link simples
      if (!loginLigado()) return redirecionar(res, linkDoConvite(d));
      return redirecionar(res, linkDoConvite({ ...d, redirect: retorno(req), estado: criarEstadoConvite() }));
    }

    // ---------- Login com Discord (navegação do navegador, não é fetch) ----------
    if (req.method === 'GET' && url.pathname === '/auth/entrar') {
      const volta = String(url.searchParams.get('volta') ?? '').split('#')[0];
      if (!voltaPermitida(volta, origens)) return responder(res, 400, { erro: 'Endereço de volta não liberado no PAINEL_ORIGENS.' });
      if (!loginLigado()) return redirecionar(res, `${volta}#erro=login-desligado`);
      return redirecionar(res, linkDoDiscord({ clientId: clientId(), redirect: retorno(req), estado: criarEstado(volta) }));
    }
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      // Volta de um convite (o Discord manda guild_id junto quando o bot foi autorizado num servidor)
      if (lerEstadoConvite(url.searchParams.get('state')) || url.searchParams.has('guild_id')) return await voltaDoConvite(req, res, url);
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
        const algum = api.servidoresDe ? (await api.servidoresDe(u.id)).length > 0 : !!(await api.papelDe?.(u.id));
        if (!algum) return redirecionar(res, `${e.volta}#erro=fora-do-servidor`);
        return redirecionar(res, `${e.volta}#sessao=${criarSessao(u)}`);
      } catch (erro) {
        console.error('Login com Discord:', erro.message);
        return redirecionar(res, `${e.volta}#erro=discord`);
      }
    }

    // ---------- Volta do login da Steam (Meu perfil › Redes) ----------
    if (req.method === 'GET' && url.pathname === '/auth/steam/volta') {
      const e = lerEstadoSteam(url.searchParams.get('estado'));
      if (!e || !voltaPermitida(e.volta, origens)) return paginaDeVolta(res, 'Esse login da Steam demorou demais (o link vale 10 minutos).', 'vá em <b>Meu perfil › Redes</b> e clique em <b>Conectar com Steam</b> de novo');
      const steamid = await conferirSteam(url.searchParams, voltaDaSteam());
      if (!steamid) return redirecionar(res, `${e.volta}#redes=steam-erro`);
      await api.ligarSteam?.(e.id, steamid);
      return redirecionar(res, `${e.volta}#redes=steam-ok`);
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
    const [precisa, acao, antes] = rota;
    const quem = await identificar(req, precisa === 'qualquer');
    if (NIVEL[quem.papel] < NIVEL[precisa]) return responder(res, 403, { erro: 'Essa parte é só pra staff.' });
    antes?.(quem);
    const corpo = req.method === 'POST' ? await lerCorpo(req, limites[chave]) : null;
    responder(res, 200, await acao(corpo, url, quem));
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
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Painel, X-Servidor',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }

      const url = new URL(req.url ?? '/', 'http://api');
      // Qual servidor: o painel manda X-Servidor; imagem de perfil e placa vêm com ?s=. Sem nenhum: o servidor padrão.
      const pedido = String(req.headers['x-servidor'] ?? url.searchParams.get('s') ?? url.searchParams.get('servidor') ?? '').trim();
      if (pedido && (!/^\d{15,25}$/.test(pedido) || api.temServidor?.(pedido) === false)) return responder(res, 404, { erro: 'O bot não está nesse servidor.' });
      return await noServidor(pedido || null, () => atender(req, res, url, origem));
    } catch (erro) {
      if (!erro.status) console.error(erro);
      responder(res, erro.status ?? 500, { erro: erro.message ?? 'Erro interno.' });
    }
  });

  /** Depois do "Autorizar" do convite: confirma com o Discord e conta em que servidor o bot entrou */
  async function voltaDoConvite(req, res, url) {
    if (!lerEstadoConvite(url.searchParams.get('state'))) return pagina(res, 400, 'Convite vencido', 'Esse convite demorou demais (o link vale 10 minutos). Clique em <b>Adicionar ao Discord</b> de novo.');
    const code = url.searchParams.get('code');
    if (url.searchParams.get('error') || !code) return pagina(res, 200, 'Convite cancelado', 'Nada mudou. Quando quiser, é só clicar em <b>Adicionar ao Discord</b> de novo.');
    let confirmado = null;
    try {
      confirmado = await confirmarConvite({ code, clientId: clientId(), segredo: segredo(), redirect: retorno(req) });
    } catch (erro) {
      console.error('Convite:', erro.message);
    }
    const id = confirmado?.id ?? url.searchParams.get('guild_id');
    const info = /^\d{15,25}$/.test(id ?? '') ? await api.servidorDoConvite?.(id) : null;
    if (!info && !confirmado) return pagina(res, 502, 'Não deu certo', 'O Discord não confirmou o convite. Tente de novo daqui a pouco.');
    const nome = `<b>${esc(info?.nome || confirmado?.nome || 'seu servidor')}</b>`;
    return pagina(res, 200, 'Chegou na resenha!', `O Manda Chuva entrou em ${nome} e já está funcionando lá, com a configuração dele separada dos outros servidores. Abra o painel e escolha ${nome} no seletor lá em cima pra configurar as cores, as boas-vindas e o resto (ou copiar a configuração de outro servidor).`, ['Abrir o painel', PAINEL()]);
  }

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

const PAINEL = () => process.env.URL_PAINEL_PAGINA || 'https://pedroa07.github.io/Interface-Manda-Chuva-Bot/painel.html';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Página simples (no visual do painel): título, texto e um botão */
function pagina(res, status, titulo, texto, [rotulo, link] = ['Voltar pro painel', PAINEL()]) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Manda Chuva · ${esc(titulo)}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1f2a5c;font:500 16px/1.5 system-ui,sans-serif;color:#1b1f33">
<div style="max-width:420px;margin:20px;padding:28px;background:#fffcf4;border:3px solid #1b1f33;border-radius:18px;box-shadow:8px 8px 0 #0e1430;display:grid;gap:14px">
<b style="font-size:22px">${esc(titulo)}</b><span>${texto}</span>
<a href="${esc(link)}" style="padding:12px;text-align:center;background:#5865f2;color:#fff;border:2px solid #1b1f33;border-radius:12px;font-weight:800;text-decoration:none">${esc(rotulo)}</a>
</div></body></html>`);
}

/** Login que voltou errado: página com o caminho de volta */
const paginaDeVolta = (res, texto, acao = 'clique em <b>Entrar com Discord</b>') => pagina(res, 400, 'Quase lá!', `${texto} Volte pro painel e ${acao}.`);

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
