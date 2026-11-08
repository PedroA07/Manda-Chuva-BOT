// O que o bot precisa lembrar entre reinícios e que não é config (ex.: quais notícias já anunciou).
// Fica em registro.json, junto da config (Gist ou pasta de dados).
import * as dados from '../dados.js';
import { porServidor } from './contexto.js';

const PADRAO = { noticiasAnunciadas: [] };
// Um registro por servidor
const memo = porServidor();

export function lerRegistro() {
  let atual = memo.ler();
  if (!atual) {
    try {
      atual = { ...PADRAO, ...JSON.parse(dados.lerExtra('registro.json') ?? '{}') };
    } catch {
      atual = { ...PADRAO };
    }
    memo.guardar(atual);
  }
  return atual;
}

/** Junta o pedaço no registro e grava. Devolve a mensagem de erro, ou null se deu certo. */
export function salvarRegistro(pedaco) {
  const atual = memo.guardar({ ...lerRegistro(), ...pedaco });
  return dados.gravarExtras({ 'registro.json': JSON.stringify(atual, null, 2) });
}
