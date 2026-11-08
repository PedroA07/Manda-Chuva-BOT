// Tickets: o membro escolhe o motivo no painel e ganha um canal privado com a staff (ticket-0042-fulano).
// Ao fechar, o bot salva a transcrição (.html), manda pro canal de logs e pra DM, pede avaliação e apaga o canal.
// Os abertos, o contador e o histórico ficam em tickets.json (Gist ou pasta de dados).
import * as dados from '../dados.js';
import { porServidor, servidorAtual } from './contexto.js';
import { PADROES } from './imagens.js';
import { emojiDoBotao } from './painel.js';

/** Fechar se ficar parado: [ms, texto] (0 = nunca) */
export const PARADO = { '12h': [12 * 3_600_000, '12 horas'], '24h': [24 * 3_600_000, '24 horas'], '48h': [48 * 3_600_000, '2 dias'], nunca: [0, 'nunca'] };
/** Apagar o canal depois de fechar: [ms, texto] */
export const APAGAR = { agora: [0, 'agora'], '5s': [5000, '5 segundos'], '10s': [10_000, '10 segundos'], '1min': [60_000, '1 minuto'], '5min': [300_000, '5 minutos'] };
const MAX_HISTORICO = 200;

/** 42 → '0042' */
export const numero = (n) => String(n).padStart(4, '0');

/** Nome do canal: ticket-0042-pedrinho (sem acento, só letras, números e hífen) */
export function nomeDoCanal(n, nome) {
  const slug = String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/, '');
  return `ticket-${numero(n)}${slug ? `-${slug}` : ''}`;
}

// ---------- Onde fica guardado ----------
const VAZIO = () => ({ proximo: 1, abertos: [], fechados: [], apagar: [], painel: null });
const memo = porServidor();

export function lerTickets() {
  let atual = memo.ler();
  if (!atual) {
    try {
      atual = { ...VAZIO(), ...JSON.parse(dados.lerExtra('tickets.json') ?? '{}') };
    } catch {
      atual = VAZIO();
    }
    memo.guardar(atual);
  }
  return atual;
}

/** Junta o pedaço e grava. Devolve a mensagem de erro, ou null se deu certo. */
export function salvarTickets(pedaco) {
  const atual = memo.guardar({ ...lerTickets(), ...pedaco });
  return dados.gravarExtras({ 'tickets.json': JSON.stringify(atual) });
}

/** Pega o próximo número (e já guarda o contador) */
export function reservarNumero() {
  const n = lerTickets().proximo;
  salvarTickets({ proximo: n + 1 });
  return n;
}

export const abertosDe = (userId, t = lerTickets()) => t.abertos.filter((x) => x.userId === userId);
export const ticketDoCanal = (canalId, t = lerTickets()) => t.abertos.find((x) => x.canalId === canalId) ?? null;

/** Tira dos abertos e põe no histórico (os mais novos primeiro) */
export function arquivar(ticket, fechamento) {
  const t = lerTickets();
  return salvarTickets({
    abertos: t.abertos.filter((x) => x.num !== ticket.num),
    fechados: [{ ...ticket, ...fechamento }, ...t.fechados].slice(0, MAX_HISTORICO),
  });
}

/** Nota da avaliação (1 a 5) num ticket fechado. Devolve o ticket, ou null se não achou / já avaliado */
export function avaliar(num, nota) {
  const t = lerTickets();
  const f = t.fechados.find((x) => x.num === num);
  if (!f || f.nota) return null;
  f.nota = nota;
  salvarTickets({ fechados: [...t.fechados] });
  return f;
}

/** Tempo médio entre abrir e alguém da staff assumir (minutos), com pelo menos 3 exemplos. Ou null. */
export function mediaDeResposta(fechados) {
  const tempos = fechados.filter((f) => f.assumidoEm && typeof f.aberto === 'number').slice(0, 30).map((f) => f.assumidoEm - f.aberto);
  if (tempos.length < 3) return null;
  return Math.max(1, Math.round(tempos.reduce((s, x) => s + x, 0) / tempos.length / 60_000));
}

/** Ficou parado demais? ultima = hora da última mensagem do canal (ou da abertura) */
export function estaParado(ultima, parado, agora = Date.now()) {
  const ms = PARADO[parado]?.[0] ?? 0;
  return ms > 0 && agora - ultima >= ms;
}

