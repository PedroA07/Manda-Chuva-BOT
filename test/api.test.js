import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { iniciarApi } from '../api.js';

/** Sobe a API numa porta livre com uma api falsa e devolve o endereço */
async function subir(api, extra = {}) {
  const servidor = iniciarApi({ porta: 0, senha: '', origens: [], api, silencioso: true, ...extra });
  await once(servidor, 'listening');
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

test('/saude mostra a versão do bot', async (t) => {
  const { servidor, base } = await subir({ saude: () => ({ ok: true, bot: 'offline' }) });
  t.after(() => servidor.close());
  const r = await fetch(`${base}/saude`);
  assert.deepEqual(await r.json(), { ok: true, bot: 'offline', versao: '3.0.0' });
});
