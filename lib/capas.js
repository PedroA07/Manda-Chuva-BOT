// Capa dos favoritos de Meu perfil (jogos, filmes, livros e músicas). O bot procura em fontes públicas que não pedem
// chave de API e só manda o nome do favorito: Steam, Wikipédia, Apple (iTunes) e Open Library. Achou nada: '' e o site
// e o bot usam um banner da galeria no lugar (o mesmo pra o mesmo nome).

const AGENTE = 'MandaChuvaBot/1.0 (+https://pedroa07.github.io/Interface-Manda-Chuva-Bot/)';
// De onde uma capa pode vir (o endereço que fica no perfil e que o site mostra)
const HOSTS = ['steamstatic.com', 'mzstatic.com', 'covers.openlibrary.org', 'upload.wikimedia.org', 'thumb.wikimedia.org', 'dzcdn.net'];
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

// ---------- Sugestões enquanto a pessoa digita (Meu perfil › Favoritos) ----------
// Nome certinho e capa já na lista: a pessoa escolhe e o bot guarda a capa da sugestão (sem procurar de novo).
// Jogos: Wikipédia + Steam + App Store. Filmes e séries: Wikipédia. Livros: Wikipédia + Apple Books + Open Library.
// Músicas: Deezer (entende palavra pela metade, "matu" já acha Matuê).
export const MAX_SUGESTOES = 6;
const semQuery = (url) => (url ? String(url).replace(/\?.*$/, '') : '');
const corta = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const palavras = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Todas as palavras digitadas estão no texto; a última pode estar pela metade ("harry pot" acha "Harry Potter") */
export function combina(texto, q) {
  const tem = palavras(texto);
  const quer = palavras(q);
  const ultima = quer.pop();
  return !!ultima && quer.every((p) => tem.includes(p)) && tem.some((p) => p.startsWith(ultima));
}

// O que a descrição curta da Wikipédia precisa ter (e não pode ter) pra entrar em cada lista
const NA_WIKI = {
  jogos: [/\b(jogos?|videojogo|video ?game)\b/i, /torneio|campeonato|competi|franquia|desenvolvedora|empresa|personagem|azar|cassino|aposta|s[ée]rie de (livros|filmes)/i],
  filmes: [/\b(filme|s[ée]rie|seriado|minissérie|anime|animação|telenovela|novela|documentário|sitcom|reality|desenho animado|film)\b/i, /franquia|s[ée]rie de (livros|filmes|jogos|torneios)|trilha sonora|personagem|jogo eletr|videojogo/i],
  livros: [/\b(livros?|romance|obra|conto|novela|mang[áa]|saga|quadrinhos|banda desenhada|poesia|poema|light novel)\b/i, /filme|s[ée]rie de televisão|franquia de filmes|personagem|editora|jogo eletr|videojogo/i],
};
const RUIDO_WIKI = /desambigua|trilha sonora|canção|single|álbum|município|bairro|episódio|temporada|elenco|lista de/i;
function vaiNaLista(tipo, desc) {
  const [aceita, recusa] = NA_WIKI[tipo];
  if (!aceita.test(desc) || recusa.test(desc) || RUIDO_WIKI.test(desc)) return false;
  // Mangá e quadrinhos só entram em filmes e séries se tiverem anime ou filme ("Naruto" sim, "Vingadores do Espaço" não)
  return tipo !== 'filmes' || !/mang[áa]|quadrinhos/i.test(desc) || /anime|anima[çd]|filme|televis/i.test(desc);
}
// "GTA 5", "CS2": abreviação que não está no título não vira nome do favorito
const abreviacao = (de, titulo) => (de.match(/\b[A-Z0-9]{2,5}\b/g) ?? []).some((s) => /[A-Z]/.test(s) && !titulo.includes(s));

/** Nome brasileiro de cada item do Wikidata ("Avengers: Endgame" é "Vingadores: Ultimato"): Map id -> nome */
async function nomesNoBrasil(buscar, ids) {
  if (!ids.length) return new Map();
  const j = await json(buscar, `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=pt-br&ids=${ids.slice(0, 50).join('|')}`).catch(() => null);
  return new Map(Object.entries(j?.entities ?? {}).map(([id, e]) => [id, e?.labels?.['pt-br']?.value]).filter(([, nome]) => nome));
}

async function wikiSugestoes(buscar, q, tipo) {
  const lista = await paginasDaWiki(buscar, q, tipo);
  const nomes = await nomesNoBrasil(buscar, lista.map((x) => x.wd).filter(Boolean));
  // O nome do Wikidata às vezes está em inglês ("Avengers: Age of Ultron"): se ele não bate com o digitado e o nome da Wikipédia bate, fica o da Wikipédia
  return lista.map(({ wd, ...x }) => {
    const br = nomes.get(wd);
    return { ...x, t: br && (combina(br, q) || !combina(x.t, q)) ? br : x.t };
  });
}

