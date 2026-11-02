// Lógica do bot: cargos de cor, botões, comando /cor e as ações usadas pelo painel web
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits as I,
  GuildFeature,
  MessageFlags,
  OAuth2Scopes,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
} from 'discord.js';
import * as dados from './dados.js';
import { lerAnexo, limparAnexos, refsDeAnexo, salvarAnexo } from './lib/anexos.js';
import { baixarImagem, desenharCard } from './lib/card.js';
import { conectar } from './lib/conexao.js';
import { emojiDaCor } from './lib/emojis.js';
import { ligarPortaria } from './lib/eventos.js';
import { midia, PADROES } from './lib/imagens.js';
import { montarV2 } from './lib/mensagem.js';
import { paraAnunciar, pedacoDaNoticia } from './lib/noticias.js';
import { NOVIDADES } from './lib/novidades.js';
import { corDoBotao, errosDoPainel, pedacoDoPainel, REMOVER } from './lib/painel.js';
import { eventoDaPlaca, placaPronta } from './lib/placa.js';
import { duracaoTexto, pedacoDoEvento, preencher } from './lib/portaria.js';
import { lerRegistro, salvarRegistro } from './lib/registro.js';
import { aplicarTema, hojeNoBrasil, temaAtivo } from './lib/temas.js';
import { VERSAO } from './lib/versao.js';

// Permissões que vão no link de convite (e que o painel confere se o bot tem)
const NOMES_PERMISSOES = [
  [P.ViewChannel, 'Ver canais'],
  [P.SendMessages, 'Enviar mensagens'],
  [P.EmbedLinks, 'Inserir links'],
  [P.AttachFiles, 'Anexar arquivos'],
  [P.ReadMessageHistory, 'Ver histórico de mensagens'],
  [P.ManageRoles, 'Gerenciar cargos'],
  [P.ViewAuditLog, 'Ver o registro de auditoria'],
];
export const PERMISSOES = NOMES_PERMISSOES.map(([p]) => p);

// Cargo com qualquer uma dessas permissões nunca é dado por botão (evita alguém virar admin sem querer)
const PERIGOSAS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageMessages,
  P.ManageWebhooks, P.KickMembers, P.BanMembers, P.ModerateMembers, P.MentionEveryone];

// Guilds = servidores, cargos e canais; Expressions = emojis do servidor; GuildModeration = bans e registro de
// auditoria (portaria); GuildMembers (privilegiada) = quem entra/sai e quem tem cada cor. Sem ela liberada no portal,
// o bot conecta sem (lib/conexao.js).
const INTENTS = [I.Guilds, I.GuildExpressions, I.GuildModeration, I.GuildMembers];

// Trocado no iniciarBot pelo cliente conectado (export let: quem importa vê o novo)
export let client = new Client({ intents: INTENTS });
let soPainel = false;
const temMembros = () => client.options.intents.has(I.GuildMembers);

