// Vários servidores: cada um com a própria config e os próprios dados (lib/contexto.js + dados.js)
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Guild } from 'discord.js';
import { iniciarApi } from '../api.js';
import { definirPadrao, noServidor, porServidor, servidorAtual, servidorPadrao } from '../lib/contexto.js';
import { criarSessao } from '../lib/sessao.js';
import { dadosNovos } from './ajuda.js';

const A = '111111111111111111', B = '222222222222222222';

test('contexto: o servidor da vez vale depois de await e de setTimeout; sem nenhum, o padrão', async () => {
  definirPadrao(null);
  assert.equal(servidorAtual(), null);
  await noServidor(A, async () => {
    assert.equal(servidorAtual(), A);
    await new Promise((ok) => setTimeout(ok, 5));
    assert.equal(servidorAtual(), A);
    await noServidor(B, async () => assert.equal(servidorAtual(), B));
    assert.equal(servidorAtual(), A);
  });
  definirPadrao(A);
  assert.equal(servidorAtual(), A);
  assert.equal(servidorPadrao(), A);
  noServidor(B, () => assert.equal(servidorAtual(), B));
  definirPadrao(null);
});

test('porServidor: cada servidor com a sua memória', () => {
  const m = porServidor();
  noServidor(A, () => m.guardar('a'));
  noServidor(B, () => m.guardar('b'));
  assert.equal(noServidor(A, m.ler), 'a');
  assert.equal(noServidor(B, m.ler), 'b');
  assert.equal(m.ler(), undefined);
  assert.equal(m.todos().length, 2);
});

test('eventos do Discord rodam no servidor de onde vieram', async () => {
  const { eventosPorServidor, servidorDoEvento } = await import('../bot.js');
  const g = Object.create(Guild.prototype, { id: { value: B } });
  assert.equal(servidorDoEvento([{ guildId: A }]), A);
  assert.equal(servidorDoEvento([{ guild: { id: B } }]), B);
  assert.equal(servidorDoEvento([{ entrada: 1 }, g]), B);
  assert.equal(servidorDoEvento(['texto', null]), null);
  const c = eventosPorServidor(new EventEmitter());
  const vistos = [];
  c.on('x', () => vistos.push(servidorAtual()));
  c.emit('x', { guildId: A });
  c.emit('x', { member: 1 }, g);
  c.emit('x', 'sem servidor');
  assert.deepEqual(vistos, [A, B, null]);
});

test('dados: config e arquivos separados por servidor; imagens e painéis são de todos', async () => {
  definirPadrao(null);
  const { dados, pasta } = await dadosNovos();
  await dados.carregar();
  noServidor(A, () => dados.salvarConfig({ ...dados.config(), noticias: { ...dados.config().noticias, on: true } }));
  assert.equal(noServidor(A, () => dados.config().noticias.on), true);
  assert.equal(noServidor(A, () => dados.config().servidorId), A);
  // B começa com a padrão, sem nada de A
  assert.equal(noServidor(B, () => dados.config().noticias.on), false);
  assert.equal(noServidor(B, () => dados.config().servidorId), B);
  assert.ok(existsSync(join(pasta, `s-${A}-config.json`)));
  assert.ok(!existsSync(join(pasta, `s-${B}-config.json`)));
  await noServidor(B, () => dados.gravarExtras({ 'perfis.json': '{"1":{}}', 'anexos.json': '{}' }));
  assert.ok(existsSync(join(pasta, `s-${B}-perfis.json`)));
  assert.ok(existsSync(join(pasta, 'anexos.json')));
  assert.equal(noServidor(A, () => dados.lerExtra('perfis.json')), null);
  assert.equal(noServidor(B, () => dados.lerExtra('perfis.json')), '{"1":{}}');
  assert.equal(noServidor(A, () => dados.lerExtra('anexos.json')), '{}');
  assert.deepEqual(dados.servidoresGuardados().sort(), [A, B]);
  assert.deepEqual(dados.todasAsConfigs().map((c) => c.servidorId).sort(), [A, B]);
  assert.equal(dados.nomeNoServidor('tickets.json', A), `s-${A}-tickets.json`);
  assert.equal(dados.nomeNoServidor('paineis.json', A), 'paineis.json');
});

