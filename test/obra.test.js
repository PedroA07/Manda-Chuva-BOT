// Aba Servidor de ponta a ponta: o bot de verdade (discord.js real) contra um Discord de mentira na memória.
// Nada sai pra internet e nada encosta no servidor de produção.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { definirPadrao } from '../lib/contexto.js';

process.env.DADOS_PASTA = mkdtempSync(join(tmpdir(), 'manda-chuva-obra-'));
delete process.env.GIST_ID;
delete process.env.GIST_TOKEN;
const dados = await import('../dados.js');
const { api, client } = await import('../bot.js');
const { chave } = await import('../lib/servidor.js');

const G = '100000000000000001', BOT = '100000000000000002', DONO = '200000000000000001';
const CARGO_BOT = '100000000000000009', COR = '100000000000000010', SEP = '100000000000000011', VIP = '100000000000000012', MINE = '100000000000000013', STAFF = '100000000000000014';
const VER = 1n << 10n, ENVIAR = 1n << 11n;
const ADMIN = 8n;

let d; // o "Discord": cargos, canais, mensagens
// Permissão como o Discord guarda (texto com o número), venha ela como BitField, número ou texto
const emTexto = (x) => String(typeof x === 'object' && x !== null ? x.bitfield : (x ?? 0));
const sobrescritas = (lista) => (lista ?? []).map((o) => ({ id: o.id, type: o.type, allow: emTexto(o.allow), deny: emTexto(o.deny) }));
function ligar() {
  d = {
    proximo: 500000000000000000n,
    cargos: [
      { id: G, name: '@everyone', permissions: '0', position: 0, color: 0, colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, hoist: false, managed: false, mentionable: false, flags: 0 },
      { id: CARGO_BOT, name: 'Manda Chuva', permissions: String(ADMIN), position: 50, color: 0, colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, hoist: false, managed: true, mentionable: false, flags: 0 },
      { id: COR, name: 'Azul', permissions: '0', position: 10, color: 0x3498db, colors: { primary_color: 0x3498db, secondary_color: null, tertiary_color: null }, hoist: false, managed: false, mentionable: false, flags: 0 },
      { id: SEP, name: '━━ STAFF ━━', permissions: '0', position: 9, color: 0, colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, hoist: false, managed: false, mentionable: false, flags: 0 },
      { id: VIP, name: 'VIP', permissions: '0', position: 8, color: 0, colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, hoist: false, managed: false, mentionable: false, flags: 0 },
      { id: MINE, name: 'Minecraft', permissions: '0', position: 7, color: 0, colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, hoist: false, managed: false, mentionable: false, flags: 0 },
      { id: STAFF, name: 'Staff dos tickets', permissions: '0', position: 6, color: 0, colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, hoist: false, managed: false, mentionable: false, flags: 0 },
    ],
    canais: [
      { id: '300000000000000001', guild_id: G, type: 0, name: 'geral', position: 0, permission_overwrites: [] },
      { id: '300000000000000002', guild_id: G, type: 4, name: 'Coisas velhas', position: 1, permission_overwrites: [] },
      { id: '300000000000000003', guild_id: G, type: 0, name: 'lixo', parent_id: '300000000000000002', position: 2, permission_overwrites: [] },
      { id: '300000000000000004', guild_id: G, type: 0, name: 'cores', position: 3, permission_overwrites: [] },
    ],
    mensagens: new Map(),
  };
  const novoId = () => String(++d.proximo);
  const canal = (id) => d.canais.find((c) => c.id === id);
  const erro = (code) => Object.assign(new Error('Unknown'), { code, status: 404 });
  client.guilds.cache.clear();
  client.channels.cache.clear();
  client.isReady = () => true;
  // Usuário de verdade do discord.js (o editable dos cargos procura o membro do bot por ele)
  client.user = client.users._add({ id: BOT, username: 'Manda Chuva', discriminator: '0', bot: true });
  client.rest.get = async (rota) => {
    let m;
    if (rota === `/guilds/${G}/roles`) return d.cargos;
    if (rota === `/guilds/${G}/channels`) return d.canais;
    if ((m = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(rota))) return d.mensagens.get(m[2]) ?? Promise.reject(erro(10008));
    if ((m = /^\/channels\/(\d+)$/.exec(rota))) return canal(m[1]) ?? Promise.reject(erro(10003));
    throw new Error(`GET ${rota}`);
  };
  client.rest.post = async (rota, { body } = {}) => {
    let m;
    if (rota === `/guilds/${G}/roles`) {
      const r = { colors: { primary_color: 0, secondary_color: null, tertiary_color: null }, ...body, id: novoId(), position: 1, managed: false, flags: 0, color: body.colors?.primary_color ?? 0 };
      d.cargos.push(r);
      return r;
    }
    if (rota === `/guilds/${G}/channels`) {
      const c = { id: novoId(), guild_id: G, type: body.type, name: body.name, parent_id: body.parent_id ?? null, position: d.canais.length, permission_overwrites: sobrescritas(body.permission_overwrites) };
      d.canais.push(c);
      return c;
    }
    if ((m = /^\/channels\/(\d+)\/messages$/.exec(rota))) {
      const msg = { id: novoId(), channel_id: m[1], author: { id: BOT, username: 'Manda Chuva', discriminator: '0', bot: true }, content: '', timestamp: '2026-11-08T12:00:00.000Z', edited_timestamp: null, tts: false, mention_everyone: false, mentions: [], mention_roles: [], attachments: [], embeds: [], type: 0, pinned: false, components: body.components, flags: body.flags };
      d.mensagens.set(msg.id, msg);
      return msg;
    }
    throw new Error(`POST ${rota}`);
  };
  client.rest.patch = async (rota, { body: corpo } = {}) => {
    let m;
    const body = Object.fromEntries(Object.entries(corpo ?? {}).filter(([, v]) => v !== undefined)); // o discord.js manda chaves vazias
    if ((m = /^\/guilds\/\d+\/roles\/(\d+)$/.exec(rota))) return Object.assign(d.cargos.find((r) => r.id === m[1]), body);
    if ((m = /^\/channels\/(\d+)\/messages\/(\d+)$/.exec(rota))) return Object.assign(d.mensagens.get(m[2]) ?? Promise.reject(erro(10008)), body);
    if ((m = /^\/channels\/(\d+)$/.exec(rota))) return Object.assign(canal(m[1]), body);
    throw new Error(`PATCH ${rota}`);
  };
  client.rest.put = async (rota, { body } = {}) => {
    const m = /^\/channels\/(\d+)\/permissions\/(\d+)$/.exec(rota);
    if (!m) throw new Error(`PUT ${rota}`);
    const c = canal(m[1]);
    c.permission_overwrites = [...c.permission_overwrites.filter((o) => o.id !== m[2]), ...sobrescritas([{ id: m[2], type: body.type, allow: body.allow, deny: body.deny }])];
  };
  client.rest.delete = async (rota) => {
    let m;
    if ((m = /^\/channels\/(\d+)$/.exec(rota))) d.canais = d.canais.filter((c) => c.id !== m[1]);
    else if ((m = /^\/guilds\/\d+\/roles\/(\d+)$/.exec(rota))) d.cargos = d.cargos.filter((r) => r.id !== m[1]);
    else throw new Error(`DELETE ${rota}`);
  };
  client.guilds._add({
    id: G, name: 'Servidor dos Cria', owner_id: DONO, features: [], emojis: [], stickers: [], presences: [], voice_states: [], member_count: 2,
    roles: d.cargos, channels: d.canais,
    members: [{ user: { id: BOT, username: 'Manda Chuva', discriminator: '0', bot: true }, roles: [CARGO_BOT], joined_at: '2026-01-01T00:00:00.000Z', deaf: false, mute: false, flags: 0 }],
  });
}