const comStatus = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const hexParaInt = (hex) => parseInt(hex.slice(1), 16);
const intParaHex = (n) => `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
const linkConvite = () => client.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: PERMISSOES });

/** Servidor configurado (ou o do id passado), se o bot estiver nele. @param {string | null} [id] */
function servidor(id = dados.config().servidorId) {
  return id && client.isReady() ? (client.guilds.cache.get(id) ?? null) : null;
}

/** @param {import('discord.js').Role} cargo */
const ehPerigoso = (cargo) => cargo.managed || cargo.permissions.any(PERIGOSAS);

// ---------- Fila por pessoa ----------
// Se alguém clicar em várias cores muito rápido, processa uma de cada vez (senão podia sobrar duas cores)
const filas = new Map();
function naFila(chave, tarefa) {
  const atual = (filas.get(chave) ?? Promise.resolve()).then(tarefa).catch((erro) => console.error('Erro:', erro));
  filas.set(chave, atual);
  atual.then(() => filas.get(chave) === atual && filas.delete(chave));
  return atual;
}

// ---------- Botões e /cor ----------
// Cada botão guarda o ID do cargo ("cor:123..."). Os cargos de cor de um painel são os botões da própria
// mensagem, então o bot não depende do config pra responder: painel antigo continua funcionando.
/** @param {import('discord.js').Message} mensagem */
export function cargosDosBotoes(mensagem) {
  const ids = [];
  const visitar = (lista) => {
    for (const c of lista ?? []) {
      const achou = /^cor:(\d+)$/.exec(c.customId ?? '');
      if (achou) ids.push(achou[1]);
      visitar(c.components);
    }
  };
  visitar(/** @type {any[]} */ (mensagem.components));
  return ids;
}

// No /cor, as opções do próprio comando (registrado no Discord) dizem quais são os cargos de cor
/** @param {import('discord.js').ChatInputCommandInteraction<'cached'>} interacao */
async function cargosDoComando(interacao) {
  const comando = interacao.command ?? (await interacao.guild.commands.fetch(interacao.commandId));
  const opcao = /** @type {any} */ (comando.options.find((o) => o.name === 'cor'));
  return (opcao?.choices ?? []).map((c) => String(c.value)).filter((v) => /^\d+$/.test(v));
}

/**
 * Dá ou tira a cor. idsDeCor = todos os cargos de cor (pra tirar os outros: é uma cor por vez).
 * @param {import('discord.js').ButtonInteraction<'cached'> | import('discord.js').ChatInputCommandInteraction<'cached'>} interacao
 * @param {string} alvoId
 * @param {string[]} idsDeCor
 */
async function escolherCor(interacao, alvoId, idsDeCor) {
  const { guild } = interacao;
  const tirarTudo = alvoId === REMOVER;
  if (!tirarTudo && !idsDeCor.includes(alvoId)) throw new Error('Essa cor não está mais neste painel.');
  const alvo = tirarTudo ? null : guild.roles.cache.get(alvoId);
  if (!tirarTudo && !alvo) throw new Error('O cargo dessa cor foi apagado. Peça pra um admin salvar o painel de novo.');

  // Cargos atualizados direto do Discord (o cache pode estar velho)
  const membro = await guild.members.fetch({ user: interacao.user.id, force: true });
  // Clicou no botão da cor que já tem: tira ela
  const tirar = tirarTudo || (interacao.isButton() && membro.roles.cache.has(alvoId));
  if (alvo && !tirar) {
    if (ehPerigoso(alvo)) throw new Error(`Por segurança eu não dou o cargo "${alvo.name}" (ele tem permissões de moderação/admin).`);
    if (!alvo.editable) throw new Error(`Não consigo dar o cargo "${alvo.name}": ele está acima do meu cargo.`);
  }

  const tiradas = [];
  for (const id of idsDeCor) {
    const cargo = guild.roles.cache.get(id);
    if (cargo?.editable && membro.roles.cache.has(id) && (tirar || id !== alvoId)) {
      await membro.roles.remove(cargo, 'Trocou de cor');
      tiradas.push(`<@&${id}>`);
    }
  }
  if (alvo && !tirar && !membro.roles.cache.has(alvoId)) await membro.roles.add(alvo, 'Escolheu cor');

  const { ganhou, removeu } = dados.config().mensagens;
  const resposta = tirar ? removeu.replaceAll('{cor}', tiradas.join(' e ') || 'a cor') : ganhou.replaceAll('{cor}', `<@&${alvoId}>`);
  await interacao.editReply({ content: resposta, allowedMentions: { parse: [] } });
}

/** @param {import('discord.js').Interaction} interacao */
async function responderInteracao(interacao) {
  if (!interacao.inCachedGuild()) return;
  const ehBotao = interacao.isButton() && interacao.customId.startsWith('cor:');
  const ehComando = interacao.isChatInputCommand() && interacao.commandName === 'cor';
  if (!ehBotao && !ehComando) return;
  try {
    await interacao.deferReply({ flags: MessageFlags.Ephemeral });
    await naFila(`${interacao.guildId}:${interacao.user.id}`, async () => {
      try {
        if (interacao.isButton()) await escolherCor(interacao, interacao.customId.slice(4), cargosDosBotoes(interacao.message));
        else if (interacao.isChatInputCommand()) await escolherCor(interacao, interacao.options.getString('cor', true), await cargosDoComando(interacao));
      } catch (erro) {
        await interacao.editReply(`⚠️ ${explicarErro(erro)}`);
      }
    });
  } catch (erro) {
    console.error('Erro ao responder um clique:', erro);
  }
}

// ---------- Mensagem do painel ----------
/** Bolinhas de cor dos botões com "cor do cargo"/"cor própria" (emoji da aplicação, criado na hora se faltar) */
async function bolinhasDoPainel(cfg) {
  const bolinhas = new Map();
  for (const hex of new Set(cfg.cores.filter((c) => c.cargoId).map(corDoBotao).filter(Boolean))) {
    try {
      bolinhas.set(hex, await emojiDaCor(client, hex));
    } catch (erro) {
      console.error(`Não consegui criar a bolinha ${hex}:`, explicarErro(erro));
    }
  }
  return bolinhas;
}

/**
 * Converte as imagens da config em URLs pra mensagem. Vão como arquivo junto (attachment://): imagem enviada pelo
 * painel e banner "Eventos" (a placa é desenhada aqui com o nome do servidor). arquivos() devolve só os que a mensagem usou.
 * @param {object} imgs as imagens daquela mensagem (pra preparar antes)
 * @param {import('discord.js').Guild} [guild] dá o nome do servidor pras placas
 */
async function imagensDaMensagem(imgs, guild) {
  const carregados = new Map();
  for (const id of refsDeAnexo(imgs)) {
    const a = await lerAnexo(id).catch((erro) => console.error(`Não consegui ler a imagem ${id}:`, erro.message));
    if (a) carregados.set(`anexo:${id}`, { attachment: a.buffer, name: `anexo-${id}.${a.ext}` });
  }
  for (const ref of Object.values(imgs ?? {}).flat()) {
    const evento = eventoDaPlaca(ref);
    if (!evento || carregados.has(ref)) continue;
    const png = await placaPronta(evento, guild?.name ?? 'SEU SERVIDOR').catch((erro) => console.error(`Não consegui desenhar a placa ${evento}:`, erro.message));
    if (png) carregados.set(ref, { attachment: png, name: `placa-${evento}.jpg` });
  }
  const usados = new Map();
  const url = (ref, padrao) => {
    const r = ref || padrao;
    const arquivo = carregados.get(r);
    if (arquivo) {
      usados.set(r, arquivo);
      return `attachment://${arquivo.name}`;
    }
    const m = midia(ref, padrao);
    return m && 'url' in m ? m.url : null;
  };
  return { url, arquivos: () => [...usados.values()] };
}

