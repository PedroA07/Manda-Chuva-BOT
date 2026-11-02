import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ajustarFonte, desenharCard } from '../lib/card.js';

const tamanho = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];
const FUNDO = readFileSync(new URL('./fixtures/fundo.png', import.meta.url));

test('card é um PNG 1200×520 com fundo e sem foto', async () => {
  const png = await desenharCard({ fundo: FUNDO, nome: 'pedrinho', cima: 'BEM-VINDO(A) AO CAMPUS', baixo: 'Membro nº 128' });
  assert.deepEqual([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG');
  assert.deepEqual(tamanho(png), [1200, 520]);
});

test('fundo ou foto que não é imagem não derruba o card', async () => {
  const png = await desenharCard({ fundo: Buffer.from('nada'), avatar: Buffer.from('nada'), nome: 'x', cima: '', baixo: '', layout: 'lado', forma: 'quadrado' });
  assert.deepEqual(tamanho(png), [1200, 520]);
});

test('nome comprido: a fonte encolhe até caber', () => {
  const medir = (texto, tam) => texto.length * tam * 0.6;
  assert.equal(ajustarFonte(medir, 'pedrinho', 56, 1000), 56);
  const t = ajustarFonte(medir, 'x'.repeat(60), 56, 1000);
  assert.ok(t < 56 && medir('x'.repeat(60), t) <= 1000);
});

test('card de aniversário é um PNG 1200×520, com ou sem foto', async () => {
  const { desenharCardNiver } = await import('../lib/card.js');
  for (const avatar of [null, FUNDO]) {
    const png = await desenharCardNiver({ fundo: FUNDO, avatar, nome: 'rafa_cringe', topo: 'PARABÉNS!', baixo: '22 ANOS DE PURA RESENHA' });
    assert.deepEqual(tamanho(png), [1200, 520]);
  }
});
