import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import { emojiDaCor, estiloMaisProximo } from '../lib/emojis.js';
import { pngCirculo } from '../lib/png.js';

/** Lê um PNG RGBA sem filtro (como o pngCirculo grava): { largura, altura, pixel(x, y) } */
function lerPng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const largura = buf.readUInt32BE(16), altura = buf.readUInt32BE(20);
  assert.equal(buf[24], 8); // 8 bits
  assert.equal(buf[25], 6); // RGBA
  const idat = [];
  for (let i = 8; i < buf.length;) {
    const tam = buf.readUInt32BE(i), tipo = buf.toString('ascii', i + 4, i + 8);
    if (tipo === 'IDAT') idat.push(buf.subarray(i + 8, i + 8 + tam));
    i += 12 + tam;
  }
  const crus = inflateSync(Buffer.concat(idat));
  const pixel = (x, y) => [...crus.subarray(y * (largura * 4 + 1) + 1 + x * 4, y * (largura * 4 + 1) + 1 + x * 4 + 4)];
  return { largura, altura, pixel };
}

test('a bolinha é um PNG 128×128 com a cor no meio e fundo transparente', () => {
  const png = lerPng(pngCirculo('#FF6EC7'));
  assert.equal(png.largura, 128);
  assert.equal(png.altura, 128);
  assert.deepEqual(png.pixel(64, 64), [255, 110, 199, 255]);
  assert.equal(png.pixel(0, 0)[3], 0);
});

test('fundo de botão mais parecido com a cor (o Discord só tem 4)', () => {
  assert.equal(estiloMaisProximo('#E74C3C'), 'Danger');
  assert.equal(estiloMaisProximo('#2ECC71'), 'Success');
  assert.equal(estiloMaisProximo('#3498DB'), 'Primary');
  assert.equal(estiloMaisProximo('#9B59B6'), 'Primary'); // matiz 283°: cai no azul, como na prévia do protótipo
  assert.equal(estiloMaisProximo('#F1C40F'), 'Secondary');
  assert.equal(estiloMaisProximo('#95A5A6'), 'Secondary');
});

test('cria o emoji da cor uma vez só e depois reaproveita', async () => {
  const criados = [];
  const client = {
    application: {
      emojis: {
        cache: new Map(),
        async fetch() {
          return this.cache;
        },
        async create({ attachment, name }) {
          criados.push(name);
          const e = { id: String(100 + criados.length), name, attachment };
          this.cache.set(e.id, e);
          return e;
        },
      },
    },
  };
  assert.deepEqual(await emojiDaCor(client, '#FF6EC7'), { id: '101', name: 'cor_ff6ec7' });
  assert.deepEqual(await emojiDaCor(client, '#ff6ec7'), { id: '101', name: 'cor_ff6ec7' });
  assert.deepEqual(criados, ['cor_ff6ec7']);
});