/** Mensagem do painel no layout novo. @param {import('discord.js').Guild} guild */
export async function montarMensagem(guild, cfg = dados.config()) {
  // Menção de cargo aparece com a cor do cargo; allowedMentions vazio garante que não marca ninguém
  const mencao = (cor) => (cor.cargoId && guild.roles.cache.has(cor.cargoId) ? `<@&${cor.cargoId}>` : `**${cor.nome}**`);
  // Data festiva no ar: banner, miniatura e cor do tema, com a frase em cima do texto
  const tema = aplicarTema('painel', cfg.painel.imgs, temaDeHoje(cfg), cfg.temas.respeitar);
  const c = tema ? { ...cfg, painel: { ...cfg.painel, imgs: tema.imgs, corDoEmbed: tema.cor } } : cfg;
  const { url, arquivos } = await imagensDaMensagem(c.painel.imgs, guild);
  const pedaco = pedacoDoPainel(c, { mencao, bolinhas: await bolinhasDoPainel(c), url });
  return montarV2({ ...comFrase(pedaco, tema), arquivos: arquivos() });
}

/** Tema de data festiva que vale hoje (ou null) */
export const temaDeHoje = (cfg = dados.config()) => temaAtivo(cfg.temas, hojeNoBrasil());

/** Põe a frase do tema em negrito no começo do texto da caixa */
const comFrase = (pedaco, tema) => (tema?.frase ? { ...pedaco, texto: [`**${tema.frase}**`, pedaco.texto].filter(Boolean).join('\n\n') } : pedaco);

// ---------- Comando /cor ----------
export function comandos(cfg = dados.config()) {
  const rotulo = (c) => (!c.emoji || c.emoji.startsWith('<') ? c.nome : `${c.emoji} ${c.nome}`).slice(0, 100);
  const escolhas = cfg.cores.filter((c) => c.cargoId).map((c) => ({ name: rotulo(c), value: c.cargoId }));
  return [
    new SlashCommandBuilder()
      .setName('cor')
      .setDescription('Escolhe a cor do seu nome')
      .addStringOption((o) =>
        o.setName('cor').setDescription('Qual cor?').setRequired(true).addChoices(...escolhas, { name: '❌ Tirar a cor', value: REMOVER }),
      )
      .toJSON(),
  ];
}

/** @param {import('discord.js').Guild} guild */
async function registrarComandos(guild) {
  try {
    await guild.commands.set(comandos());
  } catch (erro) {
    console.error(`Não consegui registrar o /cor em ${guild.name}:`, explicarErro(erro));
  }
}

