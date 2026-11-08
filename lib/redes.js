// Redes de Meu perfil (v12). Sem nada do dono do bot: Letterboxd pelo RSS público, Instagram só com o nome (vira link)
// e Steam pelo login da própria Steam (OpenID: prova que a conta é da pessoa) + o perfil público.
// Com STEAM_API_KEY a Steam também mostra nível, quantidade de jogos e os recentes.
// - Twitch (app do dono, TWITCH_*; sem ele, aparece desligada): login da própria Twitch (prova que o canal é da pessoa;
//   o token é jogado fora) + dados públicos do canal.
// - Spotify: sem API nenhuma. Desde março de 2026 o modo de desenvolvimento da API do Spotify não tem mais perfil nem
//   playlists de outra pessoa (e exige Premium do dono). Então: o link do perfil (nome e foto pela prévia pública da
//   página, como qualquer prévia de link) + o que a pessoa está ouvindo, pelo status "Ouvindo Spotify" do Discord.
import * as dados from '../dados.js';

export const NOMES_REDES = { steam: 'Steam', spotify: 'Spotify', letterboxd: 'Letterboxd', instagram: 'Instagram', twitch: 'Twitch' };
export const REDES_POR_NOME = ['letterboxd', 'instagram']; // a pessoa digita o usuário (perfil público)
export const USUARIO_VALIDO = /^[A-Za-z0-9_.]{2,30}$/;

const AGENTE = 'MandaChuvaBot/1.0 (+https://pedroa07.github.io/Interface-Manda-Chuva-Bot/)';
const tirarCdata = (s) => s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
const entidades = (s) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function tag(xml, nome) {
  const m = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(xml);
  return m ? entidades(tirarCdata(m[1].trim())) : null;
}
const numero = (t) => Number(String(t ?? '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) || 0;

/** "★★★★½" */
export const estrelas = (n) => (n == null ? '' : '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : ''));

/** RSS do diário do Letterboxd → { filmes: [{ titulo, ano, nota, visto, poster }], media, esteAno } */
export function lerRssLetterboxd(xml, anoAtual) {
  const filmes = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, it]) => ({
      titulo: tag(it, 'letterboxd:filmTitle'),
      ano: Number(tag(it, 'letterboxd:filmYear')) || null,
      nota: tag(it, 'letterboxd:memberRating') == null ? null : Number(tag(it, 'letterboxd:memberRating')),
      visto: tag(it, 'letterboxd:watchedDate'),
      poster: /<img src="(https:\/\/a\.ltrbxd\.com\/[^"]+)"/.exec(it)?.[1] ?? null,
    }))
    .filter((f) => f.titulo);
  const notas = filmes.map((f) => f.nota).filter((n) => n != null);
  return {
    filmes,
    media: notas.length ? Math.round((notas.reduce((a, n) => a + n, 0) / notas.length) * 10) / 10 : null,
    esteAno: filmes.filter((f) => f.visto?.startsWith(String(anoAtual))).length,
  };
}

/** Perfil público da Steam (XML) → { nome, avatar, publico, jogando, jogos: [{ nome, horas, capa }] } */
export function lerXmlSteam(xml) {
  const s = String(xml);
  if (!/<profile>/.test(s)) return null;
  const jogos = [...s.matchAll(/<mostPlayedGame>([\s\S]*?)<\/mostPlayedGame>/g)]
    .map(([, g]) => ({ nome: tag(g, 'gameName'), horas: numero(tag(g, 'hoursOnRecord')), capa: tag(g, 'gameLogo') }))
    .filter((j) => j.nome);
  // jogando: nome do jogo aberto agora ('' se não diz qual), ou null fora de jogo
  const jogando = tag(s, 'onlineState') === 'in-game' ? (tag(/<inGameInfo>([\s\S]*?)<\/inGameInfo>/.exec(s)?.[1] ?? '', 'gameName') ?? '') : null;
  return { nome: tag(s, 'steamID'), avatar: tag(s, 'avatarFull'), publico: tag(s, 'privacyState') === 'public', jogando, jogos };
}

// ---------- Login da Steam (OpenID 2.0) ----------
/** Endereço do login da Steam que volta pra "volta" */
export function linkDaSteam(volta) {
  const u = new URL('https://steamcommunity.com/openid/login');
  u.search = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup', 'openid.return_to': volta, 'openid.realm': new URL(volta).origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select', 'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  }).toString();
  return u.href;
}

