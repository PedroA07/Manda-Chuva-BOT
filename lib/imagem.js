// O que dá pra saber de uma imagem sem abrir: o tipo (pela assinatura) e o tamanho (pelo cabeçalho).
// Membro manda imagem por link e anexo, e um arquivo pequeno pode virar gigabytes de pixels quando aberto.
export const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MAX_PIXELS = 4096 * 4096;

/** Tipo pela assinatura do arquivo (não confia no que o navegador ou o site dizem) */
export function tipoDaImagem(b) {
  if (!b) return null;
  if (b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function dimensoesJpeg(b) {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marca = b[i + 1];
    if (marca === 0xff) {
      i++; // byte de enchimento
      continue;
    }
    const semTamanho = marca === 0x01 || (marca >= 0xd0 && marca <= 0xd9);
    const quadro = marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca);
    if (quadro) return i + 9 <= b.length ? { l: b.readUInt16BE(i + 7), a: b.readUInt16BE(i + 5) } : null;
    i += semTamanho ? 2 : 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function dimensoesWebp(b) {
  const pedaco = b.toString('ascii', 12, 16);
  if (pedaco === 'VP8X') return b.length >= 30 ? { l: b.readUIntLE(24, 3) + 1, a: b.readUIntLE(27, 3) + 1 } : null;
  if (pedaco === 'VP8L') {
    if (b.length < 25) return null;
    const v = b.readUInt32LE(21);
    return { l: (v & 0x3fff) + 1, a: ((v >>> 14) & 0x3fff) + 1 };
  }
  if (pedaco === 'VP8 ') return b.length >= 30 ? { l: b.readUInt16LE(26) & 0x3fff, a: b.readUInt16LE(28) & 0x3fff } : null;
  return null;
}

/** Largura e altura lidas do cabeçalho, ou null se o arquivo estiver cortado ou for desconhecido */
export function dimensoes(b) {
  const tipo = tipoDaImagem(b);
  if (tipo === 'image/png') return b.length >= 24 && b.toString('ascii', 12, 16) === 'IHDR' ? { l: b.readUInt32BE(16), a: b.readUInt32BE(20) } : null;
  if (tipo === 'image/gif') return b.length >= 10 ? { l: b.readUInt16LE(6), a: b.readUInt16LE(8) } : null;
  if (tipo === 'image/jpeg') return dimensoesJpeg(b);
  if (tipo === 'image/webp') return dimensoesWebp(b);
  return null;
}

/** Só abre imagem de tamanho conhecido e que caiba na memória da hospedagem grátis */
export function cabeNaMemoria(b) {
  const d = dimensoes(b);
  return !!d && d.l > 0 && d.a > 0 && d.l * d.a <= MAX_PIXELS;
}