async function paginasDaWiki(buscar, q, tipo) {
  const base = 'https://pt.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=pageimages|description|pageprops&ppprop=wikibase_item&piprop=thumbnail&pithumbsize=500&pilicense=any&redirects=1';
  const vistas = new Set();
  const ler = async (gerador) => {
    const j = await json(buscar, `${base}&${gerador}`);
    // Chegou por redirecionamento? Usa o nome em português que a pessoa digitou ("Jogos Vorazes", não "The Hunger Games");
    // vários pro mesmo lugar: o mais completo ("Vingadores: Ultimato", não "Vingadores 4")
    const de = new Map();
    for (const r of j?.query?.redirects ?? []) {
      if (!combina(r.from, q) || abreviacao(r.from, r.to)) continue;
      if (!de.has(r.to) || r.from.length > de.get(r.to).length) de.set(r.to, r.from);
    }
    return (j?.query?.pages ?? [])
      .filter((p) => !p.missing && !vistas.has(p.pageid) && !/^Lista d/i.test(p.title))
      .filter((p) => vaiNaLista(tipo, p.description ?? ''))
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .map((p) => (vistas.add(p.pageid), { t: (de.get(p.title) ?? p.title).replace(/\s*\([^)]*\)$/, ''), sub: p.description, capa: semQuery(p.thumbnail?.source), wd: p.pageprops?.wikibase_item }));
  };
  const comeco = await ler(`generator=prefixsearch&gpssearch=${enc(q)}&gpslimit=12`);
  // Pouca coisa começando com o que digitou ("pequeno principe" sem o "O"): procura no texto também
  return comeco.length >= 3 ? comeco : [...comeco, ...(await ler(`generator=search&gsrsearch=${enc(q)}&gsrlimit=8`))];
}

async function steamSugestoes(buscar, q) {
  const j = await json(buscar, `https://store.steampowered.com/api/storesearch/?term=${enc(q)}&l=portuguese&cc=BR`);
  const ids = (j?.items ?? []).filter((i) => i.type === 'app').slice(0, 6).map((i) => ({ appid: i.id }));
  if (!ids.length) return [];
  // A capa em pé (600x900) dos jogos novos tem um código no caminho: só essa API diz qual é (e o tipo: 0 = jogo, sem DLC nem trilha)
  const pedido = { ids, context: { language: 'brazilian', country_code: 'BR' }, data_request: { include_assets: true } };
  const g = await json(buscar, `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${enc(JSON.stringify(pedido))}`);
  return (g?.response?.store_items ?? [])
    .filter((s) => s.success === 1 && s.type === 0 && s.name)
    .slice(0, 3)
    .map((s) => {
      const a = s.assets ?? {};
      const arquivo = a.library_capsule_2x ?? a.library_capsule ?? a.header;
      const capa = arquivo && a.asset_url_format ? `https://shared.akamai.steamstatic.com/store_item_assets/${semQuery(a.asset_url_format.replace('${FILENAME}', arquivo))}` : '';
      return { t: s.name, sub: 'jogo na Steam', capa };
    });
}

/** "Minecraft: jogue com amigos!" vira "Minecraft" (o nome antes do subtítulo, se ainda for o que a pessoa digitou) */
function nomeDeApp(nome, q) {
  const n = String(nome ?? '').replace(/[®™]/g, '').trim();
  const [antes] = n.split(/\s*[:|–—]\s+|\s+-\s+/);
  return antes.length >= 3 && combina(antes, q) ? antes : n;
}
async function appSugestoes(buscar, q) {
  const j = await json(buscar, `https://itunes.apple.com/search?term=${enc(q)}&media=software&country=br&limit=10`);
  return (j?.results ?? [])
    .filter((r) => r.genreIds?.includes('6014')) // 6014 = Jogos
    .map((r) => ({ t: nomeDeApp(r.trackName, q), sub: `jogo de celular · ${r.artistName ?? ''}`, capa: em600(r.artworkUrl512 ?? r.artworkUrl100) ?? '' }))
    .filter((x) => combina(x.t, q))
    .slice(0, 2);
}

