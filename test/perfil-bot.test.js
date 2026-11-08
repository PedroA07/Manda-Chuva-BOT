// Liga as peças do perfil no bot de verdade, com as classes reais do discord.js e um Discord de mentira na memória:
// nada sai pra internet e nada encosta no servidor de produção.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { fazerGif, VERDE, VERMELHO } from './ajuda-gif.js';

process.env.DADOS_PASTA = mkdtempSync(join(tmpdir(), 'manda-chuva-perfil-'));
delete process.env.GIST_ID;
delete process.env.GIST_TOKEN;
const dados = await import('../dados.js');
const { lerAnexo } = await import('../lib/anexos.js');
const { perfilDe, zerarPerfis } = await import('../lib/perfil.js');
const { apagarMeusDados, api, client, responderPerfil } = await import('../bot.js');

const SERVIDOR = '100000000000000001', BOT = '100000000000000002', STAFF = '100000000000000003';
const PEDRO = '200000000000000001', BIA = '200000000000000002';
const GERENCIAR_CANAIS = 16n;
const quem = (id) => ({ tipo: 'discord', id, papel: 'membro' });

function png(cor) {
  const c = createCanvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, 64, 64);
  return c.toBuffer('image/png');
}
const gif = () => fazerGif(40, 20, [{ cor: VERMELHO, delay: 20 }, { cor: VERDE, delay: 20 }]);
const enviar = (b, tipo, alvo, nome = 'minha imagem.png') => ({ base64: b.toString('base64'), tipo, alvo, nome });

/** Usuários como o Discord devolve em GET /users/:id */
const USUARIOS = {
  [BOT]: { id: BOT, username: 'Manda Chuva', discriminator: '0', avatar: null, bot: true },
  [PEDRO]: { id: PEDRO, username: 'pedrinho', global_name: 'Pedro', discriminator: '0', avatar: 'abc', banner: null, accent_color: 0x112233 },
  [BIA]: { id: BIA, username: 'bia', discriminator: '0', avatar: 'a_animada', banner: 'a_bannerbia', accent_color: null },
};
const membroCru = (id) => ({ user: USUARIOS[id], roles: id === BOT ? ['100000000000000009'] : [], joined_at: '2026-01-10T12:00:00.000Z', deaf: false, mute: false, flags: 0 });

let discord;
function ligarDiscordFalso(permissoesDoBot = GERENCIAR_CANAIS | (1n << 10n) | (1n << 11n)) {
  discord = { canais: [], mensagens: new Map(), apagadas: [], proximo: 300000000000000000n };
  const novoId = () => String(++discord.proximo);
  const erro = (code) => Object.assign(new Error('Unknown'), { code });

  client.guilds.cache.clear();
  client.channels.cache.clear();
  client.isReady = () => true;
  client.user = { id: BOT };
  client.rest.get = async (rota) => {
    let m;
    if ((m = /^\/users\/(\d+)$/.exec(rota))) return USUARIOS[m[1]];
    if ((m = /^\/guilds\/\d+\/members\/(\d+)$/.exec(rota))) return membroCru(m[1]);
    if ((m = /^\/channels\/\d+\/messages\/(\d+)$/.exec(rota))) {
      const msg = discord.mensagens.get(m[1]);
      if (!msg) throw erro(10008);
      return msg;
    }
    if ((m = /^\/channels\/(\d+)$/.exec(rota))) {
      const canal = discord.canais.find((c) => c.id === m[1]);
      if (!canal) throw erro(10003);
      return canal;
    }
    throw new Error(`Discord falso não conhece GET ${rota}`);
  };
  client.rest.post = async (rota, { body, files } = {}) => {
    if (/^\/guilds\/\d+\/channels$/.test(rota)) {
      const canal = { id: novoId(), guild_id: SERVIDOR, type: body.type, name: body.name, topic: body.topic, permission_overwrites: body.permission_overwrites };
      discord.canais.push(canal);
      return canal;
    }
    const m = /^\/channels\/(\d+)\/messages$/.exec(rota);
    if (m) {
      const id = novoId();
      const url = `https://cdn.discordapp.com/attachments/${m[1]}/${id}/${files[0].name}`;
      const msg = {
        id, channel_id: m[1], author: USUARIOS[BOT], content: body.content, timestamp: '2026-11-07T12:00:00.000Z', edited_timestamp: null, tts: false,
        mention_everyone: false, mentions: [], mention_roles: [], embeds: [], type: 0, pinned: false, components: [],
        attachments: [{ id: novoId(), filename: files[0].name, size: files[0].data.length, url, proxy_url: url }],
      };
      discord.mensagens.set(id, msg);
      imagensNaInternet.set(url, Buffer.from(files[0].data));
      return msg;
    }
    throw new Error(`Discord falso não conhece POST ${rota}`);
  };
  client.rest.delete = async (rota) => {
    const m = /^\/channels\/\d+\/messages\/(\d+)$/.exec(rota);
    if (!m) throw new Error(`Discord falso não conhece DELETE ${rota}`);
    if (!discord.mensagens.delete(m[1])) throw erro(10008);
    discord.apagadas.push(m[1]);
  };

  const guild = client.guilds._add({
    id: SERVIDOR, name: 'Servidor dos Cria', owner_id: PEDRO, features: [], emojis: [], stickers: [], presences: [], voice_states: [], channels: [], member_count: 3,
    roles: [
      { id: SERVIDOR, name: '@everyone', permissions: '0', position: 0, color: 0, hoist: false, managed: false, mentionable: false, flags: 0 },
      { id: '100000000000000009', name: 'Manda Chuva', permissions: String(permissoesDoBot), position: 5, color: 0, hoist: false, managed: true, mentionable: false, flags: 0 },
      { id: STAFF, name: 'Staff', permissions: '0', position: 3, color: 0, hoist: false, managed: false, mentionable: false, flags: 0 },
    ],
    members: [membroCru(BOT), membroCru(PEDRO), membroCru(BIA)],
  });
  dados.salvarConfig({ ...dados.config(), servidorId: SERVIDOR, tickets: { ...dados.config().tickets, staffId: STAFF } });
  return guild;
}

