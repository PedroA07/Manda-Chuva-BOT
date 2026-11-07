// Lê GIF animado quadro a quadro (o canvas só abre o primeiro) e decide quais instantes entram na carteirinha.
import omggif from 'omggif';
import { dimensoes, tipoDaImagem } from './imagem.js';

const { GifReader } = omggif;
const MAX_LADO_GIF = 1600;
const TEMPO_PADRAO = 100; // quadro sem tempo (ou quase): os navegadores usam 100 ms

const ler = (b) => new GifReader(new Uint8Array(b.buffer, b.byteOffset, b.length));

/** GIF com mais de um quadro, inteiro e de um tamanho que dá pra percorrer quadro a quadro */
export function ehAnimado(b) {
  if (tipoDaImagem(b) !== 'image/gif') return false;
  const d = dimensoes(b);
  if (!d || !d.l || !d.a || d.l > MAX_LADO_GIF || d.a > MAX_LADO_GIF) return false;
  try {
    return ler(b).numFrames() > 1;
  } catch {
    return false;
  }
}

/** Um GIF aberto. Guarda só a tela atual (RGBA), não todos os quadros: um GIF de 8 MB abriria centenas de MB. */
export class FilmeGif {
  constructor(buffer) {
    this.leitor = ler(buffer);
    this.largura = this.leitor.width;
    this.altura = this.leitor.height;
    this.total = this.leitor.numFrames();
    this.inicios = [];
    let t = 0;
    for (let i = 0; i < this.total; i++) {
      this.inicios.push(t);
      const d = this.leitor.frameInfo(i).delay * 10;
      t += d < 20 ? TEMPO_PADRAO : d;
    }
    this.duracao = t;
    this.pixels = new Uint8ClampedArray(this.largura * this.altura * 4);
    this.atual = -1;
    this.antes = null;
  }

  /** Índice do quadro que está na tela no instante t (0 <= t < duracao) */
  #quadroEm(t) {
    let i = this.total - 1;
    while (i > 0 && this.inicios[i] > t) i--;
    return i;
  }

  /** Limpa a tela como o quadro atual pede antes de vir o próximo */
  #descartar() {
    const q = this.leitor.frameInfo(this.atual);
    if (q.disposal === 3 && this.antes) this.pixels.set(this.antes);
    if (q.disposal !== 2) return;
    for (let y = q.y; y < Math.min(q.y + q.height, this.altura); y++) {
      const inicio = y * this.largura + q.x;
      this.pixels.fill(0, inicio * 4, (inicio + q.width) * 4);
    }
  }

  #avancar() {
    if (this.atual >= 0) this.#descartar();
    this.atual++;
    if (this.leitor.frameInfo(this.atual).disposal === 3) {
      this.antes ??= new Uint8ClampedArray(this.pixels.length);
      this.antes.set(this.pixels);
    }
    this.leitor.decodeAndBlitFrameRGBA(this.atual, this.pixels);
  }

  /** RGBA da tela no instante t (dá a volta quando passa do fim). O mesmo array é reaproveitado a cada chamada. */
  em(t) {
    const alvo = this.#quadroEm(t % this.duracao);
    if (alvo < this.atual) {
      this.pixels.fill(0);
      this.atual = -1;
    }
    while (this.atual < alvo) this.#avancar();
    return this.pixels;
  }
}

/**
 * Instantes que entram no GIF final: junta os de cada filme, sem passar de maxDuracao nem de maxQuadros.
 * @param {{ inicios: number[], duracao: number }[]} filmes
 * @returns {{ t: number, delay: number }[]}
 */
export function linhaDoTempo(filmes, { maxDuracao = 6000, maxQuadros = 48, passoMin = 60 } = {}) {
  const fim = Math.min(maxDuracao, Math.max(...filmes.map((f) => f.duracao)));
  const instantes = new Set([0]);
  for (const f of filmes) {
    for (let volta = 0; volta * f.duracao < fim; volta++) {
      for (const inicio of f.inicios) {
        const t = volta * f.duracao + inicio;
        if (t < fim) instantes.add(t);
      }
    }
  }
  const passo = Math.max(passoMin, fim / maxQuadros);
  const escolhidos = [];
  for (const t of [...instantes].sort((a, b) => a - b)) {
    if (!escolhidos.length || t - escolhidos.at(-1) >= passo) escolhidos.push(t);
  }
  return escolhidos.map((t, i) => ({ t, delay: (escolhidos[i + 1] ?? fim) - t }));
}
