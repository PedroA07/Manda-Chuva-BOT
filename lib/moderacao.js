// Moderação (aba Cargos › Membros e Moderação): avisos que expiram em 30 dias, o que acontece ao chegar no
// limite (silenciar 1 h / expulsar) e o livro de ocorrências. Ficam em avisos.json e ocorrencias.json (Gist ou pasta).
import * as dados from '../dados.js';
import { porServidor } from './contexto.js';

export const TRINTA_DIAS = 30 * 864e5;
/** Durações do "Silenciar" no painel: [ms, texto] (28 dias é o máximo do Discord) */
export const SILENCIOS = {
  '10min': [600_000, '10 minutos'],
  '1h': [3_600_000, '1 hora'],
  '1d': [864e5, '1 dia'],
  '7d': [7 * 864e5, '7 dias'],
  '28d': [28 * 864e5, '28 dias'],
  // Sem prazo: o Discord só deixa 28 dias por vez; o bot renova sozinho (semPrazo) até alguém tirar
  sem: [28 * 864e5, 'sem prazo'],
};

/** Silêncio sem prazo: 'ok', 'renovar' (faltam menos de 3 dias) ou 'acabou' (alguém tirou, ou venceu com o bot desligado) */
export function semPrazo(ate, agora = Date.now()) {
  if (!ate || ate <= agora) return 'acabou';
  return ate - agora < 3 * 864e5 ? 'renovar' : 'ok';
}
export const TIPOS = { aviso: 'AVISO', silencio: 'SILÊNCIO', expulsao: 'EXPULSÃO', ban: 'BAN', automod: 'AUTO-MOD' };

/** Avisos da pessoa que ainda valem */
export const ativos = (avisos, userId, agora = Date.now()) => avisos.filter((a) => a.userId === userId && agora - a.quando < TRINTA_DIAS);

/** Depois de um aviso, com qtd avisos valendo: 'expulsar', 'silenciar' (1 h) ou null. Limite 0 = nunca. */
export function consequencia(qtd, { silenciar, expulsar }) {
  if (expulsar > 0 && qtd >= expulsar) return 'expulsar';
  if (silenciar > 0 && qtd >= silenciar) return 'silenciar';
  return null;
}

// ---------- Lista de membros do painel ----------
const simples = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Busca por nome ou @usuário (sem ligar pra acento) e filtro por cargo, em ordem alfabética */
export function filtrarMembros(lista, { q = '', cargo = '' } = {}) {
  const t = simples(q).trim().replace(/^@/, '');
  return lista
    .filter((m) => (!t || simples(m.nome).includes(t) || simples(m.usuario).includes(t)) && (!cargo || m.cargos.includes(cargo)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

export function pagina(lista, n, por = 6) {
  const paginas = Math.max(1, Math.ceil(lista.length / por));
  const p = Math.min(Math.max(1, Math.trunc(Number(n)) || 1), paginas);
  return { itens: lista.slice((p - 1) * por, p * por), pagina: p, paginas, total: lista.length };
}

/** Linha que vai pro canal de registros */
export function linhaDoRegistro(o) {
  const icone = { AVISO: '🟡', SILÊNCIO: '🔇', EXPULSÃO: '🚪', BAN: '🔨', 'AUTO-MOD': '🤖' }[o.tipo] ?? '📌';
  return `${icone} **${o.tipo}** · <@${o.userId}> ${o.oque}${o.por ? ` · ${o.por}` : ''}`;
}

// ---------- Guardados ----------
// Avisos e livro de ocorrências de cada servidor
const memoAvisos = porServidor();
const memoLivro = porServidor();
const ler = (arquivo) => {
  try {
    const v = JSON.parse(dados.lerExtra(arquivo) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const lerAvisos = () => memoAvisos.ler() ?? memoAvisos.guardar(ler('avisos.json'));

/** Guarda um aviso (e já joga fora os vencidos) */
export function darAviso({ userId, nome, motivo, por }, agora = Date.now()) {
  const a = { id: novoId(), userId, nome, motivo, por, quando: agora };
  const avisos = memoAvisos.guardar([...lerAvisos().filter((x) => agora - x.quando < TRINTA_DIAS), a]);
  dados.gravarExtras({ 'avisos.json': JSON.stringify(avisos) });
  return a;
}

export function tirarAviso(id) {
  const avisos = memoAvisos.guardar(lerAvisos().filter((x) => x.id !== id));
  return dados.gravarExtras({ 'avisos.json': JSON.stringify(avisos) });
}

export const lerOcorrencias = () => memoLivro.ler() ?? memoLivro.guardar(ler('ocorrencias.json'));

/**
 * Anota no livro de ocorrências (mais nova primeiro; guarda as 300 últimas).
 * desfazer: o que o "Desfazer" faz ('aviso:<id>', 'silencio', 'ban') ou null quando não tem volta.
 */
export function anotar({ tipo, userId, nome, oque, por, desfazer = null }, agora = Date.now()) {
  const o = { id: novoId(), tipo, userId, nome, oque, por, quando: agora, desfazer, desfeito: false };
  const livro = memoLivro.guardar([o, ...lerOcorrencias()].slice(0, 300));
  dados.gravarExtras({ 'ocorrencias.json': JSON.stringify(livro) });
  return o;
}

export function marcarDesfeita(id) {
  const livro = memoLivro.guardar(lerOcorrencias().map((o) => (o.id === id ? { ...o, desfeito: true } : o)));
  return dados.gravarExtras({ 'ocorrencias.json': JSON.stringify(livro) });
}
