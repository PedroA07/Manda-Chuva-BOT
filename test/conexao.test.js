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
  assert.deepEqual(recursos, { membros: true });
});

test('sem a intent "Server Members" no portal, reconecta sem ela', async () => {
  const f = fabrica([I.Guilds, I.GuildExpressions]);
  const { client, recursos } = await conectar('t', f.criar, PEDIDAS, { silencioso: true });
  assert.equal(f.criados.length, 2);
  assert.equal(f.criados[0].destruido, true);
  assert.deepEqual(client.intents, [I.Guilds, I.GuildExpressions]);
  assert.deepEqual(recursos, { membros: false });
});

test('outro erro (token errado) não é engolido', async () => {
  const criar = () => ({ login: async () => { throw new Error('An invalid token was provided.'); }, destroy() {} });
  await assert.rejects(conectar('t', criar, PEDIDAS, { silencioso: true }), /invalid token/);
});