// ---------- Ações do painel web ----------
/** Cria os cargos que faltam e atualiza nome/cor dos que já existem. @param {import('discord.js').Guild} guild */
async function sincronizarCargos(guild, cfg, rel) {
  const usados = new Set();
  const podeDegrade = guild.features.includes(GuildFeature.EnhancedRoleColors);
  if (!podeDegrade && cfg.cores.some((c) => c.tipo === 'degrade')) rel.push('⚠️ Degradê no nome precisa de servidor com impulso: por enquanto ficou só a primeira cor.');
  for (const cor of cfg.cores) {
    const corInt = hexParaInt(cor.hex);
    const segunda = cor.tipo === 'degrade' && podeDegrade ? hexParaInt(cor.hex2) : null;
    try {
      let cargo = cor.cargoId ? guild.roles.cache.get(cor.cargoId) : undefined;
      // Sem cargo vinculado: usa um que já tenha esse nome (ex.: criado à mão) em vez de duplicar
      cargo ??= guild.roles.cache.find((x) => x.name === cor.nome && x.id !== guild.id && !x.managed && !usados.has(x.id));
      if (!cargo) {
        const colors = { primaryColor: corInt, ...(segunda !== null && { secondaryColor: segunda }) };
        cargo = await guild.roles.create({ name: cor.nome, colors, permissions: [], reason: 'Painel de cores' });
        rel.push(`Cargo criado: ${cor.nome}`);
      } else if (ehPerigoso(cargo)) {
        cor.cargoId = null;
        rel.push(`⚠️ "${cargo.name}" não pode ser cor: tem permissões de moderação/admin. Escolha outro cargo ou deixe o bot criar.`);
        continue;
      } else if (cargo.name !== cor.nome || cargo.colors.primaryColor !== corInt || (podeDegrade && (cargo.colors.secondaryColor ?? null) !== segunda)) {
        if (!cargo.editable) rel.push(`⚠️ Não consegui mudar "${cargo.name}": ele está acima do cargo do bot.`);
        else {
          // Servidor sem impulso nem aceita o campo da segunda cor
          const colors = { primaryColor: corInt, ...(podeDegrade && { secondaryColor: segunda }) };
          await cargo.edit({ name: cor.nome, colors, reason: 'Painel de cores' });
          rel.push(`Cargo atualizado: ${cor.nome}`);
        }
      }
      cor.cargoId = cargo.id;
      usados.add(cargo.id);
    } catch (erro) {
      rel.push(`⚠️ ${cor.nome}: ${explicarErro(erro)}`);
    }
  }
}

// ---------- Datas festivas ----------
/** Se o tema do dia mudou desde a última vez, atualiza os painéis no Discord e anota */
async function conferirTema() {
  const guild = servidor();
  if (!guild) return;
  const id = temaDeHoje()?.id ?? '';
  if (id === (lerRegistro().temaNoAr ?? '')) return;
  const rel = [];
  await atualizarPaineis(guild, rel);
  await salvarRegistro({ temaNoAr: id });
  console.log(`🎉 Tema do dia: ${id || 'nenhum'}. ${rel.join(' ')}`);
}

// ---------- Jornal do Campus ----------
let anunciando = false;
/**
 * Posta no canal escolhido as versões que ainda não foram anunciadas (veja lib/noticias.js).
 * A cópia "só painel" nunca anuncia. @returns {Promise<string[]>} versões postadas
 */
async function anunciarNovidades() {
  const n = dados.config().noticias;
  const guild = servidor();
  const canal = n.on && n.canalId && guild ? guild.channels.cache.get(n.canalId) : null;
  if (soPainel || anunciando || !canal?.isTextBased()) return [];
  anunciando = true;
  const vistas = new Set(lerRegistro().noticiasAnunciadas);
  const postadas = [];
  try {
    const { postar, marcar } = paraAnunciar(NOVIDADES, [...vistas], n.quais);
    for (const noticia of postar) {
      const tema = aplicarTema('news', n.imgs, temaDeHoje(), dados.config().temas.respeitar);
      const nt = tema ? { ...n, imgs: tema.imgs } : n;
      const { url, arquivos } = await imagensDaMensagem(nt.imgs, guild);
      const pedaco = pedacoDaNoticia(noticia, nt, { url });
      await canal.send(montarV2({ ...comFrase(pedaco, tema), ...(tema && { cor: parseInt(tema.cor.slice(1), 16) }), arquivos: arquivos() }));
      vistas.add(noticia.versao);
      postadas.push(noticia.versao);
    }
    for (const v of marcar) vistas.add(v);
  } catch (erro) {
    console.error('Não consegui anunciar a novidade:', explicarErro(erro));
  } finally {
    anunciando = false;
    if (vistas.size !== lerRegistro().noticiasAnunciadas.length) await salvarRegistro({ noticiasAnunciadas: [...vistas] });
  }
  return postadas;
}

