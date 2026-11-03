// Contadores das medalhas: mensagens (total e por mês), tempo em call, madrugada, trocas de cor e medalhas de evento.
// Ficam na memória e vão pro estatisticas.json (Gist ou pasta) a cada 10 minutos, se mudou algo.
import * as dados from '../dados.js';

const VAZIO = () => ({ pessoas: {}, reis: {} });
let atual = null;
let mudou = false;
/** Quem está em call agora: userId → quando entrou (ms) */
const emCall = new Map();

export function lerEstatisticas() {
  if (!atual) {
    try {
      atual = { ...VAZIO(), ...JSON.parse(dados.lerExtra('estatisticas.json') ?? '{}') };
    } catch {
      atual = VAZIO();
    }
  }
  return atual;
}

/** Contadores de uma pessoa (cria se não tiver) */
export function de(userId) {
  const p = lerEstatisticas().pessoas;
  p[userId] ??= { m: 0, mes: {}, voz: 0, vozMax: 0, coruja: 0, cores: 0, ev: {} };
  return p[userId];
}

/** 'AAAA-MM' no horário de Brasília */
export function mesDe(agora = Date.now()) {
  const d = new Date(agora - 3 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const horaNoBrasil = (agora) => new Date(agora - 3 * 3_600_000).getUTCHours();

/** Mensagem nova de alguém (não bot) */
export function contarMensagem(userId, agora = Date.now()) {
  fecharMes(agora);
  const s = de(userId);
  const mes = mesDe(agora);
  s.m++;
  s.mes[mes] = (s.mes[mes] ?? 0) + 1;
  // Só os dois últimos meses importam (o atual e o que acabou de fechar)
  for (const k of Object.keys(s.mes)) if (k < mesAnterior(mes)) delete s.mes[k];
  if (!s.coruja && horaNoBrasil(agora) >= 3 && horaNoBrasil(agora) < 5) s.coruja = 1;
  mudou = true;
}

function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** Virou o mês: quem mais falou no mês que acabou vira Rei da Resenha daquele mês */
export function fecharMes(agora = Date.now()) {
  const e = lerEstatisticas();
  const anterior = mesAnterior(mesDe(agora));
  if (e.reis[anterior] !== undefined) return;
  let rei = null, max = 0;
  for (const [id, s] of Object.entries(e.pessoas)) {
    const n = s.mes?.[anterior] ?? 0;
    if (n > max) [rei, max] = [id, n];
  }
  e.reis[anterior] = rei;
  mudou = true;
}

/** Entrou numa call / saiu de todas (trocar de canal não para o relógio) */
export function entrouNaCall(userId, agora = Date.now()) {
  if (!emCall.has(userId)) emCall.set(userId, agora);
}
export function saiuDaCall(userId, agora = Date.now()) {
  const desde = emCall.get(userId);
  if (desde === undefined) return;
  emCall.delete(userId);
  const seg = Math.round((agora - desde) / 1000);
  const s = de(userId);
  s.voz += seg;
  s.vozMax = Math.max(s.vozMax, seg);
  mudou = true;
}

/** Fecha todas as calls abertas (antes de desligar; ao ligar, o bot recomeça a contar de quem estiver em call) */
export function fecharCalls(agora = Date.now()) {
  for (const id of [...emCall.keys()]) saiuDaCall(id, agora);
}

/** Tempo em call contando a sessão de agora (segundos) e a maior sessão até aqui */
export function tempoDeCall(userId, agora = Date.now()) {
  const s = lerEstatisticas().pessoas[userId];
  const desde = emCall.get(userId);
  const aoVivo = desde === undefined ? 0 : Math.round((agora - desde) / 1000);
  return { total: (s?.voz ?? 0) + aoVivo, maior: Math.max(s?.vozMax ?? 0, aoVivo) };
}

/** Trocou de cor pelo painel ou pelo /cor */
export function contarCor(userId) {
  de(userId).cores++;
  mudou = true;
}

/** Medalha de evento dada pela staff (quantidade pode ser negativa pra corrigir) */
export function somarEvento(userId, medalha, qtd) {
  const s = de(userId);
  s.ev[medalha] = Math.max(0, (s.ev[medalha] ?? 0) + qtd);
  mudou = true;
  return s.ev[medalha];
}

/** /privacidade apagar: esquece os contadores da pessoa (os reis dos meses passados viram "ninguém") */
export function apagarEstatisticas(userId) {
  const e = lerEstatisticas();
  delete e.pessoas[userId];
  emCall.delete(userId);
  for (const [mes, rei] of Object.entries(e.reis)) if (rei === userId) e.reis[mes] = null;
  mudou = true;
}

/** Grava se mudou algo (chamado a cada 10 min). Devolve a mensagem de erro ou null */
export async function gravarEstatisticas() {
  if (!mudou) return null;
  mudou = false;
  return dados.gravarExtras({ 'estatisticas.json': JSON.stringify(lerEstatisticas()) });
}

/** Só pros testes: começa do zero */
export function zerarEstatisticas() {
  atual = VAZIO();
  emCall.clear();
  mudou = false;
}