// Imagens que o bot baixa: galeria, medalhas, Discord
const imagensNaInternet = new Map();
const fetchDeVerdade = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url) => {
    const b = imagensNaInternet.get(String(url).split('?')[0]) ?? (/\/banners\//.test(url) ? png('#336699') : null);
    return b ? new Response(b) : new Response('não achei', { status: 404 });
  };
});
after(async () => {
  globalThis.fetch = fetchDeVerdade;
  await client.destroy();
});
beforeEach(() => {
  zerarPerfis();
  imagensNaInternet.clear();
});

/** Roda o /perfil como o Discord faria e devolve o que o bot respondeu */
async function comandoPerfil(guild, id) {
  const passos = [];
  await responderPerfil({
    guild,
    user: client.users.cache.get(id),
    options: { getUser: () => null, getBoolean: () => null },
    deferReply: async () => passos.push('esperando'),
    reply: async (r) => passos.push(r),
    editReply: async (r) => passos.push(r),
  });
  return passos;
}

test('/perfil responde com a imagem anexada, sem embed, depois de avisar que vai demorar', async () => {
  const guild = ligarDiscordFalso();
  const passos = await comandoPerfil(guild, PEDRO);
  assert.equal(passos[0], 'esperando');
  const [arquivo] = passos[1].files;
  assert.equal(arquivo.name, 'perfil-pedro.png');
  assert.equal(arquivo.attachment.toString('ascii', 1, 4), 'PNG');
  assert.equal(passos[1].embeds, undefined);
  assert.equal(passos[1].components, undefined);
});

test('/perfil de quem tem foto animada no Discord sai em GIF', async () => {
  const guild = ligarDiscordFalso();
  imagensNaInternet.set(`https://cdn.discordapp.com/avatars/${BIA}/a_animada.gif`, gif());
  const passos = await comandoPerfil(guild, BIA);
  const [arquivo] = passos[1].files;
  assert.equal(arquivo.name, 'perfil-bia.gif');
  assert.equal(arquivo.attachment.toString('ascii', 0, 3), 'GIF');
});

test('/perfil: se o desenho falhar, a pessoa recebe os dados em texto', async () => {
  const guild = ligarDiscordFalso();
  const editou = [];
  await responderPerfil({
    guild,
    user: client.users.cache.get(PEDRO),
    options: { getUser: () => null, getBoolean: () => null },
    deferReply: async () => {},
    editReply: async (r) => {
      editou.push(r);
      if (r.files) throw new Error('arquivo grande demais');
    },
  });
  assert.equal(editou.length, 2);
  assert.match(editou[1].content, /\*\*Pedro\*\*/);
  assert.deepEqual(editou[1].allowedMentions, { parse: [] });
});

test('banner do Discord sem Nitro: o site recebe a cor de destaque', async () => {
  ligarDiscordFalso();
  const r = await api.salvarPerfil(quem(PEDRO), { bOrig: 'discord' });
  assert.equal(r.perfil.bOrig, 'discord');
  assert.equal(r.visual.banner, null);
  assert.equal(r.visual.cor, '#112233');
  assert.match(r.visual.avatar, new RegExp(`cdn\\.discordapp\\.com/avatars/${PEDRO}/abc\\.png`));
});

