import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duracaoTexto, pedacoDoEvento, preencher } from '../lib/portaria.js';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const P = () => dados.normalizar({}, {}).cfg.portaria;
const VARS = { id: '1', usuario: '<@1>', nome: 'rafa_cringe', moderador: '<@2>', motivo: 'spam de figurinha', tempo: '1 hora', servidor: 'Faculdade dos Memes', numero: '127' };
const url = (ref, padrao) => ((ref || padrao) === 'none' ? null : ref || padrao);

test('duração em português', () => {
  assert.equal(duracaoTexto(10 * 60000), '10 minutos');
  assert.equal(duracaoTexto(60 * 60000 - 500), '1 hora');
  assert.equal(duracaoTexto(3 * 86400000), '3 dias');
  assert.equal(duracaoTexto(7 * 86400000), '1 semana');
  assert.equal(duracaoTexto(28 * 86400000), '4 semanas');
});

test('preencher troca só as variáveis conhecidas', () => {
  assert.equal(preencher('{usuario} saiu do {servidor} {xyz}', VARS), '<@1> saiu do Faculdade dos Memes {xyz}');
});

test('expulsão: texto fora, motivo e moderador dentro, ninguém marcado', () => {
  const p = pedacoDoEvento('expulsao', P().expulsao, VARS, { url });
  assert.equal(p.fora, '<@1> foi pra diretoria e não volta hoje.');
  assert.equal(p.titulo, 'Expulsão');
  assert.equal(p.texto, '**Motivo:** spam de figurinha\n**Moderador:** <@2>');
  assert.equal(p.cor, 0xe67e22);
  assert.equal(p.topo, 'banners/expulso-diretoria.gif');
  assert.equal(p.mini, null);
  assert.deepEqual(p.mencoes, {});
  assert.match(p.rodape, /^Faculdade dos Memes · <t:\d+:R>$/);
});

test('silêncio: texto dentro da caixa com a duração', () => {
  const p = pedacoDoEvento('silencio', P().silencio, VARS, { url });
  assert.equal(p.fora, undefined);
  assert.equal(p.texto, 'Shhh, biblioteca! <@1> ficou em silêncio por 1 hora.\n\n**Motivo:** spam de figurinha\n**Moderador:** <@2>\n**Duração:** 1 hora');
});

test('entrada: marca o novato, rodapé com o número e o card', () => {
  const p = pedacoDoEvento('entrada', P().entrada, { ...VARS, numero: '128' }, { url, card: 'attachment://card.png' });
  assert.deepEqual(p.mencoes, { users: ['1'] });
  assert.equal(p.rodape, 'Membro nº 128 · Faculdade dos Memes');
  assert.equal(p.card, 'attachment://card.png');
  assert.equal(p.topo, 'banners/boas-vindas.gif');
  assert.equal(p.mini, 'banners/mini-capelo.gif');
  assert.match(p.fora, /^Para nossa alegria, <@1> acabou de chegar no \*\*Faculdade dos Memes\*\*!/);
});

test('sem motivo e sem moderador: só o texto', () => {
  const ev = { ...P().ban, mod: false, motivo: false, textoPos: 'dentro' };
  assert.equal(pedacoDoEvento('ban', ev, VARS, { url }).texto, '<@1> foi **JUBILADO(A)** do Faculdade dos Memes. Não volta nem com recurso.');
});
