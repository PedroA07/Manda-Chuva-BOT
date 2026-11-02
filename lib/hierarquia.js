// Hierarquia de cargos (aba Cargos): a lista que o painel mostra e o plano pra aplicar a lista editada no Discord.
// Trabalha com descrições simples dos cargos (o bot.js traduz do discord.js):
// { id, nome, posicao, cor: number, bits: bigint, hoist, mencionavel, gerenciado: 'bot' | 'impulso' | 'integracao' | null, membros }
import { PermissionFlagsBits as P } from 'discord.js';

/** Permissões que o painel liga e desliga: [chave, bit, nome] */
export const PERMS = [
  ['admin', P.Administrator, 'Administrador'],
  ['cargos', P.ManageRoles, 'Gerenciar cargos'],
  ['mensagens', P.ManageMessages, 'Gerenciar mensagens'],
  ['silenciar', P.ModerateMembers, 'Silenciar membros'],
  ['expulsar', P.KickMembers, 'Expulsar'],
  ['banir', P.BanMembers, 'Banir'],
];
const DO_PAINEL = PERMS.reduce((s, [, b]) => s | b, 0n);

export const bitsDasPerms = (lista) => PERMS.filter(([k]) => lista.includes(k)).reduce((s, [, b]) => s | b, 0n);
export const permsDosBits = (bits) => PERMS.filter(([, b]) => (bits & b) === b).map(([k]) => k);

// Separador = cargo vazio que só organiza a lista: "━━ STAFF ━━" (aceita também ── ══ ▬▬ feitos à mão)
export const nomeDoSeparador = (nome) => (nome ? `━━ ${nome} ━━` : '━━━━━━');
export function lerSeparador(nome) {
  const m = /^[━─═▬]{2,}\s*(.*?)\s*[━─═▬]{2,}$/u.exec(nome) ?? /^[━─═▬]{2,}$/u.exec(nome);
  return m ? (m[1] ?? '') : null;
}

const SNOWFLAKE = /^\d{17,20}$/;
const hex = (n) => `#${n.toString(16).padStart(6, '0').toUpperCase()}`;