test('banner do Discord animado: o site recebe o GIF e o aviso de que sai animado', async () => {
  ligarDiscordFalso();
  const r = await api.salvarPerfil(quem(BIA), { bOrig: 'discord' });
  assert.match(r.visual.banner, new RegExp(`banners/${BIA}/a_bannerbia\\.gif`));
  assert.equal(r.visual.gif, true);
});

test('anexo: cria o canal escondido uma vez só e guarda quem mandou', async () => {
  ligarDiscordFalso();
  const a = await api.anexoDoPerfil(quem(PEDRO), enviar(png('#aa0000'), 'image/png', 'banner', 'meu banner.png'));
  const b = await api.anexoDoPerfil(quem(PEDRO), enviar(gif(), 'image/gif', 'foto', 'eu.gif'));
  assert.equal(discord.canais.length, 1);
  const [canal] = discord.canais;
  assert.equal(canal.name, 'deposito-do-bot');
  const regras = Object.fromEntries(canal.permission_overwrites.map((o) => [o.id, o]));
  assert.ok(BigInt(regras[SERVIDOR].deny) & (1n << 10n), 'membro comum não vê o canal');
  assert.ok(BigInt(regras[BOT].allow) & (1n << 15n), 'o bot pode anexar arquivo');
  assert.ok(BigInt(regras[STAFF].allow) & (1n << 10n), 'a staff vê o canal');
  const [primeira, segunda] = discord.mensagens.values();
  assert.equal(primeira.content, `Banner de <@${PEDRO}>`);
  assert.equal(segunda.content, `Foto de <@${PEDRO}>`);
  assert.equal(a.perfil.bOrig, 'anexo');
  assert.equal(a.perfil.bArqNome, 'meu banner.png');
  assert.match(a.visual.banner, /^anexo:[0-9a-f]{16}$/);
  assert.equal(a.visual.gif, false);
  assert.equal(b.perfil.aOrig, 'anexo');
  assert.match(b.visual.avatar, /^anexo:[0-9a-f]{16}$/);
  assert.equal(b.visual.gif, true);
});

test('anexo aparece no /perfil e na lista da turma', async () => {
  const guild = ligarDiscordFalso();
  const { visual } = await api.anexoDoPerfil(quem(PEDRO), enviar(gif(), 'image/gif', 'foto'));
  const passos = await comandoPerfil(guild, PEDRO);
  assert.equal(passos[1].files[0].name, 'perfil-pedro.gif');
  const turma = await api.turma(new URLSearchParams());
  const eu = turma.itens.find((x) => x.id === PEDRO);
  assert.equal(eu.avatar, visual.avatar);
  assert.ok(eu.banner.startsWith('banners/perfil/'));
  assert.equal(eu.cor, null);
  const bia = turma.itens.find((x) => x.id === BIA);
  assert.match(bia.avatar, /a_animada\.gif/);
});

test('/api/eu traz o visual pronto pro site', async () => {
  ligarDiscordFalso();
  await api.salvarPerfil(quem(PEDRO), { bOrig: 'discord' });
  const eu = await api.eu(quem(PEDRO));
  assert.equal(eu.perfil.bOrig, 'discord');
  assert.equal(eu.visual.cor, '#112233');
  assert.equal(eu.usuario.nome, 'Pedro');
});

test('sem a permissão Gerenciar canais: avisa com jeito e nada muda', async () => {
  ligarDiscordFalso(1n << 11n);
  await assert.rejects(api.anexoDoPerfil(quem(PEDRO), enviar(png('#00aa00'), 'image/png', 'banner')), { status: 503, message: /Gerenciar canais/ });
  assert.equal(discord.canais.length, 0);
  assert.equal(perfilDe(PEDRO).bOrig, 'galeria');
});

test('Discord recusou guardar a imagem: avisa sem mostrar erro técnico e nada muda', async () => {
  ligarDiscordFalso();
  await api.anexoDoPerfil(quem(PEDRO), enviar(png('#aa00aa'), 'image/png', 'banner'));
  const postDeVerdade = client.rest.post;
  client.rest.post = async () => {
    throw Object.assign(new Error('Missing Access'), { status: 403 });
  };
  await assert.rejects(api.anexoDoPerfil(quem(PEDRO), enviar(png('#aa00ab'), 'image/png', 'foto')), { status: 503, message: /Não consegui guardar/ });
  client.rest.post = postDeVerdade;
  assert.equal(perfilDe(PEDRO).aOrig, 'discord');
});

