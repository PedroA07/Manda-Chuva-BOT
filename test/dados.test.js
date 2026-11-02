import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const { normalizar } = dados;

// Config como estava gravada na produção antes do redesign (versão 2)
const CONFIG_V2 = {
  servidorId: '123456789012345678',
  cores: [
    { nome: 'Vermelho', emoji: '🔴', hex: '#E74C3C', estilo: 'Secondary', cargoId: null },
    { nome: 'Rosa', emoji: '🌸', hex: '#FF6EC7', estilo: 'Danger', cargoId: '223456789012345678' },
  ],
  painel: {
    titulo: '🎨 Cor do nome',
    descricao: 'Escolha a cor.',
    listarCores: true,
    campos: [{ nome: 'Como tirar', valor: 'Clique de novo.', inline: false }],
    rodape: 'Painel de cores',
    corDoEmbed: '#5865F2',
    imagem: '',
    miniatura: '',
  },
  botoes: { porLinha: 4, remover: { ativo: true, texto: 'Tirar cor', emoji: '❌', estilo: 'Danger' } },
  mensagens: { ganhou: 'Pronto! Seu nome agora está {cor}.', removeu: 'Cor removida.' },
};

const v3 = () => normalizar(CONFIG_V2, normalizar({}, {}).cfg).cfg;

test('DADOS_PASTA troca a pasta onde a config é gravada', async () => {
  const { dados: d, pasta } = await dadosNovos();
  await d.carregar();
  assert.ok(existsSync(join(pasta, 'config.json')));
});

test('config da versão 2 vira v3 sem perder cores, servidor e textos', () => {
  const { cfg, erros } = normalizar(CONFIG_V2, normalizar({}, {}).cfg);
  assert.deepEqual(erros, []);
  assert.equal(cfg.servidorId, '123456789012345678');
  assert.deepEqual(cfg.cores[1], {
    nome: 'Rosa', emoji: '🌸', hex: '#FF6EC7', tipo: 'solida', hex2: '', estilo: 'Danger', botaoModo: 'discord', botaoHex: '', cargoId: '223456789012345678',
  });
  assert.deepEqual(cfg.painel.imgs, { topo: '', mini: '', imagem: '', finais: [] });
  assert.deepEqual(cfg.painel.campos, [{ nome: 'Como tirar', valor: 'Clique de novo.' }]);
  assert.equal(cfg.mensagens.ganhou, 'Pronto! Seu nome agora está {cor}.');
});

test('link antigo de imagem e miniatura vai pros lugares novos', () => {
  const antigo = { ...CONFIG_V2, painel: { ...CONFIG_V2.painel, imagem: 'https://x.com/a.png', miniatura: 'https://x.com/m.png' } };
  const { cfg } = normalizar(antigo, normalizar({}, {}).cfg);
  assert.equal(cfg.painel.imgs.imagem, 'https://x.com/a.png');
  assert.equal(cfg.painel.imgs.mini, 'https://x.com/m.png');
});

test('interface antiga salvando não apaga imagens nem o jeito novo das cores', () => {
  const atual = v3();
  atual.painel.imgs = { topo: 'banners/festas/natal-painel.gif', mini: 'none', imagem: '', finais: ['banners/rodape-fim.gif'] };
  Object.assign(atual.cores[1], { tipo: 'degrade', hex2: '#FFD36E', botaoModo: 'cargo' });
  const { cfg, erros } = normalizar(CONFIG_V2, atual);
  assert.deepEqual(erros, []);
  assert.deepEqual(cfg.painel.imgs, atual.painel.imgs);
  assert.equal(cfg.cores[1].tipo, 'degrade');
  assert.equal(cfg.cores[1].hex2, '#FFD36E');
  assert.equal(cfg.cores[1].botaoModo, 'cargo');
});

test('seção que não veio continua como estava', () => {
  const atual = v3();
  const { cfg } = normalizar({ servidorId: atual.servidorId }, atual);
  assert.deepEqual(cfg, atual);
});

test('degradê sem a cor final válida dá erro', () => {
  const c = { ...CONFIG_V2, cores: [{ ...CONFIG_V2.cores[1], tipo: 'degrade', hex2: 'azul' }] };
  assert.deepEqual(normalizar(c, v3()).erros, ['"Rosa": a cor final do degradê está inválida (use o formato #RRGGBB).']);
});

test('botão com cor própria precisa de uma cor válida', () => {
  const c = { ...CONFIG_V2, cores: [{ ...CONFIG_V2.cores[1], botaoModo: 'propria', botaoHex: '#12' }] };
  assert.deepEqual(normalizar(c, v3()).erros, ['"Rosa": a cor do botão está inválida (use o formato #RRGGBB).']);
});

test('imagem com endereço estranho dá erro', () => {
  const c = { ...CONFIG_V2, painel: { ...CONFIG_V2.painel, imgs: { topo: 'ftp://x.com/a.gif', mini: '', imagem: '', finais: [] } } };
  assert.deepEqual(normalizar(c, v3()).erros, ['Banner do topo: o link precisa começar com https://.']);
});

test('aceita modelo, link, anexo, padrão e sem imagem', () => {
  const imgs = { topo: 'banners/festas/natal-painel.gif', mini: 'anexo:0123456789abcdef', imagem: 'https://cdn.x.com/a.gif', finais: ['', 'none'] };
  const c = { ...CONFIG_V2, painel: { ...CONFIG_V2.painel, imgs } };
  const { cfg, erros } = normalizar(c, v3());
  assert.deepEqual(erros, []);
  assert.deepEqual(cfg.painel.imgs, imgs);
});

test('no máximo 4 imagens no final', () => {
  const c = { ...CONFIG_V2, painel: { ...CONFIG_V2.painel, imgs: { topo: '', mini: '', imagem: '', finais: ['', '', '', '', ''] } } };
  assert.deepEqual(normalizar(c, v3()).erros, ['Até 4 imagens no final.']);
});
