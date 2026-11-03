import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { iniciarApi } from '../api.js';
import { criarSessao } from '../lib/sessao.js';
import { VERSAO } from '../lib/versao.js';

/** Sobe a API numa porta livre com uma api falsa e devolve o endereço */
async function subir(api, extra = {}) {
  const servidor = iniciarApi({ porta: 0, senha: '', origens: [], api, silencioso: true, ...extra });
  await once(servidor, 'listening');
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

test('anexo público é servido com o tipo certo e sem precisar de cabeçalho', async (t) => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const { servidor, base } = await subir({
    saude: () => ({}),
    lerAnexo: async (id) => (id === '0123456789abcdef' ? { buffer: png, tipo: 'image/png', ext: 'png' } : null),
  });
  t.after(() => servidor.close());
  const r = await fetch(`${base}/anexos/0123456789abcdef.png`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
  assert.equal((await fetch(`${base}/anexos/ffffffffffffffff`)).status, 404);
});

test('upload de anexo aceita corpo maior que 1 MB', async (t) => {
  let recebido;
  const { servidor, base } = await subir({ saude: () => ({}), anexo: async (c) => ((recebido = c), { id: 'x', ref: 'anexo:x' }) });
  t.after(() => servidor.close());
  const base64 = Buffer.alloc(3 * 1024 * 1024).toString('base64');
  const r = await fetch(`${base}/api/anexo`, { method: 'POST', headers: { 'X-Painel': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, tipo: 'image/png' }) });
  assert.equal(r.status, 200);
  assert.equal(recebido.base64.length, base64.length);
});

test('placa dos banners de evento é pública e vem em JPEG', async (t) => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff]);
  const { servidor, base } = await subir({ saude: () => ({}), placa: async (ev) => (ev === 'entrada' ? jpg : null) });
  t.after(() => servidor.close());
  const r = await fetch(`${base}/placas/entrada.jpg`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${base}/placas/nada.jpg`)).status, 404);
});

test('/saude mostra a versão do bot', async (t) => {
  const { servidor, base } = await subir({ saude: () => ({ ok: true, bot: 'offline' }) });
  t.after(() => servidor.close());
  const r = await fetch(`${base}/saude`);
  assert.deepEqual(await r.json(), { ok: true, bot: 'offline', versao: VERSAO, login: false });
  assert.equal((await fetch(`${base}/saude`, { method: 'HEAD' })).status, 200);
  assert.match(VERSAO, /^\d+\.\d+\.\d+$/);
});

test('níveis: senha é admin; sessão do Discord vale o papel no servidor', async (t) => {
  const papeis = { '111111111111111111': 'membro', '222222222222222222': 'staff' };
  const vistos = [];
  const { servidor, base } = await subir({
    saude: () => ({}),
    papelDe: async (id) => papeis[id] ?? null,
    eu: (quem) => quem,
    estado: () => ({ cheio: true }),
    salvar: (c, quem) => (vistos.push(quem.papel), { ok: true }),
  }, { senha: 'senha-bem-grande-123' });
  t.after(() => servidor.close());
  const pedir = (caminho, auth, corpo) =>
    fetch(base + caminho, { method: corpo ? 'POST' : 'GET', headers: { 'X-Painel': '1', 'Content-Type': 'application/json', ...(auth && { Authorization: auth }) }, body: corpo && JSON.stringify(corpo) });
  const sessao = (id) => `Sessao ${criarSessao({ id, nome: 'x', usuario: 'x' })}`;
  assert.equal((await pedir('/api/estado')).status, 401);
  assert.equal((await pedir('/api/estado', 'Bearer senha-bem-grande-123')).status, 200);
  assert.equal((await (await pedir('/api/eu', 'Bearer senha-bem-grande-123')).json()).papel, 'admin');
  // Membro: entra no /api/eu mas não na parte da staff
  assert.equal((await (await pedir('/api/eu', sessao('111111111111111111'))).json()).papel, 'membro');
  assert.equal((await pedir('/api/estado', sessao('111111111111111111'))).status, 403);
  // Staff: entra e salva (a api recebe quem salvou)
  assert.equal((await pedir('/api/salvar', sessao('222222222222222222'), {})).status, 200);
  assert.deepEqual(vistos, ['staff']);
  // Fora do servidor ou sessão inválida
  assert.equal((await pedir('/api/eu', sessao('333333333333333333'))).status, 403);
  assert.equal((await pedir('/api/eu', 'Sessao lixo')).status, 401);
});

test('login com Discord desligado volta pro site com o aviso; volta não liberada é recusada', async (t) => {
  const { servidor, base } = await subir({ saude: () => ({}), clientId: () => '42' }, { origens: ['https://site.exemplo'] });
  t.after(() => servidor.close());
  const r = await fetch(`${base}/auth/entrar?volta=${encodeURIComponent('https://site.exemplo/painel/')}`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://site.exemplo/painel/#erro=login-desligado');
  assert.equal((await fetch(`${base}/auth/entrar?volta=https://golpe.com/`, { redirect: 'manual' })).status, 400);
  // Volta do Discord aberta direto (sem o state): página com o caminho de volta, não JSON
  const direto = await fetch(`${base}/auth/callback`, { redirect: 'manual' });
  assert.equal(direto.status, 400);
  assert.match(direto.headers.get('content-type'), /text\/html/);
  assert.match(await direto.text(), /Entrar com Discord/);
});
