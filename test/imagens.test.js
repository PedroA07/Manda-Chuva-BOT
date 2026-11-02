import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_IMAGENS, midia, PADROES } from '../lib/imagens.js';

test('vazio usa o padrão do lugar', () => {
  assert.deepEqual(midia('', PADROES.painel.topo), { url: `${BASE_IMAGENS}banners/painel-cores.gif` });
});

test('"none" e padrão "none" ficam sem imagem', () => {
  assert.equal(midia('none', PADROES.painel.topo), null);
  assert.equal(midia('', PADROES.painel.imagem), null);
});

test('modelo da galeria vira endereço do site da interface', () => {
  assert.deepEqual(midia('banners/festas/natal-painel.gif'), { url: 'https://pedroa07.github.io/Interface-Manda-Chuva-Bot/banners/festas/natal-painel.gif' });
});

test('link https continua igual', () => {
  assert.deepEqual(midia('https://cdn.x.com/a.png'), { url: 'https://cdn.x.com/a.png' });
});

test('arquivo enviado pelo painel vira anexo', () => {
  assert.deepEqual(midia('anexo:0123456789abcdef'), { anexo: '0123456789abcdef' });
});