test('separação (1x): o que já existia vira do servidor que o bot cuidava; os arquivos antigos ficam de cópia', async () => {
  definirPadrao(null);
  const { dados, pasta } = await dadosNovos();
  writeFileSync(join(pasta, 'config.json'), JSON.stringify({ servidorId: A, noticias: { on: true } }));
  writeFileSync(join(pasta, 'perfis.json'), JSON.stringify({ 5: { bio: 'oi' } }));
  writeFileSync(join(pasta, 'tickets.json'), JSON.stringify({ proximo: 42 }));
  await dados.carregar();
  assert.equal(servidorPadrao(), A);
  assert.equal(JSON.parse(readFileSync(join(pasta, 'servidores.json'), 'utf8')).padrao, A);
  assert.deepEqual(JSON.parse(readFileSync(join(pasta, `s-${A}-perfis.json`), 'utf8')), { 5: { bio: 'oi' } });
  assert.equal(JSON.parse(readFileSync(join(pasta, `s-${A}-tickets.json`), 'utf8')).proximo, 42);
  assert.ok(existsSync(join(pasta, 'perfis.json'))); // cópia de segurança
  // Sem servidor na vez: o padrão, com a config de antes
  assert.equal(dados.config().noticias.on, true);
  assert.equal(dados.lerExtra('perfis.json'), JSON.stringify({ 5: { bio: 'oi' } }));
  // Outro servidor começa do zero
  assert.equal(noServidor(B, () => dados.lerExtra('perfis.json')), null);
  // Reiniciou: não copia de novo (o do servidor já mudou e o antigo não volta por cima)
  writeFileSync(join(pasta, `s-${A}-perfis.json`), JSON.stringify({ 5: { bio: 'mudou' } }));
  await dados.carregar();
  assert.deepEqual(JSON.parse(readFileSync(join(pasta, `s-${A}-perfis.json`), 'utf8')), { 5: { bio: 'mudou' } });
  assert.equal(servidorPadrao(), A);
  definirPadrao(null);
});

test('registro, tickets, aniversários, avisos e contadores: cada servidor com os seus', async () => {
  definirPadrao(null);
  const { lerRegistro, salvarRegistro } = await import('../lib/registro.js');
  const { lerAniversarios, salvarAniversario } = await import('../lib/aniversarios.js');
  const { darAviso, lerAvisos } = await import('../lib/moderacao.js');
  const { contarMensagem, gravarEstatisticas, lerEstatisticas, zerarEstatisticas } = await import('../lib/estatisticas.js');
  await noServidor(A, () => salvarRegistro({ teste: 'a' }));
  assert.equal(noServidor(B, () => lerRegistro().teste), undefined);
  assert.equal(noServidor(A, () => lerRegistro().teste), 'a');
  await noServidor(B, () => salvarAniversario({ userId: '9', nome: 'Bia', d: '01/02', ano: null }));
  assert.equal(noServidor(A, lerAniversarios).length, 0);
  assert.equal(noServidor(B, lerAniversarios).length, 1);
  noServidor(A, () => darAviso({ userId: '9', nome: 'Bia', motivo: 'spam', por: 'staff' }));
  assert.equal(noServidor(B, lerAvisos).length, 0);
  zerarEstatisticas();
  noServidor(A, () => contarMensagem('9'));
  noServidor(A, () => contarMensagem('9'));
  noServidor(B, () => contarMensagem('9'));
  assert.equal(noServidor(A, () => lerEstatisticas().pessoas['9'].m), 2);
  assert.equal(noServidor(B, () => lerEstatisticas().pessoas['9'].m), 1);
  assert.equal(await gravarEstatisticas(), null);
  zerarEstatisticas();
});

