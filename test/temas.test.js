import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarTema, datasDoTema, hojeNoBrasil, pascoaDe, temaAtivo } from '../lib/temas.js';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const T = () => dados.normalizar({}, {}).cfg.temas;
const dia = (d, m, ano = 2026) => ({ dia: d, mes: m, ano });

test('Páscoa pelo algoritmo de Meeus', () => {
  assert.deepEqual(pascoaDe(2026), dia(5, 4));
  assert.deepEqual(pascoaDe(2027), dia(28, 3, 2027));
});

test('datas móveis: carnaval sáb–qua (Páscoa −50 a −46) e Páscoa sex–dom', () => {
  const temas = T().lista;
  assert.deepEqual(datasDoTema(temas.find((t) => t.id === 'carnaval'), 2026), { ini: '14/02', fim: '18/02' });
  assert.deepEqual(datasDoTema(temas.find((t) => t.id === 'pascoa'), 2026), { ini: '03/04', fim: '05/04' });
  assert.deepEqual(datasDoTema(temas.find((t) => t.id === 'natal'), 2026), { ini: '01/12', fim: '26/12' });
});

test('tema do dia: o de período menor ganha (Namorados ganha da Junina)', () => {
  assert.equal(temaAtivo(T(), dia(12, 6))?.id, 'namorados');
  assert.equal(temaAtivo(T(), dia(20, 6))?.id, 'junina');
  assert.equal(temaAtivo(T(), dia(25, 12))?.id, 'natal');
  assert.equal(temaAtivo(T(), dia(1, 1, 2027))?.id, 'ano'); // 27/12 → 02/01 vira o ano
  assert.equal(temaAtivo(T(), dia(16, 2))?.id, 'carnaval');
  assert.equal(temaAtivo(T(), dia(10, 9)), null);
});

test('tema desligado ou troca automática desligada', () => {
  const t = T();
  t.lista.find((x) => x.id === 'natal').on = false;
  assert.equal(temaAtivo(t, dia(25, 12)), null);
  assert.equal(temaAtivo({ ...T(), auto: false }, dia(25, 12)), null);
});

test('aviso personalizado no mesmo dia e mais curto ganha', () => {
  const t = T();
  t.lista.push({ id: 'av1', custom: true, nome: 'Amigo secreto', ini: '20/12', fim: '20/12', on: true, cor: '#F2C14E', frase: '', onde: { painel: true, portaria: true, news: true }, msgs: {} });
  assert.equal(temaAtivo(t, dia(20, 12))?.id, 'av1');
});

test('dia no fuso do Brasil', () => {
  assert.deepEqual(hojeNoBrasil(new Date('2026-12-01T02:00:00Z')), dia(30, 11));
});

test('tema troca banner e miniatura padrão, cor e frase', () => {
  const natal = T().lista.find((t) => t.id === 'natal');
  const r = aplicarTema('painel', { topo: '', mini: '', imagem: '', finais: [] }, natal, true);
  assert.equal(r.imgs.topo, 'banners/festas/natal-painel.gif');
  assert.equal(r.imgs.mini, 'banners/mini/natal.jpg');
  assert.equal(r.cor, natal.cor);
  assert.equal(r.frase, natal.frase);
});

test('"manter minhas imagens": imagem trocada pela pessoa fica', () => {
  const natal = T().lista.find((t) => t.id === 'natal');
  const imgs = { topo: 'banners/eventos/painel.jpg', mini: 'none', imagem: '', finais: [] };
  assert.deepEqual(aplicarTema('painel', imgs, natal, true).imgs, imgs);
  assert.equal(aplicarTema('painel', imgs, natal, false).imgs.topo, 'banners/festas/natal-painel.gif');
});

test('imagem escolhida pro tema numa mensagem e aviso personalizado', () => {
  const natal = { ...T().lista.find((t) => t.id === 'natal'), msgs: { entrada: 'banners/fundos/natal.jpg' } };
  assert.equal(aplicarTema('entrada', { topo: '', mini: '', imagem: '', finais: [] }, natal, true).imgs.topo, 'banners/fundos/natal.jpg');
  const aviso = { id: 'av1', custom: true, cor: '#111111', frase: 'oi', onde: { painel: true }, msgs: {} };
  assert.equal(aplicarTema('painel', { topo: '', mini: '', imagem: '', finais: [] }, aviso, true).imgs.topo, 'banners/tema-aviso.gif');
});

test('tema que não vale pra aquela mensagem não muda nada', () => {
  const natal = { ...T().lista.find((t) => t.id === 'natal'), onde: { painel: false, portaria: true, news: true } };
  assert.equal(aplicarTema('painel', { topo: '', mini: '', imagem: '', finais: [] }, natal, true), null);
});

test('config de temas: padrão com as 10 datas, data inválida dá erro', () => {
  const t = T();
  assert.deepEqual(t.lista.map((x) => x.id), ['carnaval', 'pascoa', 'namorados', 'junina', 'estudante', 'criancas', 'halloween', 'natal', 'ano', 'niver']);
  assert.equal(t.auto, true);
  assert.equal(t.respeitar, true);
  const ruim = { ...t, lista: [...t.lista, { id: 'av2', custom: true, nome: 'Festa', ini: '31/13', fim: '01/01', on: true }] };
  assert.deepEqual(dados.normalizar({ temas: ruim }, dados.normalizar({}, {}).cfg).erros, ['Tema "Festa": use dia/mês, tipo 25/12.']);
});
