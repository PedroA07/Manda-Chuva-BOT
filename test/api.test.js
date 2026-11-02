import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { iniciarApi } from '../api.js';
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
  assert.deepEqual(await r.json(), { ok: true, bot: 'offline', versao: VERSAO });
  assert.match(VERSAO, /^\d+\.\d+\.\d+$/);
});