test('Discord recusou criar o canal: avisa sem mostrar erro técnico', async () => {
  ligarDiscordFalso();
  client.rest.post = async () => {
    throw Object.assign(new Error('Missing Permissions'), { status: 403 });
  };
  await assert.rejects(api.anexoDoPerfil(quem(PEDRO), enviar(png('#aa00ac'), 'image/png', 'banner')), { status: 503, message: /Não consegui guardar/ });
});

test('quem entrou com a senha do painel não tem perfil', async () => {
  ligarDiscordFalso();
  await assert.rejects(api.anexoDoPerfil({ tipo: 'senha', papel: 'admin' }, {}), { status: 400 });
  await assert.rejects(api.salvarPerfil({ tipo: 'senha', papel: 'admin' }, {}), { status: 400 });
  assert.equal(api.podeEnviarAnexo({ tipo: 'senha', papel: 'admin' }), false);
});

test('limite de envios: a sexta troca em 10 minutos é barrada', async () => {
  ligarDiscordFalso();
  const id = '200000000000000099';
  for (let i = 0; i < 5; i++) api.podeEnviarAnexo(quem(id));
  assert.throws(() => api.podeEnviarAnexo(quem(id)), { status: 429 });
});

test('link novo conta no mesmo limite, antes de baixar qualquer coisa', async () => {
  ligarDiscordFalso();
  for (let i = 0; i < 5; i++) api.podeEnviarAnexo(quem(BIA));
  await assert.rejects(api.salvarPerfil(quem(BIA), { bOrig: 'link', bLink: 'https://i.imgur.com/novo.png' }), { status: 429 });
  assert.equal(perfilDe(BIA).bOrig, 'galeria');
});

test('/privacidade apagar: some o perfil e a imagem, e a de outra pessoa fica', async () => {
  ligarDiscordFalso();
  const compartilhada = png('#123123'), so = png('#321321');
  await api.anexoDoPerfil(quem(BIA), enviar(compartilhada, 'image/png', 'banner'));
  await api.anexoDoPerfil(quem(PEDRO), enviar(compartilhada, 'image/png', 'banner'));
  const { perfil } = await api.anexoDoPerfil(quem(PEDRO), enviar(so, 'image/png', 'foto'));
  assert.equal(discord.mensagens.size, 2); // a imagem repetida não é guardada duas vezes
  const respostas = [];
  await apagarMeusDados({
    customId: `priv:apagar:${PEDRO}`,
    user: { id: PEDRO },
    deferUpdate: async () => {},
    reply: async (r) => respostas.push(r),
    editReply: async (r) => respostas.push(r),
  });
  assert.equal(respostas.length, 1);
  assert.equal(perfilDe(PEDRO).bAnexo, '');
  assert.equal(discord.apagadas.length, 1);
  assert.equal(discord.mensagens.size, 1);
  assert.equal(await lerAnexo(perfil.aAnexo.slice(6)), null);
  assert.ok(await lerAnexo(perfilDe(BIA).bAnexo.slice(6)));
});

test('botão de apagar dados de outra pessoa não faz nada', async () => {
  ligarDiscordFalso();
  await api.anexoDoPerfil(quem(BIA), enviar(png('#454545'), 'image/png', 'banner'));
  const respostas = [];
  await apagarMeusDados({ customId: `priv:apagar:${BIA}`, user: { id: PEDRO }, reply: async (r) => respostas.push(r) });
  assert.match(respostas[0].content, /não é seu/);
  assert.equal(perfilDe(BIA).bOrig, 'anexo');
});

test('imagem de link só sai do perfil salvo: sem link, nada', async () => {
  ligarDiscordFalso();
  assert.equal(await api.imagemDoPerfil(PEDRO, 'banner'), null);
  assert.equal(await api.imagemDoPerfil('999999999999999999', 'foto'), null);
});

test('/perfil completo responde com a ficha em PNG, mais comprida que a carteirinha', async () => {
  const guild = ligarDiscordFalso();
  const passos = [];
  await responderPerfil({
    guild,
    user: client.users.cache.get(PEDRO),
    options: { getUser: () => null, getBoolean: (k) => (k === 'completo' ? true : null) },
    deferReply: async () => passos.push('esperando'),
    reply: async (r) => passos.push(r),
    editReply: async (r) => passos.push(r),
  });
  assert.equal(passos[0], 'esperando');
  const [arquivo] = passos[1].files;
  assert.equal(arquivo.name, 'perfil-pedro.png');
  assert.equal(arquivo.attachment.readUInt32BE(16), 1000);
  assert.ok(arquivo.attachment.readUInt32BE(20) > 560);
});
