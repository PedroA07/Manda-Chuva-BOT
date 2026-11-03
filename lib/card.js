// Cards desenhados no bot: fundo + placa creme centralizada com a foto de perfil de verdade, o nome e os textos.
// A placa é sólida pra que o texto nunca fique em cima da ilustração (600:260 do design, desenhado em dobro).
import { canvas as carregarCanvas } from './canvas.js';

const L = 1200, A = 520;
const TINTA = '#1B1F33', CREME = '#FFFCF4', VERMELHO = '#C4363C', CINZA = '#5A5E6E', MOSTARDA = '#F2C14E';

/** Maior fonte (até "base") com que o texto cabe em "max". medir(texto, tamanho) → largura */
export function ajustarFonte(medir, texto, base, max, min = 20) {
  let t = base;
  while (t > min && medir(texto, t) > max) t -= 2;
  return t;
}

async function imagem(C, buf) {
  if (!buf) return null;
  try {
    return await C.loadImage(buf);
  } catch {
    return null;
  }
}

/** Desenha a imagem cobrindo o retângulo (como object-fit: cover) */
function cobrir(ctx, img, x, y, l, a) {
  const e = Math.max(l / img.width, a / img.height);
  const lw = img.width * e, ah = img.height * e;
  ctx.drawImage(img, x + (l - lw) / 2, y + (a - ah) / 2, lw, ah);
}

/** Canvas 1200×520 com o fundo cobrindo tudo (cinza do Discord se não tiver fundo) */
async function comFundo(C, fundo) {
  const canvas = C.createCanvas(L, A);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, L, A);
  const img = await imagem(C, fundo);
  if (img) cobrir(ctx, img, 0, 0, L, A);
  return { canvas, ctx };
}

/** Placa creme com borda de tinta e sombra dura (sem desfoque) */
function placa(ctx, x, y, l, a) {
  ctx.fillStyle = TINTA;
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 8, l, a, 28);
  ctx.fill();
  ctx.fillStyle = CREME;
  ctx.beginPath();
  ctx.roundRect(x, y, l, a, 28);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = TINTA;
  ctx.stroke();
}

/** Mede e escreve com fonte, tamanho e espaçamento entre letras */
function fonte(ctx, l) {
  ctx.font = `${l.tam}px "${l.fam}"`;
  ctx.letterSpacing = `${l.esp ? l.tam * l.esp : 0}px`;
}
const largura = (ctx, l) => (fonte(ctx, l), ctx.measureText(l.t).width);

/** Linha de texto que encolhe até caber em "max" */
function linha(ctx, t, fam, tam, max, extra = {}) {
  const l = { t, fam, esp: 0, ...extra, tam };
  l.tam = ajustarFonte((texto, n) => largura(ctx, { ...l, t: texto, tam: n }), t, tam, max, 12);
  return l;
}

