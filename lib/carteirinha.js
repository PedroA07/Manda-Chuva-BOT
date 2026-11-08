// Carteirinha do /perfil: imagem 1000×560 com banner, foto, nome, medalhas, cargos e números. Se o banner ou a foto
// for GIF animado, sai um GIF. O GIF é feito em outra linha de execução e um por vez: a hospedagem grátis tem pouca
// CPU e o bot não pode parar de responder enquanto isso. Qualquer problema no GIF vira PNG com o primeiro quadro.
import { Worker } from 'node:worker_threads';
import { AP_PADRAO, corDeDestaque, DEGRADES, textoSobre } from './aparencia.js';
import { cobrir, fonte, foto, imagem, largura, linha } from './card.js';
import { canvas as carregarCanvas } from './canvas.js';
import { ehAnimado, FilmeGif, linhaDoTempo } from './gif.js';
import { cabeNaMemoria } from './imagem.js';

const L = 1000, A = 560, ALTO_BANNER = 300, MARGEM = 32;
const TINTA = '#1B1F33', CREME = '#FFFCF4', CINZA = '#5A5E6E', COR_SEM_BANNER = '#4A63C9';
const FOTO = { x: 103, y: 307, r: 64, creme: 71, tinta: 75 };
const TEXTO_X = 196;
const MEDALHA = { tam: 64, vao: 6, y: 312 };
// Fonte do nome (Aparência): [família registrada no canvas, tamanho], na mesma proporção do site
const FONTE_DO_NOME = {
  Graduate: ['Graduate', 42], 'Bricolage Grotesque': ['Bricolage Medium', 46], 'Permanent Marker': ['Permanent Marker', 46], Caveat: ['Caveat', 56],
  Pacifico: ['Pacifico', 42], Bungee: ['Bungee', 38], 'Press Start 2P': ['Press Start 2P', 26], 'JetBrains Mono': ['JetBrains Mono', 38],
};

const DIA = 864e5;
const LIMITE_DISCORD = 9.5 * 1024 * 1024; // servidor sem impulso aceita 10 MB por arquivo
const ESCALAS = [1, 0.7]; // o Discord mostra a imagem com uns 550 px: 700 px continua nítido
const QUALIDADE_GIF = 20; // 1 a 30: quanto maior, mais rápido
const TOLERANCIA = 8; // diferença de cor que ninguém nota: não vale redesenhar o pixel
const TEMPO_MAX = 120_000;
const MAX_NA_FILA = 3;

