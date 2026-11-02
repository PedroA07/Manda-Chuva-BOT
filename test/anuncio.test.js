import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compararVersoes, paraAnunciar, pedacoDaNoticia } from '../lib/noticias.js';

const N = (versao, grande = true) => ({ versao, data: '02/11/2026', tag: 'NOVIDADE', titulo: `Título ${versao}`, texto: `Texto ${versao}`, grande });
const LISTA = [N('3.2.0'), N('3.1.1', false), N('3.1.0'), N('3.0.0')];

test('compara versões como números', () => {
  assert.ok(compararVersoes('3.10.0', '3.9.0') > 0);
  assert.ok(compararVersoes('3.1.0', '3.1.0') === 0);
  assert.ok(compararVersoes('2.0.0', '3.0.0') < 0);
});

test('primeira vez: anuncia só a mais nova e marca todas como vistas', () => {
  const r = paraAnunciar(LISTA, [], 'todas');
  assert.deepEqual(r.postar.map((n) => n.versao), ['3.2.0']);
  assert.deepEqual(r.marcar.sort(), ['3.0.0', '3.1.0', '3.1.1', '3.2.0']);
});

test('depois: anuncia as que faltam, da mais velha pra mais nova', () => {
  const r = paraAnunciar(LISTA, ['3.0.0'], 'todas');
  assert.deepEqual(r.postar.map((n) => n.versao), ['3.1.0', '3.1.1', '3.2.0']);
});

test('nada novo: não posta nada', () => {
  assert.deepEqual(paraAnunciar(LISTA, ['3.0.0', '3.1.0', '3.1.1', '3.2.0'], 'todas').postar, []);
});

test('"só as grandes" pula a pequena, mas marca ela como vista', () => {
  const r = paraAnunciar(LISTA, ['3.0.0', '3.1.0'], 'grandes');
  assert.deepEqual(r.postar.map((n) => n.versao), ['3.2.0']);
  assert.ok(r.marcar.includes('3.1.1'));
});

test('no máximo 3 de uma vez', () => {
  const muitas = [N('4.0.0'), N('3.9.0'), N('3.8.0'), N('3.7.0'), N('3.6.0')];
  assert.deepEqual(paraAnunciar(muitas, ['3.6.0'], 'todas').postar.map((n) => n.versao), ['3.8.0', '3.9.0', '4.0.0']);
});

test('mensagem da notícia: menção fora, barra mostarda, jornal, título e rodapé', () => {
  const p = pedacoDaNoticia(N('3.1.0'), { mencao: '223456789012345678', imgs: {} }, { url: (ref, padrao) => padrao });
  assert.equal(p.acima, '<@&223456789012345678>');
  assert.deepEqual(p.mencoes, { roles: ['223456789012345678'] });
  assert.equal(p.cor, 0xf2c14e);
  assert.equal(p.texto, '-# **Jornal do Campus · v3.1.0**\n### Título 3.1.0\nTexto 3.1.0');
  assert.equal(p.rodape, 'Leia tudo no painel');
  assert.equal(p.topo, 'banners/noticias.gif');
  assert.equal(p.mini, 'banners/mini-selo.gif');
});

test('mensagem da notícia: @everyone e sem menção', () => {
  const todos = pedacoDaNoticia(N('3.1.0'), { mencao: 'everyone', imgs: {} }, { url: () => null });
  assert.equal(todos.acima, '@everyone');
  assert.deepEqual(todos.mencoes, { everyone: true });
  const ninguem = pedacoDaNoticia(N('3.1.0'), { mencao: '', imgs: {} }, { url: () => null });
  assert.equal(ninguem.acima, undefined);
});
