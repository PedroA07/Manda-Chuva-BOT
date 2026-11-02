import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { dadosNovos } from './ajuda.js';

test('DADOS_PASTA troca a pasta onde a config é gravada', async () => {
  const { dados, pasta } = await dadosNovos();
  await dados.carregar();
  assert.ok(existsSync(join(pasta, 'config.json')));
});
