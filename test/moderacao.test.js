import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const m = await import('../lib/moderacao.js');
const DIA = 864e5;

test('avisos valem 30 dias', () => {
  const agora = Date.UTC(2026, 10, 2);
  const lista = [
    { id: 'a', userId: '1', quando: agora - 29 * DIA },
    { id: 'b', userId: '1', quando: agora - 31 * DIA },
    { id: 'c', userId: '2', quando: agora - DIA },
  ];
  assert.deepEqual(m.ativos(lista, '1', agora).map((a) => a.id), ['a']);
});

test('consequência: silencia ao chegar no limite, expulsa no outro (0 = nunca)', () => {
  const regras = { silenciar: 3, expulsar: 5 };
  assert.equal(m.consequencia(2, regras), null);
  assert.equal(m.consequencia(3, regras), 'silenciar');
  assert.equal(m.consequencia(4, regras), 'silenciar');
  assert.equal(m.consequencia(5, regras), 'expulsar');
  assert.equal(m.consequencia(9, { silenciar: 0, expulsar: 0 }), null);
  assert.equal(m.consequencia(3, { silenciar: 3, expulsar: 3 }), 'expulsar');
});

test('busca de membros: nome ou usuário, sem acento, filtro por cargo, em ordem alfabética', () => {
  const lista = [
    { id: '1', nome: 'Zé', usuario: 'ze.123', cargos: ['A'] },
    { id: '2', nome: 'tetê', usuario: 'tete', cargos: ['B'] },
    { id: '3', nome: 'Ana', usuario: 'ana_x', cargos: ['A', 'B'] },
  ];
  assert.deepEqual(m.filtrarMembros(lista, {}).map((x) => x.id), ['3', '2', '1']);
  assert.deepEqual(m.filtrarMembros(lista, { q: 'TETE' }).map((x) => x.id), ['2']);
  assert.deepEqual(m.filtrarMembros(lista, { q: '@ze.1' }).map((x) => x.id), ['1']);
  assert.deepEqual(m.filtrarMembros(lista, { cargo: 'B' }).map((x) => x.id), ['3', '2']);
});

test('página de 6 em 6 (página fora do intervalo vai pra mais perto)', () => {
  const lista = Array.from({ length: 14 }, (_, i) => i);
  assert.deepEqual(m.pagina(lista, 3), { itens: [12, 13], pagina: 3, paginas: 3, total: 14 });
  assert.equal(m.pagina(lista, 9).pagina, 3);
  assert.deepEqual(m.pagina([], 1), { itens: [], pagina: 1, paginas: 1, total: 0 });
});

test('silêncio: durações do painel', () => {
  assert.deepEqual(m.SILENCIOS['10min'], [600_000, '10 minutos']);
  assert.equal(m.SILENCIOS['28d'][0], 28 * DIA);
});

test('livro: mais nova primeiro, guarda 300, desfazer marca', async () => {
  for (let i = 0; i < 302; i++) m.anotar({ tipo: 'AVISO', userId: String(i), nome: `p${i}`, oque: 'levou um aviso', por: 'pelo painel' }, 1000 + i);
  const livro = m.lerOcorrencias();
  assert.equal(livro.length, 300);
  assert.equal(livro[0].nome, 'p301');
  m.marcarDesfeita(livro[0].id);
  assert.equal(m.lerOcorrencias()[0].desfeito, true);
  await dados.esperarGravacao();
});

test('aviso guardado e tirado', () => {
  const a = m.darAviso({ userId: '7', nome: 'kiko', motivo: 'spam', por: 'pelo painel' });
  assert.equal(m.ativos(m.lerAvisos(), '7').length, 1);
  m.tirarAviso(a.id);
  assert.equal(m.ativos(m.lerAvisos(), '7').length, 0);
});

test('linha do canal de registros', () => {
  assert.equal(m.linhaDoRegistro({ tipo: 'AVISO', userId: '7', oque: 'levou um aviso: spam (1/5)', por: 'pelo painel' }), '🟡 **AVISO** · <@7> levou um aviso: spam (1/5) · pelo painel');
});

test('config da moderação: padrão e limites', () => {
  const md = dados.normalizar({}, {}).cfg.moderacao;
  assert.deepEqual({ silenciar: md.silenciar, expulsar: md.expulsar, canalId: md.canalId }, { silenciar: 3, expulsar: 5, canalId: null });
  assert.deepEqual(Object.keys(md.automod), ['palavrao', 'spam', 'convites', 'mencoes', 'links']);
  assert.equal(md.automod.spam.on, false);
  const errado = dados.normalizar({ moderacao: { silenciar: 99, expulsar: -1, canalId: 'x', automod: { spam: { on: true, acao: 'explodir' } } } }, {}).cfg.moderacao;
  assert.deepEqual([errado.silenciar, errado.expulsar, errado.canalId, errado.automod.spam], [20, 0, null, { on: true, acao: 'silenciar' }]);
  assert.ok(md.palavras.includes('porra'));
  assert.deepEqual(dados.normalizar({ moderacao: { palavras: [' Porra ', 'porra', '', 'x'.repeat(70)] } }, {}).cfg.moderacao.palavras, ['porra', 'x'.repeat(60)]);
});
