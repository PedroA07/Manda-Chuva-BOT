// Copiar a configuração de um servidor pra outro: canais e cargos pelo nome
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collection } from 'discord.js';
import { traduzirConfig } from '../lib/copiar.js';

const guilda = (id, canais, cargos) => ({
  id,
  channels: { cache: new Collection(canais.map((c) => [c.id, c])) },
  roles: { cache: new Collection(cargos.map((r) => [r.id, r])) },
});
const ORIGEM = guilda('100000000000000000', [
  { id: '100000000000000001', name: 'boas-vindas', type: 0 },
  { id: '100000000000000002', name: 'regras', type: 0 },
  { id: '100000000000000003', name: 'Jogos', type: 4 },
], [
  { id: '100000000000000000', name: '@everyone' },
  { id: '100000000000000010', name: 'Staff' },
  { id: '100000000000000011', name: 'Azul' },
  { id: '100000000000000012', name: 'Verificado' },
]);
const DESTINO = guilda('200000000000000000', [
  { id: '200000000000000001', name: 'boas-vindas', type: 0 },
  { id: '200000000000000003', name: 'Jogos', type: 2 }, // mesmo nome, mas é canal de voz: não vale
], [
  { id: '200000000000000000', name: '@everyone' },
  { id: '200000000000000010', name: 'Staff' },
  { id: '200000000000000099', name: 'Azul', managed: true }, // de integração: não vale
]);

test('canais e cargos viram os de mesmo nome; o que não tem fica vazio e é listado; o resto vai igual', () => {
  const cfg = {
    servidorId: ORIGEM.id,
    portaria: { entrada: { canalId: '100000000000000001', texto: 'Bem-vindo, {usuario}!' } },
    regras: { canalId: '100000000000000002', cargoId: '100000000000000012', fixar: true },
    tickets: { staffId: '100000000000000010', categoriaId: '100000000000000003' },
    cores: [{ nome: 'Azul', hex: '#3498DB', cargoId: '100000000000000011' }],
    moderacao: { isentos: ['100000000000000010', '100000000000000012', '300000000000000000'] },
    imagem: 'anexo:0123456789abcdef',
    hierarquia: { ordem: [] },
  };
  const r = traduzirConfig(cfg, ORIGEM, DESTINO);
  assert.equal(r.cfg.servidorId, DESTINO.id);
  assert.equal(r.cfg.portaria.entrada.canalId, '200000000000000001');
  assert.equal(r.cfg.portaria.entrada.texto, 'Bem-vindo, {usuario}!');
  assert.equal(r.cfg.regras.canalId, null);
  assert.equal(r.cfg.regras.cargoId, null);
  assert.equal(r.cfg.regras.fixar, true);
  assert.equal(r.cfg.tickets.staffId, '200000000000000010');
  assert.equal(r.cfg.tickets.categoriaId, null);
  assert.equal(r.cfg.cores[0].cargoId, null); // o bot cria a cor no Salvar
  assert.deepEqual(r.cfg.moderacao.isentos, ['200000000000000010', '300000000000000000']);
  assert.equal(r.cfg.imagem, 'anexo:0123456789abcdef');
  assert.equal(r.cfg.hierarquia, undefined);
  assert.equal(r.achados, 3);
  assert.deepEqual(r.faltando.sort(), ['#Jogos', '#regras', '@Azul', '@Verificado']);
  // A config de origem não muda
  assert.equal(cfg.portaria.entrada.canalId, '100000000000000001');
});
