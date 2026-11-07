import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DADOS_PASTA = mkdtempSync(join(tmpdir(), 'manda-chuva-anexos-'));
delete process.env.GIST_ID;
delete process.env.GIST_TOKEN;
const dados = await import('../dados.js');
const { extDoAnexo, juntar, lerAnexo, limparAnexos, partir, podeEnviar, refsDeAnexo, salvarAnexo, usarDeposito } = await import('../lib/anexos.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 7)]);
const DUAS_HORAS = 2 * 3_600_000;

/** PNG com cabeçalho de verdade: "marca" muda o conteúdo (e o id) */
function pngDeMembro(marca, l = 100, a = 50) {
  const b = Buffer.alloc(64, marca);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(l, 16);
  b.writeUInt32BE(a, 20);
  return b;
}
const enviavel = (b) => ({ base64: b.toString('base64'), tipo: 'image/png' });

/** Canal de mentira: guarda em memória e anota o que apagou. O índice dos anexos é um só, então as mensagens não repetem. */
let ultimaMensagem = 0;
function depositoFalso() {
  const canal = new Map();
  return {
    canal,
    apagados: [],
    async guardar(buffer, nome, legenda) {
      const msg = String(++ultimaMensagem);
      canal.set(msg, { buffer, nome, legenda });
      return { canal: 'c', msg };
    },
    async ler({ msg }) {
      return canal.get(msg)?.buffer ?? null;
    },
    async apagar({ msg }) {
      this.apagados.push(msg);
      canal.delete(msg);
    },
  };
}

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

test('anexo de membro vai pro depósito: nada de pedaço junto da config', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const b = pngDeMembro(1);
  const { id, ref } = await salvarAnexo(enviavel(b), { noDeposito: true, legenda: 'Banner de <@1>' });
  assert.equal(ref, `anexo:${id}`);
  const [guardado] = dep.canal.values();
  assert.deepEqual(guardado.buffer, b);
  assert.equal(guardado.nome, `${id}.png`);
  assert.equal(guardado.legenda, 'Banner de <@1>');
  assert.equal(await dados.lerExtraGrande(`anexo-${id}-0.b64`), null);
  assert.deepEqual((await lerAnexo(id)).buffer, b);
});

test('depois de reiniciar, o anexo de membro volta do depósito', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const b = pngDeMembro(2);
  const { id } = await salvarAnexo(enviavel(b), { noDeposito: true });
  // O import novo começa com a memória vazia, como um bot que acabou de ligar
  const outroBot = await import('../lib/anexos.js?reiniciou');
  outroBot.usarDeposito(dep);
  const lido = await outroBot.lerAnexo(id);
  assert.deepEqual(lido.buffer, b);
  assert.equal(lido.tipo, 'image/png');
  assert.equal(lido.ext, 'png');
});

test('anexo de staff continua junto da config', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const { id } = await salvarAnexo(enviavel(pngDeMembro(3)));
  assert.equal(dep.canal.size, 0);
  assert.ok(await dados.lerExtraGrande(`anexo-${id}-0.b64`));
});

test('imagem que seria uma bomba ao abrir não entra no depósito', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  await assert.rejects(salvarAnexo(enviavel(pngDeMembro(4, 30000, 30000)), { noDeposito: true }), { status: 400 });
  assert.equal(dep.canal.size, 0);
});

test('depósito fora do ar: o erro chega em quem enviou e nada fica pela metade', async () => {
  const dep = depositoFalso();
  dep.guardar = async () => {
    throw Object.assign(new Error('Sem permissão.'), { status: 503 });
  };
  usarDeposito(dep);
  const b = pngDeMembro(5);
  await assert.rejects(salvarAnexo(enviavel(b), { noDeposito: true }), { status: 503, message: 'Sem permissão.' });
  const id = createHash('sha256').update(b).digest('hex').slice(0, 16);
  assert.equal(await lerAnexo(id), null);
});

test('imagem que sumiu do depósito pode ser enviada de novo', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const b = pngDeMembro(6);
  const { id } = await salvarAnexo(enviavel(b), { noDeposito: true });
  dep.canal.clear(); // alguém apagou o canal
  await salvarAnexo(enviavel(b), { noDeposito: true });
  assert.equal(dep.canal.size, 1);
  assert.deepEqual((await lerAnexo(id)).buffer, b);
});

