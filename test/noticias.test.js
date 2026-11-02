import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOVIDADES } from '../lib/novidades.js';
import { VERSAO } from '../lib/versao.js';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const base = () => dados.normalizar({}, {}).cfg;
const ID = '123456789012345678';

test('changelog: mais nova primeiro, com a versão atual do bot no topo', () => {
  assert.equal(NOVIDADES[0].versao, VERSAO);
  for (const n of NOVIDADES) {
    assert.match(n.versao, /^\d+\.\d+\.\d+$/);
    assert.match(n.data, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.ok(['NOVIDADE', 'MELHORIA', 'CORREÇÃO'].includes(n.tag));
    assert.ok(n.titulo && n.texto);
    assert.equal(typeof n.grande, 'boolean');
  }
});

test('notícias vêm desligadas, sem canal e sem menção', () => {
  assert.deepEqual(base().noticias, { on: false, canalId: null, mencao: '', quais: 'todas', imgs: { topo: '', mini: '', imagem: '', finais: [] } });
});

test('notícias: aceita canal, cargo pra mencionar e "só as grandes"', () => {
  const { cfg, erros } = dados.normalizar({ noticias: { on: true, canalId: ID, mencao: ID, quais: 'grandes' } }, base());
  assert.deepEqual(erros, []);
  assert.deepEqual({ ...cfg.noticias, imgs: undefined }, { on: true, canalId: ID, mencao: ID, quais: 'grandes', imgs: undefined });
});

test('notícias: menção, canal e "quais" estranhos voltam pro padrão', () => {
  const { cfg } = dados.normalizar({ noticias: { on: true, canalId: 'abc', mencao: '@todo mundo', quais: 'algumas' } }, base());
  assert.equal(cfg.noticias.canalId, null);
  assert.equal(cfg.noticias.mencao, '');
  assert.equal(cfg.noticias.quais, 'todas');
});

test('notícias: everyone é aceito', () => {
  assert.equal(dados.normalizar({ noticias: { mencao: 'everyone' } }, base()).cfg.noticias.mencao, 'everyone');
});

test('notícias: imagem com link estranho dá erro', () => {
  const { erros } = dados.normalizar({ noticias: { imgs: { topo: 'http://x.com/a.gif', mini: '', imagem: '', finais: [] } } }, base());
  assert.deepEqual(erros, ['Banner do topo (Notícias): o link precisa começar com https://.']);
});
