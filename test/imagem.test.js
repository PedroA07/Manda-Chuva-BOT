import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cabeNaMemoria, dimensoes, tipoDaImagem } from '../lib/imagem.js';

// Cabeçalhos montados à mão: é só o que o bot lê antes de decidir abrir a imagem
function png(l, a) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(l, 16);
  b.writeUInt32BE(a, 20);
  return b;
}
function gif(l, a) {
  const b = Buffer.alloc(13);
  b.write('GIF89a', 0, 'ascii');
  b.writeUInt16LE(l, 6);
  b.writeUInt16LE(a, 8);
  return b;
}
const jpeg = (l, a) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc2, 0, 11, 8, a >> 8, a & 255, l >> 8, l & 255, 1, 1, 0x11, 0]);
function riff(pedaco, dados) {
  return Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from(pedaco), Buffer.alloc(4), dados]);
}
function webpX(l, a) {
  const d = Buffer.alloc(10);
  d.writeUIntLE(l - 1, 4, 3);
  d.writeUIntLE(a - 1, 7, 3);
  return riff('VP8X', d);
}
function webpSemPerda(l, a) {
  const d = Buffer.alloc(5);
  d[0] = 0x2f;
  d.writeUInt32LE(((a - 1) << 14) | (l - 1), 1);
  return riff('VP8L', d);
}
function webpComPerda(l, a) {
  const d = Buffer.alloc(10);
  d.set([0x9d, 0x01, 0x2a], 3);
  d.writeUInt16LE(l, 6);
  d.writeUInt16LE(a, 8);
  return riff('VP8 ', d);
}

test('tipo vem da assinatura do arquivo, não do que o navegador diz', () => {
  assert.equal(tipoDaImagem(png(1, 1)), 'image/png');
  assert.equal(tipoDaImagem(jpeg(1, 1)), 'image/jpeg');
  assert.equal(tipoDaImagem(gif(1, 1)), 'image/gif');
  assert.equal(tipoDaImagem(webpX(1, 1)), 'image/webp');
  assert.equal(tipoDaImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(tipoDaImagem(Buffer.alloc(0)), null);
});

test('dimensões saem do cabeçalho, sem abrir a imagem', () => {
  assert.deepEqual(dimensoes(png(640, 360)), { l: 640, a: 360 });
  assert.deepEqual(dimensoes(gif(498, 280)), { l: 498, a: 280 });
  assert.deepEqual(dimensoes(jpeg(1920, 1080)), { l: 1920, a: 1080 });
  assert.deepEqual(dimensoes(webpX(4000, 3000)), { l: 4000, a: 3000 });
  assert.deepEqual(dimensoes(webpSemPerda(800, 600)), { l: 800, a: 600 });
  assert.deepEqual(dimensoes(webpComPerda(1024, 512)), { l: 1024, a: 512 });
});

test('arquivo cortado ou desconhecido não tem dimensão (nem quebra)', () => {
  assert.equal(dimensoes(png(1, 1).subarray(0, 20)), null);
  assert.equal(dimensoes(jpeg(1, 1).subarray(0, 10)), null);
  assert.equal(dimensoes(webpX(1, 1).subarray(0, 22)), null);
  assert.equal(dimensoes(Buffer.from('oi')), null);
});

test('imagem que ocuparia memória demais depois de aberta é recusada', () => {
  assert.equal(cabeNaMemoria(png(4096, 4096)), true);
  assert.equal(cabeNaMemoria(png(4097, 4096)), false);
  assert.equal(cabeNaMemoria(gif(65535, 65535)), false);
  // Sem saber o tamanho, não abre
  assert.equal(cabeNaMemoria(Buffer.from('oi')), false);
  assert.equal(cabeNaMemoria(null), false);
});
