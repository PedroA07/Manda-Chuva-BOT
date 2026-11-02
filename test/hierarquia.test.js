import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PermissionFlagsBits as P } from 'discord.js';
import {
  bitsDasPerms, errosDaHierarquia, lerSeparador, listaDaHierarquia, nomeDoSeparador, permsDosBits, planejarHierarquia, posicoes,
} from '../lib/hierarquia.js';

// Servidor de exemplo (posição maior = mais alto). O bot é o "Manda Chuva".
const cargo = (id, nome, posicao, extra = {}) => ({ id, nome, posicao, cor: 0, bits: 0n, hoist: false, mencionavel: false, gerenciado: null, membros: null, ...extra });
const ID = { dono: '100000000000000001', mod: '100000000000000002', bot: '100000000000000003', vip: '100000000000000004', sepCores: '100000000000000005',
  vermelho: '100000000000000006', azul: '100000000000000007', calouro: '100000000000000008', impulso: '100000000000000009', sepStaff: '100000000000000010' };
const SERVIDOR = [
  cargo(ID.sepStaff, '━━ STAFF ━━', 10),
  cargo(ID.dono, 'Dono', 9, { cor: 0xf1c40f, bits: P.Administrator, hoist: true }),
  cargo(ID.mod, 'Moderação', 8, { cor: 0xe91e63, bits: P.KickMembers | P.BanMembers }),
  cargo(ID.bot, 'Manda Chuva', 7, { gerenciado: 'bot', bits: P.ManageRoles }),
  cargo(ID.vip, 'VIP', 6, { cor: 0xf39c12, hoist: true, membros: 8 }),
  cargo(ID.sepCores, '━━ CORES ━━', 5),
  cargo(ID.azul, 'Azul', 4, { cor: 0x3498db }),
  cargo(ID.calouro, 'Calouro', 3, { bits: P.SendMessages }),
  cargo(ID.vermelho, 'Vermelho', 2, { cor: 0xe74c3c }),
  cargo(ID.impulso, 'Server Booster', 1, { gerenciado: 'impulso', cor: 0xff73fa }),
];
const BASE = { atual: SERVIDOR, botId: ID.bot, idsDeCor: [ID.vermelho, ID.azul], permsDoBot: P.ManageRoles | P.ManageMessages };

test('separador: "━━ NOME ━━" e outros traços comuns', () => {
  assert.equal(nomeDoSeparador('STAFF'), '━━ STAFF ━━');
  assert.equal(lerSeparador('━━ STAFF ━━'), 'STAFF');
  assert.equal(lerSeparador('──── INTERESSES ────'), 'INTERESSES');
  assert.equal(lerSeparador('━━━━━━'), '');
  assert.equal(lerSeparador('Calouro'), null);
  assert.equal(lerSeparador('-- quase --'), null);
});

test('permissões do painel <-> bits do Discord', () => {
  assert.equal(bitsDasPerms(['admin', 'banir']), P.Administrator | P.BanMembers);
  assert.deepEqual(permsDosBits(P.ManageRoles | P.KickMembers | P.SendMessages), ['cargos', 'expulsar']);
});

test('lista do painel: bloco de cores no lugar da cor mais alta, travados acima do bot', () => {
  const lista = listaDaHierarquia(SERVIDOR, { botId: ID.bot, idsDeCor: [ID.vermelho, ID.azul] });
  assert.deepEqual(lista.map((x) => (x.k === 'cores' ? 'BLOCO' : x.nome)), ['STAFF', 'Dono', 'Moderação', 'Manda Chuva', 'VIP', 'CORES', 'BLOCO', 'Calouro', 'Server Booster']);
  assert.deepEqual(lista[0], { k: 'sep', id: ID.sepStaff, nome: 'STAFF', travado: true });
  assert.deepEqual(lista[1], { k: 'role', id: ID.dono, nome: 'Dono', hex: '#F1C40F', perms: ['admin'], hoist: true, mencionavel: false, membros: null, travado: true });
  assert.equal(lista[3].bot, true);
  assert.equal(lista[3].gerenciado, 'bot');
  assert.equal(lista[4].membros, 8);
  assert.equal(lista[4].travado, undefined);
  assert.deepEqual(lista[5], { k: 'sep', id: ID.sepCores, nome: 'CORES' });
  assert.deepEqual(lista[6], { k: 'cores' });
  assert.equal(lista.at(-1).gerenciado, 'impulso');
});

test('lista do painel: sem cargo de cor, o bloco fica logo abaixo do bot', () => {
  const lista = listaDaHierarquia(SERVIDOR, { botId: ID.bot, idsDeCor: [] });
  assert.deepEqual(lista[4], { k: 'cores' });
});

test('salvar sem mexer na hierarquia só junta as cores na ordem da aba Cores', () => {
  const p = planejarHierarquia({ ...BASE, editada: null });
  assert.deepEqual([p.criar, p.editar, p.apagar, p.avisos], [[], [], [], []]);
  assert.deepEqual(p.ordem, [ID.vip, ID.sepCores, ID.vermelho, ID.azul, ID.calouro, ID.impulso]);
});

