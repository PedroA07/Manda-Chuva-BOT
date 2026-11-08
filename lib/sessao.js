// Login com Discord (OAuth2, escopos identify e guilds). O bot troca o código pelo usuário e devolve pro site uma
// sessão assinada (HMAC): nada fica guardado no servidor, e trocar o DISCORD_TOKEN ou o segredo derruba todas as sessões.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SETE_DIAS = 7 * 864e5;
const DEZ_MIN = 600_000;
const DISCORD = 'https://discord.com/api/v10';

/** Chave das assinaturas (derivada dos segredos do bot, nunca sai dele) */
const chave = () => createHash('sha256').update(`mc-sessao:${process.env.SESSAO_SEGREDO ?? ''}:${process.env.DISCORD_CLIENT_SECRET ?? ''}:${process.env.DISCORD_TOKEN ?? ''}`).digest();

const b64 = (x) => Buffer.from(x).toString('base64url');
const assinar = (dados) => createHmac('sha256', chave()).update(dados).digest('base64url');

/** Junta os dados e a assinatura: <json em base64url>.<hmac> */
export function selar(obj) {
  const corpo = b64(JSON.stringify(obj));
  return `${corpo}.${assinar(corpo)}`;
}

/** Confere a assinatura e o prazo (campo exp). Devolve os dados, ou null */
export function abrir(selo, agora = Date.now()) {
  const [corpo, ass] = String(selo ?? '').split('.');
  if (!corpo || !ass) return null;
  const esperado = Buffer.from(assinar(corpo));
  const recebido = Buffer.from(ass);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  try {
    const obj = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return typeof obj?.exp === 'number' && obj.exp > agora ? obj : null;
  } catch {
    return null;
  }
}

/** Sessão do site: id, nome e avatar de quem entrou (vale 7 dias) */
export const criarSessao = (u, agora = Date.now()) => selar({ t: 's', id: u.id, nome: u.nome, usuario: u.usuario, avatar: u.avatar ?? null, exp: agora + SETE_DIAS });
export function lerSessao(token, agora = Date.now()) {
  const s = abrir(token, agora);
  return s?.t === 's' && /^\d{15,25}$/.test(s.id) ? s : null;
}

/** "state" do OAuth: pra onde voltar (o site), com prazo de 10 minutos */
export const criarEstado = (volta, agora = Date.now()) => selar({ t: 'e', volta, n: randomBytes(8).toString('hex'), exp: agora + DEZ_MIN });
export function lerEstado(estado, agora = Date.now()) {
  const e = abrir(estado, agora);
  return e?.t === 'e' && typeof e.volta === 'string' ? e : null;
}

/** Link do Discord pra pessoa autorizar */
export function linkDoDiscord({ clientId, redirect, estado }) {
  const q = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'identify guilds', redirect_uri: redirect, state: estado, prompt: 'none' });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** Troca o código pelo usuário do Discord. Devolve { id, nome, usuario, avatar, servidores: [{ id, permissoes }] } */
export async function trocarCodigo({ code, clientId, segredo, redirect }) {
  const r = await fetch(`${DISCORD}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: segredo, grant_type: 'authorization_code', code, redirect_uri: redirect }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`O Discord recusou o login (${r.status}).`);
  const { access_token: acesso } = await r.json();
  const pedir = async (caminho) => {
    const x = await fetch(`${DISCORD}${caminho}`, { headers: { Authorization: `Bearer ${acesso}` }, signal: AbortSignal.timeout(15_000) });
    if (!x.ok) throw new Error(`Não consegui ler sua conta do Discord (${x.status}).`);
    return x.json();
  };
  const [u, gs] = await Promise.all([pedir('/users/@me'), pedir('/users/@me/guilds').catch(() => [])]);
  return {
    id: u.id,
    nome: u.global_name || u.username,
    usuario: u.username,
    avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
    servidores: (Array.isArray(gs) ? gs : []).map((g) => ({ id: g.id, permissoes: g.permissions })),
  };
}

/** Só volta pra site liberado (PAINEL_ORIGENS ou localhost): evita usar o login pra mandar alguém pra outro lugar */
export function voltaPermitida(volta, origens) {
  try {
    const u = new URL(volta);
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.origin) || origens.includes(u.origin);
  } catch {
    return false;
  }
}

/** "state" do login da Steam (Meu perfil › Redes): quem pediu e pra onde voltar, 10 minutos */
export const criarEstadoSteam = (id, volta, agora = Date.now()) => selar({ t: 'st', id, volta, n: randomBytes(8).toString('hex'), exp: agora + DEZ_MIN });
export function lerEstadoSteam(estado, agora = Date.now()) {
  const e = abrir(estado, agora);
  return e?.t === 'st' && /^\d{15,25}$/.test(e.id) && typeof e.volta === 'string' ? e : null;
}