/** Sobe a API com uma api falsa */
async function subir(api) {
  const servidor = iniciarApi({ porta: 0, senha: '', origens: ['https://site.exemplo'], api, silencioso: true });
  await once(servidor, 'listening');
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

test('API: X-Servidor escolhe o servidor (papel conferido nele); servidor desconhecido dá 404; CORS deixa mandar', async (t) => {
  definirPadrao(A);
  t.after(() => definirPadrao(null));
  const PEDRO = '333333333333333333';
  // Pedro é staff em B e não está em A
  const papeis = { [B]: 'staff' };
  const api = {
    saude: () => ({}),
    temServidor: (id) => id === A || id === B,
    papelDe: async () => papeis[servidorAtual()] ?? null,
    servidoresDe: async (id) => (id === PEDRO ? [{ id: B, nome: 'Resenha', papel: 'staff' }] : []),
    eu: async () => ({ servidor: servidorAtual() }),
    estado: async () => ({ servidor: servidorAtual() }),
  };
  const { servidor, base } = await subir(api);
  t.after(() => servidor.close());
  const sessao = criarSessao({ id: PEDRO, nome: 'Pedro', usuario: 'pedrinho' });
  const pedir = (caminho, extra = {}) => fetch(`${base}${caminho}`, { headers: { 'X-Painel': '1', Authorization: `Sessao ${sessao}`, ...extra } });

  assert.deepEqual(await (await pedir('/api/eu', { 'X-Servidor': B })).json(), { servidor: B });
  assert.deepEqual(await (await pedir('/api/estado', { 'X-Servidor': B })).json(), { servidor: B });
  // Sem X-Servidor: o padrão (A), onde o Pedro não está
  assert.equal((await pedir('/api/eu')).status, 403);
  // A lista de servidores dele não depende de estar no padrão
  const lista = await pedir('/api/servidores');
  assert.equal(lista.status, 200);
  assert.deepEqual(await lista.json(), [{ id: B, nome: 'Resenha', papel: 'staff' }]);
  assert.equal((await pedir('/api/eu', { 'X-Servidor': '999999999999999999' })).status, 404);
  assert.equal((await pedir('/api/eu', { 'X-Servidor': 'lixo' })).status, 404);
  const pre = await fetch(`${base}/api/eu`, { method: 'OPTIONS', headers: { Origin: 'https://site.exemplo', 'Access-Control-Request-Headers': 'x-servidor' } });
  assert.match(pre.headers.get('access-control-allow-headers'), /X-Servidor/);
});

test('perfil vinculado: o mesmo em A e B, fixadas de cada servidor; desvincular deixa uma cópia; apagar leva o compartilhado', async () => {
  definirPadrao(null);
  const p = await import('../lib/perfil.js');
  p.zerarPerfis();
  const U = '444444444444444444';
  await noServidor(A, () => p.salvarPerfil(U, { bio: 'oi de A' }, []));
  await noServidor(B, () => p.salvarPerfil(U, { bio: 'oi de B' }, []));
  assert.equal(noServidor(B, () => p.perfilDe(U).bio), 'oi de B');
  // Vincular A: o de A vira o compartilhado. Vincular B: B passa a mostrar o compartilhado
  await noServidor(A, () => p.vincularPerfil(U, true));
  await noServidor(B, () => p.vincularPerfil(U, true));
  assert.equal(noServidor(B, () => p.perfilDe(U).bio), 'oi de A');
  assert.equal(noServidor(B, () => p.perfilDe(U).vinc), true);
  // Mexeu em B, muda em A também
  await noServidor(B, () => p.salvarPerfil(U, { bio: 'mudei em B' }, []));
  assert.equal(noServidor(A, () => p.perfilDe(U).bio), 'mudei em B');
  // Medalhas fixadas são de cada servidor
  await noServidor(A, () => p.salvarPerfil(U, { fixadas: ['calouro'] }, ['calouro']));
  assert.deepEqual(noServidor(A, () => p.perfilDe(U).fixadas), ['calouro']);
  assert.deepEqual(noServidor(B, () => p.perfilDe(U).fixadas), []);
  // Favoritos vão pro compartilhado
  await noServidor(A, () => p.mudarFavorito(U, { acao: 'add', tipo: 'jogos', t: 'Minecraft' }, async () => ''));
  assert.equal(noServidor(B, () => p.perfilDe(U).fav.jogos[0].t), 'Minecraft');
  // Desvincular B: fica uma cópia, e daí em diante é só de B
  await noServidor(B, () => p.vincularPerfil(U, false));
  assert.equal(noServidor(B, () => p.perfilDe(U).fav.jogos[0].t), 'Minecraft');
  await noServidor(B, () => p.salvarPerfil(U, { bio: 'só em B' }, []));
  assert.equal(noServidor(A, () => p.perfilDe(U).bio), 'mudei em B');
  assert.equal(noServidor(B, () => p.perfilDe(U).bio), 'só em B');
  assert.equal(noServidor(B, () => p.perfilDe(U).vinc), undefined);
  // Apagar os dados em A (vinculado) leva o compartilhado junto; o de B fica
  await noServidor(A, () => p.apagarPerfil(U));
  assert.equal(p.lerVinculados()[U], undefined);
  assert.equal(noServidor(B, () => p.perfilDe(U).bio), 'só em B');
  // A limpeza de imagens enxerga o compartilhado
  assert.ok(p.todosOsPerfis().includes(p.lerVinculados()));
});