async function livroSugestoes(buscar, q) {
  const j = await json(buscar, `https://itunes.apple.com/search?term=${enc(q)}&media=ebook&country=br&limit=10`);
  return (j?.results ?? []).filter((r) => combina(r.trackName, q)).map((r) => ({ t: r.trackName, sub: r.artistName ?? '', capa: em600(r.artworkUrl100) ?? '' }));
}
async function openLibrarySugestoes(buscar, q) {
  const j = await json(buscar, `https://openlibrary.org/search.json?q=${enc(q)}&limit=8&fields=title,author_name,cover_i`);
  return (j?.docs ?? []).filter((d) => d.cover_i && combina(d.title, q)).map((d) => ({ t: d.title, sub: d.author_name?.[0] ?? '', capa: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` }));
}

async function musicaSugestoes(buscar, q) {
  const j = await json(buscar, `https://api.deezer.com/search?q=${enc(q)}&limit=15`);
  return (j?.data ?? [])
    .filter((x) => x.title && combina(`${x.title} ${x.artist?.name ?? ''}`, q))
    .map((x) => ({ t: x.artist?.name ? `${x.title} — ${x.artist.name}` : x.title, sub: x.album?.title ?? '', capa: x.album?.cover_big ?? x.album?.cover_medium ?? '' }));
}

// Fontes de cada lista, na ordem de preferência (a primeira que trouxer um nome fica com ele)
const SUGESTOES = {
  jogos: [(b, q) => wikiSugestoes(b, q, 'jogos'), steamSugestoes, appSugestoes],
  filmes: [(b, q) => wikiSugestoes(b, q, 'filmes')],
  livros: [(b, q) => wikiSugestoes(b, q, 'livros'), livroSugestoes, openLibrarySugestoes],
  musicas: [musicaSugestoes],
};

/** Junta as fontes sem repetir nome; se a primeira não tinha capa, fica a de uma repetida */
function juntar(listas) {
  const vistos = new Map();
  for (const x of listas.flat()) {
    const t = corta(String(x?.t ?? '').replace(/\s+/g, ' ').trim(), 60);
    const k = simples(t);
    if (!k) continue;
    const capa = capaPermitida(x.capa) ? x.capa : '';
    const ja = vistos.get(k);
    if (ja) {
      if (!ja.capa) ja.capa = capa;
    } else vistos.set(k, { t, sub: corta(String(x.sub ?? '').trim(), 80), capa });
  }
  return [...vistos.values()].slice(0, MAX_SUGESTOES);
}

const GUARDA = 6 * 3_600_000;
const respostas = new Map(); // "tipo:texto" -> { em, itens }
const mostradas = new Map(); // capa -> quando apareceu numa sugestão
function lembrar(mapa, chave, valor, max) {
  mapa.delete(chave);
  mapa.set(chave, valor);
  if (mapa.size > max) mapa.delete(mapa.keys().next().value);
}

/**
 * Até 6 sugestões { t, sub, capa } pro que a pessoa está digitando. A mesma busca fica guardada 6 horas.
 * podeBuscar() é chamado só quando precisa ir na internet; se devolver false, a resposta é null (limite da pessoa).
 */
export async function sugerir(tipo, q, { buscar = fetch, podeBuscar = () => true, agora = Date.now() } = {}) {
  const texto = String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!SUGESTOES[tipo] || simples(texto).length < 2) return [];
  const chave = `${tipo}:${palavras(texto).join(' ')}`;
  const guardada = respostas.get(chave);
  if (guardada && agora - guardada.em < GUARDA) return guardada.itens;
  if (!podeBuscar()) return null;
  let respondeu = false;
  const listas = await Promise.all(SUGESTOES[tipo].map((f) => f(buscar, texto).then((l) => ((respondeu = true), l), () => [])));
  const itens = juntar(listas);
  // Internet fora não fica guardado como "nada achado"
  if (respondeu) lembrar(respostas, chave, { em: agora, itens }, 400);
  for (const i of itens) if (i.capa) lembrar(mostradas, i.capa, agora, 4000);
  return itens;
}

/** A capa veio de uma sugestão recente do bot? Só essas valem quando a pessoa escolhe (o site não manda imagem qualquer). */
export function capaSugerida(url, agora = Date.now()) {
  const em = mostradas.get(url);
  return !!em && agora - em < GUARDA && capaPermitida(url);
}

// Cada um digitando: até 40 buscas novas por minuto (as repetidas saem da memória e não contam)
const DIGITANDO = 60_000, MAX_DIGITANDO = 40;
const digitando = new Map();
export function podeSugerir(userId, agora = Date.now()) {
  const recentes = (digitando.get(userId) ?? []).filter((t) => agora - t < DIGITANDO);
  const pode = recentes.length < MAX_DIGITANDO;
  if (pode) recentes.push(agora);
  digitando.set(userId, recentes);
  return pode;
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
