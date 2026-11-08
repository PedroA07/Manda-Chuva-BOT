// Redes do perfil: tudo com fetch de mentira (nada sai pra internet)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cartaoDaRede, conferirSteam, estrelas, lerRssLetterboxd, lerXmlSteam, linkDaSteam } from '../lib/redes.js';

const RSS = `<rss><channel>
<item><title>Coyote vs. Acme, 2026 - ★★★½</title><letterboxd:watchedDate>2026-11-06</letterboxd:watchedDate><letterboxd:filmTitle>Coyote vs. Acme</letterboxd:filmTitle><letterboxd:filmYear>2026</letterboxd:filmYear><letterboxd:memberRating>3.5</letterboxd:memberRating><description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/film-poster/1/0/8/1089088-coyote-0-600-0-900-crop.jpg?v=7"/></p> ]]></description></item>
<item><letterboxd:watchedDate>2025-12-24</letterboxd:watchedDate><letterboxd:filmTitle>Cidade de Deus</letterboxd:filmTitle><letterboxd:filmYear>2002</letterboxd:filmYear><letterboxd:memberRating>5.0</letterboxd:memberRating><description><![CDATA[ <p><img src="https://a.ltrbxd.com/cdd.jpg"/></p> ]]></description></item>
<item><letterboxd:watchedDate>2026-01-02</letterboxd:watchedDate><letterboxd:filmTitle>Shrek &amp; Cia</letterboxd:filmTitle><letterboxd:filmYear>2001</letterboxd:filmYear><description><![CDATA[ sem pôster ]]></description></item>
</channel></rss>`;

const XML_STEAM = `<?xml version="1.0"?><profile><steamID64>76561197960287930</steamID64><steamID><![CDATA[Pedrinho]]></steamID><onlineState>in-game</onlineState>
<inGameInfo><gameName><![CDATA[Among Us]]></gameName></inGameInfo><privacyState>public</privacyState><avatarFull><![CDATA[https://avatars.akamai.steamstatic.com/a_full.jpg]]></avatarFull>
<mostPlayedGames><mostPlayedGame><gameName><![CDATA[Counter-Strike 2]]></gameName><gameLogo><![CDATA[https://cdn.cloudflare.steamstatic.com/steam/apps/730/capsule_184x69.jpg]]></gameLogo><hoursOnRecord>1,312.5</hoursOnRecord></mostPlayedGame>
<mostPlayedGame><gameName><![CDATA[Among Us]]></gameName><gameLogo><![CDATA[https://cdn.cloudflare.steamstatic.com/steam/apps/945360/capsule_184x69.jpg]]></gameLogo><hoursOnRecord>96</hoursOnRecord></mostPlayedGame></mostPlayedGames></profile>`;

const internet = (rotas) => async (url, opcoes = {}) => {
  const chave = Object.keys(rotas).find((k) => String(url).startsWith(k));
  if (!chave) return { ok: false, text: async () => '', json: async () => null };
  const r = typeof rotas[chave] === 'function' ? rotas[chave](url, opcoes) : rotas[chave];
  return { ok: true, text: async () => (typeof r === 'string' ? r : JSON.stringify(r)), json: async () => r };
};

test('Letterboxd: filmes do diário, pôster, nota, média e os deste ano', () => {
  const l = lerRssLetterboxd(RSS, 2026);
  assert.deepEqual(l.filmes.map((f) => f.titulo), ['Coyote vs. Acme', 'Cidade de Deus', 'Shrek & Cia']);
  assert.equal(l.filmes[0].poster, 'https://a.ltrbxd.com/resized/film-poster/1/0/8/1089088-coyote-0-600-0-900-crop.jpg?v=7');
  assert.equal(l.filmes[2].poster, null);
  assert.equal(l.media, 4.3);
  assert.equal(l.esteAno, 2);
  assert.equal(estrelas(3.5), '★★★½');
  assert.equal(estrelas(null), '');
});

test('Steam: perfil público com o jogo aberto e os mais jogados (horas com vírgula de milhar)', () => {
  const s = lerXmlSteam(XML_STEAM);
  assert.equal(s.nome, 'Pedrinho');
  assert.equal(s.jogando, 'Among Us');
  assert.ok(s.publico);
  assert.deepEqual(s.jogos.map((j) => [j.nome, j.horas]), [['Counter-Strike 2', 1312.5], ['Among Us', 96]]);
  assert.equal(lerXmlSteam('<html>erro</html>'), null);
});