/** Edita no Discord os painéis já enviados. @param {import('discord.js').Guild} guild */
async function atualizarPaineis(guild, rel) {
  const mensagem = await montarMensagem(guild);
  const manter = [];
  let atualizados = 0;
  for (const p of dados.paineis()) {
    if (p.servidorId !== guild.id) {
      manter.push(p);
      continue;
    }
    try {
      const canal = guild.channels.cache.get(p.canalId);
      if (!canal?.isTextBased()) throw Object.assign(new Error('canal apagado'), { code: 10003 });
      if (p.v2) {
        // attachments: [] tira os arquivos da versão anterior (os novos vão em files)
        await canal.messages.edit(p.mensagemId, { ...mensagem, attachments: [] });
        manter.push(p);
      } else {
        // Painel do layout antigo (embed): manda um novo no mesmo canal e apaga o velho
        const novo = await canal.send(mensagem);
        await canal.messages.delete(p.mensagemId).catch(() => {});
        manter.push({ ...p, mensagemId: novo.id, v2: true });
        rel.push(`O painel de #${canal.name} foi reenviado no layout novo.`);
      }
      atualizados++;
    } catch (erro) {
      if (erro.code === 10003 || erro.code === 10008) rel.push('Um painel tinha sido apagado no Discord e saiu da lista.');
      else {
        manter.push(p);
        rel.push(`⚠️ Não consegui atualizar um painel: ${explicarErro(erro)}`);
      }
    }
  }
  dados.salvarPaineis(manter);
  if (atualizados) rel.push(`${atualizados} painel(is) atualizado(s) no Discord.`);
}

/** Canais, cargos, emojis e situação da hierarquia, pro painel web. @param {import('discord.js').Guild} guild */
function infoServidor(guild) {
  const eu = guild.members.me;
  const cores = dados.config().cores;
  const deCor = cores.map((c) => (c.cargoId ? guild.roles.cache.get(c.cargoId) : undefined)).filter((r) => r !== undefined);
  const idsDeCor = new Set(deCor.map((r) => r.id));
  const maisBaixo = deCor.length ? Math.min(...deCor.map((r) => r.position)) : Infinity;

  const canais = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .map((c) => /** @type {import('discord.js').TextChannel} */ (c))
    .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      nome: c.name,
      categoria: c.parent?.name ?? '',
      podeEnviar: !!eu && c.permissionsFor(eu).has([P.ViewChannel, P.SendMessages, P.EmbedLinks]),
    }));

  // Sem a intent "Server Members" o bot não sabe quem tem cada cargo: membros fica null
  const cargos = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      nome: r.name,
      cor: intParaHex(r.colors.primaryColor),
      cor2: r.colors.secondaryColor ? intParaHex(r.colors.secondaryColor) : '',
      perigoso: ehPerigoso(r),
      acima: !r.editable,
      membros: temMembros() ? r.members.size : null,
    }));

  // Cargos com cor acima do cargo de cor mais baixo: quem tiver um deles não vê a cor do nome mudar
  const coloridosAcima = guild.roles.cache
    .filter((r) => r.colors.primaryColor !== 0 && !idsDeCor.has(r.id) && !r.tags?.botId && r.position > maisBaixo)
    .sort((a, b) => b.position - a.position)
    .map((r) => r.name);

  return {
    id: guild.id,
    nome: guild.name,
    canais,
    cargos,
    emojis: guild.emojis.cache.filter((e) => e.available !== false).map((e) => ({ id: e.id, nome: e.name, animado: e.animated, texto: e.toString() })),
    recursos: { degrade: guild.features.includes(GuildFeature.EnhancedRoleColors) },
    hoje: hojeNoBrasil(),
    podeMencionarTodos: !!eu?.permissions.has(P.MentionEveryone),
    membros: guild.memberCount,
    permissoesFaltando: NOMES_PERMISSOES.filter(([p]) => !eu?.permissions.has(p)).map(([, nome]) => nome),
    hierarquia: {
      cargoDoBot: eu?.roles.highest.name ?? '?',
      temPermissao: !!eu?.permissions.has(P.ManageRoles),
      acimaDoBot: deCor.filter((r) => !r.editable).map((r) => r.name),
      coloridosAcima,
      semCargo: cores.length - deCor.length,
    },
  };
}

