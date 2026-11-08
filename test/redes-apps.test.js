// Spotify (link do perfil + status do Discord) e Twitch (login da própria Twitch), com uma internet de mentira
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { iniciarApi } from '../api.js';
import { definirPadrao, servidorAtual } from '../lib/contexto.js';
import {
  cartaoDaRede, contaDaTwitch, esquecerOuvidas, esquecerTokens, faixaDoStatus, idDoSpotify, linkDaTwitch, mudouOuvindo, ouvindoAgora, ultimasOuvidas, zerarOuvidas,
} from '../lib/redes.js';
import { criarSessao } from '../lib/sessao.js';



process.env.TWITCH_CLIENT_ID = 'tw-id';
process.env.TWITCH_CLIENT_SECRET = 'tw-segredo';

const responde = (x, status = 200) => ({ ok: status < 400, status, json: async () => x, text: async () => JSON.stringify(x) });
/** Internet: cada endereço que começa com uma chave responde o que a função devolver */
function internet(rotas) {
  const pedidos = [];
  const buscar = async (url, o = {}) => {
    pedidos.push({ url: String(url), o });
    const k = Object.keys(rotas).find((x) => String(url).startsWith(x));
    return k ? rotas[k](String(url), o) : responde({}, 404);
  };
  return { buscar, pedidos };
}

test('Spotify: id pelo link do perfil, pelo URI ou direto; o resto não vale', () => {
  assert.equal(idDoSpotify('https://open.spotify.com/user/pedrinho123?si=abc'), 'pedrinho123');
  assert.equal(idDoSpotify('https://open.spotify.com/intl-pt/user/31abcxyz'), '31abcxyz');
  assert.equal(idDoSpotify('spotify:user:fulano.de.tal'), 'fulano.de.tal');
  assert.equal(idDoSpotify('  31abcxyz '), '31abcxyz');
  assert.equal(idDoSpotify('https://open.spotify.com/track/123'), null);
  assert.equal(idDoSpotify('não é link'), null);
});

test('Spotify pelo status do Discord: a de agora e as últimas 5, sem repetir; desligar esquece', () => {
  zerarOuvidas();
  const atividade = (id, t) => [{ type: 0, name: 'Minecraft' }, { type: 2, name: 'Spotify', syncId: id, details: t, state: 'Matuê; Teto', assets: { largeImage: 'spotify:ab67616d0000b273abc' } }];
  assert.deepEqual(faixaDoStatus(atividade('1', 'Vampiro')), { id: '1', t: 'Vampiro', artista: 'Matuê, Teto', capa: 'https://i.scdn.co/image/ab67616d0000b273abc' });
  assert.equal(faixaDoStatus([{ type: 0, name: 'Minecraft' }]), null);
  mudouOuvindo('u', faixaDoStatus(atividade('1', 'Vampiro')), 1000);
  mudouOuvindo('u', faixaDoStatus(atividade('1', 'Vampiro')), 2000); // mesma música: nada muda
  mudouOuvindo('u', faixaDoStatus(atividade('2', 'Crack com Mussilon')), 3000);
  mudouOuvindo('u', faixaDoStatus(atividade('1', 'Vampiro')), 4000); // voltou: sobe pro topo sem repetir
  assert.equal(ouvindoAgora('u').id, '1');
  assert.deepEqual(ultimasOuvidas('u').map((x) => x.id), ['1', '2']);
  for (let i = 3; i < 10; i++) mudouOuvindo('u', { id: String(i), t: `m${i}`, artista: '', capa: null }, i * 1000);
  assert.equal(ultimasOuvidas('u').length, 5);
  mudouOuvindo('u', null);
  assert.equal(ouvindoAgora('u'), null);
  assert.equal(ultimasOuvidas('u').length, 5); // parou de ouvir: as últimas ficam
  esquecerOuvidas('u');
  assert.deepEqual(ultimasOuvidas('u'), []);
});

