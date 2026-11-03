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
  // Tenta com tudo; se recusar, sem "Message Content" (só a transcrição dos tickets perde o texto); por último, sem nenhuma privilegiada
  const tentativas = [intents, intents.filter((x) => x !== I.MessageContent), intents.filter((x) => !PRIVILEGIADAS.includes(x))]
    .filter((lista, i, todas) => i === 0 || lista.length !== todas[i - 1].length);
  for (const [i, lista] of tentativas.entries()) {
    const client = criarCliente(lista);
    try {
      await entrar(client, token);
      if (i > 0 && !silencioso) {
        console.warn(`⚠️  O Discord recusou ${lista.includes(I.GuildMembers) ? 'a "Message Content Intent"' : 'as intents privilegiadas'}. Ligue "Server Members Intent" e "Message Content Intent" em`);
        console.warn('   https://discord.com/developers/applications → seu bot → Bot. Até lá o painel mostra o que ficou faltando.');
      }
      return { client, recursos: { membros: lista.includes(I.GuildMembers), conteudo: lista.includes(I.MessageContent) } };
    } catch (erro) {
      client.destroy();
      if (!naoLiberada(erro) || i === tentativas.length - 1) throw erro;
    }
  }
  throw new Error('Não consegui conectar.');
}
