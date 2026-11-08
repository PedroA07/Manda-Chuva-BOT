// Contadores das medalhas: mensagens (total e por mês), tempo em call, madrugada, trocas de cor e medalhas de evento.
// Ficam na memória e vão pro estatisticas.json (Gist ou pasta) a cada 10 minutos, se mudou algo.
import * as dados from '../dados.js';
import { noServidor, porServidor, servidorAtual } from './contexto.js';

const VAZIO = () => ({ pessoas: {}, reis: {} });
// Contadores de cada servidor; quais servidores mudaram desde a última gravação ('' = sem servidor)
const memo = porServidor();
const mudaram = new Set();
const marcar = () => mudaram.add(servidorAtual() ?? '');
/** Quem está em call agora no servidor da vez: userId → quando entrou (ms) */
const calls = porServidor();
const emCall = () => calls.ler() ?? calls.guardar(new Map());

export function lerEstatisticas() {
  let atual = memo.ler();
  if (!atual) {
    try {
      atual = { ...VAZIO(), ...JSON.parse(dados.lerExtra('estatisticas.json') ?? '{}') };
    } catch {
      atual = VAZIO();
    }
    memo.guardar(atual);
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
  marcar();
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
  marcar();
}

/** Entrou numa call / saiu de todas (trocar de canal não para o relógio) */
export function entrouNaCall(userId, agora = Date.now()) {
  if (!emCall().has(userId)) emCall().set(userId, agora);
}
export function saiuDaCall(userId, agora = Date.now()) {
  const desde = emCall().get(userId);
  if (desde === undefined) return;
  emCall().delete(userId);
  const seg = Math.round((agora - desde) / 1000);
  const s = de(userId);
  s.voz += seg;
  s.vozMax = Math.max(s.vozMax, seg);
  marcar();
}

/** Fecha todas as calls abertas, de todos os servidores (antes de desligar; ao ligar, o bot recomeça a contar de quem estiver em call) */
export function fecharCalls(agora = Date.now()) {
  for (const [id, mapa] of calls.todos()) noServidor(id || null, () => [...mapa.keys()].forEach((userId) => saiuDaCall(userId, agora)));
}

/** Tempo em call contando a sessão de agora (segundos) e a maior sessão até aqui */
export function tempoDeCall(userId, agora = Date.now()) {
  const s = lerEstatisticas().pessoas[userId];
  const desde = emCall().get(userId);
  const aoVivo = desde === undefined ? 0 : Math.round((agora - desde) / 1000);
  return { total: (s?.voz ?? 0) + aoVivo, maior: Math.max(s?.vozMax ?? 0, aoVivo) };
}

/** Trocou de cor pelo painel ou pelo /cor */
export function contarCor(userId) {
  de(userId).cores++;
  marcar();
}

/** Medalha de evento dada pela staff (quantidade pode ser negativa pra corrigir) */
export function somarEvento(userId, medalha, qtd) {
  const s = de(userId);
  s.ev[medalha] = Math.max(0, (s.ev[medalha] ?? 0) + qtd);
  marcar();
  return s.ev[medalha];
}

/** /privacidade apagar: esquece os contadores da pessoa (os reis dos meses passados viram "ninguém") */
export function apagarEstatisticas(userId) {
  const e = lerEstatisticas();
  delete e.pessoas[userId];
  emCall().delete(userId);
  for (const [mes, rei] of Object.entries(e.reis)) if (rei === userId) e.reis[mes] = null;
  marcar();
}

/** Grava os servidores em que mudou algo (chamado a cada 10 min). Devolve a mensagem de erro ou null */
export async function gravarEstatisticas() {
  let erro = null;
  for (const id of [...mudaram]) {
    mudaram.delete(id);
    erro = (await noServidor(id || null, () => dados.gravarExtras({ 'estatisticas.json': JSON.stringify(lerEstatisticas()) }))) ?? erro;
  }
  return erro;
}

/** Só pros testes: começa do zero */
export function zerarEstatisticas() {
  memo.limpar();
  calls.limpar();
  mudaram.clear();
}
