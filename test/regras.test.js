import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizar, PADRAO } from '../dados.js';
import { montarV2, validarV2 } from '../lib/mensagem.js';
import { ID_ACEITO, MAX_REGRAS, MODELOS_REGRAS, escadaDePunicoes, pedacoDasRegras, textoDasRegras } from '../lib/regras.js';

const R = () => structuredClone(PADRAO.regras);
const url = (ref, padrao) => (ref === 'none' ? null : `https://img/${ref || padrao}`);

test('config: padrão com o modelo "Resenha de boa", botão e /regras ligados e sem canal', () => {
  const { cfg, erros } = normalizar({});
  assert.deepEqual(erros, []);
  assert.equal(cfg.regras.canalId, null);
  assert.equal(cfg.regras.cargoId, null);
  assert.equal(cfg.regras.regras.length, MODELOS_REGRAS[0][1].length);
  assert.equal(cfg.regras.regras[0].t, 'Respeito acima de tudo');
  assert.equal(cfg.regras.botaoTxt, 'Li e aceito');
  assert.equal(cfg.regras.cor, '#C4363C');
  assert.ok(cfg.regras.botao && cfg.regras.fixar && cfg.regras.cmd && cfg.regras.escada);
});

test('config: corta os textos, aceita "novo" no canal e no cargo e reclama de regra demais', () => {
  const longo = 'x'.repeat(900);
  const { cfg } = normalizar({ regras: { ...R(), titulo: longo, intro: longo, canalId: 'novo', cargoId: 'novo', cor: '#00ff00', regras: [{ t: longo, d: longo }] } });
  assert.equal(cfg.regras.titulo.length, 100);
  assert.equal(cfg.regras.intro.length, 500);
  assert.equal(cfg.regras.regras[0].t.length, 80);
  assert.equal(cfg.regras.regras[0].d.length, 110);
  assert.equal(cfg.regras.canalId, 'novo');
  assert.equal(cfg.regras.cargoId, 'novo');
  assert.equal(cfg.regras.cor, '#00FF00');
  const demais = normalizar({ regras: { ...R(), regras: Array.from({ length: MAX_REGRAS + 1 }, (_, i) => ({ t: `R${i}`, d: '' })) } });
  assert.match(demais.erros.join(), /até 15 regras/);
  assert.equal(demais.cfg.regras.regras.length, MAX_REGRAS);
  const lixo = normalizar({ regras: { canalId: 'abc', cargoId: 12, cor: 'azul', botaoTxt: '   ', banner: 'http://x.png' } });
  assert.equal(lixo.cfg.regras.canalId, null);
  assert.equal(lixo.cfg.regras.cargoId, null);
  assert.equal(lixo.cfg.regras.cor, '#C4363C');
  assert.equal(lixo.cfg.regras.botaoTxt, 'Li e aceito');
  assert.match(lixo.erros.join(), /Imagem do topo das regras/);
});

test('escada de punições segue os limites da moderação', () => {
  assert.equal(escadaDePunicoes({ silenciar: 3, expulsar: 5 }), '1º aviso → 2º aviso → 3º aviso: silêncio de 1 h → 5º aviso: expulsão → ban');
  assert.equal(escadaDePunicoes({ silenciar: 1, expulsar: 2 }), '1º aviso: silêncio de 1 h → 2º aviso: expulsão → ban');
  assert.equal(escadaDePunicoes({ silenciar: 2, expulsar: 0 }), '1º aviso → 2º aviso: silêncio de 1 h → expulsão → ban');
  assert.equal(escadaDePunicoes({ silenciar: 0, expulsar: 4 }), '1º aviso → 2º aviso → 3º aviso → 4º aviso: expulsão → ban');
  assert.equal(escadaDePunicoes({ silenciar: 0, expulsar: 0 }), 'aviso → silêncio → expulsão → ban');
  // expulsar antes de silenciar: o silêncio nunca chega
  assert.equal(escadaDePunicoes({ silenciar: 6, expulsar: 2 }), '1º aviso → 2º aviso: expulsão → ban');
  // muitos avisos antes da primeira punição viram um intervalo
  assert.equal(escadaDePunicoes({ silenciar: 5, expulsar: 8 }), '1º ao 4º aviso → 5º aviso: silêncio de 1 h → 8º aviso: expulsão → ban');
});

test('texto: introdução, regras numeradas (só as com título) e escada', () => {
  const r = { ...R(), intro: 'Leia tudo.', regras: [{ t: 'Respeito', d: 'Sem ofensa.' }, { t: '  ', d: 'sem título some' }, { t: 'Sem spam', d: '' }] };
  const t = textoDasRegras(r, { silenciar: 3, expulsar: 5 });
  assert.equal(t, 'Leia tudo.\n\n**1. Respeito**\nSem ofensa.\n\n**2. Sem spam**\n\n**Escada de punições**\n1º aviso → 2º aviso → 3º aviso: silêncio de 1 h → 5º aviso: expulsão → ban');
  assert.equal(textoDasRegras({ ...r, escada: false, intro: '' }, { silenciar: 3, expulsar: 5 }), '**1. Respeito**\nSem ofensa.\n\n**2. Sem spam**');
});

test('mensagem: banner, cor, rodapé com o servidor e a data, e o botão verde de aceitar', () => {
  const p = pedacoDasRegras(R(), { servidor: 'SERVIDOR DOS CRIA', hoje: '07/11/2026', url, moderacao: PADRAO.moderacao });
  assert.equal(p.topo, 'https://img/banners/boas-quadro.gif');
  assert.equal(p.cor, 0xc4363c);
  assert.equal(p.titulo, 'REGIMENTO INTERNO DO CAMPUS');
  assert.equal(p.rodape, 'SERVIDOR DOS CRIA · atualizado em 07/11/2026');
  const botao = p.linhas[0].components[0];
  assert.deepEqual([botao.custom_id, botao.style, botao.label, botao.emoji.name], [ID_ACEITO, 3, 'Li e aceito', '✅']);
  const sem = pedacoDasRegras({ ...R(), botao: false, banner: 'none' }, { servidor: 'X', hoje: '01/01/2027', url, moderacao: PADRAO.moderacao });
  assert.equal(sem.topo, null);
  assert.deepEqual(sem.linhas, []);
  // /regras: igual, mas o botão pode sair (comBotao: false)
  assert.deepEqual(pedacoDasRegras(R(), { servidor: 'X', hoje: '01/01/2027', url, moderacao: PADRAO.moderacao, comBotao: false }).linhas, []);
});

test('pior caso (15 regras no limite, título e introdução cheios) cabe numa mensagem do Discord', () => {
  const cheio = normalizar({ regras: { ...R(), titulo: 'T'.repeat(300), intro: 'I'.repeat(900), regras: Array.from({ length: 15 }, () => ({ t: 'A'.repeat(200), d: 'B'.repeat(300) })) } }).cfg.regras;
  const msg = montarV2(pedacoDasRegras(cheio, { servidor: 'S'.repeat(100), hoje: '07/11/2026', url, moderacao: { silenciar: 19, expulsar: 20 } }));
  assert.deepEqual(validarV2(msg), []);
});