test('login da Steam: link volta pra cá e a volta só vale se a Steam confirmar', async () => {
  const volta = 'https://bot.exemplo/auth/steam/volta?estado=abc';
  const link = new URL(linkDaSteam(volta));
  assert.equal(link.origin, 'https://steamcommunity.com');
  assert.equal(link.searchParams.get('openid.return_to'), volta);
  assert.equal(link.searchParams.get('openid.realm'), 'https://bot.exemplo');
  const params = new URLSearchParams({ 'openid.mode': 'id_res', 'openid.return_to': volta, 'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561197960287930', 'openid.sig': 'x', estado: 'abc' });
  let enviado = '';
  const steamDiz = (resposta) => internet({ 'https://steamcommunity.com/openid/login': (_, o) => ((enviado = o.body), resposta) });
  assert.equal(await conferirSteam(params, 'https://bot.exemplo/auth/steam/volta', steamDiz('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')), '76561197960287930');
  assert.match(enviado, /openid\.mode=check_authentication/);
  assert.ok(!enviado.includes('estado='), 'só os campos openid vão pra Steam');
  assert.equal(await conferirSteam(params, 'https://bot.exemplo/auth/steam/volta', steamDiz('is_valid:false')), null);
  // volta pra outro lugar ou id estranho: nem pergunta pra Steam
  assert.equal(await conferirSteam(params, 'https://outro.site/auth/steam/volta', steamDiz('is_valid:true')), null);
  const falso = new URLSearchParams({ ...Object.fromEntries(params), 'openid.claimed_id': 'https://golpe.com/openid/id/76561197960287930' });
  assert.equal(await conferirSteam(falso, 'https://bot.exemplo/auth/steam/volta', steamDiz('is_valid:true')), null);
});

test('cartões: Letterboxd com 4 pôsteres, Instagram só link, Steam sem chave (mais jogados) e com chave (nível e recentes)', async () => {
  const lb = await cartaoDaRede('letterboxd', { user: 'pedrinho' }, { buscar: internet({ 'https://letterboxd.com/pedrinho/rss/': RSS }), ano: 2026 });
  assert.equal(lb.link, 'https://letterboxd.com/pedrinho/');
  assert.deepEqual(lb.stats, [['3', 'no diário'], ['2', 'este ano'], ['4,3', 'nota média']]);
  assert.deepEqual(lb.itens.map((i) => i.s), ['★★★½', '★★★★★', '']);
  const naoAchou = await cartaoDaRede('letterboxd', { user: 'ninguem' }, { buscar: internet({}) });
  assert.match(naoAchou.aviso, /público/);

  const ig = await cartaoDaRede('instagram', { user: 'pedrinho.mc' }, { buscar: internet({}) });
  assert.equal(ig.link, 'https://www.instagram.com/pedrinho.mc/');
  assert.deepEqual(ig.itens, []);

  const xml = { 'https://steamcommunity.com/profiles/76561197960287930?xml=1': XML_STEAM };
  const semChave = await cartaoDaRede('steam', { id: '76561197960287930' }, { buscar: internet(xml), chaveSteam: '' });
  assert.equal(semChave.status, 'JOGANDO');
  assert.equal(semChave.user, 'Pedrinho');
  assert.deepEqual(semChave.itens.map((i) => i.s), ['1.312,5 h', '96 h']);
  const comChave = await cartaoDaRede('steam', { id: '76561197960287930' }, {
    chaveSteam: 'k',
    buscar: internet({
      ...xml,
      'https://api.steampowered.com/IPlayerService/GetSteamLevel/': { response: { player_level: 27 } },
      'https://api.steampowered.com/IPlayerService/GetOwnedGames/': { response: { game_count: 84, games: [{ playtime_forever: 60000 }, { playtime_forever: 14400 }] } },
      'https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/': { response: { games: [{ appid: 945360, name: 'Among Us', playtime_forever: 5760 }] } },
    }),
  });
  assert.deepEqual(comChave.stats, [['27', 'nível'], ['84', 'jogos'], ['1.240 h', 'total']]);
  assert.deepEqual(comChave.itens, [{ t: 'Among Us', src: 'https://cdn.cloudflare.steamstatic.com/steam/apps/945360/capsule_184x69.jpg', s: '96 h' }]);
  const fechado = await cartaoDaRede('steam', { id: '1' }, { buscar: internet({ 'https://steamcommunity.com/profiles/1?xml=1': XML_STEAM.replace('public', 'private') }), chaveSteam: '' });
  assert.match(fechado.aviso, /fechado/);
});
