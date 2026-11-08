// Redes de Meu perfil (v12). Sem nada do dono do bot: Letterboxd pelo RSS público, Instagram só com o nome (vira link)
// e Steam pelo login da própria Steam (OpenID: prova que a conta é da pessoa) + o perfil público.
// Com STEAM_API_KEY a Steam também mostra nível, quantidade de jogos e os recentes. Spotify e Twitch pedem um app
// registrado pelo dono (SPOTIFY_* e TWITCH_*); sem ele, aparecem desligados.

export const NOMES_REDES = { steam: 'Steam', spotify: 'Spotify', letterboxd: 'Letterboxd', instagram: 'Instagram', twitch: 'Twitch' };
export const REDES_POR_NOME = ['letterboxd', 'instagram']; // a pessoa digita o usuário (perfil público)
export const USUARIO_VALIDO = /^[A-Za-z0-9_.]{2,30}$/;

const AGENTE = 'MandaChuvaBot/1.0 (+https://pedroa07.github.io/Interface-Manda-Chuva-Bot/)';
const tirarCdata = (s) => s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
const entidades = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
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
      return {
        ...base,
        stats: [[String(nivel?.response?.player_level ?? '—'), 'nível'], [String(donos.response.game_count), 'jogos'], [`${horas(jogos.reduce((a, g) => a + (g.playtime_forever ?? 0), 0))} h`, 'total']],
        itens: (recentes?.response?.games ?? []).slice(0, 3).map((g) => ({ t: g.name, src: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/capsule_184x69.jpg`, s: `${horas(g.playtime_forever ?? 0)} h` })),
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
  } catch {
    return { ...base, status: NOMES_REDES[rede].toUpperCase(), aviso: `O ${NOMES_REDES[rede]} não respondeu agora.`, stats: [], itens: [] };
  }
  return { ...base, status: NOMES_REDES[rede]?.toUpperCase() ?? '', stats: [], itens: [] };
}

// Os cartões ficam 30 minutos guardados (as redes não precisam ser chamadas a cada clique)
const guardados = new Map();
export async function cartaoGuardado(rede, conta, opcoes = {}, agora = Date.now()) {
  const k = `${rede}:${conta.id ?? conta.user}`;
  const g = guardados.get(k);
  if (g && agora - g.quando < 30 * 60_000) return g.cartao;
  const cartao = await cartaoDaRede(rede, conta, opcoes);
  guardados.set(k, { quando: agora, cartao });
  return cartao;
}
export const esquecerCartao = (rede, conta) => guardados.delete(`${rede}:${conta.id ?? conta.user}`);
