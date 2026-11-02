// Auto-moderação. Palavrões, convites, menções e links viram regras da AutoMod do próprio Discord
// (funcionam mesmo com o bot dormindo e sem a intent "Message Content"). O anti-spam é o bot que conta,
// pelos eventos de mensagem (não precisa ler o texto).
import { AutoModerationActionType as A, AutoModerationRuleEventType as E, AutoModerationRuleTriggerType as T } from 'discord.js';

export const NOMES = { palavrao: 'Palavrões', spam: 'Anti-spam', convites: 'Convites', mencoes: 'Menções', links: 'Links suspeitos' };
/** As que viram regra do Discord (o spam fica com o bot) */
export const NATIVAS = ['palavrao', 'convites', 'mencoes', 'links'];

/** Lista inicial do filtro de palavrões (dá pra editar no painel) */
export const PALAVROES = [
  'porra', 'caralho', 'krl', 'crl', 'merda', 'mrd', 'bosta', 'puta', 'puto', 'putaria', 'fdp', 'filho da puta', 'filha da puta',
  'pqp', 'puta que pariu', 'vsf', 'vai se foder', 'vai se fuder', 'vtnc', 'tnc', 'vai tomar no cu', 'foda-se', 'fodase', 'cu', 'cuzao',
  'cuzão', 'pau no cu', 'arrombado', 'arrombada', 'buceta', 'boceta', 'xoxota', 'piroca', 'desgraçado', 'desgraçada', 'desgracado',
  'otario', 'otário', 'otaria', 'otária', 'babaca', 'corno', 'cacete', 'viado',
];

// Regex no formato do Rust (o que o Discord aceita): sem lookahead; (?i) = tanto faz maiúscula
const CONVITE = '(?i)(?:discord(?:app)?\\.com/invite|discord\\.(?:gg|io|me|li)|dsc\\.gg|invite\\.gg)/[a-z0-9-]+';
const LINKS = [
  '(?i)\\b(?:bit\\.ly|bitly\\.com|tinyurl\\.com|cutt\\.ly|is\\.gd|v\\.gd|t\\.ly|rb\\.gy|shorturl\\.at|tiny\\.cc|ow\\.ly|rebrand\\.ly|s\\.id|abre\\.ai|encurtador\\.com\\.br|shorte\\.st|adf\\.ly)/\\S+',
  '(?i)(?:free|gr[aá]tis)\\W+(?:discord\\W+)?nitro',
  '(?i)nitro\\W+(?:de\\W+)?(?:free|gr[aá]tis)',
  '(?i)\\b(?:dlscord|d1scord|discorcl|discrod|dicsord|disocrd|dscord|discordd|discord-?(?:gift|nitro|app-?gift)s?|nitro-?discord)\\.[a-z]{2,}',
  '(?i)\\b(?:steamcommunlty|steamcomunity|steamcommnunity|stearncommunity|steancommunity|steamcommunity-?[a-z0-9]+)\\.[a-z]{2,}',
];

const DEF = {
  palavrao: { gatilho: T.Keyword, mensagem: 'Olha a boca! O Manda Chuva barrou essa mensagem (palavrão).' },
  convites: { gatilho: T.Keyword, mensagem: 'Convite de outro servidor não pode aqui.' },
  mencoes: { gatilho: T.MentionSpam, mensagem: 'Calma: marcou gente demais numa mensagem só.' },
  links: { gatilho: T.Keyword, mensagem: 'Link suspeito barrado pelo Manda Chuva.' },
};

/**
 * Regra da AutoMod do Discord pra um tipo (no formato do discord.js).
 * acao 'silenciar' já põe o castigo de 10 min do próprio Discord; avisar e expulsar o bot faz quando recebe o evento.
 * convites: códigos de convite do próprio servidor (liberados). isentos: cargos de moderação (até 20).
 */
export function regraDoDiscord(tipo, { acao, palavras = [], convites = [], isentos = [] }) {
  const d = DEF[tipo];
  const actions = [{ type: A.BlockMessage, metadata: { customMessage: d.mensagem } }];
  if (acao === 'silenciar') actions.push({ type: A.Timeout, metadata: { durationSeconds: 600 } });
  const triggerMetadata =
    tipo === 'palavrao' ? { keywordFilter: palavras }
    : tipo === 'convites' ? { regexPatterns: [CONVITE], allowList: convites.flatMap((c) => [`discord.gg/${c}`, `discord.com/invite/${c}`]).slice(0, 100) }
    : tipo === 'mencoes' ? { mentionTotalLimit: 5 }
    : { regexPatterns: LINKS };
  return { name: `Manda Chuva · ${NOMES[tipo]}`, eventType: E.MessageSend, triggerType: d.gatilho, triggerMetadata, actions, enabled: true, exemptRoles: isentos.slice(0, 20) };
}

/**
 * Anti-spam: anota a mensagem e devolve a rajada (as mensagens dos últimos ms) quando chegar em qtd; senão null.
 * janelas: Map userId → mensagens recentes ({ id, canalId, userId }).
 */
export function contarSpam(janelas, m, agora, { qtd = 5, ms = 3000 } = {}) {
  if (janelas.size > 5000) janelas.clear(); // não deixa crescer pra sempre
  const recentes = (janelas.get(m.userId) ?? []).filter((x) => agora - x.quando < ms);
  recentes.push({ ...m, quando: agora });
  if (recentes.length >= qtd) {
    janelas.delete(m.userId);
    return recentes;
  }
  janelas.set(m.userId, recentes);
  return null;
}

/** O que vai no livro de ocorrências */
export function oqueDoAutomod(tipo, acao, n = 5) {
  const fez = { palavrao: 'mandou palavrão', spam: `mandou ${n} mensagens em 3s`, convites: 'mandou convite de outro servidor', mencoes: 'marcou gente demais numa mensagem', links: 'mandou link suspeito' }[tipo];
  const deu = { apagar: tipo === 'spam' ? ' (mensagens apagadas)' : ' (mensagem apagada)', avisar: ' e levou aviso', silenciar: ' e ficou 10 min em silêncio', expulsar: ' e foi expulso' }[acao];
  return fez + deu;
}
