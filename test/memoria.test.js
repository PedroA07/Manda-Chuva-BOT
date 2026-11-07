import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoriaLimitada } from '../lib/memoria.js';

const bytes = (n) => Buffer.alloc(n);

test('passou do limite: sai o que ninguém usa faz mais tempo', () => {
  const m = new MemoriaLimitada(100, (v) => v.length);
  m.guardar('a', bytes(40));
  m.guardar('b', bytes(40));
  assert.ok(m.ler('a')); // "a" foi usado agora, então "b" é o mais velho
  m.guardar('c', bytes(40));
  assert.ok(m.ler('a'));
  assert.equal(m.ler('b'), undefined);
  assert.ok(m.ler('c'));
});

test('item maior que o limite não fica guardado nem derruba os outros', () => {
  const m = new MemoriaLimitada(100, (v) => v.length);
  m.guardar('a', bytes(40));
  m.guardar('gigante', bytes(101));
  assert.equal(m.ler('gigante'), undefined);
  assert.ok(m.ler('a'));
});

test('trocar o valor da mesma chave não conta o tamanho duas vezes', () => {
  const m = new MemoriaLimitada(100, (v) => v.length);
  m.guardar('a', bytes(60));
  m.guardar('a', bytes(60));
  m.guardar('b', bytes(40));
  assert.ok(m.ler('a'));
  assert.ok(m.ler('b'));
});

test('tirar libera o espaço', () => {
  const m = new MemoriaLimitada(100, (v) => v.length);
  m.guardar('a', bytes(60));
  m.tirar('a');
  m.tirar('nem-existe');
  m.guardar('b', bytes(100));
  assert.ok(m.ler('b'));
});
