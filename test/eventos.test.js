import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuditLogEvent } from 'discord.js';
import { deveAnunciarSaida, lerAuditoria, marcarPunicao, primeiraVez } from '../lib/eventos.js';

test('saída não é anunciada se a pessoa acabou de ser expulsa ou banida', () => {
  const agora = 1_000_000;
  assert.equal(deveAnunciarSaida('a', agora), true);
  marcarPunicao('a', 'expulsao', agora);
  assert.equal(deveAnunciarSaida('a', agora + 3000), false);
  assert.equal(deveAnunciarSaida('a', agora + 11_000), true);
});

test('ban que chega por dois caminhos só é postado uma vez', () => {
  assert.equal(primeiraVez('ban:b', 5000), true);
  assert.equal(primeiraVez('ban:b', 6000), false);
  assert.equal(primeiraVez('ban:b', 40_000), true);
});

test('registro de auditoria: expulsão, ban e silêncio viram eventos da portaria', () => {
  const base = { targetId: '1', executorId: '2', reason: 'spam' };
  assert.deepEqual(lerAuditoria({ ...base, action: AuditLogEvent.MemberKick, changes: [] }), { tipo: 'expulsao', alvoId: '1', executorId: '2', motivo: 'spam' });
  assert.deepEqual(lerAuditoria({ ...base, action: AuditLogEvent.MemberBanAdd, changes: [] }), { tipo: 'ban', alvoId: '1', executorId: '2', motivo: 'spam' });
  const ate = new Date(Date.now() + 3600_000).toISOString();
  const s = lerAuditoria({ ...base, action: AuditLogEvent.MemberUpdate, changes: [{ key: 'communication_disabled_until', old: null, new: ate }] });
  assert.equal(s.tipo, 'silencio');
  assert.equal(s.ate.toISOString(), ate);
});

test('tirar o silêncio ou mudar apelido não vira evento', () => {
  const base = { targetId: '1', executorId: '2', reason: null, action: AuditLogEvent.MemberUpdate };
  assert.equal(lerAuditoria({ ...base, changes: [{ key: 'communication_disabled_until', old: '2026-01-01', new: null }] }), null);
  assert.equal(lerAuditoria({ ...base, changes: [{ key: 'nick', old: 'a', new: 'b' }] }), null);
});