// ---------- Portaria (entrou, saiu, expulso, banido, silenciado) ----------
const TEMPOS = { '10min': '10 minutos', '1h': '1 hora', '1d': '1 dia', '7d': '1 semana', sem: 'tempo indeterminado' };

/** Valores das variáveis {usuario}, {servidor}... de um evento */
function variaveisDoEvento(ev, { guild, user, membro, executorId, motivo, ate }) {
  return {
    id: user.id,
    usuario: `<@${user.id}>`,
    nome: membro?.displayName ?? user.globalName ?? user.username,
    servidor: guild.name,
    numero: String(guild.memberCount),
    moderador: executorId ? `<@${executorId}>` : 'alguém da staff',
    motivo: motivo || 'sem motivo',
    tempo: ate ? duracaoTexto(ate.getTime() - Date.now()) : TEMPOS[ev.duracao ?? '1h'],
  };
}

/** Mensagem do evento, com o card desenhado (entrada) e as imagens anexadas */
async function mensagemDoEvento(tipo, evOriginal, vars, { guild, user }) {
  const respeitar = dados.config().temas.respeitar;
  const tema = aplicarTema(tipo, evOriginal.imgs, temaDeHoje(), respeitar);
  const ev = tema ? { ...evOriginal, imgs: tema.imgs, cor: tema.cor } : evOriginal;
  const { url, arquivos } = await imagensDaMensagem(ev.imgs, guild);
  const extras = [];
  let card;
  if (tipo === 'entrada' && ev.card.on) {
    const bgTema = tema?.cardBg && (!respeitar || !ev.card.bg) ? tema.cardBg : null;
    const m = midia(bgTema || ev.card.bg || PADROES.entrada.card);
    const fundo = m?.anexo ? (await lerAnexo(m.anexo).catch(() => null))?.buffer : m?.url ? await baixarImagem(m.url) : null;
    const avatar = await baixarImagem(user.displayAvatarURL({ extension: 'png', size: 256 }));
    const noCard = { ...vars, usuario: vars.nome };
    const png = await desenharCard({
      fundo,
      avatar,
      nome: vars.nome,
      cima: preencher(ev.card.cima, noCard),
      baixo: preencher(ev.card.baixo, noCard),
      layout: ev.card.layout,
      forma: ev.card.forma,
      corTexto: ev.card.texto,
      corBorda: ev.card.borda,
    }).catch((erro) => console.error('Não consegui desenhar o card:', erro.message));
    if (png) {
      extras.push({ attachment: png, name: 'card.png' });
      card = 'attachment://card.png';
    }
  }
  return montarV2({ ...comFrase(pedacoDoEvento(tipo, ev, vars, { url, card }), tema), arquivos: [...arquivos(), ...extras] });
}

/** Chamado pelos eventos do Discord (lib/eventos.js) */
async function postarPortaria(tipo, d) {
  const cfg = dados.config();
  const ev = cfg.portaria[tipo];
  const guild = d.guild;
  if (soPainel || !ev.on || !ev.canalId || !guild || guild.id !== cfg.servidorId) return;
  const canal = guild.channels.cache.get(ev.canalId);
  if (!canal?.isTextBased()) return;
  const user = d.usuario ?? (await client.users.fetch(d.alvoId).catch(() => null));
  if (!user) return;
  const membro = d.membro ?? (tipo === 'silencio' ? await guild.members.fetch(user.id).catch(() => null) : null);
  const vars = variaveisDoEvento(ev, { guild, user, membro, executorId: d.executorId, motivo: d.motivo, ate: d.ate });
  const msg = await mensagemDoEvento(tipo, ev, vars, { guild, user });
  await canal.send(msg);
  // Na DM ninguém precisa ser marcado
  if (ev.dm) await user.send({ ...msg, allowedMentions: { parse: [] } }).catch(() => {});
  if (tipo === 'entrada' && ev.cargoAuto.on && ev.cargoAuto.cargoId && d.membro) {
    await d.membro.roles.add(ev.cargoAuto.cargoId, 'Cargo automático da portaria').catch((erro) => console.error('Cargo automático:', explicarErro(erro)));
  }
}

/** Dono do bot (quem criou a aplicação, ou o dono do time) */
async function donoDoBot() {
  const app = await client.application.fetch();
  const dono = app.owner;
  if (!dono) return null;
  return 'ownerId' in dono ? client.users.fetch(dono.ownerId) : dono;
}

