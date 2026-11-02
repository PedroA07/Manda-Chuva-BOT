// Banners da categoria "Eventos" com a placa desenhada pelo bot, com o nome do servidor de verdade
// (os .jpg do design têm o nome de um servidor de exemplo gravado). Fundo: banners/eventos/fundo-<evento>.jpg.
// Estilo da placa (handoff): retângulo creme #fffcf4, borda 6px #1b1f33, raio 22, sombra dura 9px;
// título Graduate 64px; etiqueta inclinada −0.04rad na cor do evento, Bricolage 800 22px, espaçamento 5px.
import { canvas as carregarCanvas } from './canvas.js';
import { ajustarFonte, baixarImagem } from './card.js';
import { BASE_IMAGENS } from './imagens.js';

export const PLACAS = {
  painel: { titulo: 'ESCOLHA SUA COR', cor: '#F2C14E' },
  entrada: { titulo: 'CALOURO NA ÁREA!', cor: '#2F9E5B' },
  saida: { titulo: 'TRANCOU A MATRÍCULA', cor: '#8395A7' },
  expulsao: { titulo: 'FOI PRA DIRETORIA', cor: '#E67E22' },
  ban: { titulo: 'JUBILADO!', cor: '#C4363C' },
  silencio: { titulo: 'SHHH! BIBLIOTECA', cor: '#3498DB' },
  news: { titulo: 'PLANTÃO DO BOT', cor: '#F2C14E' },
  aniversario: { titulo: 'PARABÉNS, VETERANO!', cor: '#FF6EC7' },
};

const TINTA = '#1B1F33';
const L = 1200, A = 400;

/** Letra escura em etiqueta clara, branca em etiqueta escura */
export function corDaLetraDaEtiqueta(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? TINTA : '#FFFFFF';
}

/** @param {{ fundo?: Buffer | null, evento: keyof PLACAS, servidor: string }} p @returns {Promise<Buffer | null>} JPEG 1200×400 (null sem canvas) */
export async function desenharPlaca({ fundo, evento, servidor }) {
  const C = await carregarCanvas();
  if (!C) return null;
  const { titulo, cor } = PLACAS[evento];
  const canvas = C.createCanvas(L, A);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe8d8';
  ctx.fillRect(0, 0, L, A);
  try {
    if (fundo) {
      const img = await C.loadImage(fundo);
      const e = Math.max(L / img.width, A / img.height);
      ctx.drawImage(img, (L - img.width * e) / 2, (A - img.height * e) / 2, img.width * e, img.height * e);
    }
  } catch {
    // fundo que não carrega: fica o papel liso
  }

  // Placa creme com sombra dura
  const medirTitulo = (t, tam) => ((ctx.font = `${tam}px "Graduate"`), (ctx.letterSpacing = '0px'), ctx.measureText(t).width);
  const tamTitulo = ajustarFonte(medirTitulo, titulo, 64, L - 200, 32);
  const largura = medirTitulo(titulo, tamTitulo) + 112, altura = 132;
  const x = (L - largura) / 2, y = 150;
  ctx.fillStyle = TINTA;
  ctx.beginPath();
  ctx.roundRect(x + 9, y + 9, largura, altura, 22);
  ctx.fill();
  ctx.fillStyle = '#FFFCF4';
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(x, y, largura, altura, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = TINTA;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  medirTitulo(titulo, tamTitulo);
  ctx.fillText(titulo, L / 2, y + altura / 2 + 4);

  // Etiqueta inclinada com o nome do servidor
  const nome = servidor.toUpperCase();
  const medirEtiqueta = (t, tam) => ((ctx.font = `${tam}px "Bricolage ExtraBold"`), (ctx.letterSpacing = `${tam * 0.23}px`), ctx.measureText(t).width);
  const tamEtiqueta = ajustarFonte(medirEtiqueta, nome, 22, largura - 40, 12);
  const le = medirEtiqueta(nome, tamEtiqueta) + 44, ae = 46;
  ctx.save();
  ctx.translate(L / 2, y - 6);
  ctx.rotate(-0.04);
  ctx.fillStyle = cor;
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 4;
  ctx.fillRect(-le / 2, -ae / 2, le, ae);
  ctx.strokeRect(-le / 2, -ae / 2, le, ae);
  ctx.fillStyle = corDaLetraDaEtiqueta(cor);
  medirEtiqueta(nome, tamEtiqueta);
  ctx.fillText(nome, tamEtiqueta * 0.115, 2);
  ctx.restore();
  return canvas.toBuffer('image/jpeg', 90);
}

// ---------- Placas prontas (cache por evento + nome do servidor) ----------

/** 'banners/eventos/entrada.jpg' → 'entrada' (só os banners que têm placa) */
export function eventoDaPlaca(ref) {
  const m = /^banners\/eventos\/([a-z]+)\.jpg$/.exec(ref || '');
  return m && PLACAS[m[1]] ? m[1] : null;
}

const prontas = new Map();
/** JPEG da placa do evento com o nome do servidor (desenha uma vez e guarda) */
export function placaPronta(evento, servidor) {
  const chave = `${evento}|${servidor}`;
  if (!prontas.has(chave)) {
    if (prontas.size > 40) prontas.delete(prontas.keys().next().value);
    const p = baixarImagem(`${BASE_IMAGENS}banners/eventos/fundo-${evento}.jpg`).then((fundo) => desenharPlaca({ fundo, evento, servidor }));
    p.catch(() => prontas.delete(chave));
    prontas.set(chave, p);
  }
  return prontas.get(chave);
}
