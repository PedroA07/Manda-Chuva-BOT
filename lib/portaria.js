// Portaria: texto e mensagem de cada evento (entrou, saiu, expulso, banido, silenciado)
import { PADROES } from './imagens.js';

/** Duração em português, arredondada pra unidade que faz sentido ("1 hora", "3 dias", "1 semana") */
export function duracaoTexto(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return min === 1 ? '1 minuto' : `${min} minutos`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? '1 hora' : `${h} horas`;
  const d = Math.round(h / 24);
  if (d % 7 === 0) return d === 7 ? '1 semana' : `${d / 7} semanas`;
  return d === 1 ? '1 dia' : `${d} dias`;
}

/** Troca {usuario}, {servidor}... pelos valores. Chave que não existe fica como está. */
export const preencher = (texto, vars) => String(texto ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/**
 * Entrada do montarV2 pra um evento da portaria.
 * vars: { id, usuario (menção), nome, servidor, numero, moderador, motivo, tempo }
 * @param {{ url: (ref: string, padrao: string) => string | null, card?: string }} ajuda card = URL do card (attachment://)
 */
export function pedacoDoEvento(tipo, ev, vars, { url, card }) {
  const P = PADROES[tipo], i = ev.imgs ?? {};
  const texto = preencher(ev.msg, vars);
  const campos = [
    ev.motivo && `**Motivo:** ${vars.motivo}`,
    ev.mod && `**Moderador:** ${vars.moderador}`,
    tipo === 'silencio' && `**Duração:** ${vars.tempo}`,
  ].filter(Boolean);
  const dentro = ev.textoPos === 'dentro';
  return {
    topo: url(i.topo, P.topo),
    fora: dentro ? undefined : texto,
    cor: parseInt(ev.cor.slice(1), 16),
    titulo: preencher(ev.titulo, vars),
    texto: [dentro ? texto : '', campos.join('\n')].filter(Boolean).join('\n\n'),
    mini: url(i.mini, P.mini),
    imagem: url(i.imagem, P.imagem),
    // <t:...:R> o Discord mostra como "agora", "há 2 dias"...
    rodape: tipo === 'entrada' ? `Membro nº ${vars.numero} · ${vars.servidor}` : `${vars.servidor} · <t:${Math.floor(Date.now() / 1000)}:R>`,
    card,
    finais: (i.finais ?? []).map((f) => url(f, P.final)).filter(Boolean),
    // Só o novato é marcado; nas outras a menção aparece mas não notifica
    mencoes: tipo === 'entrada' ? { users: [vars.id] } : {},
  };
}
