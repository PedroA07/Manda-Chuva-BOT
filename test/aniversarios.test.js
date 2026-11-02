import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aniversariantesDoDia, diasAteNiver, lerData, lerDataEmBlocos, textoDoNiver } from '../lib/aniversarios.js';
import { linhasDoPainel } from '../lib/painel.js';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const hoje = (dia, mes, ano = 2026) => ({ dia, mes, ano });

test('lê a data do /aniversario com e sem ano', () => {
  assert.deepEqual(lerData('14/05/2003', hoje(2, 11)), { d: '14/05', ano: 2003 });
  assert.deepEqual(lerData('4/5', hoje(2, 11)), { d: '04/05', ano: null });
  assert.deepEqual(lerData('29/02/2004', hoje(2, 11)), { d: '29/02', ano: 2004 });
});

test('data inválida dá a mensagem do design', () => {
  assert.deepEqual(lerData('31/02', hoje(2, 11)), { erro: 'Data no formato dia/mês, tipo 14/05.' });
  assert.deepEqual(lerData('maio', hoje(2, 11)), { erro: 'Data no formato dia/mês, tipo 14/05.' });
  assert.deepEqual(lerData('14/05/03', hoje(2, 11)), { erro: 'Ano com 4 dígitos, tipo 2003 (ou deixa vazio).' });
  assert.deepEqual(lerData('14/05/2099', hoje(2, 11)), { erro: 'Ano com 4 dígitos, tipo 2003 (ou deixa vazio).' });
});

test('data em blocos (dia DD, mês MM, ano AAAA) do /aniversario e do formulário', () => {
  assert.deepEqual(lerDataEmBlocos({ dia: 14, mes: 5, ano: 2003 }, hoje(2, 11)), { d: '14/05', ano: 2003 });
  assert.deepEqual(lerDataEmBlocos({ dia: '4', mes: '05', ano: '' }, hoje(2, 11)), { d: '04/05', ano: null });
  assert.deepEqual(lerDataEmBlocos({ dia: 9, mes: 12, ano: null }, hoje(2, 11)), { d: '09/12', ano: null });
  const invalida = { erro: 'Essa data não existe: confere o dia (DD) e o mês (MM), tipo dia 14 e mês 05.' };
  assert.deepEqual(lerDataEmBlocos({ dia: 31, mes: 2 }, hoje(2, 11)), invalida);
  assert.deepEqual(lerDataEmBlocos({ dia: 'ab', mes: 5 }, hoje(2, 11)), invalida);
  assert.deepEqual(lerDataEmBlocos({ dia: 14, mes: 5, ano: '03' }, hoje(2, 11)), { erro: 'Ano com 4 dígitos, tipo 2003 (ou deixa vazio).' });
  assert.deepEqual(lerDataEmBlocos({ dia: 14, mes: 5, ano: 2099 }, hoje(2, 11)), { erro: 'Ano com 4 dígitos, tipo 2003 (ou deixa vazio).' });
});

test('quem faz aniversário hoje (29/02 comemora em 28/02 em ano comum)', () => {
  const lista = [{ userId: '1', d: '14/05', ano: 2003 }, { userId: '2', d: '29/02', ano: null }, { userId: '3', d: '28/02', ano: 2000 }];
  assert.deepEqual(aniversariantesDoDia(lista, hoje(14, 5)).map((p) => p.userId), ['1']);
  assert.deepEqual(aniversariantesDoDia(lista, hoje(28, 2, 2026)).map((p) => p.userId), ['2', '3']);
  assert.deepEqual(aniversariantesDoDia(lista, hoje(28, 2, 2028)).map((p) => p.userId), ['3']);
  assert.deepEqual(aniversariantesDoDia(lista, hoje(29, 2, 2028)).map((p) => p.userId), ['2']);
});

test('dias até o próximo aniversário', () => {
  assert.equal(diasAteNiver('02/11', hoje(2, 11)), 0);
  assert.equal(diasAteNiver('03/11', hoje(2, 11)), 1);
  assert.equal(diasAteNiver('01/11', hoje(2, 11)), 364);
});

test('texto: {idade} some quando não tem ano (ou idade desligada)', () => {
  const vars = { usuario: '<@1>', nome: 'rafa', servidor: 'Cria' };
  assert.equal(textoDoNiver('{usuario} faz {idade} anos no {servidor}!', { ...vars, idade: 22 }, true), '<@1> faz 22 anos no Cria!');
  assert.equal(textoDoNiver('{usuario} faz {idade} anos!', { ...vars, idade: null }, true), '<@1> faz anos!');
  assert.equal(textoDoNiver('{idade} ANOS DE RESENHA', { ...vars, idade: 22 }, false), 'ANOS DE RESENHA');
});

test('config dos aniversários: desligado, 09:00 e os textos do protótipo', () => {
  const n = dados.normalizar({}, {}).cfg.niver;
  assert.deepEqual(n, {
    on: false, canalId: null, hora: '09:00', msg: 'Hoje é aniversário de {usuario}! {idade} anos e ainda não trancou o curso. Parabéns!',
    topo: 'PARABÉNS!', baixo: '{idade} ANOS DE PURA RESENHA', fundo: '', idade: true, cargo: true, dm: false, botao: true,
  });
  assert.equal(dados.normalizar({ niver: { ...n, hora: '25:00' } }, {}).cfg.niver.hora, '09:00');
});

test('botão "Cadastrar aniversário" no painel de cores quando ligado', () => {
  const cfg = dados.normalizar({}, {}).cfg;
  cfg.cores = [{ ...cfg.cores[0], cargoId: '123456789012345678' }];
  const sem = linhasDoPainel(cfg);
  assert.equal(sem.some((l) => l.components.some((b) => b.custom_id === 'niver:cadastrar')), false);
  cfg.niver = { ...cfg.niver, on: true, botao: true };
  const ultima = linhasDoPainel(cfg).at(-1);
  assert.deepEqual(ultima.components.at(-1), { type: 2, style: 2, custom_id: 'niver:cadastrar', label: 'Cadastrar aniversário', emoji: { name: '🎂' } });
});