/** "há 4 min", "há 2 h", "ontem", "há 3 dias" */
export function haQuanto(ts, agora = Date.now()) {
  const min = Math.floor((agora - ts) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

// ---------- Mensagens (entrada do montarV2) ----------
const BOTAO = { verde: 3, cinza: 2, vermelho: 4 };
const botao = (custom_id, style, label, emoji) => ({ type: 2, custom_id, style, label, emoji: { name: emoji } });

/** Painel com o menu de motivos. url(ref, padrao) resolve a imagem */
export function pedacoDoPainelTickets(t, url) {
  const opcoes = t.motivos
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.on)
    .map(({ m, i }) => ({ label: m.nome.slice(0, 100), value: String(i), ...(m.desc && { description: m.desc.slice(0, 100) }), emoji: emojiDoBotao(m.emoji) }));
  return {
    cor: 0xf2c14e,
    titulo: t.titulo,
    texto: t.desc,
    imagem: url(t.imagem, PADROES.tickets.imagem),
    linhas: opcoes.length ? [{ type: 1, components: [{ type: 3, custom_id: 'tk:abrir', placeholder: 'Escolha o motivo do ticket', options: opcoes }] }] : [],
  };
}

/** Primeira mensagem do canal do ticket */
export function pedacoDasBoasVindas(ticket, t, { staffId, media } = {}) {
  const mencoes = [`<@${ticket.userId}>`, t.mencionar && staffId && `<@&${staffId}>`].filter(Boolean).join(' ');
  const parado = PARADO[t.parado];
  return {
    acima: mencoes,
    cor: 0xc4363c,
    titulo: `${ticket.emoji} Ticket #${numero(ticket.num)} · ${ticket.motivo}`,
    texto: `Valeu por abrir, ${ticket.nome}! Conta o que rolou com print se tiver. A staff já foi chamada${media ? ` (média de resposta: ${media} min)` : ''}.`,
    rodape: parado[0] ? `Fecha sozinho depois de ${parado[1]} sem mensagem.` : undefined,
    linhas: [{ type: 1, components: [botao('tk:assumir', BOTAO.verde, 'Assumir', '🙋'), botao('tk:add', BOTAO.cinza, 'Adicionar membro', '➕'), botao('tk:fechar', BOTAO.vermelho, 'Fechar', '🔒')] }],
    mencoes: { users: [ticket.userId], roles: t.mencionar && staffId ? [staffId] : [] },
  };
}

/** Onde a transcrição foi parar, numa frase */
export function textoDaTranscricao(t, { logs, quem }) {
  const partes = [t.transLog && logs && `Transcrição salva em ${logs}`, t.transDm && `cópia enviada na DM de ${quem}`].filter(Boolean);
  return partes.length ? `${partes.join(' e ')}.` : 'Sem transcrição.';
}

/** Mensagem no canal quando o ticket fecha */
export function pedacoDoFechamento(t, { por, motivo, transcricao }) {
  return {
    cor: 0x4e5058,
    texto: [`**🔒 Ticket fechado por ${por}**${motivo ? ` · ${motivo}` : ''}`, transcricao, `\`Este canal some em ${APAGAR[t.apagar][1]}…\``].join('\n'),
  };
}

/** DM pedindo a nota (botões tkn:<num>:<nota>:<servidor>: a DM não diz de que servidor é o ticket) */
export function pedacoDaAvaliacao(ticket, servidor, nota = 0) {
  return {
    cor: 0xf2c14e,
    titulo: 'Como foi o atendimento?',
    texto: nota
      ? `Ticket #${numero(ticket.num)} · ${ticket.motivo} no **${servidor}**.\nNota ${nota}/5 enviada pra staff. Valeu!`
      : `Ticket #${numero(ticket.num)} · ${ticket.motivo} no **${servidor}**.\nDá uma nota pra staff. É anônimo (mais ou menos).`,
    linhas: [{ type: 1, components: [1, 2, 3, 4, 5].map((n) => ({ type: 2, custom_id: `tkn:${ticket.num}:${n}${servidorAtual() ? `:${servidorAtual()}` : ''}`, style: n <= nota ? BOTAO.verde : BOTAO.cinza, label: String(n), emoji: { name: '⭐' }, disabled: !!nota })) }],
  };
}

// ---------- Transcrição ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const quando = (ts) => new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/**
 * Página .html com a conversa inteira do ticket (abre em qualquer navegador).
 * @param {{ ticket: object, servidor: string, fechadoPor: string, motivo?: string, fechado: number,
 *   mensagens: { autor: string, avatar?: string, bot?: boolean, ts: number, texto: string, anexos?: { nome: string, url: string }[] }[] }} t
 */
export function transcricao({ ticket, servidor, fechadoPor, motivo, fechado, mensagens }) {
  const linhas = mensagens
    .map((m) => {
      const anexos = (m.anexos ?? []).map((a) => `<a href="${esc(a.url)}">📎 ${esc(a.nome)}</a>`).join(' ');
      const texto = m.texto ? esc(m.texto).replace(/\n/g, '<br>') : anexos ? '' : '<i>(mensagem sem texto)</i>';
      return `<div class="m"><img src="${esc(m.avatar ?? '')}" alt=""><div><b>${esc(m.autor)}</b>${m.bot ? ' <span class="app">APP</span>' : ''} <span class="h">${quando(m.ts)}</span><p>${texto}${anexos ? `<br>${anexos}` : ''}</p></div></div>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket #${numero(ticket.num)} · ${esc(ticket.motivo)}</title>
<style>
body{margin:0;background:#313338;color:#dbdee1;font:15px/1.45 system-ui,'Segoe UI',sans-serif}
header{padding:20px 24px;background:#1f2a5c;color:#fffcf4;border-bottom:3px solid #1b1f33}
header h1{margin:0 0 6px;font-size:22px;color:#f2c14e}header p{margin:2px 0;font-size:14px}
main{max-width:900px;margin:0 auto;padding:12px 16px 40px}
.m{display:flex;gap:12px;padding:8px 0}.m img{width:40px;height:40px;border-radius:50%;flex:none;background:#5865f2}
.m b{color:#f2f3f5}.h{font-size:12px;color:#949ba4}.m p{margin:2px 0 0;overflow-wrap:anywhere}
.app{padding:0 4px;font-size:10px;font-weight:700;color:#fff;background:#5865f2;border-radius:3px}a{color:#00a8fc}
</style></head><body>
<header><h1>🎫 Ticket #${numero(ticket.num)} · ${esc(ticket.emoji)} ${esc(ticket.motivo)}</h1>
<p>Servidor: <b>${esc(servidor)}</b> · aberto por <b>${esc(ticket.nome)}</b> em ${quando(ticket.aberto)}</p>
<p>Fechado por <b>${esc(fechadoPor)}</b> em ${quando(fechado)}${motivo ? ` · motivo: ${esc(motivo)}` : ''}${ticket.respNome ? ` · atendido por <b>${esc(ticket.respNome)}</b>` : ''}</p>
<p>${mensagens.length} mensagens</p></header>
<main>
${linhas || '<p>Ninguém escreveu nada.</p>'}
</main></body></html>`;
}