/** Confere com a própria Steam que a volta é verdadeira (e é pra cá). Devolve o SteamID64 ou null. */
export async function conferirSteam(params, voltaEsperada, buscar = fetch) {
  const p = Object.fromEntries([...params].filter(([k]) => k.startsWith('openid.')));
  if (p['openid.mode'] !== 'id_res' || !String(p['openid.return_to'] ?? '').startsWith(voltaEsperada)) return null;
  const id = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(p['openid.claimed_id'] ?? '')?.[1];
  if (!id) return null;
  try {
    const r = await buscar('https://steamcommunity.com/openid/login', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENTE },
      body: new URLSearchParams({ ...p, 'openid.mode': 'check_authentication' }).toString(), signal: AbortSignal.timeout(10_000),
    });
    return r.ok && /is_valid\s*:\s*true/.test(await r.text()) ? id : null;
  } catch {
    return null;
  }
}

// ---------- Apps do dono (Spotify e Twitch) ----------
// O Spotify não precisa de chave (veja o topo); fica a função pra o site saber que dá pra ligar
export const temSpotify = () => true;
export const temTwitch = () => !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
const formulario = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENTE };

// Token do próprio app (sem login de ninguém), guardado até perto de vencer
const tokens = new Map();
async function tokenDoApp(nome, pedir, buscar) {
  const t = tokens.get(nome);
  if (t && t.ate > Date.now()) return t.valor;
  const r = await pedir(buscar);
  const j = r.ok ? await r.json() : null;
  if (!j?.access_token) return null;
  tokens.set(nome, { valor: j.access_token, ate: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000 });
  return j.access_token;
}
const tokenTwitch = (buscar) =>
  tokenDoApp('twitch', (b) => b('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: formulario, signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }).toString(),
  }), buscar);
/** Só pros testes */
export const esquecerTokens = () => tokens.clear();

/** GET com cabeçalhos; 404 = null; outro erro = joga (a rede não respondeu) */
async function pedirJson(buscar, url, headers) {
  const r = await buscar(url, { headers: { 'User-Agent': AGENTE, ...headers }, signal: AbortSignal.timeout(8000) });
  if (r.status === 401) tokens.clear(); // token venceu antes da hora: o próximo pedido pega outro
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`respondeu ${r.status}`);
  return r.json();
}
const mil = (n) => Number(n ?? 0).toLocaleString('pt-BR');

// ---------- Twitch: login (prova que o canal é da pessoa) ----------
export function linkDaTwitch({ clientId, redirect, estado }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: '', state: estado, force_verify: 'true' });
  return `https://id.twitch.tv/oauth2/authorize?${q}`;
}

/** Troca o código da volta pela conta { id, user, nome }. O token não fica guardado (é revogado na hora). null se falhar. */
export async function contaDaTwitch({ code, redirect }, buscar = fetch) {
  try {
    const r = await buscar('https://id.twitch.tv/oauth2/token', {
      method: 'POST', headers: formulario, signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirect }).toString(),
    });
    if (!r.ok) return null;
    const { access_token: token } = await r.json();
    const u = await pedirJson(buscar, 'https://api.twitch.tv/helix/users', { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` });
    buscar('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: formulario, body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, token }).toString() }).catch(() => {});
    const d = u?.data?.[0];
    return d?.id ? { id: String(d.id), user: d.login, nome: d.display_name || d.login } : null;
  } catch {
    return null;
  }
}

// ---------- Spotify: perfil pelo link ----------
/** Id do perfil a partir do link (open.spotify.com/user/<id>), do URI (spotify:user:<id>) ou do próprio id. null se não parece um. */
export function idDoSpotify(texto) {
  const t = String(texto ?? '').trim();
  const m = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?user\/([^/?#\s]+)/i.exec(t) ?? /^spotify:user:([^\s:]+)$/i.exec(t);
  let id = m ? m[1] : t;
  try {
    id = decodeURIComponent(id);
  } catch {}
  return /^[A-Za-z0-9._-]{1,64}$/.test(id) ? id : null;
}

const meta = (html, prop) => {
  const m = new RegExp(`<meta[^>]+property="og:${prop}"[^>]+content="([^"]*)"`).exec(html) ?? new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="og:${prop}"`).exec(html);
  return m ? entidades(m[1]) : null;
};
/**
 * Perfil público { id, nome, foto } pela prévia da página (a mesma que o Discord e o WhatsApp mostram num link).
 * null se o perfil não existe. Joga erro se o Spotify não responder.
 */
