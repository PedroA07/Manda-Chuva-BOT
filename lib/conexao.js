// Conecta no Discord pedindo as intents privilegiadas. Se o dono ainda não ligou elas no Developer Portal,
// o Discord recusa (código 4014): aí o bot reconecta sem elas e o painel avisa o que ficou faltando.
import { Events, GatewayIntentBits as I } from 'discord.js';

export const PRIVILEGIADAS = [I.GuildMembers, I.GuildPresences, I.MessageContent];

const naoLiberada = (erro) => erro?.code === 'DisallowedIntents' || /disallowed intents|privileged intent/i.test(erro?.message ?? '');

/** Login que também falha se o Discord derrubar a conexão por intent não liberada */
function entrar(client, token) {
  return new Promise((resolve, reject) => {
    client.once?.(Events.ShardDisconnect, (ev) => ev?.code === 4014 && reject(Object.assign(new Error('Used disallowed intents'), { code: 'DisallowedIntents' })));
    client.login(token).then(resolve, reject);
  });
}

/**
 * @param {string} token
 * @param {(intents: number[]) => import('discord.js').Client} criarCliente
 * @param {number[]} intents
 * @returns {Promise<{ client: import('discord.js').Client, recursos: { membros: boolean } }>}
 */
export async function conectar(token, criarCliente, intents, { silencioso = false } = {}) {
  const client = criarCliente(intents);
  try {
    await entrar(client, token);
    return { client, recursos: { membros: intents.includes(I.GuildMembers) } };
  } catch (erro) {
    if (!naoLiberada(erro)) throw erro;
    client.destroy();
    if (!silencioso) {
      console.warn('⚠️  O Discord recusou as intents privilegiadas. Ligue "Server Members Intent" e "Message Content Intent" em');
      console.warn('   https://discord.com/developers/applications → seu bot → Bot. Até lá: sem contagem de membros, portaria e auto-mod.');
    }
    const basicas = intents.filter((x) => !PRIVILEGIADAS.includes(x));
    const reserva = criarCliente(basicas);
    await entrar(reserva, token);
    return { client: reserva, recursos: { membros: false } };
  }
}
