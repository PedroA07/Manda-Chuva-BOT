import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DADOS_PASTA = mkdtempSync(join(tmpdir(), 'manda-chuva-anexos-'));
delete process.env.GIST_ID;
delete process.env.GIST_TOKEN;
const { juntar, lerAnexo, partir, refsDeAnexo, salvarAnexo } = await import('../lib/anexos.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 7)]);

test('base64 grande é partido em pedaços e volta igual', () => {
  const texto = 'a'.repeat(23);
  const partes = partir(texto, 10);
  assert.deepEqual(partes.map((p) => p.length), [10, 10, 3]);
  assert.equal(juntar(partes), texto);
});

test('salva um PNG e lê de volta pelo id', async () => {
  const { id, ref } = await salvarAnexo({ base64: PNG.toString('base64'), tipo: 'image/png', nome: 'a.png' });
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(ref, `anexo:${id}`);
  const lido = await lerAnexo(id);
  assert.equal(lido.tipo, 'image/png');
  assert.equal(lido.ext, 'png');
  assert.deepEqual(lido.buffer, PNG);
});

test('arquivo maior que 8 MB é recusado', async () => {
  const grande = Buffer.concat([PNG, Buffer.alloc(8 * 1024 * 1024)]);
  await assert.rejects(salvarAnexo({ base64: grande.toString('base64'), tipo: 'image/png' }), { status: 400, message: 'Arquivo maior que 8 MB.' });
});

test('o que não é imagem é recusado', async () => {
  await assert.rejects(salvarAnexo({ base64: Buffer.from('oi').toString('base64'), tipo: 'text/plain' }), { status: 400, message: 'Isso não parece uma imagem.' });
  await assert.rejects(salvarAnexo({ base64: Buffer.from('oi').toString('base64'), tipo: 'image/png' }), { status: 400, message: 'Isso não parece uma imagem.' });
});

test('acha os anexos usados em qualquer lugar da config', () => {
  const cfg = { painel: { imgs: { topo: 'anexo:0123456789abcdef', finais: ['banners/x.gif', 'anexo:fedcba9876543210'] } }, outra: { card: { bg: 'anexo:0123456789abcdef' } } };
  assert.deepEqual([...refsDeAnexo(cfg)].sort(), ['0123456789abcdef', 'fedcba9876543210']);
});

test('id que não existe devolve null', async () => {
  assert.equal(await lerAnexo('0000000000000000'), null);
});
