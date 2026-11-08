// Capa dos favoritos: a busca roda com um fetch de mentira (nada sai pra internet)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acharCapa, capaDaGaleria, capaPermitida, capaSugerida, combina, sugerir } from '../lib/capas.js';

/** fetch falso: cada endereço que começa com uma chave responde o JSON dela; HEAD responde ok se estiver em "existem" */
function internet(respostas, existem = []) {
  const pedidos = [];
  const buscar = async (url, opcoes = {}) => {
    pedidos.push(url);
    if (opcoes.method === 'HEAD') return { ok: existem.some((e) => url.startsWith(e)) };
    const chave = Object.keys(respostas).find((k) => url.startsWith(k));
    return chave ? { ok: true, json: async () => respostas[chave] } : { ok: false, json: async () => ({}) };
  };
  return { buscar, pedidos };
}
const STEAM = 'https://store.steampowered.com/api/storesearch/';
const WIKI = 'https://pt.wikipedia.org/w/api.php';
const ITUNES = 'https://itunes.apple.com/search';
const OL = 'https://openlibrary.org/search.json';

test('jogo da Steam: capa em pé quando existe, senão a horizontal; só aceita nome parecido', async () => {
  const net = internet({ [STEAM]: { items: [{ id: 945360, name: 'Among Us' }, { id: 1, name: 'Among Us 3D' }] } }, ['https://cdn.cloudflare.steamstatic.com/steam/apps/945360/library_600x900.jpg']);
  assert.equal(await acharCapa('jogos', 'among us', net.buscar), 'https://cdn.cloudflare.steamstatic.com/steam/apps/945360/library_600x900.jpg');
  const semRetrato = internet({ [STEAM]: { items: [{ id: 7, name: 'Terraria' }] } });
  assert.equal(await acharCapa('jogos', 'Terraria', semRetrato.buscar), 'https://cdn.cloudflare.steamstatic.com/steam/apps/7/header.jpg');
  // "Minecraft" não é "Minecraft Dungeons" e nem "Block Craft": cai na Wikipédia
  const mine = internet({
    [STEAM]: { items: [{ id: 2, name: 'Minecraft Dungeons' }] },
    [WIKI]: { query: { pages: { 9: { title: 'Minecraft', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/pt/5/51/Minecraft_capa.png?utm_source=x' } } } } },
  });
  assert.equal(await acharCapa('jogos', 'Minecraft', mine.buscar), 'https://upload.wikimedia.org/wikipedia/pt/5/51/Minecraft_capa.png');
  assert.ok(mine.pedidos.some((u) => u.startsWith(WIKI) && decodeURIComponent(u).includes('Minecraft jogo eletrônico')));
});

test('jogo sem Steam e sem Wikipédia: ícone do app (iTunes), em 600 px', async () => {
  const net = internet({ [STEAM]: { items: [] }, [WIKI]: {}, [ITUNES]: { results: [{ trackName: 'Free Fire', artworkUrl512: 'https://is1-ssl.mzstatic.com/image/thumb/x/AppIcon.png/512x512bb.jpg' }] } });
  assert.equal(await acharCapa('jogos', 'Free Fire', net.buscar), 'https://is1-ssl.mzstatic.com/image/thumb/x/AppIcon.png/600x600bb.jpg');
});

test('filme pela Wikipédia; livro pela Open Library; música pelo iTunes com "Música — Artista"', async () => {
  const filme = internet({ [WIKI]: { query: { pages: { 1: { title: 'Interstellar', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Interstellar_Filme.png' } } } } } });
  assert.equal(await acharCapa('filmes', 'Interestelar', filme.buscar), 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Interstellar_Filme.png');
  const livro = internet({ [OL]: { docs: [{ title: 'Dom Casmurro', cover_i: 647501 }] } });
  assert.equal(await acharCapa('livros', 'Dom Casmurro', livro.buscar), 'https://covers.openlibrary.org/b/id/647501-L.jpg');
  const musica = internet({ [ITUNES]: { results: [{ trackName: 'Evidências', artistName: 'Chitãozinho & Xororó', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/x.jpg/100x100bb.jpg' }] } });
  assert.equal(await acharCapa('musicas', 'Evidências — Chitãozinho & Xororó', musica.buscar), 'https://is1-ssl.mzstatic.com/image/thumb/Music/x.jpg/600x600bb.jpg');
  assert.ok(musica.pedidos[0].includes('entity=song'));
});

test('nada encontrado, internet fora ou endereço estranho: sem capa (o site e o bot usam a galeria)', async () => {
  assert.equal(await acharCapa('filmes', 'Filme que não existe', internet({}).buscar), '');
  const quebrada = async () => { throw new Error('sem rede'); };
  assert.equal(await acharCapa('jogos', 'Among Us', quebrada), '');
  const golpe = internet({ [WIKI]: { query: { pages: { 1: { title: 'X', thumbnail: { source: 'https://golpe.com/x.png' } } } } } });
  assert.equal(await acharCapa('filmes', 'X', golpe.buscar), '');
  assert.equal(await acharCapa('tipo-que-nao-existe', 'X', internet({}).buscar), '');
});

test('só endereços https das fontes conhecidas', () => {
  assert.ok(capaPermitida('https://upload.wikimedia.org/wikipedia/pt/3/3a/a.png'));
  assert.ok(capaPermitida('https://covers.openlibrary.org/b/id/1-L.jpg'));
  assert.ok(capaPermitida('https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg'));
  assert.ok(capaPermitida('https://cdn.cloudflare.steamstatic.com/steam/apps/1/header.jpg'));
  assert.ok(!capaPermitida('http://upload.wikimedia.org/a.png'));
  assert.ok(!capaPermitida('https://wikimedia.org.golpe.com/a.png'));
  assert.ok(!capaPermitida('https://localhost/a.png'));
  assert.ok(!capaPermitida('lixo'));
});

test('capa da galeria (plano B): sempre a mesma pro mesmo nome, da categoria certa', () => {
  assert.match(capaDaGaleria('jogos', 'Valorant'), /^banners\/perfil\/jogos-[1-8]\.jpg$/);
  assert.match(capaDaGaleria('musicas', 'Evidências'), /^banners\/perfil\/musica-[1-8]\.jpg$/);
  assert.match(capaDaGaleria('filmes', 'Shrek'), /^banners\/perfil\/(diversos|desenhos)-[1-8]\.jpg$/);
  assert.equal(capaDaGaleria('livros', 'Dom Casmurro'), capaDaGaleria('livros', 'Dom Casmurro'));
});

test('app que só começa com o nome não vale ("CS2 Case Clicker" não é CS2); complemento depois de ":" ou "(" vale', async () => {
  const net = internet({ [STEAM]: { items: [] }, [WIKI]: {}, [ITUNES]: { results: [{ trackName: 'CS2 Case Clicker', artworkUrl512: 'https://is1-ssl.mzstatic.com/a/512x512bb.jpg' }] } });
  assert.equal(await acharCapa('jogos', 'CS2', net.buscar), '');
  const mine = internet({ [STEAM]: { items: [] }, [WIKI]: {}, [ITUNES]: { results: [{ trackName: 'Minecraft: jogue com amigos!', artworkUrl512: 'https://is1-ssl.mzstatic.com/m/512x512bb.jpg' }] } });
  assert.equal(await acharCapa('jogos', 'minecraft', mine.buscar), 'https://is1-ssl.mzstatic.com/m/600x600bb.jpg');
  const aoVivo = internet({ [ITUNES]: { results: [{ trackName: 'Evidencias (Ao Vivo)', artworkUrl100: 'https://is1-ssl.mzstatic.com/e/100x100bb.jpg' }] } });
  assert.equal(await acharCapa('musicas', 'Evidências', aoVivo.buscar), 'https://is1-ssl.mzstatic.com/e/600x600bb.jpg');
});

test('limite de buscas: 15 a cada 10 minutos por pessoa', async () => {
  const { podeProcurar } = await import('../lib/capas.js');
  const t0 = 1_000_000;
  for (let i = 0; i < 15; i++) assert.ok(podeProcurar('limite', t0 + i));
  assert.ok(!podeProcurar('limite', t0 + 20));
  assert.ok(podeProcurar('outra-pessoa', t0 + 20));
  assert.ok(podeProcurar('limite', t0 + 10 * 60_000 + 1));
});

// ---------- Sugestões enquanto digita ----------
const responde = (x) => ({ ok: true, json: async () => x });
const nada = { ok: false, json: async () => ({}) };

test('combina: todas as palavras digitadas, a última pode estar pela metade, sem ligar pra acento', () => {
  assert.ok(combina('Harry Potter e a Pedra Filosofal', 'harry pot'));
  assert.ok(combina('Evidências — Chitãozinho & Xororó', 'evidencias xoro'));
  assert.ok(!combina('Hairy Potato', 'harry pot'));
  assert.ok(!combina('Qualquer coisa', '   '));
});

test('sugestões de filmes: nome brasileiro do Wikidata; se ele vier em inglês, fica o nome em português da Wikipédia', async () => {
  const buscar = async (url) => {
    if (url.startsWith('https://www.wikidata.org/')) return responde({ entities: { Q1: { labels: { 'pt-br': { value: 'Vingadores: Ultimato' } } }, Q2: { labels: { 'pt-br': { value: 'Avengers: Age of Ultron' } } } } });
    if (!url.includes('generator=prefixsearch')) return responde({});
    return responde({
      query: {
        redirects: [{ from: 'Vingadores 4', to: 'Avengers: Endgame' }, { from: 'Vingadores: A Era de Ultron', to: 'Avengers: Age of Ultron' }],
        pages: [
          { pageid: 1, index: 1, title: 'Avengers: Endgame', description: 'filme de 2019', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Endgame.jpg?utm_source=pt' }, pageprops: { wikibase_item: 'Q1' } },
          { pageid: 2, index: 2, title: 'Avengers: Age of Ultron', description: 'filme de 2015', pageprops: { wikibase_item: 'Q2' } },
          { pageid: 3, index: 3, title: 'Vingadores do Espaço', description: 'série de mangá japonesa' },
          { pageid: 4, index: 4, title: 'Vingadores (desambiguação)', description: 'página de desambiguação de um projeto da Wikimedia' },
        ],
      },
    });
  };
  const r = await sugerir('filmes', 'vingadores', { buscar });
  assert.deepEqual(r.map((x) => x.t), ['Vingadores: Ultimato', 'Vingadores: A Era de Ultron']);
  assert.equal(r[0].capa, 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Endgame.jpg');
  assert.equal(r[0].sub, 'filme de 2019');
});

test('sugestões de jogos: Wikipédia + Steam (só jogo, capa em pé) + App Store (só jogo, sem subtítulo), sem repetir nome', async () => {
  const buscar = async (url) => {
    if (url.startsWith(WIKI)) return responde(url.includes('generator=prefixsearch') ? { query: { pages: [{ pageid: 9, index: 1, title: 'Among Us', description: 'jogo eletrônico de 2018' }] } } : {});
    if (url.startsWith(STEAM)) return responde({ items: [{ id: 945360, name: 'Among Us', type: 'app' }, { id: 5, name: 'Among Us Soundtrack', type: 'app' }, { id: 6, name: 'Among Trees', type: 'app' }] });
    if (url.startsWith('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/')) {
      const ids = JSON.parse(new URL(url).searchParams.get('input_json')).ids.map((i) => i.appid);
      assert.deepEqual(ids, [945360, 5, 6]);
      return responde({ response: { store_items: [
        { appid: 945360, success: 1, type: 0, name: 'Among Us', assets: { asset_url_format: 'steam/apps/945360/${FILENAME}?t=1', library_capsule_2x: 'abc/library_capsule_2x.jpg' } },
        { appid: 5, success: 1, type: 11, name: 'Among Us Soundtrack' },
        { appid: 6, success: 1, type: 0, name: 'Among Trees', assets: { asset_url_format: 'steam/apps/6/${FILENAME}?t=2', header: 'header.jpg' } },
      ] } });
    }
    if (url.startsWith(ITUNES)) return responde({ results: [
      { trackName: 'Among Us!', genreIds: ['6014', '7001'], artistName: 'Innersloth', artworkUrl512: 'https://is1-ssl.mzstatic.com/x/512x512bb.jpg' },
      { trackName: 'Among Notes: diário', genreIds: ['6000'], artworkUrl512: 'https://is1-ssl.mzstatic.com/y/512x512bb.jpg' },
      { trackName: 'Minecraft: jogue com amigos!', genreIds: ['6014'], artworkUrl512: 'https://is1-ssl.mzstatic.com/z/512x512bb.jpg' },
    ] });
    return nada;
  };
  const r = await sugerir('jogos', 'among', { buscar });
  assert.deepEqual(r, [
    { t: 'Among Us', sub: 'jogo eletrônico de 2018', capa: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/945360/abc/library_capsule_2x.jpg' },
    { t: 'Among Trees', sub: 'jogo na Steam', capa: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/6/header.jpg' },
  ]);
  // Subtítulo do app sai quando o começo já é o que a pessoa digitou
  const mine = await sugerir('jogos', 'minec', { buscar: async (url) => (url.startsWith(ITUNES) ? buscar(url) : nada) });
  assert.deepEqual(mine.map((x) => x.t), ['Minecraft']);
});

test('sugestões de músicas: Deezer, "Música — Artista", só o que combina com o digitado', async () => {
  const buscar = async (url) =>
    url.startsWith('https://api.deezer.com/search')
      ? responde({ data: [
          { title: 'Vampiro', artist: { name: 'Matuê' }, album: { title: 'Vampiro', cover_big: 'https://cdn-images.dzcdn.net/images/cover/aa/500x500.jpg' } },
          { title: 'Outra', artist: { name: 'Fulano' }, album: { title: 'X', cover_big: 'https://cdn-images.dzcdn.net/images/cover/bb/500x500.jpg' } },
        ] })
      : nada;
  assert.deepEqual(await sugerir('musicas', 'matu', { buscar }), [{ t: 'Vampiro — Matuê', sub: 'Vampiro', capa: 'https://cdn-images.dzcdn.net/images/cover/aa/500x500.jpg' }]);
  // Só capa que o bot mostrou vale quando a pessoa escolhe
  assert.ok(capaSugerida('https://cdn-images.dzcdn.net/images/cover/aa/500x500.jpg'));
  assert.ok(!capaSugerida('https://cdn-images.dzcdn.net/images/cover/bb/500x500.jpg'));
  assert.ok(!capaSugerida('https://golpe.com/x.jpg'));
});

test('sugestões: a mesma busca vem da memória; limite só conta quando precisa ir na internet; internet fora não fica guardada', async () => {
  let idas = 0;
  const buscar = async () => (idas++, responde({ data: [{ title: 'Sweater Weather', artist: { name: 'The Neighbourhood' }, album: { title: 'I Love You.' } }] }));
  assert.equal((await sugerir('musicas', 'sweater w', { buscar })).length, 1);
  assert.equal((await sugerir('musicas', 'Sweater   W', { buscar, podeBuscar: () => false })).length, 1);
  assert.equal(idas, 1);
  assert.equal(await sugerir('musicas', 'sweater weather', { buscar, podeBuscar: () => false }), null);
  // Uma letra só, ou lista que não existe: nem procura
  assert.deepEqual(await sugerir('musicas', 's', { buscar }), []);
  assert.deepEqual(await sugerir('series', 'abc', { buscar }), []);
  const caiu = async () => {
    throw new Error('sem internet');
  };
  assert.deepEqual(await sugerir('musicas', 'bohemian', { buscar: caiu }), []);
  assert.equal((await sugerir('musicas', 'bohemian', { buscar: async () => responde({ data: [{ title: 'Bohemian Rhapsody', artist: { name: 'Queen' }, album: {} }] }) })).length, 1);
});