/** De cima pra baixo, igual ao Discord: posição maior primeiro; empate, o id menor (mais antigo) fica em cima */
export const ordenar = (cargos) => [...cargos].sort((a, b) => b.posicao - a.posicao || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

/** Cargos abaixo do cargo mais alto do bot: só esses ele consegue mexer */
function marcar(atual, botId) {
  const ord = ordenar(atual);
  const iBot = ord.findIndex((r) => r.id === botId);
  return ord.map((r, i) => ({ ...r, movivel: iBot >= 0 && i > iBot }));
}

/**
 * Lista que o painel mostra, de cima pra baixo: { k: 'role' | 'sep' | 'cores', ... }.
 * Os cargos de cor viram um item só (o bloco), no lugar do cargo de cor mais alto que o bot consegue mexer.
 */
export function listaDaHierarquia(atual, { botId, idsDeCor }) {
  const cor = new Set(idsDeCor);
  const lista = [];
  let bloco = false;
  for (const r of marcar(atual, botId)) {
    if (cor.has(r.id)) {
      if (r.movivel && !bloco) lista.push({ k: 'cores' });
      bloco ||= r.movivel;
      continue;
    }
    const trava = r.movivel ? {} : { travado: true };
    const sep = r.gerenciado ? null : lerSeparador(r.nome);
    if (sep !== null) lista.push({ k: 'sep', id: r.id, nome: sep, ...trava });
    else {
      lista.push({
        k: 'role', id: r.id, nome: r.nome, hex: r.cor ? hex(r.cor) : '', perms: permsDosBits(r.bits), hoist: r.hoist, mencionavel: r.mencionavel, membros: r.membros,
        ...trava, ...(r.gerenciado && { gerenciado: r.gerenciado }), ...(r.id === botId && { bot: true }),
      });
    }
  }
  // Nenhum cargo de cor que o bot mexa ainda: o bloco fica logo abaixo dele
  if (!bloco) {
    const b = lista.findIndex((x) => x.bot);
    lista.splice(b < 0 ? lista.length : b + 1, 0, { k: 'cores' });
  }
  return lista;
}

/** Confere o formato do que veio do painel ({ lista, apagar }). Sem hierarquia (undefined/null) não tem erro. */
export function errosDaHierarquia(editada) {
  if (editada == null) return [];
  if (typeof editada !== 'object' || !Array.isArray(editada.lista) || !Array.isArray(editada.apagar ?? []) || editada.lista.length > 300) return ['Hierarquia: formato inválido.'];
  const erros = [];
  let blocos = 0;
  for (const x of editada.lista) {
    if (!x || typeof x !== 'object' || !['role', 'sep', 'cores'].includes(x.k)) erros.push('Hierarquia: formato inválido.');
    else if (x.k === 'cores') blocos++;
    else if (x.k === 'sep') {
      if (String(x.nome ?? '').trim().length > 94) erros.push('Nome de separador passa de 94 letras.');
    } else {
      const nome = String(x.nome ?? '').trim();
      if (!nome) erros.push('Tem cargo sem nome na hierarquia.');
      else if (nome.length > 100) erros.push(`O nome "${nome.slice(0, 20)}…" passa de 100 letras.`);
      else if (x.hex && !/^#[0-9A-F]{6}$/i.test(x.hex)) erros.push(`Cor inválida no cargo "${nome}" (use #RRGGBB).`);
      else if (!Array.isArray(x.perms ?? []) || (x.perms ?? []).some((p) => !PERMS.some(([k]) => k === p))) erros.push(`Permissão desconhecida no cargo "${nome}".`);
    }
  }
  if (blocos > 1) erros.push('O bloco de cores aparece mais de uma vez.');
  return [...new Set(erros)];
}

/** Bits pedidos, menos os que o bot não tem (e o aviso disso) */
function semAsQueNaoTenho(nome, bits, jaTinha, permsDoBot, avisos) {
  const faltam = bits & ~jaTinha & ~permsDoBot;
  if (faltam) {
    const nomes = PERMS.filter(([, b]) => faltam & b).map(([, , n]) => n);
    const uma = nomes.length === 1;
    avisos.push(`⚠️ "${nome}" ficou sem ${nomes.join(' e ')}: eu mesmo não tenho ${uma ? 'essa permissão' : 'essas permissões'}, então não consigo dar.`);
  }
  return bits & ~faltam;
}

function dadosDoNovo(item, permsDoBot, avisos) {
  if (item.k === 'sep') {
    const name = nomeDoSeparador(String(item.nome ?? '').trim().toUpperCase());
    return { name, colors: { primaryColor: 0 }, permissions: 0n, hoist: false, mentionable: false };
  }
  const name = String(item.nome).trim();
  return {
    name,
    colors: { primaryColor: item.hex ? parseInt(item.hex.slice(1), 16) : 0 },
    permissions: semAsQueNaoTenho(name, bitsDasPerms(item.perms ?? []), 0n, permsDoBot, avisos),
    hoist: !!item.hoist,
    mentionable: !!item.mencionavel,
  };
}

/** Só o que mudou num cargo que já existe (null = nada) */
function mudancas(r, item, permsDoBot, avisos) {
  const d = {};
  if (item.k === 'sep') {
    const nome = String(item.nome ?? '').trim().toUpperCase();
    if (lerSeparador(r.nome) !== nome) d.name = nomeDoSeparador(nome);
    return Object.keys(d).length ? d : null;
  }
  const nome = String(item.nome).trim();
  if (nome !== r.nome) d.name = nome;
  const cor = item.hex ? parseInt(item.hex.slice(1), 16) : 0;
  if (cor !== r.cor) d.colors = { primaryColor: cor };
  if (!!item.hoist !== r.hoist) d.hoist = !!item.hoist;
  if (!!item.mencionavel !== r.mencionavel) d.mentionable = !!item.mencionavel;
  // As permissões fora do painel (ver canais, enviar mensagens...) ficam como estão
  const bits = semAsQueNaoTenho(nome, (r.bits & ~DO_PAINEL) | bitsDasPerms(item.perms ?? []), r.bits, permsDoBot, avisos);
  if (bits !== r.bits) d.permissions = bits;
  return Object.keys(d).length ? d : null;
}

/**
 * O que fazer no Discord pra ficar igual à lista editada (ou, sem edição, só juntar as cores no bloco).
 * ordem = ids (e chaves "novo:N" dos que vão ser criados) dos cargos que o bot mexe, de cima pra baixo.
 */
export function planejarHierarquia({ atual, editada, botId, idsDeCor, permsDoBot }) {
  const marcados = marcar(atual, botId);
  const porId = new Map(marcados.map((r) => [r.id, r]));
  const deCor = new Set(idsDeCor);
  const coresMoveis = idsDeCor.filter((id) => porId.get(id)?.movivel);
  const lista = editada?.lista ?? listaDaHierarquia(atual, { botId, idsDeCor });
  const plano = { criar: [], editar: [], apagar: [], ordem: [], avisos: [] };

  const apagar = new Set();
  for (const id of editada?.apagar ?? []) {
    const r = porId.get(id);
    if (!r) continue; // já não existe
    if (!r.movivel || r.gerenciado || deCor.has(id)) {
      plano.avisos.push(`⚠️ Não apaguei "${r.nome}": ${deCor.has(id) ? 'é cargo de cor (tire na aba Cores)' : r.gerenciado ? 'é de uma integração' : 'está acima do meu cargo'}.`);
      continue;
    }
    apagar.add(id);
  }
  plano.apagar = [...apagar];

  const vistos = new Set(apagar);
  let novos = 0;
  let bloco = false;
  for (const item of lista) {
    if (item.k === 'cores') {
      if (!bloco) plano.ordem.push(...coresMoveis);
      bloco = true;
      continue;
    }
    if (!SNOWFLAKE.test(item.id ?? '')) {
      const chave = `novo:${novos++}`;
      const dados = dadosDoNovo(item, permsDoBot, plano.avisos);
      plano.criar.push({ chave, nome: dados.name, dados });
      plano.ordem.push(chave);
      continue;
    }
    const r = porId.get(item.id);
    if (!r) {
      plano.avisos.push(`⚠️ "${item.nome}" não existe mais no Discord: atualize a página.`);
      continue;
    }
    if (vistos.has(r.id) || deCor.has(r.id) || !r.movivel) continue;
    vistos.add(r.id);
    plano.ordem.push(r.id);
    const dados = r.gerenciado ? null : mudancas(r, item, permsDoBot, plano.avisos);
    if (dados) plano.editar.push({ id: r.id, nome: dados.name ?? r.nome, dados });
  }

  // Cargo que não estava na lista (criado no Discord depois de abrir o painel, ou cor sem bloco):
  // entra logo abaixo de quem está em cima dele hoje. As cores entram juntas, na ordem da aba Cores.
  const naOrdem = new Set(plano.ordem);
  let anterior = null;
  for (const r of marcados) {
    if (!r.movivel || apagar.has(r.id)) continue;
    if (naOrdem.has(r.id)) {
      anterior = r.id;
      continue;
    }
    const entram = deCor.has(r.id) ? coresMoveis.filter((id) => !naOrdem.has(id)) : [r.id];
    plano.ordem.splice(anterior === null ? 0 : plano.ordem.indexOf(anterior) + 1, 0, ...entram);
    for (const id of entram) naOrdem.add(id);
    anterior = entram.at(-1);
  }
  return plano;
}

/**
 * Posições pro setPositions. [] = já está nessa ordem. Usa as vagas que esses cargos já ocupam
 * (se tiver empate de posição, numera de K até 1).
 */
export function posicoes(ordem, atual) {
  const porId = new Map(atual.map((r) => [r.id, r]));
  const ids = ordem.filter((id) => porId.has(id));
  const agora = ordenar(ids.map((id) => porId.get(id))).map((r) => r.id);
  if (agora.every((id, i) => id === ids[i])) return [];
  const vagas = ids.map((id) => porId.get(id).posicao).sort((a, b) => b - a);
  const distintas = new Set(vagas).size === vagas.length;
  return ids.map((id, i) => ({ id, position: distintas ? vagas[i] : ids.length - i }));
}