export async function perfilSpotify(id, buscar = fetch) {
  const r = await buscar(`https://open.spotify.com/user/${encodeURIComponent(id)}`, { headers: { 'User-Agent': AGENTE, Accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`o Spotify respondeu ${r.status}`);
  const html = await r.text();
  if (meta(html, 'type') !== 'profile') return null;
  const foto = meta(html, 'image');
  return { id, nome: meta(html, 'title') || id, foto: foto && /^https:\/\/[^/]*(scdn\.co|spotifycdn\.com)\//.test(foto) ? foto : null };
}

// ---------- Spotify pelo status do Discord ("Ouvindo Spotify") ----------
// Só de quem ligou o Spotify no perfil. A música de agora fica na memória; as últimas 5 vão pro ouvidas.json (de todos os servidores).
const MAX_OUVIDAS = 5;
const tocando = new Map(); // userId -> { id, t, artista, capa, desde }
let ouvidas = null;
let ouvidasMudou = false;
function lerOuvidas() {
  if (!ouvidas) {
    try {
      ouvidas = JSON.parse(dados.lerExtra('ouvidas.json') ?? '{}');
    } catch {
      ouvidas = {};
    }
  }
  return ouvidas;
}

/** A música da atividade "Ouvindo Spotify" do Discord → { id, t, artista, capa } ou null */
export function faixaDoStatus(atividades) {
  const a = [...(atividades ?? [])].find((x) => x?.type === 2 && x.name === 'Spotify' && x.syncId);
  if (!a) return null;
  const img = /^spotify:([A-Za-z0-9]+)$/.exec(a.assets?.largeImage ?? '')?.[1];
  return { id: a.syncId, t: a.details || 'Música', artista: String(a.state ?? '').replace(/;\s*/g, ', '), capa: img ? `https://i.scdn.co/image/${img}` : null };
}

/** O status mudou: guarda a de agora e, quando muda de música, ela entra nas últimas ouvidas */
export function mudouOuvindo(userId, faixa, agora = Date.now()) {
  if (!faixa) return void tocando.delete(userId);
  if (tocando.get(userId)?.id === faixa.id) return;
  tocando.set(userId, { ...faixa, desde: agora });
  const lista = lerOuvidas()[userId] ?? [];
  lerOuvidas()[userId] = [{ ...faixa, quando: agora }, ...lista.filter((x) => x.id !== faixa.id)].slice(0, MAX_OUVIDAS);
  ouvidasMudou = true;
}
export const ouvindoAgora = (userId) => tocando.get(userId) ?? null;
export const ultimasOuvidas = (userId) => lerOuvidas()[userId] ?? [];
/** Desligou o Spotify ou apagou os dados */
export function esquecerOuvidas(userId) {
  tocando.delete(userId);
  if (lerOuvidas()[userId]) {
    delete lerOuvidas()[userId];
    ouvidasMudou = true;
  }
}
/** Grava as últimas ouvidas, se mudou (junto dos contadores, a cada 10 min) */
export async function gravarOuvidas() {
  if (!ouvidasMudou) return null;
  ouvidasMudou = false;
  return dados.gravarExtras({ 'ouvidas.json': JSON.stringify(lerOuvidas()) });
}
/** Só pros testes */
export function zerarOuvidas() {
  tocando.clear();
  ouvidas = {};
  ouvidasMudou = false;
}

// ---------- Dados de cada rede (o cartão que o site e o /redes mostram) ----------
async function texto(buscar, url) {
  const r = await buscar(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(8000) });
  return r.ok ? r.text() : null;
}
async function json(buscar, url) {
  const r = await buscar(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(8000) });
  return r.ok ? r.json() : null;
}
const horas = (min) => Math.round(min / 60).toLocaleString('pt-BR');

async function cartaoLetterboxd(buscar, user, ano) {
  const xml = await texto(buscar, `https://letterboxd.com/${encodeURIComponent(user)}/rss/`);
  if (!xml) return { status: 'NÃO ACHEI', aviso: 'Não achei esse perfil no Letterboxd (ele precisa ser público).', stats: [], itens: [] };
  const l = lerRssLetterboxd(xml, ano);
  return {
    status: `${l.filmes.length}${l.filmes.length >= 50 ? '+' : ''} FILMES`,
    stats: [[`${l.filmes.length}${l.filmes.length >= 50 ? '+' : ''}`, 'no diário'], [String(l.esteAno), 'este ano'], [l.media == null ? '—' : String(l.media).replace('.', ','), 'nota média']],
    itens: l.filmes.slice(0, 4).map((f) => ({ t: f.titulo, src: f.poster, s: estrelas(f.nota), nota: f.nota })),
  };
}

/**
 * Cápsula deitada (231x87) de cada jogo: os jogos novos têm um código no caminho da imagem, que só essa API da loja diz
 * (sem chave). Map appid -> endereço.
 */
async function capsulasDaSteam(buscar, appids) {
  if (!appids.length) return new Map();
  const pedido = { ids: appids.map((appid) => ({ appid })), context: { language: 'brazilian', country_code: 'BR' }, data_request: { include_assets: true } };
  const g = await json(buscar, `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(pedido))}`);
  const mapa = new Map();
  for (const s of g?.response?.store_items ?? []) {
    const a = s.assets ?? {};
    const arquivo = a.small_capsule ?? a.header;
    if (arquivo && a.asset_url_format) mapa.set(s.appid ?? s.id, `https://shared.akamai.steamstatic.com/store_item_assets/${a.asset_url_format.replace('${FILENAME}', arquivo).replace(/\?.*$/, '')}`);
  }
  return mapa;
}

async function cartaoSteam(buscar, id, chave) {
  const perfil = lerXmlSteam(await texto(buscar, `https://steamcommunity.com/profiles/${id}?xml=1`));
  if (!perfil) return { status: 'STEAM', aviso: 'A Steam não respondeu agora. Tenta de novo mais tarde.', stats: [], itens: [] };
  const base = { perfilNome: perfil.nome, status: perfil.jogando != null ? 'JOGANDO' : 'STEAM' };
  if (chave) {
    const k = encodeURIComponent(chave);
    const [nivel, donos, recentes] = await Promise.all([
      json(buscar, `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${k}&steamid=${id}`).catch(() => null),
      json(buscar, `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${k}&steamid=${id}`).catch(() => null),
      json(buscar, `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${k}&steamid=${id}&count=3`).catch(() => null),
    ]);
    const jogos = donos?.response?.games ?? [];
    if (donos?.response?.game_count != null) {
      const ultimos = (recentes?.response?.games ?? []).slice(0, 3);
      const capsulas = await capsulasDaSteam(buscar, ultimos.map((g) => g.appid)).catch(() => new Map());
      return {
        ...base,
        stats: [[String(nivel?.response?.player_level ?? '—'), 'nível'], [String(donos.response.game_count), 'jogos'], [`${horas(jogos.reduce((a, g) => a + (g.playtime_forever ?? 0), 0))} h`, 'total']],
        itens: ultimos.map((g) => ({ t: g.name, src: capsulas.get(g.appid) ?? `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/capsule_184x69.jpg`, s: `${horas(g.playtime_forever ?? 0)} h` })),
        rotulo: 'JOGADOS RECENTEMENTE',
      };
    }
  }
  if (!perfil.publico) return { ...base, status: 'PERFIL FECHADO', aviso: 'O perfil da Steam está fechado. Abre a privacidade dos jogos pra aparecer aqui.', stats: [], itens: [] };
  return {
    ...base,
    stats: perfil.jogos.length ? [[`${perfil.jogos.reduce((a, j) => a + j.horas, 0).toLocaleString('pt-BR')} h`, 'nos favoritos']] : [],
    itens: perfil.jogos.slice(0, 3).map((j) => ({ t: j.nome, src: j.capa, s: `${j.horas.toLocaleString('pt-BR')} h` })),
    rotulo: 'MAIS JOGADOS',
  };
}

// O cartão do Spotify é o nome do perfil; as músicas entram por cima no bot (o que está tocando e as últimas, pelo status do Discord)
async function cartaoSpotify(buscar, conta) {
  // A página não respondeu: fica o nome guardado (as músicas do status entram do mesmo jeito)
  const p = await perfilSpotify(conta.id, buscar).catch(() => ({ nome: conta.nome }));
  if (!p) return { status: 'NÃO ACHEI', aviso: 'Não achei esse perfil no Spotify.', stats: [], itens: [] };
  return { perfilNome: p.nome, status: 'SPOTIFY', stats: [], itens: [] };
}

async function cartaoTwitch(buscar, conta) {
  if (!temTwitch()) return { status: 'TWITCH', aviso: 'A Twitch ainda não foi ligada no bot.', stats: [], itens: [] };
  const token = await tokenTwitch(buscar);
  if (!token) throw new Error('sem token da Twitch');
  const h = { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` };
  const id = encodeURIComponent(conta.id);
  const [u, ao, v, seg] = await Promise.all([
    pedirJson(buscar, `https://api.twitch.tv/helix/users?id=${id}`, h),
    pedirJson(buscar, `https://api.twitch.tv/helix/streams?user_id=${id}`, h),
    pedirJson(buscar, `https://api.twitch.tv/helix/videos?user_id=${id}&first=3&type=archive`, h).catch(() => null),
    pedirJson(buscar, `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${id}&first=1`, h).catch(() => null),
  ]);
  const user = u?.data?.[0];
  if (!user) return { status: 'NÃO ACHEI', aviso: 'Não achei esse canal na Twitch.', stats: [], itens: [] };
  const live = ao?.data?.[0];
  const tam = (url) => (url ? url.replace(/%?\{width\}/, '320').replace(/%?\{height\}/, '180') : null);
  const videos = (v?.data ?? []).map((x) => ({ t: x.title, src: tam(x.thumbnail_url), s: `${mil(x.view_count)} views` }));
  const stats = [];
  if (seg?.total != null) stats.push([mil(seg.total), 'seguidores']);
  if (live) stats.push([mil(live.viewer_count), 'assistindo']);
  return {
    perfilNome: user.display_name,
    login: user.login,
    status: live ? 'AO VIVO' : 'OFFLINE',
    stats,
    itens: live ? [{ t: live.title || 'Ao vivo', src: tam(live.thumbnail_url), s: live.game_name || 'ao vivo' }, ...videos].slice(0, 3) : videos,
    rotulo: live ? 'AO VIVO AGORA' : 'VÍDEOS RECENTES',
  };
}