test('Spotify: perfil pela prévia pública da página (sem API: o modo de desenvolvimento não tem mais perfil de outra pessoa)', async () => {
  const pagina = (titulo, tipo = 'profile') => ({ ok: true, status: 200, text: async () => `<html><head><meta property="og:title" content="${titulo}"/><meta property="og:type" content="${tipo}"/><meta property="og:image" content="https://i.scdn.co/image/ab67"/></head></html>` });
  const net = internet({
    'https://open.spotify.com/user/pedrinho123': () => pagina('Pedrinho &amp; Cia &#x27;oficial&#x27;'),
    'https://open.spotify.com/user/fora': () => ({ ok: false, status: 503, text: async () => '' }),
  });
  const c = await cartaoDaRede('spotify', { id: 'pedrinho123', nome: 'antigo' }, { buscar: net.buscar });
  assert.equal(c.user, "Pedrinho & Cia 'oficial'");
  assert.equal(c.link, 'https://open.spotify.com/user/pedrinho123');
  assert.equal(c.status, 'SPOTIFY');
  assert.ok(net.pedidos.every((p) => !p.url.includes('api.spotify.com')));
  // Perfil que não existe (404)
  assert.equal((await cartaoDaRede('spotify', { id: 'ninguem' }, { buscar: net.buscar })).status, 'NÃO ACHEI');
  // Spotify fora do ar: fica o nome guardado, sem aviso de erro (as músicas do status entram por cima)
  const fora = await cartaoDaRede('spotify', { id: 'fora', nome: 'Fulano' }, { buscar: net.buscar });
  assert.equal(fora.user, 'Fulano');
  assert.equal(fora.aviso, undefined);
});

