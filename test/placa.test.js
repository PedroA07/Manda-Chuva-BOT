import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadImage } from '@napi-rs/canvas';
import { corDaLetraDaEtiqueta, desenharPlaca, PLACAS } from '../lib/placa.js';

const FUNDO = readFileSync(new URL('./fixtures/fundo.png', import.meta.url));

test('as 8 placas dos eventos com os títulos dos banners', () => {
  assert.deepEqual(Object.keys(PLACAS), ['painel', 'entrada', 'saida', 'expulsao', 'ban', 'silencio', 'news', 'aniversario']);
  assert.equal(PLACAS.entrada.titulo, 'CALOURO NA ÁREA!');
  assert.equal(PLACAS.ban.titulo, 'JUBILADO!');
});

test('etiqueta clara tem letra escura e etiqueta escura tem letra branca', () => {
  assert.equal(corDaLetraDaEtiqueta('#F2C14E'), '#1B1F33');
  assert.equal(corDaLetraDaEtiqueta('#C4363C'), '#FFFFFF');
});

test('placa é um JPEG 1200×400, mesmo com nome de servidor enorme ou sem fundo', async () => {
  for (const [fundo, nome] of [[FUNDO, 'SERVIDOR DOS CRIA'], [null, 'X'.repeat(80)]]) {
    const jpg = await desenharPlaca({ fundo, evento: 'entrada', servidor: nome });
    assert.deepEqual([jpg[0], jpg[1]], [0xff, 0xd8]);
    const img = await loadImage(jpg);
    assert.deepEqual([img.width, img.height], [1200, 400]);
  }
});
