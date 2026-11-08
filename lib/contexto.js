// Em qual servidor o bot está trabalhando agora. Cada evento do Discord, cada pedido do painel e cada volta dos timers
// roda "dentro" de um servidor (AsyncLocalStorage: vale pra tudo que é chamado dali, até depois de await e setTimeout).
// Os dados (config, perfis, tickets...) de cada servidor ficam separados por isso.
// Sem servidor na vez: o "padrão", o servidor que o bot já cuidava antes de cuidar de vários (nada antigo quebra).
import { AsyncLocalStorage } from 'node:async_hooks';

const vez = new AsyncLocalStorage();
let padrao = null;

/** Servidor usado quando não tem nenhum na vez */
export const definirPadrao = (id) => {
  padrao = id ? String(id) : null;
};
export const servidorPadrao = () => padrao;

/** Id do servidor da vez (ou o padrão, ou null) */
export const servidorAtual = () => vez.getStore() ?? padrao;

/** Roda fn com o servidor id na vez (id vazio: o padrão) */
export const noServidor = (id, fn) => vez.run(id ? String(id) : padrao, fn);

/**
 * Memória separada por servidor (o cache de cada módulo): ler() devolve o do servidor da vez (undefined se não tem),
 * guardar(v) troca e devolve v, limpar() esquece todos (testes), todos() = [id, valor] de cada servidor.
 */
export function porServidor() {
  const m = new Map();
  const chave = () => servidorAtual() ?? '';
  return {
    ler: () => m.get(chave()),
    guardar: (v) => (m.set(chave(), v), v),
    limpar: () => m.clear(),
    todos: () => [...m.entries()],
  };
}