/** Foto (ou a inicial num fundo colorido) recortada em círculo ou quadrado arredondado */
function foto(ctx, avatar, x, y, tam, raio, nome, fundoInicial = '#5865f2') {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, tam, tam, raio);
  ctx.clip();
  if (avatar) cobrir(ctx, avatar, x, y, tam, tam);
  else {
    ctx.fillStyle = fundoInicial;
    ctx.fillRect(x, y, tam, tam);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${Math.round(tam * 0.42)}px "Graduate"`;
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((nome || '?').trim().charAt(0).toUpperCase(), x + tam / 2, y + tam / 2 + 2);
  }
  ctx.restore();
}

/** Etiqueta: retângulo arredondado com o texto dentro (alinhado à esquerda em x, ou centrado se centro) */
function etiqueta(ctx, l, x, y, { fundo, cor, padX, padY, raio, centro }) {
  const w = largura(ctx, l) + padX * 2, h = l.tam * 1.25 + padY * 2;
  const x0 = centro ? x - w / 2 : x;
  ctx.fillStyle = fundo;
  ctx.beginPath();
  ctx.roundRect(x0, y, w, h, raio);
  ctx.fill();
  fonte(ctx, l);
  ctx.fillStyle = cor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(l.t, x0 + padX, y + h / 2 + 1);
  return h;
}

/**
 * Card de boas-vindas. A cor do texto antiga (corTexto) não é mais usada: o texto fica sempre na placa creme.
 * @param {{ fundo?: Buffer | null, avatar?: Buffer | null, nome: string, cima?: string, baixo?: string,
 *   layout?: 'centro' | 'lado', forma?: 'circulo' | 'quadrado', corTexto?: string, corBorda?: string }} c
 * @returns {Promise<Buffer | null>} PNG 1200×520 (null se o canvas não carregou nesta máquina)
 */
export async function desenharCard(c) {
  const C = await carregarCanvas();
  if (!C) return null;
  const { canvas, ctx } = await comFundo(C, c.fundo);
  const avatar = await imagem(C, c.avatar);

  const lado = c.layout === 'lado';
  const FOTO = 144, ANEL = 8, CONTORNO = 4, VAO = 28, PAD_X = 44, PAD_Y = 28;
  const caixaFoto = FOTO + (ANEL + CONTORNO) * 2;
  // A placa cabe com folga no card (7% em cima e embaixo, 9% dos lados)
  const maxPlaca = L * 0.82;
  const maxTexto = maxPlaca - PAD_X * 2 - (lado ? caixaFoto + VAO : 0);
  const cima = c.cima ? linha(ctx, c.cima, 'Bricolage ExtraBold', 20, maxTexto - 32, { esp: 0.14 }) : null;
  const nome = linha(ctx, c.nome || '?', 'Graduate', 52, maxTexto);
  const baixo = c.baixo ? linha(ctx, c.baixo, 'Bricolage Bold', 24, maxTexto) : null;
  const ESPACO = 8;
  const alturaCima = cima ? cima.tam * 1.25 + 8 : 0;
  const alturas = [alturaCima, nome.tam * 1.05, baixo ? baixo.tam * 1.2 : 0].filter(Boolean);
  const alturaTexto = alturas.reduce((s, h) => s + h, 0) + (alturas.length - 1) * ESPACO;
  const larguraTexto = Math.max(cima ? largura(ctx, cima) + 32 : 0, largura(ctx, nome), baixo ? largura(ctx, baixo) : 0);

  const conteudoL = lado ? caixaFoto + VAO + larguraTexto : Math.max(caixaFoto, larguraTexto);
  const conteudoA = lado ? Math.max(caixaFoto, alturaTexto) : caixaFoto + VAO + alturaTexto;
  const pl = conteudoL + PAD_X * 2, pa = conteudoA + PAD_Y * 2;
  const px = (L - pl) / 2, py = (A - pa) / 2;
  placa(ctx, px, py, pl, pa);

  // Foto com o anel colorido e o contorno de tinta
  const fx = lado ? px + PAD_X : L / 2 - caixaFoto / 2;
  const fy = lado ? A / 2 - caixaFoto / 2 : py + PAD_Y;
  const quadrado = c.forma === 'quadrado';
  const raio = (t) => (quadrado ? t * 0.18 : t / 2);
  ctx.fillStyle = TINTA;
  ctx.beginPath();
  ctx.roundRect(fx, fy, caixaFoto, caixaFoto, raio(caixaFoto));
  ctx.fill();
  const anel = caixaFoto - CONTORNO * 2;
  ctx.fillStyle = c.corBorda || MOSTARDA;
  ctx.beginPath();
  ctx.roundRect(fx + CONTORNO, fy + CONTORNO, anel, anel, raio(anel));
  ctx.fill();
  foto(ctx, avatar, fx + CONTORNO + ANEL, fy + CONTORNO + ANEL, FOTO, raio(FOTO), c.nome);

  // Textos: etiqueta vermelha, nome em Graduate e a linha de baixo em cinza
  const tx = lado ? fx + caixaFoto + VAO : L / 2;
  let y = lado ? A / 2 - alturaTexto / 2 : fy + caixaFoto + VAO;
  if (cima) {
    etiqueta(ctx, cima, tx, y, { fundo: VERMELHO, cor: CREME, padX: 16, padY: 4, raio: 10, centro: !lado });
    y += alturaCima + ESPACO;
  }
  ctx.textAlign = lado ? 'left' : 'center';
  ctx.textBaseline = 'top';
  fonte(ctx, nome);
  ctx.fillStyle = TINTA;
  ctx.fillText(nome.t, tx, y);
  y += nome.tam * 1.05 + ESPACO;
  if (baixo) {
    fonte(ctx, baixo);
    ctx.fillStyle = CINZA;
    ctx.textAlign = lado ? 'left' : 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(baixo.t, tx, y);
  }
  return canvas.toBuffer('image/png');
}

/**
 * Card do aniversariante: placa creme com a etiqueta vermelha em cima, a foto redonda, o nome e a etiqueta escura.
 * @param {{ fundo?: Buffer | null, avatar?: Buffer | null, nome: string, topo?: string, baixo?: string }} c
 * @returns {Promise<Buffer | null>} PNG 1200×520
 */
export async function desenharCardNiver(c) {
  const C = await carregarCanvas();
  if (!C) return null;
  const { canvas, ctx } = await comFundo(C, c.fundo);
  const avatar = await imagem(C, c.avatar);
  const FOTO = 128, BORDA = 6, VAO = 10, PAD_X = 52;
  const max = L * 0.8 - PAD_X * 2;
  const topo = c.topo ? linha(ctx, c.topo, 'Graduate', 30, max - 40) : null;
  const nome = linha(ctx, c.nome || '?', 'Graduate', 44, max);
  const baixo = c.baixo ? linha(ctx, c.baixo, 'Bricolage ExtraBold', 22, max - 40, { esp: 0.12 }) : null;
  const hTopo = topo ? topo.tam * 1.25 + 8 : 0, hBaixo = baixo ? baixo.tam * 1.25 + 16 : 0;
  const blocos = [hTopo, FOTO + BORDA * 2, nome.tam * 1.05, hBaixo].filter(Boolean);
  const conteudoA = blocos.reduce((s, h) => s + h, 0) + (blocos.length - 1) * VAO;
  const conteudoL = Math.max(topo ? largura(ctx, topo) + 40 : 0, FOTO + BORDA * 2, largura(ctx, nome), baixo ? largura(ctx, baixo) + 40 : 0);
  const pl = conteudoL + PAD_X * 2, pa = conteudoA + 24 + 28;
  const py = (A - pa) / 2;
  placa(ctx, (L - pl) / 2, py, pl, pa);

  let y = py + 24;
  if (topo) {
    etiqueta(ctx, topo, L / 2, y, { fundo: VERMELHO, cor: CREME, padX: 20, padY: 4, raio: 10, centro: true });
    y += hTopo + VAO;
  }
  // Foto redonda com borda de tinta (sem foto: a inicial num fundo azul do Discord)
  const caixa = FOTO + BORDA * 2;
  ctx.fillStyle = TINTA;
  ctx.beginPath();
  ctx.arc(L / 2, y + caixa / 2, caixa / 2, 0, Math.PI * 2);
  ctx.fill();
  foto(ctx, avatar, L / 2 - FOTO / 2, y + BORDA, FOTO, FOTO / 2, c.nome);
  y += caixa + VAO;
  fonte(ctx, nome);
  ctx.fillStyle = TINTA;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(nome.t, L / 2, y);
  y += nome.tam * 1.05 + VAO;
  if (baixo) etiqueta(ctx, baixo, L / 2, y, { fundo: TINTA, cor: MOSTARDA, padX: 20, padY: 8, raio: 12, centro: true });
  return canvas.toBuffer('image/png');
}

// ---------- Imagens de fundo e fotos ----------
const cache = new Map();
/** Baixa uma imagem (com cache, até 40). Devolve null se não der. */
export async function baixarImagem(url) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (cache.size >= 40) cache.delete(cache.keys().next().value);
    cache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}
