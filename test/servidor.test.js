import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATS_SRV, chave, fancy, formatarNome, normalizarSrv, PADRAO_SRV, planoDoModelo } from '../lib/servidor.js';

test('fontes Unicode: cada estilo troca as letras, tira o acento e deixa o resto', () => {
  assert.equal(fancy('Resenha', 'normal'), 'Resenha');
  assert.equal(fancy('Resenha 2', 'negrito'), '𝗥𝗲𝘀𝗲𝗻𝗵𝗮 𝟮');
  assert.equal(fancy('Ação', 'mono'), '𝙰𝚌𝚊𝚘');
  assert.equal(fancy('CHN', 'duplo'), 'ℂℍℕ'); // letras que já existiam fora do bloco
  assert.equal(fancy('ab', 'versalete'), 'ᴀʙ');
  assert.equal(fancy('a0 9', 'bolinha'), 'ⓐ⓪ ⑨');
  assert.equal(fancy('Ab1', 'largo'), 'Ａｂ１');
  assert.equal(fancy('💬 x', 'gotica'), '💬 𝖝');
});

test('nome no Discord: enfeite, caixa e canal de texto com hífen (e minúsculo na fonte normal)', () => {
  const f = PADRAO_SRV.f;
  assert.equal(formatarNome('categorias', 'Resenha', '💬', false, f.categorias), '┏━ 𝗥𝗘𝗦𝗘𝗡𝗛𝗔');
  assert.equal(formatarNome('canais', 'off-topic', '🌀', false, f.canais), '🌀・off-topic');
  assert.equal(formatarNome('canais', 'Procurando Time', '🔎', false, { fonte: 'normal', deco: 0, caixa: 'manter' }), 'procurando-time');
  assert.equal(formatarNome('canais', 'Resenha 1', '🔊', true, f.canais), '🔊・Resenha 1'); // voz aceita espaço
  assert.equal(formatarNome('canais', 'geral', '💬', false, { fonte: 'negrito', deco: 5, caixa: 'maiusculas' }), '»𝗚𝗘𝗥𝗔𝗟');
  assert.equal(formatarNome('cargos', 'Veterano', '🎓', false, f.cargos), '🎓 Veterano');
});

test('chave acha o que já existe mesmo com enfeite, fonte, acento ou emoji', () => {
  assert.equal(chave('┏━ 𝗥𝗘𝗦𝗘𝗡𝗛𝗔'), 'resenha');
  assert.equal(chave('🌀・off-topic'), 'offtopic');
  assert.equal(chave('Off Topic'), 'offtopic');
  assert.equal(chave('📢 Anúncios'), 'anuncios');
  assert.equal(chave('ᴠᴇʀɪꜰɪᴄᴀᴅᴏ'), 'verificado');
  assert.equal(chave('Ⓜⓘⓝⓔⓒⓡⓐⓕⓣ'), 'minecraft');
  assert.equal(chave('〔Monitor〕'), 'monitor');
  // Todo nome do modelo continua achável depois de formatado, em qualquer fonte e enfeite
  for (const fonte of ['normal', 'negrito', 'italico', 'cursiva', 'gotica', 'duplo', 'mono', 'largo', 'versalete', 'bolinha']) {
    for (const [, nome, emoji, canais] of CATS_SRV) {
      assert.equal(chave(formatarNome('categorias', nome, emoji, false, { fonte, deco: 3, caixa: 'maiusculas' })), chave(nome), `${fonte} ${nome}`);
      for (const [tipo, n, e] of canais) assert.equal(chave(formatarNome('canais', n, e, tipo === 'v', { fonte, deco: 2, caixa: 'manter' })), chave(n), `${fonte} ${n}`);
    }
  }
});

test('plano do modelo: categorias ligadas, canais e cargos que dependem delas', () => {
  const p = planoDoModelo({ cats: ['portaria', 'jogatina', 'staff'] });
  assert.deepEqual(p.cats.map((c) => c.id), ['portaria', 'jogatina', 'staff']);
  assert.ok(p.cargos.some((c) => c.nome === 'Minecraft'));
  assert.ok(!p.cargos.some((c) => c.nome === 'Ping de eventos'));
  assert.ok(p.cargos.some((c) => c.nome === 'Verificado'));
  assert.equal(p.resumo, '3 categorias, 14 canais e 13 cargos');
});

test('config da aba: padrão, lixo vira padrão e categoria inventada some', () => {
  assert.deepEqual(normalizarSrv(undefined), PADRAO_SRV);
  const s = normalizarSrv({ modelo: 'xyz', cats: ['staff', 'inventada', 'portaria'], opt: { apagar: 'sim', perms: false }, f: { canais: { fonte: 'comic', deco: 99, caixa: 'maiusculas' } } });
  assert.equal(s.modelo, 'resenha_jogos');
  assert.deepEqual(s.cats, ['portaria', 'staff']); // na ordem do modelo
  assert.equal(s.opt.apagar, false);
  assert.equal(s.opt.perms, false);
  assert.deepEqual(s.f.canais, { fonte: 'normal', deco: 1, caixa: 'maiusculas' });
});
