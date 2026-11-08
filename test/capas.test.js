// Capa dos favoritos: a busca roda com um fetch de mentira (nada sai pra internet)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acharCapa, capaDaGaleria, capaPermitida } from '../lib/capas.js';

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
