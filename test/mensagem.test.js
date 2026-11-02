import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contarComponentes, montarV2, tamanhoTexto, validarV2 } from '../lib/mensagem.js';

const U = (n) => `https://x.com/${n}.gif`;
const botao = (id) => ({ type: 2, style: 2, custom_id: `cor:${id}`, label: `Cor ${id}` });
const linhas = (qtd, porLinha) => {
  const ids = Array.from({ length: qtd }, (_, i) => String(i));
  const rows = [];
  for (let i = 0; i < ids.length; i += porLinha) rows.push({ type: 1, components: ids.slice(i, i + porLinha).map(botao) });
  return rows;
};
const tipos = (cs) => cs.map((c) => c.type);

test('monta na ordem: topo, texto de fora, caixa, card, finais e botões', () => {
  const m = montarV2({
    topo: U('topo'), fora: 'oi {usuario}', cor: 0x5865f2, titulo: 'Título', texto: 'Texto', mini: U('mini'), imagem: U('img'),
    rodape: 'Rodapé', card: 'attachment://card.png', finais: [U('f1'), U('f2')], linhas: linhas(2, 5),
  });
  assert.deepEqual(tipos(m.components), [12, 10, 17, 12, 12, 12, 1]);
  const caixa = m.components[2];
  assert.equal(caixa.accent_color, 0x5865f2);
  assert.deepEqual(tipos(caixa.components), [9, 12, 10]);
  assert.equal(caixa.components[0].components[0].content, '### Título\nTexto');
  assert.deepEqual(caixa.components[0].accessory, { type: 11, media: { url: U('mini') } });
  assert.equal(caixa.components[2].content, '-# Rodapé');
  assert.equal(m.flags, 32768);
});

test('texto de cima vem antes do banner (menção da notícia)', () => {
  const m = montarV2({ acima: '@everyone', topo: U('topo'), texto: 'x' });
  assert.deepEqual(tipos(m.components), [10, 12, 17]);
  assert.equal(m.components[0].content, '@everyone');
});

test('sem miniatura o texto fica solto na caixa', () => {
  const m = montarV2({ titulo: 'T', texto: 'x' });
  assert.deepEqual(tipos(m.components), [17]);
  assert.deepEqual(tipos(m.components[0].components), [10]);
});

test('sem cor a caixa não tem barra colorida', () => {
  assert.equal('accent_color' in montarV2({ texto: 'x' }).components[0], false);
});

test('por padrão ninguém é marcado', () => {
  assert.deepEqual(montarV2({ texto: '<@&1>' }).allowedMentions, { parse: [], users: [], roles: [] });
});

test('marca só quem foi pedido', () => {
  assert.deepEqual(montarV2({ fora: '<@9>', mencoes: { users: ['9'] } }).allowedMentions, { parse: [], users: ['9'], roles: [] });
});

test('conta peças aninhadas (botões, seção e miniatura contam)', () => {
  const m = montarV2({ topo: U('t'), titulo: 'T', mini: U('m'), linhas: linhas(3, 2) });
  // topo 1 + caixa 1 + seção 1 + texto 1 + miniatura 1 + 2 linhas + 3 botões
  assert.equal(contarComponentes(m.components), 10);
});

test('painel cheio demais passa de 40 peças e dá erro em português', () => {
  const m = montarV2({
    topo: U('t'), titulo: 'T', texto: 'x', mini: U('m'), imagem: U('i'), rodape: 'r',
    finais: [U('1'), U('2'), U('3'), U('4')], linhas: [...linhas(24, 5), { type: 1, components: [botao('tirar')] }],
  });
  assert.equal(contarComponentes(m.components), 42);
  assert.deepEqual(validarV2(m), ['A mensagem ficou com 42 peças e o Discord aceita até 40. Tire imagens do final, campos ou cores.']);
});

test('texto com mais de 4000 caracteres dá erro', () => {
  const m = montarV2({ titulo: 'T', texto: 'a'.repeat(3995) }); // "### T\n" + 3995
  assert.equal(tamanhoTexto(m.components), 4001);
  assert.deepEqual(validarV2(m), ['O texto da mensagem passou de 4000 caracteres (ficou com 4001).']);
});

test('texto de baixo vem depois do card e antes dos botões', () => {
  const m = montarV2({ fora: 'Parabéns', card: 'attachment://card.png', abaixo: '-# ganhou o cargo', linhas: linhas(1, 1) });
  assert.deepEqual(tipos(m.components), [10, 12, 10, 1]);
});
