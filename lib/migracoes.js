// Ajustes que rodam uma vez só na config de quem já usava o bot (ficam anotados no registro.json)
import * as dados from '../dados.js';
import { lerRegistro, salvarRegistro } from './registro.js';

/**
 * Roda as migrações que ainda não rodaram.
 * cores-redesign: o redesign tem 11 cores (Preto, Cinza e Marrom chegaram); acrescenta as que faltam no fim da lista.
 * @returns {Promise<string[]>} nomes das cores acrescentadas
 */
export async function migrar() {
  const feitas = lerRegistro().migracoes ?? [];
  if (feitas.includes('cores-redesign')) return [];
  const cfg = structuredClone(dados.config());
  const tem = new Set(cfg.cores.map((c) => c.nome.toLowerCase()));
  const padrao = dados.normalizar(dados.PADRAO, {}).cfg.cores;
  const novas = padrao.filter((c) => !tem.has(c.nome.toLowerCase())).slice(0, Math.max(0, dados.MAX_CORES - cfg.cores.length));
  if (novas.length) dados.salvarConfig({ ...cfg, cores: [...cfg.cores, ...novas] });
  await salvarRegistro({ migracoes: [...feitas, 'cores-redesign'] });
  return novas.map((c) => c.nome);
}
