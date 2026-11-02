// O que o bot precisa lembrar entre reinícios e que não é config (ex.: quais notícias já anunciou).
// Fica em registro.json, junto da config (Gist ou pasta de dados).
import * as dados from '../dados.js';

const PADRAO = { noticiasAnunciadas: [] };
let atual = null;

export function lerRegistro() {
  if (!atual) {
    try {
      atual = { ...PADRAO, ...JSON.parse(dados.lerExtra('registro.json') ?? '{}') };
    } catch {
      atual = { ...PADRAO };
    }
  }
  return atual;
}

/** Junta o pedaço no registro e grava. Devolve a mensagem de erro, ou null se deu certo. */
export function salvarRegistro(pedaco) {
  atual = { ...lerRegistro(), ...pedaco };
  return dados.gravarExtras({ 'registro.json': JSON.stringify(atual, null, 2) });
}