test('Twitch: cartão ao vivo (miniatura, jogo, quem assiste) e fora do ar (vídeos recentes)', async () => {
  esquecerTokens();
  let aoVivo = true;
  const net = internet({
    'https://id.twitch.tv/oauth2/token': () => responde({ access_token: 'app', expires_in: 3600 }),
    'https://api.twitch.tv/helix/users': () => responde({ data: [{ id: '77', login: 'pedrinho', display_name: 'Pedrinho' }] }),
    'https://api.twitch.tv/helix/streams': () => responde({ data: aoVivo ? [{ title: 'Ranked no Valorant', game_name: 'VALORANT', viewer_count: 1532, thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_pedrinho-{width}x{height}.jpg' }] : [] }),
    'https://api.twitch.tv/helix/videos': () => responde({ data: [{ title: 'Live de ontem', view_count: 98, thumbnail_url: 'https://static-cdn.jtvnw.net/cf_vods/x/thumb-%{width}x%{height}.jpg' }] }),
    'https://api.twitch.tv/helix/channels/followers': (_, o) => (assert.equal(o.headers['Client-Id'], 'tw-id'), responde({ total: 4321 })),
  });
  const c = await cartaoDaRede('twitch', { id: '77', user: 'pedrinho' }, { buscar: net.buscar });
  assert.equal(c.status, 'AO VIVO');
  assert.equal(c.user, '@pedrinho');
  assert.equal(c.link, 'https://www.twitch.tv/pedrinho');
  assert.deepEqual(c.stats, [['4.321', 'seguidores'], ['1.532', 'assistindo']]);
  assert.deepEqual(c.itens[0], { t: 'Ranked no Valorant', src: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_pedrinho-320x180.jpg', s: 'VALORANT' });
  aoVivo = false;
  const fora = await cartaoDaRede('twitch', { id: '77', user: 'pedrinho' }, { buscar: net.buscar });
  assert.equal(fora.status, 'OFFLINE');
  assert.equal(fora.rotulo, 'VÍDEOS RECENTES');
  assert.deepEqual(fora.itens, [{ t: 'Live de ontem', src: 'https://static-cdn.jtvnw.net/cf_vods/x/thumb-320x180.jpg', s: '98 views' }]);
});

test('Twitch: login devolve a conta e revoga o token (nada fica guardado)', async () => {
  const link = new URL(linkDaTwitch({ clientId: 'tw-id', redirect: 'https://bot.exemplo/auth/twitch/volta', estado: 'xyz' }));
  assert.equal(link.origin + link.pathname, 'https://id.twitch.tv/oauth2/authorize');
  assert.equal(link.searchParams.get('response_type'), 'code');
  assert.equal(link.searchParams.get('state'), 'xyz');
  const net = internet({
    'https://id.twitch.tv/oauth2/token': (_, o) => (assert.match(String(o.body), /code=abc/), responde({ access_token: 'da-pessoa' })),
    'https://api.twitch.tv/helix/users': (_, o) => (assert.equal(o.headers.Authorization, 'Bearer da-pessoa'), responde({ data: [{ id: '77', login: 'pedrinho', display_name: 'Pedrinho' }] })),
    'https://id.twitch.tv/oauth2/revoke': () => responde({}),
  });
  assert.deepEqual(await contaDaTwitch({ code: 'abc', redirect: 'https://bot.exemplo/auth/twitch/volta' }, net.buscar), { id: '77', user: 'pedrinho', nome: 'Pedrinho' });
  await new Promise((ok) => setImmediate(ok));
  assert.ok(net.pedidos.some((p) => p.url === 'https://id.twitch.tv/oauth2/revoke'));
  const recusou = internet({ 'https://id.twitch.tv/oauth2/token': () => responde({}, 400) });
  assert.equal(await contaDaTwitch({ code: 'x', redirect: 'r' }, recusou.buscar), null);
});

test('API: login da Twitch volta pro mesmo servidor em que a pessoa clicou', async (t) => {
  const A = '111111111111111111', B = '222222222222222222', PEDRO = '333333333333333333';
  definirPadrao(A);
  t.after(() => definirPadrao(null));
  const ligados = [];
  const api = {
    saude: () => ({}),
    temServidor: () => true,
    papelDe: async () => 'membro',
    ligarTwitch: async (id, conta) => ligados.push([servidorAtual(), id, conta.user]),
  };
  const servidor = iniciarApi({ porta: 0, senha: '', origens: ['https://site.exemplo'], api, silencioso: true });
  await once(servidor, 'listening');
  t.after(() => servidor.close());
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const sessao = criarSessao({ id: PEDRO, nome: 'Pedro', usuario: 'pedrinho' });
  const r = await fetch(`${base}/api/eu/redes/twitch`, { method: 'POST', headers: { 'X-Painel': '1', 'X-Servidor': B, Authorization: `Sessao ${sessao}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ volta: 'https://site.exemplo/painel.html' }) });
  const link = new URL((await r.json()).link);
  assert.equal(new URL(link.searchParams.get('redirect_uri')).pathname, '/auth/twitch/volta');
  const fetchDeVerdade = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    if (String(url).startsWith('https://id.twitch.tv/oauth2/token')) return Response.json({ access_token: 'da-pessoa' });
    if (String(url).startsWith('https://api.twitch.tv/helix/users')) return Response.json({ data: [{ id: '77', login: 'pedrinho', display_name: 'Pedrinho' }] });
    if (String(url).startsWith('https://id.twitch.tv/oauth2/revoke')) return Response.json({});
    return fetchDeVerdade(url, o);
  };
  t.after(() => (globalThis.fetch = fetchDeVerdade));
  const volta = await fetchDeVerdade(`${base}/auth/twitch/volta?code=abc&state=${encodeURIComponent(link.searchParams.get('state'))}`, { redirect: 'manual' });
  assert.equal(volta.headers.get('location'), 'https://site.exemplo/painel.html#redes=twitch-ok');
  assert.deepEqual(ligados, [[B, PEDRO, 'pedrinho']]);
  const cancelou = await fetchDeVerdade(`${base}/auth/twitch/volta?error=access_denied&state=${encodeURIComponent(link.searchParams.get('state'))}`, { redirect: 'manual' });
  assert.equal(cancelou.headers.get('location'), 'https://site.exemplo/painel.html#redes=twitch-erro');
  assert.equal(ligados.length, 1);
});

test('Steam: jogo novo pega a cápsula pelo endereço que a loja diz (o antigo dá 404)', async () => {
  const xml = '<profile><steamID>Pedr0</steamID><privacyState>public</privacyState><onlineState>online</onlineState></profile>';
  const net = internet({
    'https://steamcommunity.com/profiles/': () => ({ ok: true, status: 200, text: async () => xml }),
    'https://api.steampowered.com/IPlayerService/GetSteamLevel/': () => responde({ response: { player_level: 66 } }),
    'https://api.steampowered.com/IPlayerService/GetOwnedGames/': () => responde({ response: { game_count: 557, games: [{ playtime_forever: 600 }] } }),
    'https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/': () => responde({ response: { games: [{ appid: 3751950, name: "Assassin's Creed Black Flag Resynced", playtime_forever: 6720 }, { appid: 730, name: 'Counter-Strike 2', playtime_forever: 60 }] } }),
    'https://api.steampowered.com/IStoreBrowseService/GetItems/': () => responde({ response: { store_items: [{ appid: 3751950, assets: { asset_url_format: 'steam/apps/3751950/${FILENAME}?t=1', small_capsule: 'abc/capsule_231x87.jpg' } }] } }),
  });
  const c = await cartaoDaRede('steam', { id: '76561197960287930' }, { buscar: net.buscar, chaveSteam: 'k' });
  assert.equal(c.itens[0].src, 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3751950/abc/capsule_231x87.jpg');
  // Sem resposta da loja pra esse: o endereço de sempre
  assert.equal(c.itens[1].src, 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/capsule_184x69.jpg');
});
