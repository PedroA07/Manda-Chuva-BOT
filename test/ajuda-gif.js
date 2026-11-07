// Monta GIFs de verdade pros testes, com cores conhecidas
import omggif from 'omggif';

const { GifWriter } = omggif;
export const VERMELHO = 1, VERDE = 2, AZUL = 3;
const PALETA = [0x000000, 0xff0000, 0x00ff00, 0x0000ff];

/** quadros: [{ cor, delay (centésimos de segundo), disposal?, x?, y?, l?, a? }] */
export function fazerGif(largura, altura, quadros) {
  const saida = new Uint8Array(64 * 1024);
  const g = new GifWriter(saida, largura, altura, { palette: PALETA, loop: 0 });
  for (const { cor, delay, disposal = 1, x = 0, y = 0, l = largura, a = altura } of quadros) {
    g.addFrame(x, y, l, a, new Uint8Array(l * a).fill(cor), { delay, disposal });
  }
  return Buffer.from(saida.subarray(0, g.end()));
}
