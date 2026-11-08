// Capa dos favoritos de Meu perfil (jogos, filmes, livros e músicas). O bot procura em fontes públicas que não pedem
// chave de API e só manda o nome do favorito: Steam, Wikipédia, Apple (iTunes) e Open Library. Achou nada: '' e o site
// e o bot usam um banner da galeria no lugar (o mesmo pra o mesmo nome).

const AGENTE = 'MandaChuvaBot/1.0 (+https://pedroa07.github.io/Interface-Manda-Chuva-Bot/)';
// De onde uma capa pode vir (o endereço que fica no perfil e que o site mostra)
const HOSTS = ['steamstatic.com', 'mzstatic.com', 'covers.openlibrary.org', 'upload.wikimedia.org'];
// Plano B: categorias da galeria pra cada lista (as mesmas do protótipo)
const GALERIA = { jogos: ['jogos'], filmes: ['diversos', 'desenhos'], livros: ['desenhos', 'animais'], musicas: ['musica'] };

export const TIPOS_FAVORITOS = Object.keys(GALERIA);

/** Endereço https de uma das fontes conhecidas */
export function capaPermitida(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Banner da galeria no lugar da capa: sempre o mesmo pro mesmo nome */
export function capaDaGaleria(tipo, nome) {
  let x = 0;
  for (const ch of String(nome)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const cats = GALERIA[tipo] ?? GALERIA.jogos;
  return `banners/perfil/${cats[x % cats.length]}-${(x % 8) + 1}.jpg`;
}

// Comparação sem acento, maiúscula nem pontuação: "Among Us" = "among us"
const simples = (t) => String(t ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/** O nome achado é o procurado, ou ele com um complemento: "Minecraft: jogue com amigos!", "Evidências (Ao Vivo)". "CS2 Case Clicker" não é "CS2". */
function mesmoNome(achado, procurado) {
  const a = String(achado ?? '').trim(), p = String(procurado ?? '').trim();
  if (simples(a) === simples(p)) return !!simples(p);
  return simples(a.slice(0, p.length)) === simples(p) && /^\s*[:(\-–—|]/.test(a.slice(p.length));
}

const enc = encodeURIComponent;
async function json(buscar, url) {
  const r = await buscar(url, { headers: { 'User-Agent': AGENTE, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  return r.ok ? r.json() : null;
}
const existe = async (buscar, url) => (await buscar(url, { method: 'HEAD', headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(6000) })).ok;
const em600 = (url) => url?.replace(/\/\d+x\d+bb\./, '/600x600bb.');

async function steam(buscar, nome) {
  const j = await json(buscar, `https://store.steampowered.com/api/storesearch/?term=${enc(nome)}&l=portuguese&cc=BR`);
  const item = j?.items?.find((i) => simples(i.name) === simples(nome));
  if (!item) return null;
  const emPe = `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/library_600x900.jpg`;
  return (await existe(buscar, emPe)) ? emPe : `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`;
}

async function wikipedia(buscar, nome, dica) {
  const url = `https://pt.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${enc(`${nome} ${dica}`)}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=600&pilicense=any`;
  const pagina = Object.values((await json(buscar, url))?.query?.pages ?? {})[0];
  return pagina?.thumbnail?.source?.replace(/\?.*$/, '') ?? null;
}

async function itunes(buscar, nome, media, entity) {
  const [titulo] = String(nome).split(/\s+[—–-]\s+/);
  const termo = String(nome).replace(/\s+[—–-]\s+/g, ' ');
  const j = await json(buscar, `https://itunes.apple.com/search?term=${enc(termo)}&media=${media}${entity ? `&entity=${entity}` : ''}&country=br&limit=5`);
  const r = j?.results?.find((x) => mesmoNome(x.trackName, titulo));
  return em600(r?.artworkUrl512 ?? r?.artworkUrl100) ?? null;
}

async function openLibrary(buscar, nome) {
  const j = await json(buscar, `https://openlibrary.org/search.json?q=${enc(nome)}&limit=5&fields=title,cover_i`);
  const doc = j?.docs?.find((d) => d.cover_i && simples(d.title).startsWith(simples(nome).slice(0, 12)));
  return doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null;
}

// Em que ordem procurar cada tipo
const ORDEM = {
  jogos: [(b, n) => steam(b, n), (b, n) => wikipedia(b, n, 'jogo eletrônico'), (b, n) => itunes(b, n, 'software')],
  filmes: [(b, n) => wikipedia(b, n, 'filme')],
  livros: [(b, n) => openLibrary(b, n), (b, n) => wikipedia(b, n, 'livro')],
  musicas: [(b, n) => itunes(b, n, 'music', 'song')],
};

/** Endereço da capa, ou '' se não achou (internet fora também dá ''). buscar = fetch (os testes trocam). */
export async function acharCapa(tipo, nome, buscar = fetch) {
  for (const fonte of ORDEM[tipo] ?? []) {
    const url = await fonte(buscar, nome).catch(() => null);
    if (url && capaPermitida(url)) return url;
  }
  return '';
}

// Cada favorito novo dispara buscas nas fontes (que têm limite): até 15 a cada 10 minutos por pessoa
const JANELA = 10 * 60_000, MAX_BUSCAS = 15;
const buscas = new Map();
/** Conta a busca quando deixa passar */
export function podeProcurar(userId, agora = Date.now()) {
  const recentes = (buscas.get(userId) ?? []).filter((t) => agora - t < JANELA);
  const pode = recentes.length < MAX_BUSCAS;
  if (pode) recentes.push(agora);
  buscas.set(userId, recentes);
  return pode;
}
