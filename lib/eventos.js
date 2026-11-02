// Liga a portaria nos eventos do Discord.
// Entrou/saiu: GuildMemberAdd/Remove (precisam da intent "Server Members").
// Expulso/banido/silenciado: registro de auditoria (intent GuildModeration + permissão "Ver o registro de auditoria"),
// com plano B pro ban pelo GuildBanAdd (sem moderador nem motivo).
import { AuditLogEvent, Events } from 'discord.js';

const JANELA_SAIDA = 10_000;
const punidos = new Map();
const postados = new Map();

/** Anota que a pessoa foi expulsa/banida agora (o Discord também manda "saiu" pra ela) */
export function marcarPunicao(userId, tipo, agora = Date.now()) {
  punidos.set(userId, { tipo, quando: agora });
}

/** "Saiu" só vale se não teve expulsão/ban da mesma pessoa nos últimos 10 s */
export function deveAnunciarSaida(userId, agora = Date.now()) {
  const p = punidos.get(userId);
  return !(p && agora - p.quando < JANELA_SAIDA);
}

/** true na primeira vez que a chave aparece em 30 s (o ban chega pela auditoria e pelo GuildBanAdd) */
export function primeiraVez(chave, agora = Date.now(), janela = 30_000) {
  const antes = postados.get(chave);
  if (antes !== undefined && agora - antes < janela) return false;
  postados.set(chave, agora);
  return true;
}

/** Transforma uma entrada do registro de auditoria num evento da portaria (ou null) */
export function lerAuditoria(e) {
  const base = { alvoId: e.targetId, executorId: e.executorId, motivo: e.reason };
  if (e.action === AuditLogEvent.MemberKick) return { tipo: 'expulsao', ...base };
  if (e.action === AuditLogEvent.MemberBanAdd) return { tipo: 'ban', ...base };
  if (e.action === AuditLogEvent.MemberUpdate) {
    const mudanca = (e.changes ?? []).find((c) => c.key === 'communication_disabled_until');
    const ate = mudanca?.new ? new Date(mudanca.new) : null;
    if (ate && ate.getTime() > Date.now()) return { tipo: 'silencio', ...base, ate };
  }
  return null;
}

/**
 * @param {import('discord.js').Client} client
 * @param {(tipo: string, dados: object) => Promise<void>} postar
 */
export function ligarPortaria(client, postar) {
  const tentar = (tipo, d) => postar(tipo, d).catch((erro) => console.error(`Portaria (${tipo}):`, erro?.message ?? erro));
  client.on(Events.GuildMemberAdd, (membro) => tentar('entrada', { guild: membro.guild, membro, usuario: membro.user }));
  client.on(Events.GuildMemberRemove, (membro) => {
    // Espera a auditoria chegar: se foi expulsão/ban, quem posta é ela
    setTimeout(() => deveAnunciarSaida(membro.id) && tentar('saida', { guild: membro.guild, usuario: membro.user }), 3000);
  });
  client.on(Events.GuildAuditLogEntryCreate, (entrada, guild) => {
    const ev = lerAuditoria(entrada);
    if (!ev) return;
    if (ev.tipo !== 'silencio') marcarPunicao(ev.alvoId, ev.tipo);
    if (ev.tipo === 'ban' && !primeiraVez(`ban:${guild.id}:${ev.alvoId}`)) return;
    tentar(ev.tipo, { guild, ...ev });
  });
  client.on(Events.GuildBanAdd, (ban) => {
    marcarPunicao(ban.user.id, 'ban');
    setTimeout(() => primeiraVez(`ban:${ban.guild.id}:${ban.user.id}`) && tentar('ban', { guild: ban.guild, usuario: ban.user, alvoId: ban.user.id, motivo: ban.reason }), 2500);
  });
}
