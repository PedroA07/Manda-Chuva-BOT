import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AutoModerationActionType as A, AutoModerationRuleTriggerType as T } from 'discord.js';
import { contarSpam, oqueDoAutomod, PALAVROES, regraDoDiscord } from '../lib/automod.js';

// As regex do Discord são do Rust; pra testar aqui tiro o (?i) e uso a flag i do JS
const casa = (padroes, texto) => padroes.some((p) => new RegExp(p.replace(/^\(\?i\)/, ''), 'i').test(texto));

test('palavrões: regra de palavra-chave com a lista; silenciar = bloquear + castigo de 10 min', () => {
  const r = regraDoDiscord('palavrao', { acao: 'silenciar', palavras: ['porra', 'vai se foder'], isentos: ['9'] });
  assert.equal(r.name, 'Manda Chuva · Palavrões');
  assert.equal(r.triggerType, T.Keyword);
  assert.deepEqual(r.triggerMetadata.keywordFilter, ['porra', 'vai se foder']);
  assert.deepEqual(r.actions.map((a) => a.type), [A.BlockMessage, A.Timeout]);
  assert.equal(r.actions[1].metadata.durationSeconds, 600);
  assert.ok(r.actions[0].metadata.customMessage.length <= 150);
  assert.deepEqual(r.exemptRoles, ['9']);
  assert.deepEqual(regraDoDiscord('palavrao', { acao: 'avisar', palavras: ['x'], isentos: [] }).actions.map((a) => a.type), [A.BlockMessage]);
});

test('convites: pega discord.gg e discord.com/invite, menos os da casa', () => {
  const r = regraDoDiscord('convites', { acao: 'apagar', convites: ['minhacasa'], isentos: [] });
  const p = r.triggerMetadata.regexPatterns;
  assert.ok(casa(p, 'entra aí https://discord.gg/abc123'));
  assert.ok(casa(p, 'discord.com/invite/XyZ'));
  assert.ok(casa(p, 'dsc.gg/servidor'));
  assert.equal(casa(p, 'discord.com/channels/1/2'), false);
  assert.deepEqual(r.triggerMetadata.allowList, ['discord.gg/minhacasa', 'discord.com/invite/minhacasa']);
});

test('menções: mais de 5 numa mensagem', () => {
  const r = regraDoDiscord('mencoes', { acao: 'apagar', isentos: [] });
  assert.equal(r.triggerType, T.MentionSpam);
  assert.equal(r.triggerMetadata.mentionTotalLimit, 5);
});

test('links suspeitos: encurtadores, nitro grátis e sites que imitam o Discord', () => {
  const p = regraDoDiscord('links', { acao: 'apagar', isentos: [] }).triggerMetadata.regexPatterns;
  assert.ok(p.length <= 10 && p.every((x) => x.length <= 260));
  for (const ruim of ['https://bit.ly/3abc', 'olha https://tinyurl.com/x', 'NITRO GRÁTIS aqui', 'free discord nitro', 'https://dlscord.gift/abc', 'https://discord-nitro.ru/x', 'steamcommunlty.com/trade']) assert.ok(casa(p, ruim), ruim);
  for (const bom of ['https://discord.com/channels/1', 'https://discord.gift/abc', 'comprei nitro ontem', 'https://youtube.com/watch?v=1']) assert.equal(casa(p, bom), false, bom);
});

test('lista padrão de palavrões: minúsculas, sem repetir, no limite do Discord', () => {
  assert.ok(PALAVROES.length > 10 && PALAVROES.length <= 1000);
  assert.equal(new Set(PALAVROES).size, PALAVROES.length);
  assert.ok(PALAVROES.every((x) => x === x.toLowerCase() && x.length <= 60));
});

test('anti-spam: 5 mensagens em 3 segundos', () => {
  const janelas = new Map();
  const msg = (n) => ({ id: String(n), canalId: 'c', userId: 'u' });
  for (let i = 0; i < 4; i++) assert.equal(contarSpam(janelas, msg(i), 1000 + i * 500), null);
  const rajada = contarSpam(janelas, msg(4), 3000);
  assert.deepEqual(rajada.map((m) => m.id), ['0', '1', '2', '3', '4']);
  assert.equal(janelas.has('u'), false);
  // devagar não conta
  for (let i = 0; i < 6; i++) assert.equal(contarSpam(janelas, msg(10 + i), 10_000 + i * 1000), null);
});

test('texto do livro pro auto-mod', () => {
  assert.equal(oqueDoAutomod('spam', 'avisar', 6), 'mandou 6 mensagens em 3s e levou aviso');
  assert.equal(oqueDoAutomod('convites', 'apagar'), 'mandou convite de outro servidor (mensagem apagada)');
  assert.equal(oqueDoAutomod('spam', 'apagar', 5), 'mandou 5 mensagens em 3s (mensagens apagadas)');
  assert.equal(oqueDoAutomod('palavrao', 'silenciar'), 'mandou palavrão e ficou 10 min em silêncio');
  assert.equal(oqueDoAutomod('links', 'expulsar'), 'mandou link suspeito e foi expulso');
});