// A API (api.js) só conversa com o bot por aqui
export const api = {
  saude: () => ({ ok: true, bot: client.isReady() ? 'online' : 'offline' }),

  estado(servidorId) {
    const cfg = dados.config();
    const guild = servidor(servidorId || cfg.servidorId);
    const user = client.isReady() ? client.user : null;
    // recursos.membros = a intent "Server Members" está liberada no portal (sem ela: sem contagem de membros)
    const recursos = { membros: temMembros() };
    return {
      config: cfg,
      bot: user
        ? { online: true, soPainel, versao: VERSAO, recursos, nome: user.username, avatar: user.displayAvatarURL({ size: 64 }), convite: linkConvite() }
        : { online: false, soPainel, versao: VERSAO, recursos },
      servidores: user ? client.guilds.cache.map((g) => ({ id: g.id, nome: g.name })) : [],
      servidor: guild ? infoServidor(guild) : null,
      noticias: NOVIDADES,
      paineis: guild
        ? dados.paineis()
            .filter((p) => p.servidorId === guild.id)
            .map((p) => ({
              ...p,
              canalNome: guild.channels.cache.get(p.canalId)?.name ?? 'canal apagado',
              link: `https://discord.com/channels/${p.servidorId}/${p.canalId}/${p.mensagemId}`,
            }))
        : [],
    };
  },

  async salvar(entrada) {
    const { cfg, erros } = dados.normalizar(entrada);
    erros.push(...errosDoPainel(cfg));
    if (erros.length) throw comStatus(400, erros.join('\n'));
    const antes = dados.config().servidorId;
    const rel = [];
    const guild = servidor(cfg.servidorId);
    if (guild) await sincronizarCargos(guild, cfg, rel);
    else rel.push(client.isReady() ? 'Escolha um servidor pra criar os cargos.' : 'Bot offline: a configuração foi salva; cargos e painéis atualizam quando salvar com ele online.');
    dados.salvarConfig(cfg);
    if (guild) {
      await atualizarPaineis(guild, rel);
      await registrarComandos(guild);
      const velho = antes !== cfg.servidorId ? servidor(antes) : null;
      if (velho) await velho.commands.set([]).catch(() => {});
    }
    const postadas = guild ? await anunciarNovidades() : [];
    if (postadas.length) rel.push(`Jornal do Campus: ${postadas.map((v) => `v${v}`).join(', ')} anunciada(s) no Discord.`);
    await avisarSeNaoGravou(rel);
    limparAnexos(cfg).catch((erro) => console.error('Não consegui apagar imagens antigas:', erro.message));
    return { config: cfg, relatorio: rel };
  },

  // Imagem enviada pelo painel ("Anexar"): guarda e devolve a referência pra pôr na config
  anexo: (corpo) => salvarAnexo(corpo),
  lerAnexo: (id) => lerAnexo(id),

  // "Testar comigo": manda a mensagem do evento (como está salva) na DM do dono do bot, com ele de exemplo
  async testarPortaria(evento) {
    const cfg = dados.config();
    const ev = cfg.portaria[evento];
    if (!ev) throw comStatus(400, 'Evento desconhecido.');
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    const dono = await donoDoBot().catch(() => null);
    if (!dono) throw comStatus(400, 'Não achei o dono do bot no Discord.');
    const membro = await guild.members.fetch(dono.id).catch(() => null);
    const vars = variaveisDoEvento(ev, { guild, user: dono, membro, executorId: client.user.id, motivo: 'teste do painel' });
    const msg = await mensagemDoEvento(evento, ev, vars, { guild, user: dono });
    try {
      await dono.send({ ...msg, allowedMentions: { parse: [] } });
    } catch (erro) {
      throw comStatus(400, erro.code === 50007 ? 'Não consegui mandar DM: libere mensagens diretas de membros do servidor.' : explicarErro(erro));
    }
    return { ok: true, para: dono.username };
  },

  // Banner "Eventos" com a placa e o nome do servidor escolhido (o painel mostra daqui)
  async placa(evento) {
    if (!eventoDaPlaca(`banners/eventos/${evento}.jpg`)) return null;
    return placaPronta(evento, servidor()?.name ?? 'SEU SERVIDOR');
  },

  async enviar(canalId) {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    const canal = guild.channels.cache.get(String(canalId ?? ''));
    if (!canal?.isTextBased()) throw comStatus(400, 'Escolha um canal de texto.');
    const cfg = dados.config();
    const rel = [];
    if (cfg.cores.some((c) => !c.cargoId || !guild.roles.cache.has(c.cargoId))) {
      await sincronizarCargos(guild, cfg, rel);
      dados.salvarConfig(cfg);
      await registrarComandos(guild);
    }
    if (!cfg.cores.some((c) => c.cargoId)) throw comStatus(400, ['Nenhuma cor tem cargo ainda.', ...rel].join('\n'));
    try {
      const msg = await canal.send(await montarMensagem(guild));
      dados.salvarPaineis([...dados.paineis(), { servidorId: guild.id, canalId: canal.id, mensagemId: msg.id, v2: true }]);
      await avisarSeNaoGravou(rel);
      return { link: msg.url, relatorio: rel };
    } catch (erro) {
      throw comStatus(400, explicarErro(erro));
    }
  },

  async apagar(mensagemId) {
    const painel = dados.paineis().find((p) => p.mensagemId === mensagemId);
    if (!painel) throw comStatus(404, 'Painel não encontrado.');
    const canal = client.channels.cache.get(painel.canalId);
    if (canal?.isTextBased()) {
      await canal.messages.delete(painel.mensagemId).catch((erro) => {
        if (![10003, 10008].includes(erro.code)) throw comStatus(400, explicarErro(erro));
      });
    }
    dados.salvarPaineis(dados.paineis().filter((p) => p !== painel));
    return { ok: true };
  },
};

