import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const base = () => dados.normalizar({}, {}).cfg;
const ID = '123456789012345678';
const portaria = (patch) => dados.normalizar({ portaria: { ...base().portaria, ...patch } }, base());

test('portaria vem toda desligada, com os textos do protótipo', () => {
  const p = base().portaria;
  assert.deepEqual(Object.keys(p), ['entrada', 'saida', 'expulsao', 'ban', 'silencio']);
  for (const e of Object.values(p)) assert.equal(e.on, false);
  assert.equal(p.entrada.titulo, 'Bem-vindo(a) ao campus!');
  assert.equal(p.entrada.msg, 'Para nossa alegria, {usuario} acabou de chegar no **{servidor}**! 🎉\nPega sua cor em #escolha-sua-cor e se apresenta.');
  assert.deepEqual(p.entrada.card, { on: true, bg: '', cima: 'BEM-VINDO(A) AO CAMPUS', baixo: 'Membro nº {numero}', layout: 'centro', forma: 'circulo', texto: '#FFFFFF', borda: '#F2C14E' });
  assert.deepEqual(p.entrada.cargoAuto, { on: false, cargoId: null });
  assert.equal(p.saida.msg, '{usuario} trancou a matrícula. A turma agora tem {numero} alunos.');
  assert.equal(p.ban.cor, '#C4363C');
  assert.equal(p.silencio.textoPos, 'dentro');
  assert.equal(p.silencio.duracao, '1h');
  assert.deepEqual([p.expulsao.dm, p.expulsao.mod, p.expulsao.motivo], [true, true, true]);
  assert.equal('mod' in p.saida, false);
});

test('portaria: canal e cargo inválidos viram null, cor inválida volta ao padrão', () => {
  const { cfg } = portaria({ entrada: { ...base().portaria.entrada, canalId: 'x', cor: 'azul', cargoAuto: { on: true, cargoId: '1' } } });
  assert.equal(cfg.portaria.entrada.canalId, null);
  assert.equal(cfg.portaria.entrada.cor, '#F2C14E');
  assert.deepEqual(cfg.portaria.entrada.cargoAuto, { on: true, cargoId: null });
});

test('portaria: aceita canal, cargo automático, texto dentro e duração', () => {
  const { cfg, erros } = portaria({
    entrada: { ...base().portaria.entrada, on: true, canalId: ID, textoPos: 'dentro', cargoAuto: { on: true, cargoId: ID } },
    silencio: { ...base().portaria.silencio, duracao: 'sem' },
  });
  assert.deepEqual(erros, []);
  assert.equal(cfg.portaria.entrada.on, true);
  assert.equal(cfg.portaria.entrada.canalId, ID);
  assert.equal(cfg.portaria.entrada.textoPos, 'dentro');
  assert.equal(cfg.portaria.entrada.cargoAuto.cargoId, ID);
  assert.equal(cfg.portaria.silencio.duracao, 'sem');
});

test('portaria: mensagem vazia volta pro primeiro modelo e duração estranha vira 1 hora', () => {
  const { cfg } = portaria({ saida: { ...base().portaria.saida, msg: '   ' }, silencio: { ...base().portaria.silencio, duracao: '3 anos' } });
  assert.equal(cfg.portaria.saida.msg, base().portaria.saida.msg);
  assert.equal(cfg.portaria.silencio.duracao, '1h');
});

test('portaria: imagem errada diz de qual evento é', () => {
  const { erros } = portaria({ entrada: { ...base().portaria.entrada, imgs: { topo: 'ftp://x', mini: '', imagem: '', finais: [] } } });
  assert.deepEqual(erros, ['Banner do topo (Entrou): o link precisa começar com https://.']);
});

test('portaria: fundo do card errado também', () => {
  const { erros } = portaria({ entrada: { ...base().portaria.entrada, card: { ...base().portaria.entrada.card, bg: 'ftp://x' } } });
  assert.deepEqual(erros, ['Fundo do card: o link precisa começar com https://.']);
});
