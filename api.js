// API que a interface web (repositório Interface-Manda-Chuva-Bot) usa pra configurar o bot
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { VERSAO } from './lib/versao.js';

const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ORIGEM_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Sem senha: só aceita acesso do próprio PC (localhost).
 * Com senha: aceita acesso de fora, e a interface manda a senha no cabeçalho Authorization.
 * origens: sites que podem chamar a API pelo navegador (CORS). Endereços localhost sempre podem.
 */
export function iniciarApi({ porta, senha, origens, api, silencioso = false }) {
  const rotas = {
    'GET /api/estado': (_, url) => api.estado(url.searchParams.get('servidor')),
    'POST /api/salvar': (corpo) => api.salvar(corpo),
    'POST /api/enviar': (corpo) => api.enviar(corpo?.canalId),
    'POST /api/apagar': (corpo) => api.apagar(corpo?.mensagemId),
  };
  const permitida = (origem) => ORIGEM_LOCAL.test(origem) || origens.includes(origem);

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
      // A hospedagem usa pra ver se o bot está vivo (e o MANTER_ACORDADO também)
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/saude')) return responder(res, 200, { ...api.saude(), versao: VERSAO });

      const rota = rotas[`${req.method} ${url.pathname}`];
      if (!rota) return responder(res, 404, { erro: 'Não encontrado.' });
      if (origem && !permitida(origem)) return responder(res, 403, { erro: `O site ${origem} não está no PAINEL_ORIGENS do bot.` });
      // Cabeçalho próprio: um site qualquer aberto no navegador não consegue chamar a API
      if (req.headers['x-painel'] !== '1') return responder(res, 403, { erro: 'Requisição bloqueada.' });
      if (senha && !senhaConfere(req.headers.authorization, senha)) return responder(res, 401, { erro: 'Senha errada.' });
      const corpo = req.method === 'POST' ? await lerCorpo(req) : null;
      responder(res, 200, await rota(corpo, url));
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
  });
  return servidor;
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

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > 1_000_000) {
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
