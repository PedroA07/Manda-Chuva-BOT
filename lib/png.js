// PNG simples feito à mão (sem dependência): a bolinha colorida que vai nos botões das cores
import { crc32, deflateSync } from 'node:zlib';

function pedaco(tipo, dados) {
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

/** Grava um PNG RGBA. pixel(x, y) devolve [r, g, b, a]. */
export function png(largura, altura, pixel) {
  const linha = largura * 4 + 1;
  const crus = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) crus.set(pixel(x, y), y * linha + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, sem entrelaçar
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', deflateSync(crus)),
    pedaco('IEND', Buffer.alloc(0)),
  ]);
}

/** Bolinha da cor com um anel branco translúcido (igual à prévia do painel), fundo transparente */
export function pngCirculo(hex, tam = 128) {
  const cor = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const meio = tam / 2, raio = tam * 0.39, anel = tam * 0.47;
  const cobre = (r, d) => Math.min(1, Math.max(0, r + 0.5 - d));
  return png(tam, tam, (x, y) => {
    const d = Math.hypot(x + 0.5 - meio, y + 0.5 - meio);
    const a1 = cobre(raio, d), a2 = cobre(anel, d) * (0x55 / 255);
    const a = a1 + a2 * (1 - a1);
    if (!a) return [0, 0, 0, 0];
    const mistura = (c) => Math.round((c * a1 + 255 * a2 * (1 - a1)) / a);
    return [...cor.map(mistura), Math.round(a * 255)];
  });
}