/** As fontes do bot não têm emoji: tira o emoji e transforma letra enfeitada (𝓟𝓮𝓭𝓻𝓸) em letra normal */
export function textoDesenhavel(t) {
  return String(t ?? '')
    .normalize('NFKC')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nomeDoArquivo(nome, ext) {
  const limpo = textoDesenhavel(nome).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `perfil-${limpo.slice(0, 40).replace(/^-+|-+$/g, '') || 'membro'}.${ext}`;
}

/** "entrou há 3 meses" */
export function tempoDeCasa(entrou, agora = Date.now()) {
  if (!entrou) return '';
  const dias = Math.floor((agora - entrou) / DIA);
  if (dias < 1) return 'entrou hoje';
  if (dias < 30) return `entrou há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const anos = Math.floor(dias / 365);
  if (anos) return `entrou há ${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  const meses = Math.max(1, Math.floor(dias / 30.44));
  return `entrou há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

/** Só abre imagem de tamanho conhecido e razoável */
const abrir = (C, b) => (cabeNaMemoria(b) ? imagem(C, b) : null);
const nomeNaImagem = (d) => textoDesenhavel(d.nome) || textoDesenhavel(d.usuario) || 'Membro';

function circulo(ctx, x, y, r, cor) {
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** O que passar da altura do banner fica escondido: o corpo é pintado por cima */
function pintarBanner(ctx, img, cor) {
  ctx.fillStyle = cor || COR_SEM_BANNER;
  ctx.fillRect(0, 0, L, ALTO_BANNER);
  if (img) cobrir(ctx, img, 0, 0, L, ALTO_BANNER);
}

const pintarFoto = (ctx, img, nome) => foto(ctx, img, FOTO.x - FOTO.r, FOTO.y - FOTO.r, FOTO.r * 2, FOTO.r, nome);

/** Cargos em pílulas, até acabar a largura */
function pilulas(ctx, cargos, y) {
  const ALTO = 36, BOLA = 16, PAD = 12;
  let x = MARGEM;
  for (const c of cargos) {
    const nome = textoDesenhavel(c.nome);
    if (!nome) continue;
    const t = linha(ctx, nome, 'Bricolage ExtraBold', 21, 340);
    const w = PAD + BOLA + 8 + largura(ctx, t) + PAD + 4;
    if (x + w > L - MARGEM) break;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, ALTO, ALTO / 2);
    ctx.fill();
    ctx.stroke();
    circulo(ctx, x + PAD + BOLA / 2, y + ALTO / 2, BOLA / 2, TINTA);
    circulo(ctx, x + PAD + BOLA / 2, y + ALTO / 2, BOLA / 2 - 2, c.cor);
    fonte(ctx, t);
    ctx.fillStyle = TINTA;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.t, x + PAD + BOLA + 8, y + ALTO / 2 + 1);
    x += w + 10;
  }
}

/** Caixa dos 3 números: mensagens, em call e medalhas */
function numeros(ctx, stats, y) {
  const l = L - MARGEM * 2, a = 72, col = l / stats.length;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(MARGEM, y, l, a, 16);
  ctx.fill();
  ctx.stroke();
  stats.forEach(([valor, rotulo], i) => {
    const x = MARGEM + col * i;
    if (i) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + a);
      ctx.stroke();
    }
    const v = linha(ctx, String(valor), 'Graduate', 30, col - 24);
    fonte(ctx, v);
    ctx.fillStyle = TINTA;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(v.t, x + col / 2, y + 38);
    const r = linha(ctx, String(rotulo).toUpperCase(), 'Bricolage Bold', 16, col - 24, { esp: 0.05 });
    fonte(ctx, r);
    ctx.fillStyle = CINZA;
    ctx.fillText(r.t, x + col / 2, y + 60);
  });
}

/** Nome com a fonte e a cor (ou o degradê) que a pessoa escolheu. Fonte de letra grande sobe um pouco pra não pisar na linha de baixo. */
function pintarNome(ctx, d, ap, cor, ate, x = TEXTO_X, base = 350) {
  const [fam, tam] = FONTE_DO_NOME[ap.fonte] ?? FONTE_DO_NOME.Graduate;
  const nome = linha(ctx, nomeNaImagem(d), fam, tam, ate - x);
  fonte(ctx, nome);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(nome.t);
  const y = base - Math.max(0, Math.round(m.actualBoundingBoxDescent) - 8);
  if (ap.nomeTipo === 'degrade') {
    const [c1, c2] = DEGRADES[ap.grad] ?? DEGRADES[0];
    const g = ctx.createLinearGradient(x, 0, x + m.width, 0);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = ap.nome || cor;
  ctx.fillText(nome.t, x, y);
}

function pintarRodape(ctx, d, cor, y) {
  const rodape = linha(ctx, textoDesenhavel(d.rodape), 'Graduate', 15, L - MARGEM * 2, { esp: 0.14 });
  fonte(ctx, rodape);
  ctx.fillStyle = cor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(rodape.t, MARGEM, y);
}

/** Tudo o que não mexe: corpo na cor do fundo, anel da foto, nome, medalhas, cargos, números e rodapé (a ficha é mais comprida) */
function pintarCorpo(ctx, d, medalhas, { alto = A, comRodape = true } = {}) {
  const ap = { ...AP_PADRAO, ...d.ap };
  const { txt, sub } = textoSobre(ap.fundo);
  ctx.fillStyle = ap.fundo;
  ctx.fillRect(0, ALTO_BANNER, L, alto - ALTO_BANNER);
  ctx.fillStyle = TINTA;
  ctx.fillRect(0, ALTO_BANNER, L, 6);
  circulo(ctx, FOTO.x, FOTO.y, FOTO.tinta, TINTA);
  circulo(ctx, FOTO.x, FOTO.y, FOTO.creme, CREME);

  const fixadas = medalhas.slice(0, 3);
  const n = fixadas.length;
  fixadas.forEach((m, i) => {
    const faltam = n - i;
    ctx.drawImage(m, L - MARGEM - faltam * MEDALHA.tam - (faltam - 1) * MEDALHA.vao, MEDALHA.y, MEDALHA.tam, MEDALHA.tam);
  });
  const fimDoTexto = L - MARGEM - n * (MEDALHA.tam + MEDALHA.vao) - 10;

  pintarNome(ctx, d, ap, txt, fimDoTexto);
  if (d.entrou) {
    const linhaSub = linha(ctx, d.entrou, 'Bricolage Bold', 22, fimDoTexto - TEXTO_X);
    fonte(ctx, linhaSub);
    ctx.fillStyle = sub;
    ctx.fillText(linhaSub.t, TEXTO_X, 378);
  }
  pilulas(ctx, d.cargos ?? [], 392);
  numeros(ctx, d.stats ?? [], 440);
  if (comRodape) pintarRodape(ctx, d, sub, 538);
}

/** Abre e filtra as medalhas (a que não abrir fica de fora) */
const abrirMedalhas = async (C, lista) => (await Promise.all((lista ?? []).map((b) => abrir(C, b)))).filter(Boolean);

async function estatica(C, d) {
  const tela = C.createCanvas(L, A);
  const ctx = tela.getContext('2d');
  pintarBanner(ctx, await abrir(C, d.banner), d.cor);
  pintarCorpo(ctx, d, await abrirMedalhas(C, d.medalhas));
  pintarFoto(ctx, await abrir(C, d.avatar), nomeNaImagem(d));
  return tela.toBuffer('image/png');
}

/** Pedaço da imagem que muda entre os quadros: quanto menor, mais leve o GIF */
function areaQueMexe(filmes, escala) {
  const [x0, y0, x1, y1] = filmes.banner
    ? [0, 0, L, filmes.foto ? FOTO.y + FOTO.tinta : ALTO_BANNER]
    : [FOTO.x - FOTO.tinta, FOTO.y - FOTO.tinta, FOTO.x + FOTO.tinta, FOTO.y + FOTO.tinta];
  const x = Math.floor(x0 * escala), y = Math.floor(y0 * escala);
  return { x, y, l: Math.ceil(x1 * escala) - x, a: Math.ceil(y1 * escala) - y };
}

/** Deixa transparente (= "fica como está") o que não mudou e atualiza "tela", o que quem assiste está vendo */
function soOQueMudou(px, tela) {
  for (let i = 0; i < px.length; i += 4) {
    const igual = Math.abs(px[i] - tela[i]) <= TOLERANCIA && Math.abs(px[i + 1] - tela[i + 1]) <= TOLERANCIA && Math.abs(px[i + 2] - tela[i + 2]) <= TOLERANCIA;
    if (igual) {
      px[i + 3] = 0;
    } else {
      tela[i] = px[i];
      tela[i + 1] = px[i + 1];
      tela[i + 2] = px[i + 2];
    }
  }
}

/** Telinha que recebe os pixels de um filme a cada instante, pra poder desenhar com escala */
function telaDoFilme(C, filme) {
  if (!filme) return null;
  const tela = C.createCanvas(filme.largura, filme.altura);
  const ctx = tela.getContext('2d');
  const dados = new C.ImageData(filme.pixels, filme.largura, filme.altura);
  return {
    em(t) {
      filme.em(t);
      ctx.putImageData(dados, 0, 0);
      return tela;
    },
  };
}

async function montarGif(C, d, filmes, instantes, escala) {
  const W = Math.round(L * escala), H = Math.round(A * escala);
  const tela = C.createCanvas(W, H);
  const ctx = tela.getContext('2d');
  ctx.scale(escala, escala);
  const corpo = C.createCanvas(W, H);
  const cctx = corpo.getContext('2d');
  cctx.scale(escala, escala);
  pintarCorpo(cctx, d, await abrirMedalhas(C, d.medalhas));

  const bannerFixo = filmes.banner ? null : await abrir(C, d.banner);
  const fotoFixa = filmes.foto ? null : await abrir(C, d.avatar);
  const filmeBanner = telaDoFilme(C, filmes.banner), filmeFoto = telaDoFilme(C, filmes.foto);
  const area = areaQueMexe(filmes, escala);
  const nome = nomeNaImagem(d);
  const gif = new C.GifEncoder(W, H, { repeat: 0, quality: QUALIDADE_GIF });
  let visto = null;
  instantes.forEach(({ t, delay }, i) => {
    pintarBanner(ctx, filmeBanner ? filmeBanner.em(t) : bannerFixo, d.cor);
    ctx.drawImage(corpo, 0, 0, L, A);
    pintarFoto(ctx, filmeFoto ? filmeFoto.em(t) : fotoFixa, nome);
    if (!i) {
      gif.addFrame(new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer), W, H, { delay });
      visto = ctx.getImageData(area.x, area.y, area.l, area.a).data;
      return;
    }
    const px = ctx.getImageData(area.x, area.y, area.l, area.a).data;
    soOQueMudou(px, visto);
    gif.addFrame(new Uint8Array(px.buffer), area.l, area.a, { delay, left: area.x, top: area.y });
  });
  return gif.finish();
}

const emBuffer = (b) => (b ? Buffer.from(b.buffer, b.byteOffset, b.length) : null);

/** Monta o GIF (roda dentro do carteirinha-trabalho.js). null se não couber no limite nem na menor escala. */
export async function animar(entrada, { limite = LIMITE_DISCORD } = {}) {
  const C = await carregarCanvas();
  if (!C) return null;
  const d = { ...entrada, banner: emBuffer(entrada.banner), avatar: emBuffer(entrada.avatar), medalhas: (entrada.medalhas ?? []).map(emBuffer) };
  const filmes = { banner: ehAnimado(d.banner) ? new FilmeGif(d.banner) : null, foto: ehAnimado(d.avatar) ? new FilmeGif(d.avatar) : null };
  const instantes = linhaDoTempo([filmes.banner, filmes.foto].filter(Boolean));
  for (const escala of ESCALAS) {
    const gif = await montarGif(C, d, filmes, instantes, escala);
    if (gif.length <= limite) return gif;
  }
  return null;
}

function noTrabalhador(d, { tempo = TEMPO_MAX, limite } = {}) {
  return new Promise((pronto) => {
    const trabalhador = new Worker(new URL('./carteirinha-trabalho.js', import.meta.url), {
      workerData: { d, limite },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    const acabar = (gif) => {
      clearTimeout(relogio);
      trabalhador.terminate();
      pronto(gif);
    };
    const relogio = setTimeout(() => acabar(null), tempo);
    trabalhador.once('message', (gif) => acabar(emBuffer(gif)));
    trabalhador.once('error', (erro) => {
      console.error('Carteirinha em GIF:', erro.message);
      acabar(null);
    });
    trabalhador.once('exit', () => acabar(null));
  });
}

let fila = Promise.resolve();
let naFila = 0;
/** GIF um por vez. Fila cheia: null, e a pessoa recebe PNG em vez de esperar minutos. */
function gifNaFila(d, opcoes) {
  if (naFila >= MAX_NA_FILA) return null;
  naFila++;
  const vez = fila
    .then(() => noTrabalhador(d, opcoes))
    .catch((erro) => {
      console.error('Carteirinha em GIF:', erro.message);
      return null;
    });
  fila = vez.finally(() => naFila--);
  return vez;
}

/**
 * @param {{ banner?: Buffer | null, cor?: string | null, avatar?: Buffer | null, nome: string, usuario?: string, entrou?: string,
 *   medalhas?: Buffer[], cargos?: { nome: string, cor: string }[], stats?: [string, string][], rodape?: string }} d
 * @param {{ tempo?: number, limite?: number }} [opcoes] tempo máximo do GIF e tamanho máximo do arquivo
 * @returns {Promise<{ buffer: Buffer, ext: 'png' | 'gif' } | null>} null se o canvas não carregou nesta máquina
 */
export async function desenharCarteirinha(d, opcoes) {
  const C = await carregarCanvas();
  if (!C) return null;
  if (ehAnimado(d.banner) || ehAnimado(d.avatar)) {
    const gif = await gifNaFila(d, opcoes);
    if (gif) return { buffer: gif, ext: 'gif' };
  }
  return { buffer: await estatica(C, d), ext: 'png' };
}

// ---------- Ficha: /perfil completo, /trofeus e /aniversario ver ----------
// Mesma largura da carteirinha; a altura cresce com as seções. Sai sempre em PNG (com o primeiro quadro, se o banner for GIF).
const TROFEU = { tam: 86, vao: 9 };
const VAO_SECAO = 26;
const ROTULO = 22; // altura das letras dos rótulos (ANIVERSÁRIO, TROFÉUS…)
const CABECALHO = { cx: MARGEM + 52, cy: MARGEM + 52, r: 44 };

function rotulo(ctx, texto, y, cor) {
  const l = linha(ctx, texto, 'Bricolage ExtraBold', ROTULO, L - MARGEM * 2, { esp: 0.14 });
  fonte(ctx, l);
  ctx.fillStyle = cor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(l.t, MARGEM, y);
}

/** Seções da ficha e a altura de cada uma. trofeus = imagens que abriram. */
function secoesDaFicha(d, trofeus) {
  const lista = [];
  if (d.niver != null) lista.push({ tipo: 'niver', alto: ROTULO + 8 + 34 });
  if (d.trofeus) {
    const porLinha = Math.floor((L - MARGEM * 2 + TROFEU.vao) / (TROFEU.tam + TROFEU.vao));
    const linhas = Math.max(1, Math.ceil(trofeus.length / porLinha));
    lista.push({ tipo: 'trofeus', alto: ROTULO + 12 + linhas * TROFEU.tam + (linhas - 1) * TROFEU.vao, porLinha });
  }
  return lista;
}

function pintarSecao(ctx, s, d, y, cores, destaque, trofeus) {
  if (s.tipo === 'niver') {
    rotulo(ctx, 'ANIVERSÁRIO', y, destaque);
    const v = linha(ctx, textoDesenhavel(d.niver), 'Bricolage Bold', 32, L - MARGEM * 2);
    fonte(ctx, v);
    ctx.fillStyle = cores.txt;
    ctx.textBaseline = 'top';
    ctx.fillText(v.t, MARGEM, y + ROTULO + 8);
  } else if (s.tipo === 'trofeus') {
    rotulo(ctx, `TROFÉUS · ${d.trofeus.ganhas ?? trofeus.length} DE ${d.trofeus.total}`, y, destaque);
    trofeus.forEach((img, i) => {
      const col = i % s.porLinha, lin = Math.floor(i / s.porLinha);
      ctx.drawImage(img, MARGEM + col * (TROFEU.tam + TROFEU.vao), y + ROTULO + 12 + lin * (TROFEU.tam + TROFEU.vao), TROFEU.tam, TROFEU.tam);
    });
  }
}

/** Cabeçalho da ficha com título: foto pequena, nome na aparência da pessoa e o título na cor de destaque */
function pintarCabecalho(ctx, d, ap, cores, destaque, titulo, avatar) {
  const { cx, cy, r } = CABECALHO;
  circulo(ctx, cx, cy, r + 8, TINTA);
  circulo(ctx, cx, cy, r + 5, CREME);
  foto(ctx, avatar, cx - r, cy - r, r * 2, r, nomeNaImagem(d));
  const x = cx + r + 26;
  pintarNome(ctx, d, ap, cores.txt, L - MARGEM, x, cy + 4);
  const t = linha(ctx, titulo, 'Bricolage ExtraBold', ROTULO, L - MARGEM - x, { esp: 0.14 });
  fonte(ctx, t);
  ctx.fillStyle = destaque;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t.t, x, cy + 40);
}

/**
 * Ficha do /perfil completo (tipo 'completo': a carteirinha em cima) ou do /trofeus e /aniversario ver (tipo 'titulo').
 * d = dados da carteirinha + niver (texto pronto) e/ou trofeus { imgs: Buffer[], ganhas, total }.
 * @returns {Promise<Buffer | null>} PNG, ou null se o canvas não carregou nesta máquina
 */
export async function desenharFicha(d, { tipo = 'completo', titulo = '' } = {}) {
  const C = await carregarCanvas();
  if (!C) return null;
  const ap = { ...AP_PADRAO, ...d.ap }, cores = textoSobre(ap.fundo), destaque = corDeDestaque(ap);
  const trofeus = d.trofeus ? await abrirMedalhas(C, d.trofeus.imgs) : [];
  const secoes = secoesDaFicha(d, trofeus);
  const topo = tipo === 'completo' ? 540 : 166;
  const alto = topo + secoes.reduce((a, s, i) => a + s.alto + (i ? VAO_SECAO : 0), 0) + 58;
  const tela = C.createCanvas(L, alto);
  const ctx = tela.getContext('2d');
  const avatar = await abrir(C, d.avatar);
  if (tipo === 'completo') {
    pintarBanner(ctx, await abrir(C, d.banner), d.cor);
    pintarCorpo(ctx, d, await abrirMedalhas(C, d.medalhas), { alto, comRodape: false });
    pintarFoto(ctx, avatar, nomeNaImagem(d));
  } else {
    ctx.fillStyle = ap.fundo;
    ctx.fillRect(0, 0, L, alto);
    pintarCabecalho(ctx, d, ap, cores, destaque, titulo, avatar);
  }
  let y = topo;
  for (const s of secoes) {
    pintarSecao(ctx, s, d, y, cores, destaque, trofeus);
    y += s.alto + VAO_SECAO;
  }
  pintarRodape(ctx, d, cores.sub, alto - 22);
  return tela.toBuffer('image/png');
}