async function avisarSeNaoGravou(rel) {
  const erro = await dados.esperarGravacao();
  if (erro) rel.push(`⚠️ Não consegui guardar no Gist (${erro}). Funciona agora, mas some se o bot reiniciar.`);
}

function explicarErro(erro) {
  switch (erro?.code) {
    case 50013:
      return 'Estou sem permissão. Confira se tenho "Gerenciar cargos" (e, no canal, ver, enviar mensagens e inserir links) e se meu cargo está acima dos cargos de cor.';
    case 50001:
      return 'Não tenho acesso a esse canal.';
    case 30005:
      return 'O servidor chegou no limite de 250 cargos.';
    case 50035:
      return `O Discord recusou algum campo (emoji inválido, link de imagem, texto grande demais...). Detalhe: ${erro.message}`;
    default:
      return erro?.message ?? String(erro);
  }
}

// ---------- Ligar o bot ----------
/** Liga os eventos num cliente novo (o conectar pode criar dois: com e sem as intents privilegiadas) */
function prepararCliente(c) {
  // Modo só painel: este processo só mexe no painel; quem responde aos botões é o bot hospedado
  if (!soPainel) c.on(Events.InteractionCreate, responderInteracao);
  if (!soPainel) ligarPortaria(c, postarPortaria);
  c.once(Events.ClientReady, async (pronto) => {
    console.log(`✅ Bot online como ${pronto.user.tag} (versão ${VERSAO})${soPainel ? ' (modo só painel: não responde aos botões)' : ''}`);
    console.log(`🔗 Link para adicionar o bot a um servidor:\n${pronto.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: PERMISSOES })}`);
    const cfg = dados.config();
    if (!cfg.servidorId && pronto.guilds.cache.size === 1) dados.salvarConfig({ ...cfg, servidorId: pronto.guilds.cache.firstKey() ?? null });
    // Versão nova no ar? Conta no jornal (espera um pouco pra conexão assentar)
    setTimeout(() => anunciarNovidades().catch(() => {}), 5000);
    // Virou o dia e mudou a data festiva? Os painéis já enviados trocam de visual sozinhos
    if (!soPainel) {
      setTimeout(() => conferirTema().catch(() => {}), 15_000);
      setInterval(() => conferirTema().catch(() => {}), 30 * 60_000);
    }
    // Com a intent "Server Members", baixa a lista de membros uma vez; depois os eventos mantêm atualizada
    if (pronto.options.intents.has(I.GuildMembers)) {
      for (const guild of pronto.guilds.cache.values()) await guild.members.fetch().catch((erro) => console.error(`Não consegui listar os membros de ${guild.name}:`, explicarErro(erro)));
    }
  });
  c.on(Events.GuildCreate, (guild) => {
    const cfg = dados.config();
    if (!cfg.servidorId) dados.salvarConfig({ ...cfg, servidorId: guild.id });
  });
  c.on(Events.Error, (erro) => console.error('Erro do bot:', erro));
  return c;
}

/** @param {string} token @param {{ soPainel?: boolean }} [opcoes] */
export async function iniciarBot(token, opcoes = {}) {
  soPainel = !!opcoes.soPainel;
  ({ client } = await conectar(token, (intents) => prepararCliente(new Client({ intents })), INTENTS));
}