async function esperarObra() {
  for (let i = 0; i < 400; i++) {
    const { obra } = api.andamentoServidor();
    if (obra && obra.status !== 'andando') return obra;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('a obra não terminou');
}
const bits = (o, campo) => BigInt(o?.[campo] ?? 0);
const sobre = (c, id) => c.permission_overwrites.find((o) => o.id === id);
after(() => client.destroy());

test('montar: cria o modelo, reaproveita pelo nome, fecha as categorias, botões de jogo e apaga só o que pode', async () => {
  ligar();
  definirPadrao(G);
  const cfg = structuredClone(dados.config());
  cfg.servidorId = G;
  cfg.cores = [{ ...cfg.cores[4], cargoId: COR }];
  cfg.tickets = { ...cfg.tickets, staffId: STAFF };
  cfg.srv = { ...cfg.srv, opt: { fontes: true, perms: true, autoJogos: true, apagar: true } };
  dados.salvarConfig(cfg);
  dados.salvarPaineis([{ servidorId: G, canalId: '300000000000000004', mensagemId: '1', v2: true }]);

  api.montarServidor();
  const obra = await esperarObra();
  assert.equal(obra.status, 'pronto', obra.rel.join('\n'));

  // Cargos: o Minecraft que já existia é o mesmo (renomeado com o enfeite), sem duplicar
  assert.equal(d.cargos.filter((r) => chave(r.name) === 'minecraft').length, 1);
  assert.equal(d.cargos.find((r) => r.id === MINE).name, '⛏️ Minecraft');
  const verificado = d.cargos.find((r) => chave(r.name) === 'verificado');
  assert.ok(verificado && d.cargos.some((r) => chave(r.name) === 'reitor'));

  // Categorias com fonte; o #geral que existia entrou na Resenha
  const resenha = d.canais.find((c) => c.type === 4 && chave(c.name) === 'resenha');
  assert.equal(resenha.name, '┏━ 𝗥𝗘𝗦𝗘𝗡𝗛𝗔');
  const geral = d.canais.find((c) => c.id === '300000000000000001');
  assert.equal(geral.parent_id, resenha.id);
  assert.equal(geral.name, '💬・geral');

  // Resenha fechada pra quem não é Verificado; canal novo já nasce fechado (sem esperar o cache)
  assert.ok(bits(sobre(resenha, G), 'deny') & VER);
  assert.ok(bits(sobre(resenha, verificado.id), 'allow') & VER);
  const memes = d.canais.find((c) => chave(c.name) === 'memes');
  assert.ok(bits(sobre(memes, G), 'deny') & VER, 'memes nasceu aberto');
  assert.ok(bits(sobre(memes, BOT), 'allow') & VER, 'o bot não vê memes');
  assert.ok(bits(sobre(geral, G), 'deny') & VER, 'o #geral antigo ficou aberto');
  // Portaria aberta, mas o #regras é só leitura
  const regras = d.canais.find((c) => chave(c.name) === 'regras');
  assert.ok(!(bits(sobre(regras, G), 'deny') & VER));
  assert.ok(bits(sobre(regras, G), 'deny') & ENVIAR);

  // Botões dos cargos de jogo no #escolha-sua-cor
  const cor = d.canais.find((c) => chave(c.name) === 'escolhasuacor');
  const msg = [...d.mensagens.values()].find((x) => x.channel_id === cor.id);
  assert.ok(JSON.stringify(msg.components).includes(`jogo:${MINE}`));

  // Apagou o que estava fora (#lixo, a categoria dele e o VIP); ficaram cor, separador, staff dos tickets e o canal do painel
  assert.ok(!d.canais.some((c) => c.name === 'lixo' || c.name === 'Coisas velhas'));
  assert.ok(!d.cargos.some((r) => r.id === VIP));
  for (const id of [COR, SEP, STAFF, CARGO_BOT]) assert.ok(d.cargos.some((r) => r.id === id), id);
  assert.ok(d.canais.some((c) => c.id === '300000000000000004'));

  // A aba Regras passa a usar o #regras e o Verificado
  assert.equal(dados.config().regras.canalId, regras.id);
  assert.equal(dados.config().regras.cargoId, verificado.id);
  assert.ok(api.andamentoServidor().montado);
});

test('renomear: aplica a fonte nova no que tem nome do modelo; não roda duas obras juntas', async () => {
  const cfg = structuredClone(dados.config());
  cfg.srv.f.canais = { fonte: 'mono', deco: 0, caixa: 'manter' };
  dados.salvarConfig(cfg);
  api.renomearServidor();
  assert.throws(() => api.renomearServidor(), /em andamento/);
  const obra = await esperarObra();
  assert.equal(obra.status, 'pronto', obra.rel.join('\n'));
  assert.equal(d.canais.find((c) => c.id === '300000000000000001').name, '𝚐𝚎𝚛𝚊𝚕');
  assert.equal(d.canais.find((c) => chave(c.name) === 'resenha1').name, '𝚁𝚎𝚜𝚎𝚗𝚑𝚊 𝟷');
});
