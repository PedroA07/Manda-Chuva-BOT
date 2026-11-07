import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ehAnimado, FilmeGif, linhaDoTempo } from '../lib/gif.js';
import { AZUL, fazerGif, VERDE, VERMELHO } from './ajuda-gif.js';

/** [r, g, b, a] do pixel */
const pixel = (filme, px, x, y) => [...px.subarray((y * filme.largura + x) * 4, (y * filme.largura + x) * 4 + 4)];
const R = [255, 0, 0, 255], G = [0, 255, 0, 255], B = [0, 0, 255, 255];

test('lê tamanho, quadros e tempo de cada um', () => {
  const f = new FilmeGif(fazerGif(4, 2, [{ cor: VERMELHO, delay: 10 }, { cor: VERDE, delay: 20 }, { cor: AZUL, delay: 30 }]));
  assert.equal(f.largura, 4);
  assert.equal(f.altura, 2);
  assert.equal(f.total, 3);
  assert.deepEqual(f.inicios, [0, 100, 300]);
  assert.equal(f.duracao, 600);
});

test('quadro sem tempo dura 100 ms, como no navegador', () => {
  const f = new FilmeGif(fazerGif(2, 2, [{ cor: VERMELHO, delay: 0 }, { cor: VERDE, delay: 1 }]));
  assert.equal(f.duracao, 200);
});

test('mostra o quadro certo em cada instante, em qualquer ordem', () => {
  const f = new FilmeGif(fazerGif(4, 2, [{ cor: VERMELHO, delay: 10 }, { cor: VERDE, delay: 20 }, { cor: AZUL, delay: 30 }]));
  assert.deepEqual(pixel(f, f.em(0), 1, 1), R);
  assert.deepEqual(pixel(f, f.em(150), 1, 1), G);
  assert.deepEqual(pixel(f, f.em(350), 1, 1), B);
  assert.deepEqual(pixel(f, f.em(50), 1, 1), R); // voltou no tempo
});

test('passou do fim, recomeça', () => {
  const f = new FilmeGif(fazerGif(4, 2, [{ cor: VERMELHO, delay: 10 }, { cor: VERDE, delay: 20 }, { cor: AZUL, delay: 30 }]));
  f.em(350);
  assert.deepEqual(pixel(f, f.em(650), 1, 1), R); // 650 - 600 = 50
  assert.deepEqual(pixel(f, f.em(750), 1, 1), G); // 750 - 600 = 150
});

test('quadro parcial desenha por cima do anterior', () => {
  const f = new FilmeGif(fazerGif(4, 4, [{ cor: VERMELHO, delay: 10 }, { cor: VERDE, delay: 10, x: 1, y: 1, l: 2, a: 2 }]));
  const px = f.em(100);
  assert.deepEqual(pixel(f, px, 1, 1), G);
  assert.deepEqual(pixel(f, px, 0, 0), R);
});

test('descarte 2: o quadro some antes do próximo', () => {
  const f = new FilmeGif(fazerGif(4, 4, [
    { cor: VERMELHO, delay: 10 },
    { cor: VERDE, delay: 10, x: 1, y: 1, l: 2, a: 2, disposal: 2 },
    { cor: AZUL, delay: 10, x: 0, y: 0, l: 1, a: 1 },
  ]));
  const px = f.em(200);
  assert.deepEqual(pixel(f, px, 1, 1), [0, 0, 0, 0]); // onde estava o verde ficou vazio
  assert.deepEqual(pixel(f, px, 3, 3), R); // o resto continua
  assert.deepEqual(pixel(f, px, 0, 0), B);
});

test('descarte 3: volta como estava antes do quadro', () => {
  const f = new FilmeGif(fazerGif(4, 4, [
    { cor: VERMELHO, delay: 10 },
    { cor: VERDE, delay: 10, x: 1, y: 1, l: 2, a: 2, disposal: 3 },
    { cor: AZUL, delay: 10, x: 0, y: 0, l: 1, a: 1 },
  ]));
  const px = f.em(200);
  assert.deepEqual(pixel(f, px, 1, 1), R);
  assert.deepEqual(pixel(f, px, 0, 0), B);
});

test('recomeçar não leva sujeira da volta anterior', () => {
  const f = new FilmeGif(fazerGif(4, 4, [
    { cor: VERMELHO, delay: 10, x: 0, y: 0, l: 2, a: 2 },
    { cor: VERDE, delay: 10, x: 2, y: 2, l: 2, a: 2 },
  ]));
  f.em(100);
  assert.deepEqual(pixel(f, f.em(0), 3, 3), [0, 0, 0, 0]);
});

test('só é animado GIF com mais de um quadro e tamanho que dá pra abrir', () => {
  assert.equal(ehAnimado(fazerGif(2, 2, [{ cor: VERMELHO, delay: 10 }, { cor: VERDE, delay: 10 }])), true);
  assert.equal(ehAnimado(fazerGif(2, 2, [{ cor: VERMELHO, delay: 10 }])), false);
  assert.equal(ehAnimado(fazerGif(1601, 2, [{ cor: VERMELHO, delay: 10, l: 1, a: 1 }, { cor: VERDE, delay: 10, l: 1, a: 1 }])), false);
  assert.equal(ehAnimado(Buffer.concat([Buffer.from('GIF89a'), Buffer.from([2, 0, 2, 0, 0, 0, 0]), Buffer.alloc(30, 0x55)])), false); // quebrado
  assert.equal(ehAnimado(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), false);
  assert.equal(ehAnimado(null), false);
});

test('linha do tempo de um GIF só usa os tempos dele', () => {
  assert.deepEqual(linhaDoTempo([{ inicios: [0, 100, 300], duracao: 600 }]), [{ t: 0, delay: 100 }, { t: 100, delay: 200 }, { t: 300, delay: 300 }]);
});

test('dois GIFs: junta os instantes e dura o tempo do maior', () => {
  const l = linhaDoTempo([{ inicios: [0, 100], duracao: 200 }, { inicios: [0, 150], duracao: 300 }]);
  // 0 e 100 do primeiro, 200 da segunda volta dele; 150 fica a menos de 60 ms do 100
  assert.deepEqual(l, [{ t: 0, delay: 100 }, { t: 100, delay: 100 }, { t: 200, delay: 100 }]);
});

test('GIF longo é cortado em 6 segundos', () => {
  const l = linhaDoTempo([{ inicios: Array.from({ length: 20 }, (_, i) => i * 1000), duracao: 20_000 }]);
  assert.equal(l.length, 6);
  assert.deepEqual(l.at(-1), { t: 5000, delay: 1000 });
});

test('GIF com quadros demais perde quadros, mas não perde tempo', () => {
  const l = linhaDoTempo([{ inicios: Array.from({ length: 200 }, (_, i) => i * 20), duracao: 4000 }]);
  assert.ok(l.length <= 48, `${l.length} quadros`);
  assert.equal(l.reduce((s, x) => s + x.delay, 0), 4000);
});