/**
 * Cartão de uma rede: { rede, nome, user, link, status, stats: [[valor, rótulo]], itens: [{ t, src, s }], rotulo?, aviso? }.
 * conta = o que está no perfil (user ou id). Nunca joga erro: rede fora do ar vira aviso.
 */
export async function cartaoDaRede(rede, conta, { buscar = fetch, ano = new Date().getFullYear(), chaveSteam = process.env.STEAM_API_KEY } = {}) {
  const base = { rede, nome: NOMES_REDES[rede], user: conta.user ? `@${conta.user}` : '', link: '' };
  try {
    if (rede === 'letterboxd') return { ...base, link: `https://letterboxd.com/${conta.user}/`, ...(await cartaoLetterboxd(buscar, conta.user, ano)) };
    if (rede === 'instagram') return { ...base, link: `https://www.instagram.com/${conta.user}/`, status: 'INSTAGRAM', stats: [], itens: [] };
    if (rede === 'steam') {
      const { perfilNome, ...c } = await cartaoSteam(buscar, conta.id, chaveSteam);
      return { ...base, user: perfilNome || 'perfil da Steam', link: `https://steamcommunity.com/profiles/${conta.id}`, ...c };
    }
    if (rede === 'spotify') {
      const { perfilNome, ...c } = await cartaoSpotify(buscar, conta);
      return { ...base, user: perfilNome || conta.nome || 'perfil do Spotify', link: `https://open.spotify.com/user/${encodeURIComponent(conta.id)}`, ...c };
    }
    if (rede === 'twitch') {
      const { perfilNome, login, ...c } = await cartaoTwitch(buscar, conta);
      return { ...base, user: `@${login || conta.user}`, link: `https://www.twitch.tv/${login || conta.user}`, ...c };
    }
  } catch {
    return { ...base, status: NOMES_REDES[rede].toUpperCase(), aviso: `O ${NOMES_REDES[rede]} não respondeu agora.`, stats: [], itens: [] };
  }
  return { ...base, status: NOMES_REDES[rede]?.toUpperCase() ?? '', stats: [], itens: [] };
}

// Os cartões ficam 30 minutos guardados (as redes não precisam ser chamadas a cada clique); a Twitch, 3 (ao vivo muda rápido)
const guardados = new Map();
export async function cartaoGuardado(rede, conta, opcoes = {}, agora = Date.now()) {
  const k = `${rede}:${conta.id ?? conta.user}`;
  const g = guardados.get(k);
  if (g && agora - g.quando < (rede === 'twitch' ? 3 : 30) * 60_000) return g.cartao;
  const cartao = await cartaoDaRede(rede, conta, opcoes);
  guardados.set(k, { quando: agora, cartao });
  return cartao;
}
export const esquecerCartao = (rede, conta) => guardados.delete(`${rede}:${conta.id ?? conta.user}`);
