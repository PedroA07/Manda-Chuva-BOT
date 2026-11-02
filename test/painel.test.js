import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errosDoPainel, linhasDoPainel, pedacoDoPainel, textoDoPainel } from '../lib/painel.js';
import { dadosNovos } from './ajuda.js';

const { dados } = await dadosNovos();
const base = () => structuredClone(dados.normalizar({}, {}).cfg);
const ID = (n) => String(100000000000000000 + n);

function config(cores, extra = {}) {
  const cfg = base();
  cfg.cores = cores.map((c, i) => ({ nome: `Cor ${i}`, emoji: '', hex: '#3498DB', tipo: 'solida', hex2: '', estilo: 'Secondary', botaoModo: 'discord', botaoHex: '', cargoId: ID(i), ...c }));
  return Object.assign(cfg, extra);
}

test('botão com "cor do cargo" leva a bolinha e o emoji vai pro texto', () => {
  const cfg = config([{ nome: 'Rosa', emoji: '🌸', hex: '#FF6EC7', botaoModo: 'cargo' }]);
  const [linha] = linhasDoPainel(cfg, new Map([['#FF6EC7', { id: '777', name: 'cor_ff6ec7' }]]));
  assert.deepEqual(linha.components[0], { type: 2, style: 2, custom_id: `cor:${ID(0)}`, label: '🌸 Rosa', emoji: { id: '777', name: 'cor_ff6ec7' } });
});

test('botão com "cor própria" usa o fundo mais parecido com ela', () => {
  const cfg = config([{ nome: 'Fogo', emoji: '🔥', botaoModo: 'propria', botaoHex: '#E74C3C' }]);
  const [linha] = linhasDoPainel(cfg, new Map([['#E74C3C', { id: '9', name: 'cor_e74c3c' }]]));
  assert.equal(linha.components[0].style, 4);
});

test('botão "padrão Discord" usa o estilo escolhido e o emoji da cor', () => {
  const cfg = config([{ nome: 'Vermelho', emoji: '🔴', estilo: 'Danger' }]);
  const [linha] = linhasDoPainel(cfg);
  assert.deepEqual(linha.components[0], { type: 2, style: 4, custom_id: `cor:${ID(0)}`, label: 'Vermelho', emoji: { name: '🔴' } });
});

test('emoji do servidor no botão vira id e nome', () => {
  const cfg = config([{ emoji: '<a:brilho:123456789012345678>' }]);
  assert.deepEqual(linhasDoPainel(cfg)[0].components[0].emoji, { id: '123456789012345678', name: 'brilho', animated: true });
});

test('cores em linhas do tamanho escolhido e o botão de tirar no fim', () => {
  const cfg = config([{}, {}, {}, {}, {}], { botoes: { porLinha: 2, remover: { ativo: true, texto: 'Tirar cor', emoji: '❌', estilo: 'Danger' } } });
  const linhas = linhasDoPainel(cfg);
  assert.deepEqual(linhas.map((l) => l.components.length), [2, 2, 1, 1]);
  assert.deepEqual(linhas[3].components[0], { type: 2, style: 4, custom_id: 'cor:remover', label: 'Tirar cor', emoji: { name: '❌' } });
});

test('cor sem cargo ainda não ganha botão', () => {
  const cfg = config([{ cargoId: null }, {}]);
  assert.equal(linhasDoPainel(cfg)[0].components.length, 1);
});

test('texto: descrição, lista com menção colorida e campos', () => {
  const cfg = config([{ nome: 'Azul', emoji: '🔵' }]);
  cfg.painel.descricao = 'Escolha.';
  cfg.painel.campos = [{ nome: 'Como', valor: 'Clicando.' }];
  assert.equal(textoDoPainel(cfg, (c) => `<@&${c.cargoId}>`), `Escolha.\n\n🔵  <@&${ID(0)}>\n\n**Como**\nClicando.`);
});

test('pedaço do painel usa os padrões de imagem', () => {
  const cfg = config([{}]);
  const url = (ref, padrao) => ((ref || padrao) === 'none' ? null : ref || padrao);
  const p = pedacoDoPainel(cfg, { mencao: () => '@x', url });
  assert.equal(p.topo, 'banners/painel-cores.gif');
  assert.equal(p.mini, 'banners/mini-paleta.gif');
  assert.equal(p.imagem, null);
  assert.equal(p.cor, 0x5865f2);
});

test('painel com peças demais é barrado antes de ir pro Discord', () => {
  const cfg = config(Array.from({ length: 24 }, () => ({})), { botoes: { porLinha: 5, remover: { ativo: true, texto: 'Tirar', emoji: '', estilo: 'Danger' } } });
  cfg.painel.imgs = { topo: '', mini: '', imagem: 'banners/rodape-fim.gif', finais: ['', '', '', ''] };
  assert.match(errosDoPainel(cfg)[0], /aceita até 40/);
});

test('painel normal passa', () => {
  assert.deepEqual(errosDoPainel(base()), []);
});
