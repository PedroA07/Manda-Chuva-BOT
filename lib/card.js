// Card de boas-vindas desenhado no bot: fundo + foto de perfil de verdade + nome + textos (600:260, em 2x)
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';

const fonte = (arq) => new URL(`../fontes/${arq}`, import.meta.url);
GlobalFonts.registerFromPath(fonte('Graduate-Regular.ttf').pathname.replace(/^\/([A-Z]:)/, '$1'), 'Graduate');
GlobalFonts.registerFromPath(fonte('BricolageGrotesque-Bold.ttf').pathname.replace(/^\/([A-Z]:)/, '$1'), 'Bricolage Bold');
GlobalFonts.registerFromPath(fonte('BricolageGrotesque-ExtraBold.ttf').pathname.replace(/^\/([A-Z]:)/, '$1'), 'Bricolage ExtraBold');

const L = 1200, A = 520; // 600×260 do design, em dobro
const ESCURO = '#1B1F33';

/** Maior fonte (até "base") com que o texto cabe em "max". medir(texto, tamanho) → largura */
export function ajustarFonte(medir, texto, base, max, min = 20) {
  let t = base;
  while (t > min && medir(texto, t) > max) t -= 2;
  return t;
}

async function imagem(buf) {
  if (!buf) return null;
  try {
    return await loadImage(buf);
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

function forma(ctx, x, y, tam, raio) {
  ctx.beginPath();
  ctx.roundRect(x, y, tam, tam, raio);
}

/**
 * @param {{ fundo?: Buffer | null, avatar?: Buffer | null, nome: string, cima?: string, baixo?: string,
 *   layout?: 'centro' | 'lado', forma?: 'circulo' | 'quadrado', corTexto?: string, corBorda?: string }} c
 * @returns {Promise<Buffer>} PNG
 */
export async function desenharCard(c) {
  const canvas = createCanvas(L, A);
  const ctx = canvas.getContext('2d');
  const [fundo, avatar] = await Promise.all([imagem(c.fundo), imagem(c.avatar)]);
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, L, A);
  if (fundo) cobrir(ctx, fundo, 0, 0, L, A);

  const lado = c.layout === 'lado';
  const corTexto = c.corTexto || '#FFFFFF';
  const sombra = corTexto.toUpperCase() === ESCURO ? '#ffffff99' : '#00000099';
  const FOTO = 152, BORDA = 8, VAO = 28, RAIO = c.forma === 'quadrado' ? FOTO * 0.18 : FOTO / 2;

  // Linhas de texto: [texto, fonte, tamanho, espaçamento entre letras]
  const largMax = lado ? L - 112 - FOTO - VAO : L - 112;
  const medir = (fam, esp) => (t, tam) => {
    ctx.font = `${tam}px "${fam}"`;
    ctx.letterSpacing = `${esp(tam)}px`;
    return ctx.measureText(t).width;
  };
  const linhas = [
    c.cima && { t: c.cima, fam: 'Bricolage ExtraBold', tam: 22, esp: (t) => t * 0.14 },
    c.nome && { t: c.nome, fam: 'Graduate', tam: 56, esp: () => 0 },
    c.baixo && { t: c.baixo, fam: 'Bricolage Bold', tam: 24, esp: () => 0 },
  ].filter(Boolean);
  for (const l of linhas) l.tam = ajustarFonte(medir(l.fam, l.esp), l.t, l.tam, largMax, 12);
  const alturaTexto = linhas.reduce((s, l) => s + l.tam * 1.15, 0) + Math.max(0, linhas.length - 1) * 8;
  const larguraTexto = Math.max(0, ...linhas.map((l) => medir(l.fam, l.esp)(l.t, l.tam)));

  // Posição da foto e do bloco de texto
  let fx, fy, tx, ty;
  if (lado) {
    const total = FOTO + VAO + larguraTexto;
    fx = (L - total) / 2;
    fy = (A - FOTO) / 2;
    tx = fx + FOTO + VAO;
    ty = (A - alturaTexto) / 2;
  } else {
    const total = FOTO + (linhas.length ? VAO + alturaTexto : 0);
    fx = (L - FOTO) / 2;
    fy = (A - total) / 2;
    tx = L / 2;
    ty = fy + FOTO + VAO;
  }

  // Foto (ou a inicial num fundo azul do Discord) com a borda colorida
  ctx.save();
  forma(ctx, fx - BORDA, fy - BORDA, FOTO + BORDA * 2, RAIO + BORDA);
  ctx.fillStyle = c.corBorda || '#F2C14E';
  ctx.fill();
  forma(ctx, fx, fy, FOTO, RAIO);
  ctx.clip();
  if (avatar) cobrir(ctx, avatar, fx, fy, FOTO, FOTO);
  else {
    ctx.fillStyle = '#5865f2';
    ctx.fillRect(fx, fy, FOTO, FOTO);
    ctx.fillStyle = '#ffffff';
    ctx.font = '60px "Graduate"';
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((c.nome || '?').trim().charAt(0).toUpperCase(), fx + FOTO / 2, fy + FOTO / 2 + 4);
  }
  ctx.restore();

  // Textos com a sombra dura do design
  ctx.fillStyle = corTexto;
  ctx.shadowColor = sombra;
  ctx.shadowOffsetY = 4;
  ctx.textBaseline = 'top';
  ctx.textAlign = lado ? 'left' : 'center';
  let y = ty;
  for (const l of linhas) {
    ctx.font = `${l.tam}px "${l.fam}"`;
    ctx.letterSpacing = `${l.esp(l.tam)}px`;
    ctx.fillText(l.t, tx, y);
    y += l.tam * 1.15 + 8;
  }
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