test('edições: renomear, cor, permissões (sem perder as outras), criar e apagar', () => {
  const lista = listaDaHierarquia(SERVIDOR, BASE);
  const calouro = lista.find((x) => x.id === ID.calouro);
  const editada = {
    lista: [
      ...lista.slice(0, 4),
      { k: 'sep', id: 'novo-1', nome: 'NOVO GRUPO' },
      { k: 'role', id: 'novo-2', nome: 'Monitor', hex: '#5865F2', perms: ['mensagens', 'banir'], hoist: true, mencionavel: false },
      { k: 'cores' },
      { ...calouro, nome: 'Calouros', hex: '#2ECC71', perms: ['mensagens'], mencionavel: true },
      { k: 'sep', id: ID.sepCores, nome: 'CORES' },
      lista.at(-1),
    ],
    apagar: [ID.vip],
  };
  const p = planejarHierarquia({ ...BASE, editada });
  assert.deepEqual(p.apagar, [ID.vip]);
  assert.deepEqual(p.criar, [
    { chave: 'novo:0', nome: '━━ NOVO GRUPO ━━', dados: { name: '━━ NOVO GRUPO ━━', colors: { primaryColor: 0 }, permissions: 0n, hoist: false, mentionable: false } },
    { chave: 'novo:1', nome: 'Monitor', dados: { name: 'Monitor', colors: { primaryColor: 0x5865f2 }, permissions: P.ManageMessages, hoist: true, mentionable: false } },
  ]);
  assert.deepEqual(p.editar, [{ id: ID.calouro, nome: 'Calouros', dados: { name: 'Calouros', colors: { primaryColor: 0x2ecc71 }, mentionable: true, permissions: P.SendMessages | P.ManageMessages } }]);
  assert.deepEqual(p.avisos, ['⚠️ "Monitor" ficou sem Banir: eu mesmo não tenho essa permissão, então não consigo dar.']);
  assert.deepEqual(p.ordem, ['novo:0', 'novo:1', ID.vermelho, ID.azul, ID.calouro, ID.sepCores, ID.impulso]);
});

test('travado, integração e cor não são editados nem apagados pela hierarquia', () => {
  const lista = listaDaHierarquia(SERVIDOR, BASE).map((x) => (x.k === 'role' ? { ...x, nome: `${x.nome}!`, hex: '#000001' } : x));
  const p = planejarHierarquia({ ...BASE, editada: { lista, apagar: [ID.dono, ID.impulso, ID.vermelho] } });
  assert.deepEqual(p.editar.map((e) => e.id), [ID.vip, ID.calouro]);
  assert.deepEqual(p.apagar, []);
  assert.equal(p.avisos.length, 3);
  assert.match(p.avisos[0], /Não apaguei "Dono"/);
});

test('cargo criado no Discord depois de abrir o painel fica abaixo do vizinho de cima', () => {
  const lista = listaDaHierarquia(SERVIDOR, BASE);
  // Novato apareceu entre Azul e Calouro
  const atual = [...SERVIDOR.map((r) => (r.posicao >= 4 ? { ...r, posicao: r.posicao + 1 } : r)), cargo('100000000000000099', 'Novato', 4)];
  const p = planejarHierarquia({ ...BASE, atual, editada: { lista, apagar: [] } });
  assert.deepEqual(p.ordem, [ID.vip, ID.sepCores, ID.vermelho, ID.azul, '100000000000000099', ID.calouro, ID.impulso]);
});

test('cargo que sumiu do Discord vira aviso; separador "──" não é renomeado à toa', () => {
  const atual = SERVIDOR.map((r) => (r.id === ID.sepCores ? { ...r, nome: '──── CORES ────' } : r));
  const lista = [...listaDaHierarquia(atual, BASE), { k: 'role', id: '100000000000000555', nome: 'Fantasma', hex: '', perms: [] }];
  const p = planejarHierarquia({ ...BASE, atual, editada: { lista, apagar: [] } });
  assert.deepEqual(p.editar, []);
  assert.deepEqual(p.avisos, ['⚠️ "Fantasma" não existe mais no Discord: atualize a página.']);
});

test('posições: nada muda quando já está na ordem; senão usa as vagas que eles ocupam', () => {
  const atual = [cargo('1', 'A', 5), cargo('2', 'B', 4), cargo('3', 'C', 3)];
  assert.deepEqual(posicoes(['1', '2', '3'], atual), []);
  assert.deepEqual(posicoes(['3', '1', '2'], atual), [{ id: '3', position: 5 }, { id: '1', position: 4 }, { id: '2', position: 3 }]);
  const empate = [cargo('1', 'A', 2), cargo('2', 'B', 2), cargo('3', 'C', 1)];
  assert.deepEqual(posicoes(['3', '2', '1'], empate), [{ id: '3', position: 3 }, { id: '2', position: 2 }, { id: '1', position: 1 }]);
});

test('validação do que vem do painel', () => {
  assert.deepEqual(errosDaHierarquia(undefined), []);
  assert.deepEqual(errosDaHierarquia({ lista: 'x' }), ['Hierarquia: formato inválido.']);
  assert.deepEqual(errosDaHierarquia({
    lista: [{ k: 'role', id: 'novo-1', nome: '  ', hex: '' }, { k: 'role', id: 'novo-2', nome: 'A', hex: 'azul' }, { k: 'sep', nome: 'X'.repeat(95) }, { k: 'cores' }, { k: 'cores' }, { k: 'role', nome: 'B', hex: '', perms: ['dono'] }],
    apagar: [],
  }), [
    'Tem cargo sem nome na hierarquia.',
    'Cor inválida no cargo "A" (use #RRGGBB).',
    'Nome de separador passa de 94 letras.',
    'Permissão desconhecida no cargo "B".',
    'O bloco de cores aparece mais de uma vez.',
  ]);
});
