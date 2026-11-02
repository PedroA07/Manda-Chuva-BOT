import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DADOS_PASTA = mkdtempSync(join(tmpdir(), 'manda-chuva-registro-'));
delete process.env.GIST_ID;
delete process.env.GIST_TOKEN;
const { lerRegistro, salvarRegistro } = await import('../lib/registro.js');

test('registro começa vazio e guarda o que foi anunciado', async () => {
  assert.deepEqual(lerRegistro().noticiasAnunciadas, []);
  assert.equal(await salvarRegistro({ noticiasAnunciadas: ['3.0.0', '3.1.0'] }), null);
  assert.deepEqual(lerRegistro().noticiasAnunciadas, ['3.0.0', '3.1.0']);
});

test('salvar um pedaço não apaga o resto', async () => {
  await salvarRegistro({ outraCoisa: 1 });
  assert.deepEqual(lerRegistro().noticiasAnunciadas, ['3.0.0', '3.1.0']);
  assert.equal(lerRegistro().outraCoisa, 1);
});
