import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DADOS_PASTA = mkdtempSync(join(tmpdir(), 'manda-chuva-migracoes-'));
delete process.env.GIST_ID;
delete process.env.GIST_TOKEN;
const dados = await import('../dados.js');
const { migrar } = await import('../lib/migracoes.js');
const { lerRegistro } = await import('../lib/registro.js');

const ANTIGAS = ['Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Azul', 'Roxo', 'Rosa', 'Branco'];

test('acrescenta uma vez as cores do redesign que faltam, sem mexer nas que já existem', async () => {
  await dados.carregar();
  const cfg = dados.config();
  dados.salvarConfig({ ...cfg, cores: cfg.cores.filter((c) => ANTIGAS.includes(c.nome)).map((c) => ({ ...c, cargoId: c.nome === 'Azul' ? '123456789012345678' : null })) });
  assert.deepEqual(await migrar(), ['Preto', 'Cinza', 'Marrom']);
  const nomes = dados.config().cores.map((c) => c.nome);
  assert.deepEqual(nomes, [...ANTIGAS, 'Preto', 'Cinza', 'Marrom']);
  assert.equal(dados.config().cores.find((c) => c.nome === 'Azul').cargoId, '123456789012345678');
  assert.ok(lerRegistro().migracoes.includes('cores-redesign'));
});

test('não roda de novo (se a pessoa apagar uma cor, ela não volta)', async () => {
  dados.salvarConfig({ ...dados.config(), cores: dados.config().cores.filter((c) => c.nome !== 'Preto') });
  assert.deepEqual(await migrar(), []);
  assert.equal(dados.config().cores.some((c) => c.nome === 'Preto'), false);
});
