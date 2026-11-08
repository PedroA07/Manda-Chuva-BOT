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

const MEMBRO = '111111111111111111';

test('membro envia imagem do perfil, com corpo maior que 1 MB', async (t) => {
  const recebidos = [];
  const { servidor, base } = await subir({
    saude: () => ({}),
    papelDe: async () => 'membro',
    podeEnviarAnexo: () => {},
    anexoDoPerfil: async (quem, corpo) => (recebidos.push([quem.id, corpo.alvo, corpo.base64.length]), { ok: true }),
  }, { senha: 'senha-bem-grande-123' });
  t.after(() => servidor.close());
  const base64 = Buffer.alloc(3 * 1024 * 1024).toString('base64');
  const r = await fetch(`${base}/api/eu/anexo`, {
    method: 'POST',
    headers: { 'X-Painel': '1', 'Content-Type': 'application/json', Authorization: `Sessao ${criarSessao({ id: MEMBRO, nome: 'x', usuario: 'x' })}` },
    body: JSON.stringify({ base64, tipo: 'image/png', alvo: 'foto' }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(recebidos, [[MEMBRO, 'foto', base64.length]]);
});

test('passou do limite de envios: nem processa a imagem', async (t) => {
  let processou = false;
  const { servidor, base } = await subir({
    saude: () => ({}),
    papelDe: async () => 'membro',
    podeEnviarAnexo: () => {
      throw Object.assign(new Error('Calma, tenta daqui a pouco.'), { status: 429 });
    },
    anexoDoPerfil: async () => (processou = true),
  }, { senha: 'senha-bem-grande-123' });
  t.after(() => servidor.close());
  const r = await fetch(`${base}/api/eu/anexo`, {
    method: 'POST',
    headers: { 'X-Painel': '1', 'Content-Type': 'application/json', Authorization: `Sessao ${criarSessao({ id: MEMBRO, nome: 'x', usuario: 'x' })}` },
    body: JSON.stringify({ base64: 'AAAA', tipo: 'image/png' }),
  });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).erro, 'Calma, tenta daqui a pouco.');
  assert.equal(processou, false);
});

test('imagem do perfil por link passa pelo bot, sem precisar de login', async (t) => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const pedidos = [];
  const { servidor, base } = await subir({
    saude: () => ({}),
    imagemDoPerfil: async (id, tipo) => (pedidos.push([id, tipo]), id === MEMBRO && tipo === 'banner' ? { buffer: png, tipo: 'image/png', ext: 'png' } : null),
  });
  t.after(() => servidor.close());
  const r = await fetch(`${base}/perfis/${MEMBRO}/banner?v=abc`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
  assert.equal((await fetch(`${base}/perfis/${MEMBRO}/foto`)).status, 404);
  assert.deepEqual(pedidos, [[MEMBRO, 'banner'], [MEMBRO, 'foto']]);
  // O que não é id de membro ou tipo conhecido nem chega no bot
  assert.equal((await fetch(`${base}/perfis/abc/banner`)).status, 404);
  assert.equal((await fetch(`${base}/perfis/${MEMBRO}/outra`)).status, 404);
  assert.equal(pedidos.length, 2);
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

test('Steam: link só pra quem entrou com Discord e volta liberada; a volta liga a conta depois que a Steam confirma', async (t) => {
  const ligados = [];
  const api = { saude: () => ({}), papelDe: async () => 'membro', ligarSteam: async (id, steamid) => ligados.push([id, steamid]) };
  const { servidor, base } = await subir(api, { origens: ['https://site.exemplo'] });
  t.after(() => servidor.close());
  const sessao = criarSessao({ id: '123456789012345678', nome: 'Pedro', usuario: 'pedrinho' });
  const pedir = (corpo, cab = { Authorization: `Sessao ${sessao}` }) =>
    fetch(`${base}/api/eu/redes/steam`, { method: 'POST', headers: { 'X-Painel': '1', 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(corpo) });
  assert.equal((await pedir({ volta: 'https://golpe.com/' })).status, 400);
  assert.equal((await pedir({ volta: 'https://site.exemplo/painel.html' }, {})).status, 400); // senha do painel (sem conta do Discord)
  const { link } = await (await pedir({ volta: 'https://site.exemplo/painel.html' })).json();
  const steam = new URL(link);
  assert.equal(steam.host, 'steamcommunity.com');
  const voltaDaSteam = new URL(steam.searchParams.get('openid.return_to'));
  assert.equal(voltaDaSteam.pathname, '/auth/steam/volta');

  // A Steam devolve a pessoa (no endereço que o bot mandou); o bot confere com a Steam
  const fetchDeVerdade = globalThis.fetch;
  let perguntou = false;
  globalThis.fetch = async (url, o) => (String(url).startsWith('https://steamcommunity.com/openid/login') ? ((perguntou = true), new Response('is_valid:true\n')) : fetchDeVerdade(url, o));
  t.after(() => (globalThis.fetch = fetchDeVerdade));
  const volta = new URL(`${base}/auth/steam/volta`);
  volta.search = new URLSearchParams({ estado: voltaDaSteam.searchParams.get('estado'), 'openid.mode': 'id_res', 'openid.return_to': voltaDaSteam.href, 'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561197960287930', 'openid.sig': 'x' }).toString();
  const r = await fetchDeVerdade(volta, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://site.exemplo/painel.html#redes=steam-ok');
  assert.ok(perguntou);
  assert.deepEqual(ligados, [['123456789012345678', '76561197960287930']]);

  // Estado mexido ou vencido: página de volta, sem ligar nada
  const ruim = new URL(volta);
  ruim.searchParams.set('estado', 'lixo');
  const p = await fetchDeVerdade(ruim, { redirect: 'manual' });
  assert.equal(p.status, 400);
  assert.match(await p.text(), /Conectar com Steam/);
  assert.equal(ligados.length, 1);
});