test('imagem que a staff apagou do depósito some em até 10 minutos, mesmo na memória', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const { id } = await salvarAnexo(enviavel(pngDeMembro(14)), { noDeposito: true });
  dep.canal.clear();
  const agora = Date.now();
  assert.ok(await lerAnexo(id, agora + 60_000));
  assert.equal(await lerAnexo(id, agora + 11 * 60_000), null);
});

test('limpeza: imagem usada num perfil fica, sem uso e velha sai do depósito', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const { id, ref } = await salvarAnexo(enviavel(pngDeMembro(7)), { noDeposito: true });
  const [msg] = dep.canal.keys();
  const depois = Date.now() + DUAS_HORAS;
  await limparAnexos({ config: {}, perfis: { 1: { bAnexo: ref } } }, { agora: depois });
  assert.ok(await lerAnexo(id));
  assert.ok(dep.canal.has(msg));
  await limparAnexos({ config: {}, perfis: {} }, { agora: depois });
  assert.equal(await lerAnexo(id), null);
  assert.ok(dep.apagados.includes(msg));
});

test('limpeza: imagem recém-enviada espera (pode ter alguém editando)', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const { id } = await salvarAnexo(enviavel(pngDeMembro(8)), { noDeposito: true });
  await limparAnexos({ config: {} });
  assert.ok(await lerAnexo(id));
});

test('limpeza imediata: quem pediu pra apagar os dados não espera 1 hora', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const { id } = await salvarAnexo(enviavel(pngDeMembro(9)), { noDeposito: true });
  await limparAnexos({ config: {}, perfis: {} }, { imediatos: new Set([id]) });
  assert.equal(await lerAnexo(id), null);
  assert.equal(dep.canal.size, 0);
});

test('limpeza imediata não apaga imagem que outra pessoa também usa', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const { id, ref } = await salvarAnexo(enviavel(pngDeMembro(10)), { noDeposito: true });
  await limparAnexos({ perfis: { 2: { aAnexo: ref } } }, { imediatos: new Set([id]) });
  assert.ok(await lerAnexo(id));
});

test('limpeza: falhou ao apagar do depósito, tenta de novo na próxima', async () => {
  const dep = depositoFalso();
  usarDeposito(dep);
  const { id } = await salvarAnexo(enviavel(pngDeMembro(11)), { noDeposito: true });
  const apagarDeVerdade = dep.apagar;
  dep.apagar = async () => {
    throw new Error('Discord fora do ar');
  };
  const depois = Date.now() + DUAS_HORAS;
  await limparAnexos({}, { agora: depois });
  assert.ok(await lerAnexo(id));
  dep.apagar = apagarDeVerdade;
  await limparAnexos({}, { agora: depois });
  assert.equal(await lerAnexo(id), null);
});

test('limpeza também tira os pedaços do que era da config', async () => {
  usarDeposito(depositoFalso());
  const { id } = await salvarAnexo(enviavel(pngDeMembro(12)));
  await limparAnexos({}, { agora: Date.now() + DUAS_HORAS });
  assert.equal(await lerAnexo(id), null);
  assert.equal(await dados.lerExtraGrande(`anexo-${id}-0.b64`), null);
});

test('extensão do anexo diz se a imagem é GIF', async () => {
  usarDeposito(depositoFalso());
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([10, 0, 10, 0]), Buffer.alloc(40, 13)]);
  const { ref } = await salvarAnexo({ base64: gif.toString('base64'), tipo: 'image/gif' }, { noDeposito: true });
  assert.equal(extDoAnexo(ref), 'gif');
  assert.equal(extDoAnexo('anexo:0000000000000000'), null);
  assert.equal(extDoAnexo(''), null);
});

test('membro manda até 5 imagens a cada 10 minutos', () => {
  for (let i = 0; i < 5; i++) assert.equal(podeEnviar('m1', 1000 + i), true);
  assert.equal(podeEnviar('m1', 2000), false);
  assert.equal(podeEnviar('m2', 2000), true); // cada um com a sua conta
  assert.equal(podeEnviar('m1', 1000 + 10 * 60_000), true); // a janela andou
});
