import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GatewayIntentBits as I } from 'discord.js';
import { conectar } from '../lib/conexao.js';

/** Cliente falso: o "portal" só libera as intents da lista */
function fabrica(liberadas) {
  const criados = [];
  const criar = (intents) => {
    const c = {
      intents,
      destruido: false,
      async login() {
        if (intents.some((x) => !liberadas.includes(x))) throw new Error('Used disallowed intents');
        return 'ok';
      },
      destroy() {
        this.destruido = true;
      },
    };
    criados.push(c);
    return c;
  };
  return { criar, criados };
}

const PEDIDAS = [I.Guilds, I.GuildExpressions, I.GuildMembers];

test('com a intent liberada, conecta com tudo', async () => {
  const f = fabrica(PEDIDAS);
  const { client, recursos } = await conectar('t', f.criar, PEDIDAS, { silencioso: true });
  assert.equal(client, f.criados[0]);
  assert.deepEqual(recursos, { membros: true, conteudo: false, presenca: false });
});

test('sem a intent "Server Members" no portal, reconecta sem ela', async () => {
  const f = fabrica([I.Guilds, I.GuildExpressions]);
  const { client, recursos } = await conectar('t', f.criar, PEDIDAS, { silencioso: true });
  assert.equal(f.criados.length, 2);
  assert.equal(f.criados[0].destruido, true);
  assert.deepEqual(client.intents, [I.Guilds, I.GuildExpressions]);
  assert.deepEqual(recursos, { membros: false, conteudo: false, presenca: false });
});

test('outro erro (token errado) não é engolido', async () => {
  const criar = () => ({ login: async () => { throw new Error('An invalid token was provided.'); }, destroy() {} });
  await assert.rejects(conectar('t', criar, PEDIDAS, { silencioso: true }), /invalid token/);
});

test('sem "Message Content" no portal, fica com "Server Members"', async () => {
  const COM = [...PEDIDAS, I.MessageContent];
  const f = fabrica(PEDIDAS);
  const { client, recursos } = await conectar('t', f.criar, COM, { silencioso: true });
  assert.equal(f.criados.length, 2);
  assert.deepEqual(client.intents, PEDIDAS);
  assert.deepEqual(recursos, { membros: true, conteudo: false, presenca: false });
});

test('com as duas liberadas, conecta com a transcrição completa', async () => {
  const COM = [...PEDIDAS, I.MessageContent];
  const f = fabrica(COM);
  const { recursos } = await conectar('t', f.criar, COM, { silencioso: true });
  assert.equal(f.criados.length, 1);
  assert.deepEqual(recursos, { membros: true, conteudo: true, presenca: false });
});

test('sem "Presence" no portal, perde só ela (fica com Server Members e Message Content)', async () => {
  const COM = [...PEDIDAS, I.MessageContent, I.GuildPresences];
  const f = fabrica([...PEDIDAS, I.MessageContent]);
  const { client, recursos } = await conectar('t', f.criar, COM, { silencioso: true });
  assert.equal(f.criados.length, 2);
  assert.deepEqual(client.intents, [...PEDIDAS, I.MessageContent]);
  assert.deepEqual(recursos, { membros: true, conteudo: true, presenca: false });
});
