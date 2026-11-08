// Lógica do bot: cargos de cor, botões, comando /cor e as ações usadas pelo painel web
import { createHash } from 'node:crypto';
import {
  AutoModerationActionType,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits as I,
  Guild,
  GuildFeature,
  MessageFlags,
  OAuth2Scopes,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
  SnowflakeUtil,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import * as dados from './dados.js';
import { extDoAnexo, lerAnexo, limparAnexos, podeEnviar, refsDeAnexo, salvarAnexo, usarDeposito } from './lib/anexos.js';
import { contarSpam, NATIVAS, NOMES, oqueDoAutomod, regraDoDiscord } from './lib/automod.js';
import { aniversariantesDoDia, lerAniversarios, lerData, lerDataEmBlocos, salvarAniversario, textoDoNiver, tirarAniversario } from './lib/aniversarios.js';
import { baixarImagem, desenharCard, desenharCardNiver } from './lib/card.js';
import { desenharCarteirinha, desenharFicha, nomeDoArquivo, tempoDeCasa } from './lib/carteirinha.js';
import { conectar } from './lib/conexao.js';
import { traduzirConfig } from './lib/copiar.js';
import { noServidor, servidorAtual } from './lib/contexto.js';
import { emojiDaCor } from './lib/emojis.js';
import { ligarPortaria } from './lib/eventos.js';
import { errosDaHierarquia, lerSeparador, listaDaHierarquia, PERMS, planejarHierarquia, posicoes } from './lib/hierarquia.js';
import { CARGOS_POR_BOTAO, CARGOS_SRV, CARGOS_STAFF, CATS_SRV, chave, formatarNome, planoDoModelo, SO_LEITURA } from './lib/servidor.js';
import { midia, PADROES } from './lib/imagens.js';
import { lerLink } from './lib/link.js';
import { anotar, ativos, consequencia, darAviso, filtrarMembros, lerAvisos, lerOcorrencias, linhaDoRegistro, marcarDesfeita, pagina, semPrazo, SILENCIOS, TIPOS, tirarAviso } from './lib/moderacao.js';
import { montarV2 } from './lib/mensagem.js';
import { paraAnunciar, pedacoDaNoticia } from './lib/noticias.js';
import { NOVIDADES } from './lib/novidades.js';
import { corDoBotao, errosDoPainel, pedacoDoPainel, REMOVER } from './lib/painel.js';
import { eventoDaPlaca, placaPronta } from './lib/placa.js';
import { duracaoTexto, pedacoDoEvento, preencher } from './lib/portaria.js';
import { lerRegistro, salvarRegistro } from './lib/registro.js';
import { escadaDePunicoes, ID_ACEITO, pedacoDasRegras, temRegras } from './lib/regras.js';
import { aplicarTema, hojeNoBrasil, horaNoBrasil, temaAtivo } from './lib/temas.js';
import { apagarEstatisticas, contarCor, contarMensagem as contarMensagemDaPessoa, entrouNaCall, fecharCalls, gravarEstatisticas, lerEstatisticas, saiuDaCall, somarEvento, tempoDeCall } from './lib/estatisticas.js';
import { apagarPerfil, DE_EVENTO, definirAnexo, favoritosPublicos, lerPerfis, ligarSteam, MEDALHAS, medalhasDe, mudarFavorito, mudarRede, lerVinculados, ligarSpotify, ligarTwitch, perfilDe, perfilGuardado, redesPublicas, salvarPerfil, textoDoAniversario, todosOsPerfis, vincularPerfil, visualDoPerfil } from './lib/perfil.js';
import { cartaoGuardado, esquecerCartao, esquecerOuvidas, faixaDoStatus, gravarOuvidas, idDoSpotify, mudouOuvindo, ouvindoAgora, perfilSpotify, temSpotify, temTwitch, ultimasOuvidas } from './lib/redes.js';
import { acharCapa, capaDaGaleria, capaPermitida, capaSugerida, podeProcurar, podeSugerir, sugerir, TIPOS_FAVORITOS } from './lib/capas.js';
import { abertosDe, APAGAR, arquivar, avaliar, estaParado, haQuanto, lerTickets, mediaDeResposta, nomeDoCanal, numero, PARADO, pedacoDaAvaliacao, pedacoDasBoasVindas, pedacoDoFechamento, pedacoDoPainelTickets, reservarNumero, salvarTickets, textoDaTranscricao, ticketDoCanal, transcricao } from './lib/tickets.js';
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
// Aba Cargos › Membros e Moderação (o painel avisa à parte se faltar)
const NOMES_MODERACAO = [
  [P.KickMembers, 'Expulsar membros'],
  [P.ModerateMembers, 'Silenciar membros'],
  [P.BanMembers, 'Banir membros'],
  [P.ManageGuild, 'Gerenciar servidor (auto-moderação)'],
  [P.ManageMessages, 'Gerenciar mensagens (anti-spam)'],
];
// Tickets: criar e apagar os canais privados
const NOMES_TICKETS = [[P.ManageChannels, 'Gerenciar canais (tickets)']];
// Regras: fixar a mensagem no canal (desde 2026 o Discord separou do "Gerenciar mensagens")
const NOMES_REGRAS = [[P.PinMessages, 'Fixar mensagens (regras)']];
export const PERMISSOES = [...NOMES_PERMISSOES, ...NOMES_MODERACAO, ...NOMES_TICKETS, ...NOMES_REGRAS].map(([p]) => p);

// Cargo com qualquer uma dessas permissões nunca é dado por botão (evita alguém virar admin sem querer)
const PERIGOSAS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageMessages,
  P.ManageWebhooks, P.KickMembers, P.BanMembers, P.ModerateMembers, P.MentionEveryone];

// Guilds = servidores, cargos e canais; Expressions = emojis do servidor; GuildModeration = bans e registro de
// auditoria (portaria); GuildMembers (privilegiada) = quem entra/sai e quem tem cada cor. Sem ela liberada no portal,
// o bot conecta sem (lib/conexao.js). GuildMessages = anti-spam (conta mensagens, não lê o texto);
// AutoModerationExecution = quando a AutoMod do Discord barra alguém (pra avisar/expulsar e anotar no livro).
// MessageContent (privilegiada) = o texto das mensagens na transcrição dos tickets; sem ela o bot conecta sem (lib/conexao.js).
// GuildVoiceStates = tempo em call (medalhas do perfil no site).
// GuildPresences (privilegiada) = o "Ouvindo Spotify" do status, só de quem ligou o Spotify no perfil; sem ela o bot conecta sem.
const INTENTS = [I.Guilds, I.GuildExpressions, I.GuildModeration, I.GuildMembers, I.GuildMessages, I.GuildVoiceStates, I.AutoModerationExecution, I.MessageContent, I.GuildPresences];

// Trocado no iniciarBot pelo cliente conectado (export let: quem importa vê o novo)
export let client = new Client({ intents: INTENTS });
let soPainel = false;
const temMembros = () => client.options.intents.has(I.GuildMembers);

const NO_AR_DESDE = new Date().toISOString(); // /saude: confere se o deploy novo já subiu
const comStatus = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const hexParaInt = (hex) => parseInt(hex.slice(1), 16);
const intParaHex = (n) => `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
const conviteDireto = () => client.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: PERMISSOES });
// O link que os sites mostram passa pelo /convite da API: ela monta o link do Discord na hora, pelo fluxo com código
// (o único que funciona com "Requires OAuth2 Code Grant" ligado no Developer Portal). Sem endereço público, o link direto.
const urlPublica = () => process.env.URL_PUBLICA || process.env.RENDER_EXTERNAL_URL || '';
const linkConvite = () => (urlPublica() ? new URL('/convite', urlPublica()).href : conviteDireto());

/** Servidor da vez (lib/contexto.js) ou o do id passado, se o bot estiver nele. @param {string | null} [id] */
function servidor(id = servidorAtual()) {
  return id && client.isReady() ? (client.guilds.cache.get(id) ?? null) : null;
}

/** Roda fn uma vez em cada servidor em que o bot está, cada um com os próprios dados. Erro em um não para os outros. */
async function paraCadaServidor(nome, fn) {
  if (!client?.isReady()) return;
  for (const guild of client.guilds.cache.values()) {
    await noServidor(guild.id, fn).catch((erro) => console.error(`${nome} (${guild.name}):`, explicarErro(erro)));
  }
}

/** Cada evento do cliente roda dentro do servidor de onde veio (lib/contexto.js): config, perfis, tickets... são os dele */
export function eventosPorServidor(c) {
  const emitir = c.emit.bind(c);
  c.emit = (evento, ...args) => {
    const id = servidorDoEvento(args);
    return id ? noServidor(id, () => emitir(evento, ...args)) : emitir(evento, ...args);
  };
  return c;
}

/** De que servidor veio um evento do Discord (interação, mensagem, membro, call, ban, auditoria, o próprio servidor) */
export function servidorDoEvento(args) {
  for (const a of args) {
    if (!a || typeof a !== 'object') continue;
    if (a instanceof Guild) return a.id;
    const id = a.guildId ?? a.guild?.id;
    if (typeof id === 'string') return id;
  }
  return null;
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
  if (alvo && !tirar && !membro.roles.cache.has(alvoId)) {
    await membro.roles.add(alvo, 'Escolheu cor');
    contarCor(membro.id);
  }

  const { ganhou, removeu } = dados.config().mensagens;
  const resposta = tirar ? removeu.replaceAll('{cor}', tiradas.join(' e ') || 'a cor') : ganhou.replaceAll('{cor}', `<@&${alvoId}>`);
  await interacao.editReply({ content: resposta, allowedMentions: { parse: [] } });
}

/** @param {import('discord.js').Interaction} interacao */
async function responderInteracao(interacao) {
  // Avaliação do ticket chega pela DM (fora do servidor)
  if (interacao.isButton() && interacao.customId.startsWith('tkn:')) return avaliarTicket(interacao).catch((erro) => console.error('Avaliação:', erro.message));
  if (!interacao.inCachedGuild()) return;
  if (ehDeTicket(interacao)) return responderTicket(interacao).catch((erro) => console.error('Ticket:', erro));
  if (interacao.isChatInputCommand() && interacao.commandName === 'medalha') return responderMedalha(interacao);
  if (interacao.isButton() && interacao.customId.startsWith('priv:apagar:')) return apagarMeusDados(interacao).catch((erro) => console.error('Privacidade:', erro));
  if (interacao.isButton() && interacao.customId === ID_ACEITO) return aceitarRegras(interacao);
  if (interacao.isButton() && interacao.customId.startsWith('jogo:')) return alternarCargoDeJogo(interacao);
  const outro = interacao.isChatInputCommand() && {
    perfil: responderPerfil,
    medalhas: responderMedalhas,
    tema: responderTema,
    privacidade: responderPrivacidade,
    painel: responderPainel,
    regras: responderRegras,
    trofeus: (i) => responderFicha(i, 'trofeus'),
    favoritos: (i) => responderFicha(i, 'favoritos'),
    redes: (i) => responderFicha(i, 'redes'),
  }[interacao.commandName];
  if (outro) return outro(interacao).catch((erro) => console.error(`/${interacao.commandName}:`, erro));
  // Aniversário: botão abre o formulário; formulário e /aniversario cadastram
  if (interacao.isButton() && interacao.customId === 'niver:cadastrar') return interacao.showModal(formularioNiver()).catch((erro) => console.error('Formulário:', erro.message));
  const niverForm = interacao.isModalSubmit() && interacao.customId === 'niver:modal';
  // /aniversario-apagar e o /aniversario sem subcomando são da versão antiga (cliente com o comando velho em cache)
  const niverCmd = interacao.isChatInputCommand() && ['aniversario', 'aniversario-apagar'].includes(interacao.commandName);
  const sub = niverCmd && interacao.commandName === 'aniversario' ? interacao.options.getSubcommand(false) : null;
  if (sub === 'ver') return responderFicha(interacao, 'niver').catch((erro) => console.error('/aniversario ver:', erro));
  if (niverForm || niverCmd) {
    try {
      await interacao.deferReply({ flags: MessageFlags.Ephemeral });
      if (sub === 'apagar' || (niverCmd && interacao.commandName === 'aniversario-apagar')) {
        await tirarAniversario(interacao.user.id);
        await interacao.editReply('Tirei seu aniversário da lista.');
      } else {
        const campo = niverForm ? (id) => interacao.fields.getTextInputValue(id) : (id) => interacao.options.getInteger(id);
        await cadastrarNiver(interacao, { dia: campo('dia'), mes: campo('mes'), ano: campo('ano') });
      }
    } catch (erro) {
      console.error('Erro no cadastro de aniversário:', erro);
    }
    return;
  }
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
export async function montarMensagem(guild, cfg = dados.config(), temaEscolhido) {
  // Menção de cargo aparece com a cor do cargo; allowedMentions vazio garante que não marca ninguém
  const mencao = (cor) => (cor.cargoId && guild.roles.cache.has(cor.cargoId) ? `<@&${cor.cargoId}>` : `**${cor.nome}**`);
  // Data festiva no ar: banner, miniatura e cor do tema, com a frase em cima do texto
  const tema = aplicarTema('painel', cfg.painel.imgs, temaEscolhido ?? temaDeHoje(cfg), cfg.temas.respeitar);
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
    // Data em blocos: dia DD, mês MM e ano AAAA (opcional). "ver" responde com imagem, do jeito que a pessoa deixou ver.
    new SlashCommandBuilder()
      .setName('aniversario')
      .setDescription('Seu aniversário: cadastrar, ver ou apagar')
      .addSubcommand((s) =>
        s
          .setName('cadastrar')
          .setDescription('Cadastra o seu aniversário: dia, mês e ano (o ano é opcional)')
          .addIntegerOption((o) => o.setName('dia').setDescription('Dia em que você nasceu (DD), tipo 14').setRequired(true).setMinValue(1).setMaxValue(31))
          .addIntegerOption((o) => o.setName('mes').setDescription('Mês (MM), tipo 05').setRequired(true).setMinValue(1).setMaxValue(12))
          .addIntegerOption((o) => o.setName('ano').setDescription('Ano (AAAA), tipo 2003. Opcional: sem ano a mensagem sai sem idade').setMinValue(1900).setMaxValue(hojeNoBrasil().ano)),
      )
      .addSubcommand((s) => s.setName('ver').setDescription('Mostra o aniversário (se a pessoa deixou ver)').addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')))
      .addSubcommand((s) => s.setName('apagar').setDescription('Tira o seu aniversário da lista'))
      .toJSON(),
    comandoTicket(cfg),
    new SlashCommandBuilder()
      .setName('medalha')
      .setDescription('Dá (ou tira) medalha de evento no perfil do site (staff)')
      .addUserOption((o) => o.setName('membro').setDescription('Quem ganha').setRequired(true))
      .addStringOption((o) => o.setName('medalha').setDescription('Qual medalha').setRequired(true).addChoices(...MEDALHAS.filter((m) => DE_EVENTO.includes(m.id)).map((m) => ({ name: m.nome, value: m.id }))))
      .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantas vezes (negativo tira; padrão 1)').setMinValue(-10).setMaxValue(10))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('perfil')
      .setDescription('Mostra a carteirinha com banner, foto e medalhas')
      .addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)'))
      .addBooleanOption((o) => o.setName('completo').setDescription('Tudo: aniversário, redes, favoritos e troféus (só o que a pessoa deixou ver)'))
      .toJSON(),
    new SlashCommandBuilder().setName('trofeus').setDescription('Medalhas e troféus do servidor, em imagem').addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')).toJSON(),
    new SlashCommandBuilder().setName('favoritos').setDescription('Jogos, filmes, livros e músicas favoritos, em imagem').addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')).toJSON(),
    new SlashCommandBuilder().setName('redes').setDescription('As redes vinculadas (Steam, Spotify, Twitch, Letterboxd, Instagram), em imagem').addUserOption((o) => o.setName('membro').setDescription('De quem (padrão: você)')).toJSON(),
    new SlashCommandBuilder().setName('medalhas').setDescription('Lista as suas medalhas e o que falta').toJSON(),
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Link do painel do site (notícias, membros e seu perfil)')
      .addBooleanOption((o) => o.setName('mostrar').setDescription('Mandar no canal pra todo mundo ver (padrão: só pra você)'))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('tema')
      .setDescription('Datas festivas (staff)')
      .addSubcommand((s) => s.setName('simular').setDescription('Prévia de uma festa antes da data (só pra você)').addStringOption((o) => o.setName('festa').setDescription('Qual').setRequired(true).addChoices(...cfg.temas.lista.slice(0, 25).map((t) => ({ name: t.nome.slice(0, 100), value: t.id })))))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('privacidade')
      .setDescription('Seus dados no Manda Chuva')
      .addSubcommand((s) => s.setName('ver').setDescription('Mostra o que o bot guarda de você'))
      .addSubcommand((s) => s.setName('apagar').setDescription('Apaga seu aniversário, perfil e medalhas'))
      .toJSON(),
    // /regras só aparece depois que a staff publica as regras (e se deixou ligado)
    ...(cfg.regras.cmd && lerRegistro().regrasMsg ? [new SlashCommandBuilder().setName('regras').setDescription('Mostra as regras do servidor (só pra você)').toJSON()] : []),
  ];
}

/** /ticket com os motivos ligados como opções do "abrir" */
function comandoTicket(cfg) {
  const motivos = cfg.tickets.motivos
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.on)
    .slice(0, 25)
    .map(({ m, i }) => ({ name: (m.emoji.startsWith('<') ? m.nome : `${m.emoji} ${m.nome}`).slice(0, 100), value: String(i) }));
  return new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Tickets: abrir, fechar e cuidar do atendimento')
    .addSubcommand((s) => s.setName('abrir').setDescription('Abre um ticket sem precisar do botão').addStringOption((o) => o.setName('motivo').setDescription('Qual o motivo?').setRequired(true).addChoices(...motivos)))
    .addSubcommand((s) => s.setName('fechar').setDescription('Fecha o ticket, salva a transcrição e apaga o canal').addStringOption((o) => o.setName('motivo').setDescription('Por que está fechando (opcional)').setMaxLength(200)))
    .addSubcommand((s) => s.setName('add').setDescription('Coloca alguém na conversa (staff)').addUserOption((o) => o.setName('membro').setDescription('Quem entra').setRequired(true)))
    .addSubcommand((s) => s.setName('remover').setDescription('Tira alguém do ticket (staff)').addUserOption((o) => o.setName('membro').setDescription('Quem sai').setRequired(true)))
    .addSubcommand((s) => s.setName('assumir').setDescription('Você vira o responsável pelo ticket (staff)'))
    .addSubcommand((s) => s.setName('renomear').setDescription('Muda o nome do canal do ticket (staff)').addStringOption((o) => o.setName('nome').setDescription('Nome novo').setRequired(true).setMaxLength(40)))
    .addSubcommand((s) => s.setName('painel').setDescription('Manda (ou reenvia) o painel com o menu (admin)').addChannelOption((o) => o.setName('canal').setDescription('Onde (padrão: aqui)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('config').setDescription('Link das configurações no site'))
    .toJSON();
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

// ---------- Fotos de perfil (painel) ----------
const semFoto = new Set(); // contas apagadas: não busca de novo

/**
 * Nome atual e foto de cada pessoa da lista. Quem não está no cache é buscado uma vez (até 25 por vez,
 * pra não travar o painel); o discord.js guarda no cache e na próxima já vem.
 */
async function comFoto(guild, lista) {
  const faltam = lista.filter((p) => !guild.members.cache.has(p.userId) && !client.users.cache.has(p.userId) && !semFoto.has(p.userId)).slice(0, 25);
  await Promise.all(faltam.map((p) => client.users.fetch(p.userId).catch(() => semFoto.add(p.userId))));
  return lista.map((p) => {
    const quem = guild.members.cache.get(p.userId) ?? client.users.cache.get(p.userId);
    return { ...p, nome: guild.members.cache.get(p.userId)?.displayName ?? p.nome, avatar: quem?.displayAvatarURL({ size: 64 }) ?? null };
  });
}

// ---------- Membros e moderação (aba Cargos) ----------
const POR_PAINEL = 'pelo painel';

/** Membro do jeito que a aba Membros mostra */
function descreverMembro(m, avisos = lerAvisos(), agora = Date.now()) {
  const ate = m.communicationDisabledUntilTimestamp;
  return {
    id: m.id,
    nome: m.displayName,
    usuario: m.user.username,
    avatar: m.displayAvatarURL({ size: 64 }),
    entrou: m.joinedTimestamp,
    cargos: [...m.roles.cache.values()].filter((r) => r.id !== m.guild.id).sort((a, b) => b.position - a.position).map((r) => r.id),
    cor: m.displayColor ? intParaHex(m.displayColor) : null,
    avisos: ativos(avisos, m.id, agora).length,
    silenciadoAte: ate && ate > agora ? ate : null,
    semPrazo: (lerRegistro().semPrazo ?? []).includes(m.id),
    bot: m.user.bot,
    podeSilenciar: m.moderatable,
    podeExpulsar: m.kickable,
  };
}

/** Anota no livro e manda a linha pro canal de registros (se tiver um) */
async function registrar(guild, o) {
  const canalId = dados.config().moderacao.canalId;
  const canal = canalId ? guild.channels.cache.get(canalId) : null;
  if (canal?.isTextBased()) await canal.send({ content: linhaDoRegistro(o), allowedMentions: { parse: [] } }).catch((erro) => console.error('Canal de registros:', explicarErro(erro)));
  return o;
}

/** Expulsão, ban ou silêncio feito por alguém no Discord */
async function anotarDoDiscord(tipo, d) {
  const user = d.usuario ?? (await client.users.fetch(d.alvoId).catch(() => null));
  if (!user) return;
  const executor = d.executorId ? await d.guild.members.fetch(d.executorId).catch(() => null) : null;
  const motivo = d.motivo ? `: ${d.motivo}` : '';
  const oque = tipo === 'ban' ? `foi banido${motivo}` : tipo === 'expulsao' ? `foi expulso${motivo}` : `foi silenciado por ${duracaoTexto(d.ate.getTime() - Date.now())}${motivo}`;
  await registrar(d.guild, anotar({
    tipo: TIPOS[tipo], userId: user.id, nome: user.globalName ?? user.username, oque,
    por: executor ? `por ${executor.displayName}` : 'pelo Discord',
    desfazer: tipo === 'ban' ? 'ban' : tipo === 'silencio' ? 'silencio' : null,
  }));
}

/** Erro do Discord vira erro 400 com a explicação em português */
const noDiscord = (promessa) => promessa.catch((erro) => { throw comStatus(400, explicarErro(erro)); });

/** Silencia por ms (o motivo vai pro registro de auditoria) */
async function silenciar(guild, membro, ms, texto, motivo, por) {
  if (!membro.moderatable) throw comStatus(400, `Não consigo silenciar ${membro.displayName}: é admin, dono do servidor ou está acima do meu cargo.`);
  await noDiscord(membro.timeout(ms, motivo || 'Painel do Manda Chuva'));
  await registrar(guild, anotar({ tipo: TIPOS.silencio, userId: membro.id, nome: membro.displayName, oque: `foi silenciado ${texto === SILENCIOS.sem[1] ? texto : `por ${texto}`}${motivo ? `: ${motivo}` : ''}`, por, desfazer: 'silencio' }));
}

async function expulsar(guild, membro, motivo, por) {
  if (!membro.kickable) throw comStatus(400, `Não consigo expulsar ${membro.displayName}: é admin, dono do servidor ou está acima do meu cargo.`);
  await noDiscord(membro.kick(motivo || 'Painel do Manda Chuva'));
  await registrar(guild, anotar({ tipo: TIPOS.expulsao, userId: membro.id, nome: membro.displayName, oque: `foi expulso${motivo ? `: ${motivo}` : ''}`, por }));
}

/** Aviso + o que acontece ao chegar no limite (silenciar 1 h ou expulsar). Devolve o texto pro painel. */
async function avisar(guild, membro, motivo, por) {
  const regras = dados.config().moderacao;
  const a = darAviso({ userId: membro.id, nome: membro.displayName, motivo, por });
  const qtd = ativos(lerAvisos(), membro.id).length;
  const conta = `${qtd}${regras.expulsar ? `/${regras.expulsar}` : ''}`;
  await registrar(guild, anotar({ tipo: TIPOS.aviso, userId: membro.id, nome: membro.displayName, oque: `levou um aviso${motivo ? `: ${motivo}` : ''} (${conta})`, por, desfazer: `aviso:${a.id}` }));
  await membro.send(`⚠️ Você levou um aviso no servidor **${guild.name}**${motivo ? `: ${motivo}` : ''}. Avisos valendo: ${conta}. Cada aviso some depois de 30 dias.`).catch(() => {});
  return (await depoisDoAviso(guild, membro, qtd, conta)) ?? `${membro.displayName} levou um aviso (${conta}).`;
}

/** Chegou no limite de avisos: silencia 1 h ou expulsa. Devolve o texto pro painel (null = nada aconteceu). */
async function depoisDoAviso(guild, membro, qtd, conta) {
  // O aviso já valeu; se a consequência falhar, o painel conta as duas coisas
  const c = consequencia(qtd, dados.config().moderacao);
  try {
    if (c === 'expulsar' && membro.kickable) {
      await expulsar(guild, membro, `Juntou ${qtd} avisos`, 'automático');
      return `${membro.displayName} levou o aviso ${conta} e foi expulso.`;
    }
    if (c === 'silenciar' && membro.moderatable) {
      await silenciar(guild, membro, SILENCIOS['1h'][0], SILENCIOS['1h'][1], `Juntou ${qtd} avisos`, 'automático');
      return `${membro.displayName} levou o aviso ${conta} e ficou 1 hora em silêncio.`;
    }
  } catch (erro) {
    return `${membro.displayName} levou o aviso ${conta}, mas não consegui ${c === 'expulsar' ? 'expulsar' : 'silenciar'}: ${erro.message}`;
  }
  return null;
}

// ---------- Silêncio sem prazo ----------
/** Põe ou tira a pessoa da lista do silêncio sem prazo (fica no registro) */
async function marcarSemPrazo(userId, sim) {
  const lista = lerRegistro().semPrazo ?? [];
  if (sim === lista.includes(userId)) return;
  await salvarRegistro({ semPrazo: sim ? [...lista, userId] : lista.filter((id) => id !== userId) });
}

/**
 * O Discord só silencia 28 dias por vez: renova antes de acabar. Quem teve o silêncio tirado no Discord
 * sai da lista; quem saiu do servidor fica (se voltar, o silêncio volta junto).
 */
async function cuidarDosSilencios(guild) {
  const lista = lerRegistro().semPrazo ?? [];
  const fica = [];
  for (const userId of lista) {
    const membro = await guild.members.fetch(userId).catch(() => null);
    if (!membro) {
      fica.push(userId);
      continue;
    }
    const s = semPrazo(membro.communicationDisabledUntilTimestamp);
    if (s === 'acabou') continue;
    fica.push(userId);
    if (s === 'renovar' && membro.moderatable) await membro.timeout(SILENCIOS.sem[0], 'Silêncio sem prazo (renovado)').catch((erro) => console.error('Silêncio sem prazo:', explicarErro(erro)));
  }
  if (fica.length !== lista.length) await salvarRegistro({ semPrazo: fica });
}

/** Saiu e voltou pra fugir do silêncio sem prazo: volta silenciado */
async function voltouSilenciado(membro) {
  if (soPainel || membro.guild.id !== dados.config().servidorId || !(lerRegistro().semPrazo ?? []).includes(membro.id) || !membro.moderatable) return;
  await membro.timeout(SILENCIOS.sem[0], 'Voltou com silêncio sem prazo');
}

/** A cada 6 horas: tira imagens sem uso e, em cada servidor, renova silêncios sem prazo e atualiza as regras do auto-mod (convites novos) */
async function manutencao() {
  await vestirMascote();
  if (soPainel) return;
  await limparImagens();
  await paraCadaServidor('Manutenção', manutencaoDoServidor);
}
async function manutencaoDoServidor() {
  const guild = servidor();
  if (!guild) return;
  await cuidarDosSilencios(guild);
  const rel = [];
  await sincronizarAutomod(guild, dados.config(), rel);
  if (rel.length) console.log('Auto-mod:', rel.join(' | '));
}

// Foto e banner do perfil do bot = o mascote do redesign. Troca uma vez só (o Discord limita trocas de avatar);
// se as imagens ainda não estiverem no site (a interface sobe depois do bot), tenta de novo na próxima manutenção.
const VISUAL = 'mascote-1';
async function vestirMascote() {
  if (soPainel || !client.isReady() || lerRegistro().visual === VISUAL) return;
  try {
    await client.user.setAvatar(midia('banners/bot/mascote.png').url);
    await client.user.setBanner(midia('banners/bot/banner.png').url);
    await salvarRegistro({ visual: VISUAL });
    console.log('🧢 Foto e banner do bot trocados pelo mascote.');
  } catch (erro) {
    console.error('Não consegui trocar a foto do bot (tento de novo depois):', explicarErro(erro));
  }
}

// ---------- Auto-moderação ----------
/** Depois que a mensagem foi barrada: anota no livro e avisa, silencia ou expulsa conforme a regra */
async function punirPeloAutomod(guild, membro, tipo, acao, n) {
  let desfazer = null;
  if (acao === 'avisar') desfazer = `aviso:${darAviso({ userId: membro.id, nome: membro.displayName, motivo: `auto-mod: ${NOMES[tipo]}`, por: 'auto-mod' }).id}`;
  if (acao === 'silenciar') {
    desfazer = 'silencio';
    // Nas regras do Discord o castigo de 10 min já vem junto; no anti-spam quem dá é o bot
    if (tipo === 'spam' && membro.moderatable) await membro.timeout(600_000, 'Auto-mod: anti-spam').catch((erro) => console.error('Anti-spam:', explicarErro(erro)));
  }
  await registrar(guild, anotar({ tipo: TIPOS.automod, userId: membro.id, nome: membro.displayName, oque: oqueDoAutomod(tipo, acao, n), por: `auto-mod · ${NOMES[tipo].toLowerCase()}`, desfazer }));
  if (acao === 'expulsar' && membro.kickable) await membro.kick(`Auto-mod: ${NOMES[tipo]}`).catch((erro) => console.error('Auto-mod:', explicarErro(erro)));
  if (acao === 'avisar') {
    const regras = dados.config().moderacao;
    const qtd = ativos(lerAvisos(), membro.id).length;
    await depoisDoAviso(guild, membro, qtd, `${qtd}${regras.expulsar ? `/${regras.expulsar}` : ''}`);
  }
}

/** Convites do próprio servidor: liberados na regra de convites */
async function convitesDaCasa(guild) {
  const codigos = new Set(guild.vanityURLCode ? [guild.vanityURLCode] : []);
  const convites = await guild.invites.fetch().catch(() => null);
  convites?.forEach((c) => codigos.add(c.code));
  return [...codigos];
}

/**
 * Cria, atualiza ou apaga as regras "Manda Chuva · …" na AutoMod do Discord conforme a aba Moderação.
 * Os ids ficam no registro; só edita quando alguma coisa da regra mudou.
 */
async function sincronizarAutomod(guild, cfg, rel) {
  const am = cfg.moderacao.automod;
  const antes = lerRegistro().automod ?? {};
  if (!NATIVAS.some((k) => am[k].on || antes[k])) return;
  if (!guild.members.me?.permissions.has(P.ManageGuild)) {
    if (NATIVAS.some((k) => am[k].on)) rel.push('⚠️ Auto-moderação: o bot precisa da permissão "Gerenciar servidor" pra criar as regras.');
    return;
  }
  const motivo = 'Painel: auto-moderação';
  try {
    const existentes = await guild.autoModerationRules.fetch();
    // Moderação não leva bronca do auto-mod (admin o Discord já deixa de fora)
    const isentos = guild.roles.cache
      .filter((r) => r.id !== guild.id && !r.permissions.has(P.Administrator) && r.permissions.any([P.ManageMessages, P.ModerateMembers, P.KickMembers, P.BanMembers]))
      .map((r) => r.id);
    const convites = am.convites.on ? await convitesDaCasa(guild) : [];
    const depois = { ...antes };
    for (const k of NATIVAS) {
      // Se o registro se perdeu, acha a regra pelo nome (senão criava outra igual)
      const atual = (antes[k] && existentes.get(antes[k].id)) || existentes.find((r) => r.creatorId === client.user.id && r.name === `Manda Chuva · ${NOMES[k]}`);
      try {
        const ligar = am[k].on && !(k === 'palavrao' && !cfg.moderacao.palavras.length);
        if (am[k].on && !ligar) rel.push('⚠️ Filtro de palavrões ligado, mas a lista está vazia: não criei a regra.');
        if (!ligar) {
          if (atual) await atual.delete(motivo);
          delete depois[k];
          continue;
        }
        const regra = regraDoDiscord(k, { acao: am[k].acao, palavras: cfg.moderacao.palavras, convites, isentos });
        const marca = JSON.stringify(regra);
        if (atual && antes[k]?.id === atual.id && antes[k].marca === marca) continue;
        // O tipo do gatilho não muda depois de criada
        const { triggerType, ...semGatilho } = regra;
        const feita = atual ? await atual.edit({ ...semGatilho, reason: motivo }) : await guild.autoModerationRules.create({ ...regra, reason: motivo });
        depois[k] = { id: feita.id, marca };
        rel.push(`Auto-mod: ${NOMES[k]} ${atual ? 'atualizado' : 'ligado'}.`);
      } catch (erro) {
        rel.push(`⚠️ Auto-mod (${NOMES[k]}): ${explicarErro(erro)}`);
      }
    }
    await salvarRegistro({ automod: depois });
  } catch (erro) {
    rel.push(`⚠️ Auto-moderação: ${explicarErro(erro)}`);
  }
}

/** A AutoMod do Discord barrou alguém numa regra nossa */
async function tratarAutomod(ex) {
  // Cada regra manda um evento por ação: só o de "bloquear mensagem" conta
  if (ex.action.type !== AutoModerationActionType.BlockMessage) return;
  const cfg = dados.config();
  if (soPainel || ex.guild.id !== cfg.servidorId) return;
  const regras = lerRegistro().automod ?? {};
  const tipo = NATIVAS.find((k) => regras[k]?.id === ex.ruleId);
  if (!tipo || !cfg.moderacao.automod[tipo].on) return;
  const membro = ex.member ?? (await ex.guild.members.fetch(ex.userId).catch(() => null));
  if (membro) await punirPeloAutomod(ex.guild, membro, tipo, cfg.moderacao.automod[tipo].acao);
}

// Anti-spam: 5 mensagens em 3 segundos (não precisa ler o texto)
const janelasSpam = new Map();
async function contarMensagem(msg) {
  if (soPainel || !msg.inGuild() || msg.author.bot || msg.webhookId) return;
  const cfg = dados.config();
  const regra = cfg.moderacao.automod.spam;
  if (!regra.on || msg.guildId !== cfg.servidorId) return;
  const membro = msg.member;
  if (!membro || membro.id === msg.guild.ownerId || membro.permissions.has(P.ManageMessages)) return;
  const rajada = contarSpam(janelasSpam, { id: msg.id, canalId: msg.channelId, userId: msg.author.id }, Date.now());
  if (!rajada) return;
  const porCanal = new Map();
  for (const m of rajada) porCanal.set(m.canalId, [...(porCanal.get(m.canalId) ?? []), m.id]);
  for (const [canalId, ids] of porCanal) {
    const canal = msg.guild.channels.cache.get(canalId);
    if (canal?.isTextBased()) await canal.bulkDelete(ids, true).catch((erro) => console.error('Anti-spam:', explicarErro(erro)));
  }
  await punirPeloAutomod(msg.guild, membro, 'spam', regra.acao, rajada.length);
}

/** Ações da aba Membros: dar/tirar cargo, avisar, silenciar, tirar o silêncio e expulsar */
async function moderar(guild, membro, { acao, cargoId, motivo, duracao, por = POR_PAINEL }) {
  if (membro.id === client.user.id) throw comStatus(400, 'Em mim não, né.');
  if (acao === 'dar' || acao === 'tirar') {
    const cargo = guild.roles.cache.get(String(cargoId ?? ''));
    if (!cargo || cargo.id === guild.id) throw comStatus(400, 'Esse cargo não existe mais: atualize a página.');
    if (!cargo.editable) throw comStatus(400, `Não consigo mexer em "${cargo.name}": ${cargo.managed ? 'é de uma integração' : 'está acima do meu cargo'}.`);
    if (acao === 'tirar') {
      await noDiscord(membro.roles.remove(cargo, 'Painel do Manda Chuva'));
      return `Tirei ${cargo.name} de ${membro.displayName}.`;
    }
    // Cor nova: tira as outras cores, igual ao botão do painel
    const cores = new Set(dados.config().cores.map((c) => c.cargoId).filter(Boolean));
    const outras = cores.has(cargo.id) ? [...membro.roles.cache.keys()].filter((id) => cores.has(id) && id !== cargo.id) : [];
    if (outras.length) await noDiscord(membro.roles.remove(outras, 'Painel do Manda Chuva: trocou de cor'));
    await noDiscord(membro.roles.add(cargo, 'Painel do Manda Chuva'));
    return `${membro.displayName} ganhou ${cargo.name}.`;
  }
  if (acao === 'avisar') return avisar(guild, membro, motivo, por);
  if (acao === 'silenciar') {
    const [ms, texto] = SILENCIOS[duracao] ?? SILENCIOS['10min'];
    await silenciar(guild, membro, ms, texto, motivo, por);
    await marcarSemPrazo(membro.id, duracao === 'sem');
    if (duracao === 'sem') return `${membro.displayName} ficou em silêncio sem prazo (até alguém tirar).`;
    return `${membro.displayName} ficou em silêncio por ${texto}.`;
  }
  if (acao === 'dessilenciar') {
    await noDiscord(membro.timeout(null, 'Painel do Manda Chuva'));
    await marcarSemPrazo(membro.id, false);
    return `${membro.displayName} pode falar de novo.`;
  }
  if (acao === 'expulsar') {
    await expulsar(guild, membro, motivo, por);
    return `${membro.displayName} foi expulso.`;
  }
  throw comStatus(400, 'Ação desconhecida.');
}

// ---------- Hierarquia (aba Cargos) ----------
/** Cargos do servidor do jeito que o lib/hierarquia.js entende (sem o @everyone) */
function descreverCargos(guild) {
  return guild.roles.cache
    .filter((r) => r.id !== guild.id)
    .map((r) => ({
      id: r.id,
      nome: r.name,
      posicao: r.position,
      cor: r.colors.primaryColor,
      bits: r.permissions.bitfield,
      hoist: r.hoist,
      mencionavel: r.mentionable,
      gerenciado: !r.managed ? null : r.tags?.botId ? 'bot' : r.tags?.premiumSubscriberRole ? 'impulso' : 'integracao',
      membros: temMembros() ? r.members.size : null,
    }));
}

/** Das permissões do painel, as que o bot tem (só dá pra dar o que ele mesmo tem) */
const permsDoBot = (eu) => PERMS.filter(([, b]) => eu?.permissions.has(b));

/**
 * Aplica a hierarquia editada no painel ({ lista, apagar }). Sem edição, só junta os cargos de cor
 * num bloco na ordem da aba Cores (cor nova entra no bloco em vez de ficar lá embaixo).
 */
async function aplicarHierarquia(guild, cfg, editada, rel) {
  const eu = guild.members.me;
  if (!eu?.permissions.has(P.ManageRoles)) {
    if (editada) rel.push('⚠️ Não mexi na hierarquia: estou sem a permissão "Gerenciar cargos".');
    return;
  }
  const motivo = 'Painel: hierarquia de cargos';
  const tentar = (promessa, ok, nome) => promessa.then(ok, (erro) => rel.push(`⚠️ ${nome}: ${explicarErro(erro)}`));
  try {
    await guild.roles.fetch();
    const plano = planejarHierarquia({
      atual: descreverCargos(guild),
      editada,
      botId: eu.roles.highest.id,
      idsDeCor: cfg.cores.map((c) => c.cargoId).filter(Boolean),
      permsDoBot: permsDoBot(eu).reduce((s, [, b]) => s | b, 0n),
    });
    rel.push(...plano.avisos);
    for (const id of plano.apagar) {
      const nome = guild.roles.cache.get(id)?.name ?? id;
      await tentar(guild.roles.delete(id, motivo), () => rel.push(`Cargo apagado: ${nome}`), nome);
    }
    for (const e of plano.editar) await tentar(guild.roles.edit(e.id, { ...e.dados, reason: motivo }), () => rel.push(`Cargo atualizado: ${e.nome}`), e.nome);
    const criados = new Map();
    for (const c of plano.criar) {
      await tentar(guild.roles.create({ ...c.dados, reason: motivo }), (r) => { criados.set(c.chave, r.id); rel.push(`Cargo criado: ${c.nome}`); }, c.nome);
    }
    if (plano.criar.length || plano.apagar.length) await guild.roles.fetch();
    const pos = posicoes(plano.ordem.map((id) => criados.get(id) ?? id), descreverCargos(guild));
    if (pos.length) {
      await guild.roles.setPositions(pos.map((p) => ({ role: p.id, position: p.position })));
      rel.push('Ordem dos cargos atualizada.');
    }
  } catch (erro) {
    rel.push(`⚠️ Hierarquia: ${explicarErro(erro)}`);
  }
}

// ---------- Aniversários ----------
const NOME_CARGO_NIVER = 'Aniversariante do dia';
const DIA = 24 * 60 * 60 * 1000;

/** Cadastra pelo /aniversario ou pelo formulário do botão do painel. blocos = { dia, mes, ano } */
async function cadastrarNiver(interacao, blocos) {
  const lida = lerDataEmBlocos(blocos, hojeNoBrasil());
  if (lida.erro) return interacao.editReply(`⚠️ ${lida.erro}`);
  await salvarAniversario({ userId: interacao.user.id, nome: interacao.member.displayName, d: lida.d, ano: lida.ano });
  return interacao.editReply(`Anotado! Seu aniversário é ${lida.d}${lida.ano ? `/${lida.ano}` : ''}. 🎂 Quem vê no perfil você escolhe em Meu perfil, no site. Pra tirar: \`/aniversario apagar\`.`);
}

const formularioNiver = () =>
  new ModalBuilder()
    .setCustomId('niver:modal')
    .setTitle('Seu aniversário')
    .addLabelComponents(
      bloco('dia', 'Dia (DD)', '14', 2, true),
      bloco('mes', 'Mês (MM)', '05', 2, true),
      bloco('ano', 'Ano (AAAA)', '2003', 4, false).setDescription('Opcional. Sem ano, a mensagem sai sem idade.'),
    );

/** Campo do formulário de aniversário: um bloco da data */
function bloco(id, rotulo, exemplo, tamanho, obrigatorio) {
  const campo = new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setPlaceholder(exemplo).setRequired(obrigatorio).setMinLength(obrigatorio ? 1 : 0).setMaxLength(tamanho);
  return new LabelBuilder().setLabel(rotulo).setTextInputComponent(campo);
}

/** Cargo "Aniversariante do dia" (cria se não existe) */
async function cargoAniversariante(guild) {
  const reg = lerRegistro();
  let cargo = (reg.cargoNiverId && guild.roles.cache.get(reg.cargoNiverId)) || guild.roles.cache.find((r) => r.name === NOME_CARGO_NIVER);
  if (!cargo) cargo = await guild.roles.create({ name: NOME_CARGO_NIVER, colors: { primaryColor: 0xf2c14e }, hoist: true, permissions: [], reason: 'Aniversários do Manda Chuva' });
  if (reg.cargoNiverId !== cargo.id) await salvarRegistro({ cargoNiverId: cargo.id });
  return cargo;
}

async function postarAniversario(guild, canal, p, hoje) {
  const membro = await guild.members.fetch(p.userId).catch(() => null);
  if (!membro) return; // saiu do servidor
  const n = dados.config().niver;
  const vars = { usuario: `<@${p.userId}>`, nome: membro.displayName, servidor: guild.name, idade: p.ano ? hoje.ano - p.ano : null };
  const noCard = { ...vars, usuario: vars.nome };
  const m = midia(n.fundo || 'banners/card-confete.gif');
  const fundo = m?.anexo ? (await lerAnexo(m.anexo).catch(() => null))?.buffer : m?.url ? await baixarImagem(m.url) : null;
  const avatar = await baixarImagem(membro.displayAvatarURL({ extension: 'png', size: 256 }));
  const png = await desenharCardNiver({ fundo, avatar, nome: membro.displayName, topo: textoDoNiver(n.topo, noCard, n.idade), baixo: textoDoNiver(n.baixo, noCard, n.idade) }).catch(() => null);
  let abaixo;
  if (n.cargo) {
    const cargo = await cargoAniversariante(guild).catch((erro) => console.error('Cargo de aniversário:', explicarErro(erro)));
    if (cargo && (await membro.roles.add(cargo, 'Aniversário').then(() => true, () => false))) {
      await salvarRegistro({ niverCargos: [...(lerRegistro().niverCargos ?? []), { userId: p.userId, ate: Date.now() + DIA }] });
      abaixo = `-# ${membro.displayName} ganhou o cargo <@&${cargo.id}> por 24 horas.`;
    }
  }
  const msg = montarV2({ fora: textoDoNiver(n.msg, vars, n.idade), card: png ? 'attachment://card.png' : undefined, abaixo, arquivos: png ? [{ attachment: png, name: 'card.png' }] : [], mencoes: { users: [p.userId] } });
  await canal.send(msg);
  if (n.dm) await membro.send({ ...msg, allowedMentions: { parse: [] } }).catch(() => {});
}

/** A cada 10 min: tira o cargo de quem já passou 24 h e, depois do horário escolhido, posta os aniversários do dia (uma vez) */
async function conferirAniversarios() {
  const guild = servidor();
  if (soPainel || !guild) return;
  const reg = lerRegistro();
  const vencidos = (reg.niverCargos ?? []).filter((x) => x.ate <= Date.now());
  for (const v of vencidos) {
    const membro = await guild.members.fetch(v.userId).catch(() => null);
    if (membro && reg.cargoNiverId) await membro.roles.remove(reg.cargoNiverId, 'Fim do dia do aniversário').catch(() => {});
  }
  if (vencidos.length) await salvarRegistro({ niverCargos: (lerRegistro().niverCargos ?? []).filter((x) => x.ate > Date.now()) });
  const n = dados.config().niver;
  const hoje = hojeNoBrasil();
  const chave = `${hoje.ano}-${hoje.mes}-${hoje.dia}`;
  if (!n.on || !n.canalId || lerRegistro().niverDia === chave || horaNoBrasil() < +n.hora.slice(0, 2)) return;
  await salvarRegistro({ niverDia: chave }); // anota antes: reinício no meio não posta duas vezes
  const canal = guild.channels.cache.get(n.canalId);
  if (!canal?.isTextBased()) return;
  for (const p of aniversariantesDoDia(lerAniversarios(), hoje)) {
    await postarAniversario(guild, canal, p, hoje).catch((erro) => console.error('Aniversário:', explicarErro(erro)));
  }
}

/** Membro pelo id, menção, nome de usuário ou apelido */
async function acharMembro(guild, q) {
  const id = /^<?@?!?(\d{15,25})>?$/.exec(q)?.[1];
  if (id) return guild.members.fetch(id).catch(() => null);
  const alvo = q.toLowerCase();
  const doCache = guild.members.cache.find((m) => [m.user.username, m.displayName, m.user.globalName].some((x) => x?.toLowerCase() === alvo));
  if (doCache) return doCache;
  const achados = await guild.members.search({ query: q, limit: 5 }).catch(() => null);
  return achados?.find((m) => [m.user.username, m.displayName].some((x) => x?.toLowerCase() === alvo)) ?? achados?.first() ?? null;
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
    moderacaoFaltando: NOMES_MODERACAO.filter(([p]) => !eu?.permissions.has(p)).map(([, nome]) => nome),
    ticketsFaltando: NOMES_TICKETS.filter(([p]) => !eu?.permissions.has(p)).map(([, nome]) => nome),
    regrasFaltando: [...NOMES_REGRAS, [P.ManageRoles, 'Gerenciar cargos (botão de aceitar)']].filter(([p]) => !eu?.permissions.has(p)).map(([, nome]) => nome),
    categorias: guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, nome: c.name })),
    hierarquia: {
      cargoDoBot: eu?.roles.highest.name ?? '?',
      temPermissao: !!eu?.permissions.has(P.ManageRoles),
      acimaDoBot: deCor.filter((r) => !r.editable).map((r) => r.name),
      coloridosAcima,
      semCargo: cores.length - deCor.length,
      // Aba Cargos: a lista de cima pra baixo (cores num bloco só) e as permissões que o bot consegue dar
      lista: listaDaHierarquia(descreverCargos(guild), { botId: eu?.roles.highest.id ?? null, idsDeCor: deCor.map((r) => r.id) }),
      permsDoBot: permsDoBot(eu).map(([k]) => k),
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
  // O que o próprio bot faz já entrou no livro na hora (com mais detalhe)
  if (TIPOS[tipo] && tipo !== 'aviso' && !soPainel && guild?.id === cfg.servidorId && d.executorId !== client.user?.id) {
    await anotarDoDiscord(tipo, d).catch((erro) => console.error('Livro de ocorrências:', erro.message));
  }
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
// ---------- Tickets ----------
// Painel com menu de motivos → canal privado ticket-0042-fulano na categoria → Assumir / Adicionar / Fechar.
// Fechar: transcrição (.html) no canal de logs e na DM, avaliação por estrelas na DM e o canal some depois de X segundos.
const URL_SITE = (process.env.URL_PAINEL || 'https://pedroa07.github.io/Interface-Manda-Chuva-Bot/').replace(/\/?$/, '/');
const PERMS_TICKET = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
const PERMS_TICKET_NOMES = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true };
const temConteudo = () => client.options.intents.has(I.MessageContent);

/** A fila do bot (naFila) só registra erros no console: aqui o erro volta pra quem chamou */
async function naFilaComErro(chave, tarefa) {
  let resultado, falha;
  await naFila(chave, async () => {
    try {
      resultado = await tarefa();
    } catch (erro) {
      falha = erro;
    }
  });
  if (falha) throw falha;
  return resultado;
}

/** Staff dos tickets: tem o cargo escolhido ou "Gerenciar servidor" */
const ehStaffTicket = (membro, t = dados.config().tickets) => membro.permissions.has(P.ManageGuild) || (!!t.staffId && membro.roles.cache.has(t.staffId));

/** Mensagem do painel de tickets (com a imagem anexada se for banner "Eventos" ou arquivo enviado) */
async function montarPainelTickets(guild, t = dados.config().tickets) {
  const { url, arquivos } = await imagensDaMensagem({ imagem: t.imagem }, guild);
  return montarV2({ ...pedacoDoPainelTickets(t, url), arquivos: arquivos() });
}

/** Salvar: cria a categoria nova se pediram e põe (ou atualiza) o painel no canal escolhido */
async function prepararTickets(guild, cfg, rel) {
  const t = cfg.tickets;
  if (t.categoriaId === 'nova') {
    try {
      const cat = await guild.channels.create({
        name: '🎫 TICKETS',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.id, deny: [P.ViewChannel] }, ...(t.staffId ? [{ id: t.staffId, allow: PERMS_TICKET }] : []), { id: client.user.id, allow: [...PERMS_TICKET, P.ManageChannels] }],
      });
      t.categoriaId = cat.id;
      rel.push('Criei a categoria 🎫 TICKETS.');
    } catch (erro) {
      t.categoriaId = null;
      rel.push(`⚠️ Não consegui criar a categoria dos tickets: ${explicarErro(erro)}`);
    }
  }
  // Canais novos ficam dentro da categoria dos tickets (com permissão própria, não herdam a dela)
  const parent = t.categoriaId && guild.channels.cache.get(t.categoriaId)?.type === ChannelType.GuildCategory ? t.categoriaId : undefined;
  const staff = t.staffId && guild.roles.cache.has(t.staffId) ? [t.staffId] : [];
  const criar = async (campo, nome, permissionOverwrites, texto) => {
    if (t[campo] !== 'novo') return;
    try {
      const canal = await guild.channels.create({ name: nome, type: ChannelType.GuildText, parent, permissionOverwrites });
      t[campo] = canal.id;
      rel.push(`Criei o canal #${canal.name} ${texto}.`);
    } catch (erro) {
      t[campo] = null;
      rel.push(`⚠️ Não consegui criar o #${nome}: ${explicarErro(erro)}`);
    }
  };
  // Canal do menu: todo mundo vê, só o bot escreve
  await criar('canalId', 'abrir-ticket', [
    { id: guild.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages] },
    { id: client.user.id, allow: [...PERMS_TICKET, P.ManageMessages] },
  ], 'pro menu dos tickets');
  // Transcrições: só a staff e o bot
  await criar('logsId', 'registros-tickets', [
    { id: guild.id, deny: [P.ViewChannel] },
    ...staff.map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages] })),
    { id: client.user.id, allow: PERMS_TICKET },
  ], 'pras transcrições (só a staff vê)');
}

async function publicarPainelTickets(guild, rel, cfg = dados.config()) {
  const t = cfg.tickets;
  const atual = lerTickets().painel;
  if (!t.on || !t.canalId) return;
  const canal = guild.channels.cache.get(t.canalId);
  if (!canal?.isTextBased()) return rel.push('⚠️ O canal do botão dos tickets não existe mais.');
  try {
    const msg = await montarPainelTickets(guild, t);
    if (atual?.canalId === canal.id) {
      const ok = await canal.messages.edit(atual.mensagemId, { ...msg, attachments: [] }).then(() => true, (erro) => {
        if ([10003, 10008].includes(erro.code)) return false;
        throw erro;
      });
      if (ok) return;
    }
    const nova = await canal.send(msg);
    if (atual) await guild.channels.cache.get(atual.canalId)?.messages?.delete(atual.mensagemId).catch(() => {});
    await salvarTickets({ painel: { canalId: canal.id, mensagemId: nova.id } });
    rel.push(`Painel de tickets enviado em #${canal.name}.`);
  } catch (erro) {
    rel.push(`⚠️ Não consegui pôr o painel de tickets em #${canal.name}: ${explicarErro(erro)}`);
  }
}

// ---------- Aba Servidor: montar e renomear ----------
// Roda em segundo plano (dezenas de chamadas ao Discord, com limite de velocidade); o painel acompanha pelo andamento.
// Uma por servidor: { tipo, status: 'andando' | 'pronto' | 'erro', passo, feitos, total, rel, inicio, fim }
const obras = new Map();
const obraDaVez = () => obras.get(servidorAtual()) ?? null;

/** Começa a obra se não tiver outra andando. fazer(t, rel) mexe no Discord e conta em t.feitos. */
function comecarObra(tipo, fazer) {
  if (obraDaVez()?.status === 'andando') throw comStatus(409, 'Já tem uma obra em andamento. Espera terminar.');
  const t = { tipo, status: 'andando', passo: 'Começando…', feitos: 0, total: 0, rel: [], inicio: Date.now(), fim: null };
  obras.set(servidorAtual(), t);
  fazer(t)
    .then(() => (t.status = 'pronto'))
    .catch((erro) => {
      t.status = 'erro';
      t.rel.push(`⚠️ Parou no meio: ${explicarErro(erro)}`);
      console.error(`Obra (${tipo}):`, erro);
    })
    .finally(async () => {
      t.fim = Date.now();
      t.passo = '';
      if (tipo === 'montar' && t.status === 'pronto') await salvarRegistro({ srvMontado: t.fim });
    });
  return t;
}

/** Nome de uma peça do modelo: com a fonte da aba (se ligada no Montar) ou do jeito simples */
function nomeDaObra(srv, alvo, nome, emoji, voz, comFonte) {
  if (comFonte) return formatarNome(alvo, nome, emoji, voz, srv.f[alvo]);
  return alvo === 'canais' && !voz ? nome.toLowerCase().replace(/\s+/g, '-') : nome;
}

/** Permissões que o bot pode dar (só as que ele tem) */
const queOBotTem = (guild, lista) => lista.filter((p) => guild.members.me?.permissions.has(p));
const PERMS_PAPEL = {
  admin: [P.ManageChannels, P.ManageRoles, P.ManageMessages, P.KickMembers, P.BanMembers, P.ModerateMembers, P.ViewAuditLog],
  'moderação': [P.ManageMessages, P.ModerateMembers, P.KickMembers, P.ViewAuditLog],
};
const PERMS_DO_BOT_NO_CANAL = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.Connect, P.Speak];

/**
 * Permissões do modelo pra uma categoria: Portaria todo mundo vê; Staff só a staff; o resto só quem tem Verificado
 * (e a staff). O bot sempre vê. [{ id, type (0 cargo, 1 membro), allow, deny }]. Calculada, não lida do cache:
 * o cache só atualiza quando o Discord avisa, e canal novo não pode nascer aberto.
 */
function permissoesDoModelo(guild, catId, cargos) {
  const lista = [{ id: client.user.id, type: 1, allow: queOBotTem(guild, PERMS_DO_BOT_NO_CANAL), deny: [] }];
  if (catId === 'portaria') return lista;
  lista.push({ id: guild.id, type: 0, allow: [], deny: [P.ViewChannel] });
  for (const nome of [...CARGOS_STAFF, ...(catId === 'staff' ? [] : ['Verificado'])]) {
    const r = cargos.get(nome);
    if (r) lista.push({ id: r.id, type: 0, allow: [P.ViewChannel], deny: [] });
  }
  return lista;
}

const nomeDaPermissao = (bit) => Object.keys(P).find((k) => P[k] === bit);
/** Aplica com edit (junta com o que já tinha): nunca apaga permissão que a pessoa pôs à mão */
async function aplicarPermissoes(alvo, lista) {
  for (const o of lista) {
    const mudancas = { ...Object.fromEntries(o.allow.map((p) => [nomeDaPermissao(p), true])), ...Object.fromEntries(o.deny.map((p) => [nomeDaPermissao(p), false])) };
    await alvo.permissionOverwrites.edit(o.id, mudancas, { reason: 'Montar servidor', type: o.type });
  }
}

/** Canal da Portaria em que só o bot e a staff escrevem */
async function soLeitura(guild, canal, cargos) {
  await canal.permissionOverwrites.edit(guild.id, { SendMessages: false, CreatePublicThreads: false, CreatePrivateThreads: false }, { reason: 'Montar servidor', type: 0 });
  for (const nome of CARGOS_STAFF) {
    const r = cargos.get(nome);
    if (r) await canal.permissionOverwrites.edit(r.id, { SendMessages: true }, { reason: 'Montar servidor', type: 0 });
  }
}

/** Mensagem com os botões dos cargos de jogo e de aviso (cada um pega e tira sozinho). Edita a mesma depois. */
async function publicarCargosPorBotao(guild, canal, cargos, rel) {
  const lista = CARGOS_POR_BOTAO.map((n) => [n, cargos.get(n)]).filter(([, r]) => r && r.editable && !ehPerigoso(r));
  if (!lista.length) return;
  const botoes = lista.map(([n, r]) => ({ type: 2, style: 2, custom_id: `jogo:${r.id}`, label: n, emoji: { name: CARGOS_SRV.find((c) => c[0] === n)[2] } }));
  const linhas = [];
  for (let i = 0; i < botoes.length; i += 5) linhas.push({ type: 1, components: botoes.slice(i, i + 5) });
  const msg = montarV2({
    cor: 0x5865f2,
    titulo: '🎮 Cargos de jogo e de aviso',
    texto: 'Clica no jogo pra ganhar o cargo e ser chamado nas partidas. Clicou de novo, tirou.\n**Ping de eventos** avisa quando tem evento no servidor.',
    linhas,
  });
  const antes = lerRegistro().jogosMsg;
  let feita = antes?.canalId === canal.id ? await canal.messages.edit(antes.mensagemId, msg).catch(() => null) : null;
  if (!feita) {
    feita = await canal.send(msg);
    if (antes) await guild.channels.cache.get(antes.canalId)?.messages?.delete(antes.mensagemId).catch(() => {});
  }
  await salvarRegistro({ jogosMsg: { canalId: canal.id, mensagemId: feita.id }, jogos: lista.map(([, r]) => r.id) });
  rel.push(`Botões dos cargos de jogo em #${canal.name}.`);
}

/** Botão de cargo de jogo: dá ou tira (só os cargos que o Montar pôs na mensagem) */
async function alternarCargoDeJogo(i) {
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const id = i.customId.slice(5);
    const cargo = (lerRegistro().jogos ?? []).includes(id) ? i.guild.roles.cache.get(id) : null;
    if (!cargo) return void (await i.editReply('Esse cargo não existe mais. Avisa a staff.'));
    if (ehPerigoso(cargo) || !cargo.editable) return void (await i.editReply('Não consigo mexer nesse cargo agora (ele está acima do meu). Avisa a staff.'));
    const tem = i.member.roles.cache.has(id);
    if (tem) await i.member.roles.remove(cargo, 'Botão de cargo de jogo');
    else await i.member.roles.add(cargo, 'Botão de cargo de jogo');
    await i.editReply({ content: tem ? `Tirei o cargo <@&${id}>.` : `Pronto! Agora você tem <@&${id}>. Bora jogar.`, allowedMentions: { parse: [] } });
  } catch (erro) {
    console.error('Cargo de jogo:', erro.message);
    await i.editReply(`⚠️ ${explicarErro(erro)}`).catch(() => {});
  }
}

/** O que o bot usa e nunca pode sumir no "apagar o que não está no modelo" */
function protegidosDaObra(guild, cfg) {
  const canais = new Set([
    ...dados.paineis().map((p) => p.canalId), cfg.noticias.canalId, cfg.moderacao.canalId, cfg.niver.canalId, cfg.regras.canalId,
    ...Object.values(cfg.portaria).map((e) => e.canalId), cfg.tickets.canalId, cfg.tickets.logsId, cfg.tickets.categoriaId,
    lerRegistro().regrasMsg?.canalId, lerRegistro().jogosMsg?.canalId, lerTickets().painel?.canalId, ...lerTickets().abertos.map((x) => x.canalId),
    guild.rulesChannelId, guild.publicUpdatesChannelId, guild.safetyAlertsChannelId, guild.systemChannelId, guild.afkChannelId,
  ].filter(Boolean));
  for (const c of guild.channels.cache.values()) if (c.name === NOME_DEPOSITO) canais.add(c.id);
  const cargos = new Set([
    ...cfg.cores.map((c) => c.cargoId), cfg.tickets.staffId, cfg.regras.cargoId, cfg.portaria.entrada.cargoAuto?.cargoId, cfg.noticias.mencao,
  ].filter(Boolean));
  return { canais, cargos };
}

/** Montar: cargos, categorias e canais do modelo (reaproveita pelo nome), permissões, botões e, se pedido, apaga o resto */
async function montarServidor(guild, t) {
  const cfg = dados.config(), srv = cfg.srv, plano = planoDoModelo(srv), comFonte = srv.opt.fontes;
  t.total = plano.cargos.length + plano.cats.reduce((a, c) => a + 1 + c.canais.length, 0);
  const rel = t.rel, conta = { cargos: 0, canais: 0, renomeados: 0 };
  await guild.roles.fetch();
  await guild.channels.fetch();

  const cargos = new Map();
  for (const c of plano.cargos) {
    t.passo = `Cargo ${c.nome}`;
    const nome = nomeDaObra(srv, 'cargos', c.nome, c.emoji, false, comFonte);
    let r = guild.roles.cache.find((x) => x.id !== guild.id && !x.managed && chave(x.name) === chave(c.nome));
    if (!r) {
      r = await guild.roles.create({
        name: nome, colors: { primaryColor: hexParaInt(c.cor) }, permissions: queOBotTem(guild, PERMS_PAPEL[c.papel] ?? []),
        hoist: CARGOS_STAFF.includes(c.nome), mentionable: CARGOS_POR_BOTAO.includes(c.nome), reason: 'Montar servidor',
      });
      conta.cargos++;
    } else if (comFonte && r.name !== nome && r.editable) {
      await r.setName(nome, 'Montar servidor');
      conta.renomeados++;
    }
    cargos.set(c.nome, r);
    t.feitos++;
  }

  const usados = new Set();
  for (const cat of plano.cats) {
    t.passo = `Categoria ${cat.nome}`;
    const nomeCat = nomeDaObra(srv, 'categorias', cat.nome, cat.emoji, false, comFonte);
    let categoria = guild.channels.cache.find((x) => x.type === ChannelType.GuildCategory && !usados.has(x.id) && chave(x.name) === chave(cat.nome));
    if (!categoria) {
      categoria = await guild.channels.create({ name: nomeCat, type: ChannelType.GuildCategory, reason: 'Montar servidor' });
      conta.canais++;
    } else if (comFonte && categoria.name !== nomeCat) {
      await categoria.setName(nomeCat, 'Montar servidor');
      conta.renomeados++;
    }
    usados.add(categoria.id);
    const perms = srv.opt.perms ? permissoesDoModelo(guild, cat.id, cargos) : [];
    await aplicarPermissoes(categoria, perms);
    // Canal novo nasce com as permissões da categoria: as que ela já tinha (cache) + as do modelo por cima
    const doModelo = new Set(perms.map((o) => o.id));
    const herda = [...categoria.permissionOverwrites.cache.filter((o) => !doModelo.has(o.id)).map((o) => ({ id: o.id, type: o.type, allow: o.allow, deny: o.deny })), ...perms];
    t.feitos++;
    for (const ch of cat.canais) {
      t.passo = ch.voz ? `🔊 ${ch.nome}` : `#${ch.nome}`;
      const tipo = ch.voz ? ChannelType.GuildVoice : ChannelType.GuildText;
      const nome = nomeDaObra(srv, 'canais', ch.nome, ch.emoji, ch.voz, comFonte);
      let canal = guild.channels.cache.find((x) => x.type === tipo && !usados.has(x.id) && chave(x.name) === chave(ch.nome));
      if (!canal) {
        canal = await guild.channels.create({ name: nome, type: tipo, parent: categoria.id, permissionOverwrites: herda, reason: 'Montar servidor' });
        conta.canais++;
      } else {
        if (canal.parentId !== categoria.id) await canal.setParent(categoria.id, { lockPermissions: false, reason: 'Montar servidor' });
        if (comFonte && canal.name !== nome) {
          await canal.setName(nome, 'Montar servidor');
          conta.renomeados++;
        }
        // Canal que já existia guarda as permissões dele: só ganha as do modelo por cima
        await aplicarPermissoes(canal, perms);
      }
      if (srv.opt.perms && cat.id === 'portaria' && SO_LEITURA.includes(ch.nome)) await soLeitura(guild, canal, cargos);
      usados.add(canal.id);
      t.feitos++;
      if (ch.nome === 'escolha-sua-cor' && srv.opt.autoJogos) {
        t.passo = 'Botões dos cargos de jogo';
        await publicarCargosPorBotao(guild, canal, cargos, rel).catch((erro) => rel.push(`⚠️ Não consegui pôr os botões dos cargos de jogo: ${explicarErro(erro)}`));
      }
    }
  }
  rel.unshift(`Montado: ${plano.resumo}. Criados: ${conta.cargos} cargo(s) e ${conta.canais} canal(is)/categoria(s); ${conta.renomeados} renomeado(s); o resto foi reaproveitado.`);

  // A aba Regras passa a usar o #regras e o Verificado do modelo, se ainda não tinha escolhido
  const regrasCanal = [...usados].map((id) => guild.channels.cache.get(id)).find((c) => c?.type === ChannelType.GuildText && chave(c.name) === 'regras');
  const novo = structuredClone(cfg);
  if (!novo.regras.canalId && regrasCanal) novo.regras.canalId = regrasCanal.id;
  if (!novo.regras.cargoId && cargos.get('Verificado')) novo.regras.cargoId = cargos.get('Verificado').id;
  if (novo.regras.canalId !== cfg.regras.canalId || novo.regras.cargoId !== cfg.regras.cargoId) {
    dados.salvarConfig(novo);
    rel.push('A aba Regras agora usa o #regras e o cargo Verificado do modelo. Envie as regras lá pra liberar o servidor pra quem aceitar.');
  }

  if (srv.opt.apagar) await apagarForaDoModelo(guild, novo, usados, new Set([...cargos.values()].map((r) => r.id)), t);
}

/** "Apagar o que não está no modelo": canais e cargos de fora, menos o que o bot usa, integrações, cor e separadores */
async function apagarForaDoModelo(guild, cfg, usados, cargosDoModelo, t) {
  const { canais, cargos } = protegidosDaObra(guild, cfg);
  let nCanais = 0, nCargos = 0;
  // Canais primeiro, categorias por último (categoria com canal protegido dentro fica)
  const fora = [...guild.channels.cache.values()].filter((c) => !usados.has(c.id) && !canais.has(c.id) && c.deletable);
  for (const c of fora.sort((a, b) => (a.type === ChannelType.GuildCategory) - (b.type === ChannelType.GuildCategory))) {
    if (c.type === ChannelType.GuildCategory && guild.channels.cache.some((x) => x.parentId === c.id && canais.has(x.id))) continue;
    t.passo = `Apagando #${c.name}`;
    await c.delete('Montar servidor: fora do modelo').then(() => nCanais++, () => {});
  }
  for (const r of guild.roles.cache.values()) {
    if (r.id === guild.id || r.managed || !r.editable || cargosDoModelo.has(r.id) || cargos.has(r.id) || lerSeparador(r.name) !== null || r.name === NOME_CARGO_NIVER) continue;
    t.passo = `Apagando @${r.name}`;
    await r.delete('Montar servidor: fora do modelo').then(() => nCargos++, () => {});
  }
  t.rel.push(`Apagados fora do modelo: ${nCanais} canal(is) e ${nCargos} cargo(s). Ficaram os canais e cargos que o bot usa, os de cor, separadores e integrações.`);
}

/** "Renomear o que já existe": aplica as fontes da aba em tudo que tem nome do modelo (de qualquer categoria) */
async function renomearServidor(guild, t) {
  const srv = dados.config().srv;
  await guild.channels.fetch();
  const alvos = [];
  for (const [, nome, emoji, canais] of CATS_SRV) {
    for (const c of guild.channels.cache.filter((x) => x.type === ChannelType.GuildCategory && chave(x.name) === chave(nome)).values()) alvos.push([c, formatarNome('categorias', nome, emoji, false, srv.f.categorias)]);
    for (const [tipo, n, e] of canais) {
      const voz = tipo === 'v';
      for (const c of guild.channels.cache.filter((x) => x.type === (voz ? ChannelType.GuildVoice : ChannelType.GuildText) && chave(x.name) === chave(n)).values()) alvos.push([c, formatarNome('canais', n, e, voz, srv.f.canais)]);
    }
  }
  for (const [nome, , emoji] of CARGOS_SRV) for (const r of guild.roles.cache.filter((x) => !x.managed && x.id !== guild.id && chave(x.name) === chave(nome)).values()) alvos.push([r, formatarNome('cargos', nome, emoji, false, srv.f.cargos)]);
  const mudar = alvos.filter(([x, nome]) => x.name !== nome);
  t.total = mudar.length;
  let feitos = 0, travados = 0;
  for (const [x, nome] of mudar) {
    t.passo = `${x.name} → ${nome}`;
    if ('editable' in x && !x.editable) travados++;
    else await x.setName(nome, 'Fontes e nomes').then(() => feitos++, () => travados++);
    t.feitos++;
  }
  t.rel.push(`${feitos} nome(s) trocado(s)${travados ? `; ${travados} sem permissão pra mudar (acima do cargo do bot)` : ''}. ${alvos.length - mudar.length} já estavam certos.`);
}

// ---------- Regras ----------
const hojeTxt = () => {
  const h = hojeNoBrasil();
  return `${String(h.dia).padStart(2, '0')}/${String(h.mes).padStart(2, '0')}/${h.ano}`;
};

/** Mensagem das regras (com o botão de aceitar, se ligado). @param {import('discord.js').Guild} guild */
async function montarRegras(guild, cfg = dados.config(), { comBotao = true } = {}) {
  const r = cfg.regras;
  const { url, arquivos } = await imagensDaMensagem({ banner: r.banner }, guild);
  return montarV2({ ...pedacoDasRegras(r, { servidor: guild.name, hoje: hojeTxt(), url, moderacao: cfg.moderacao, comBotao }), arquivos: arquivos() });
}

// O que muda a mensagem: se nada mudou, o Salvar não edita (e o "atualizado em" continua valendo)
const assinaturaDasRegras = (guild, cfg) =>
  createHash('sha1').update(JSON.stringify([cfg.regras, cfg.regras.escada && escadaDePunicoes(cfg.moderacao), guild.name])).digest('hex');

/** Salvar: cria o canal e o cargo das regras se pediram "Criar" */
async function prepararRegras(guild, cfg, rel) {
  const r = cfg.regras;
  if (r.canalId === 'novo') {
    try {
      // Todo mundo lê, só o bot escreve
      const canal = await guild.channels.create({
        name: 'regras',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads] },
          { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory] },
        ],
        reason: 'Aba Regras do painel',
      });
      r.canalId = canal.id;
      rel.push(`Criei o canal #${canal.name} pras regras.`);
    } catch (erro) {
      r.canalId = null;
      rel.push(`⚠️ Não consegui criar o canal das regras: ${explicarErro(erro)}`);
    }
  }
  if (r.cargoId === 'novo') {
    try {
      const ja = guild.roles.cache.find((x) => x.name.toLowerCase() === 'verificado' && x.id !== guild.id && !x.managed);
      const cargo = ja ?? (await guild.roles.create({ name: 'Verificado', colors: { primaryColor: 0x2ecc71 }, permissions: [], reason: 'Botão de aceitar as regras' }));
      r.cargoId = cargo.id;
      rel.push(ja ? `O botão das regras vai dar o cargo ${cargo.name}, que já existia.` : 'Criei o cargo Verificado pro botão das regras.');
    } catch (erro) {
      r.cargoId = null;
      rel.push(`⚠️ Não consegui criar o cargo Verificado: ${explicarErro(erro)}`);
    }
  }
}

/**
 * Põe (ou atualiza) a mensagem das regras e guarda onde ficou.
 * forcar = botão Enviar/Atualizar do painel: sem ele (Salvar), só edita a que já existe e só se algo mudou.
 * @param {import('discord.js').Guild} guild
 */
async function publicarRegras(guild, rel, cfg = dados.config(), { forcar = false } = {}) {
  const r = cfg.regras;
  const atual = lerRegistro().regrasMsg;
  const assinatura = assinaturaDasRegras(guild, cfg);
  if (!forcar && (!atual || (atual.assinatura === assinatura && atual.canalId === r.canalId))) return null;
  const problema = (texto) => {
    if (forcar) throw comStatus(400, texto);
    rel.push(`⚠️ ${texto}`);
    return null;
  };
  const canal = r.canalId ? guild.channels.cache.get(r.canalId) : null;
  if (!canal?.isTextBased()) return problema(r.canalId ? 'O canal das regras não existe mais. Escolha outro.' : 'Escolha o canal das regras.');
  if (!temRegras(r)) return problema('Escreva pelo menos uma regra (com título).');
  const cargo = r.botao && r.cargoId ? guild.roles.cache.get(r.cargoId) : null;
  if (r.botao && !cargo) rel.push('⚠️ O botão de aceitar está sem cargo: escolha o cargo que ele dá.');
  else if (cargo && ehPerigoso(cargo)) rel.push(`⚠️ Por segurança o botão não dá "${cargo.name}" (tem permissões de moderação/admin). Escolha outro cargo.`);
  else if (cargo && !cargo.editable) rel.push(`⚠️ O cargo "${cargo.name}" está acima do cargo do bot: o botão só funciona se o cargo do bot ficar acima dele.`);
  try {
    const msg = await montarRegras(guild, cfg);
    let feita = null;
    if (atual?.canalId === canal.id) {
      feita = await canal.messages.edit(atual.mensagemId, { ...msg, attachments: [] }).catch((erro) => {
        if ([10003, 10008].includes(erro.code)) return null;
        throw erro;
      });
    }
    const nova = !feita;
    if (nova) {
      feita = await canal.send(msg);
      if (atual && atual.canalId !== canal.id) await guild.channels.cache.get(atual.canalId)?.messages?.delete(atual.mensagemId).catch(() => {});
    }
    if (r.fixar && !feita.pinned) await feita.pin('Regras do servidor').catch(() => rel.push(`⚠️ Não consegui fixar as regras: falta a permissão "Fixar mensagens" pro bot em #${canal.name}.`));
    if (!r.fixar && feita.pinned) await feita.unpin('Regras sem fixar').catch(() => {});
    await salvarRegistro({ regrasMsg: { canalId: canal.id, mensagemId: feita.id, quando: Date.now(), fixada: r.fixar, assinatura } });
    rel.push(nova ? `Regras enviadas em #${canal.name}.` : `Mensagem das regras atualizada em #${canal.name}.`);
    return feita;
  } catch (erro) {
    return problema(`Não consegui pôr as regras em #${canal.name}: ${explicarErro(erro)}`);
  }
}

/** Onde está a mensagem das regras, pro painel ("Enviada em … · fixada" e o link) */
function mensagemDasRegras(guild) {
  const m = lerRegistro().regrasMsg;
  if (!m) return null;
  return { quando: m.quando, fixada: !!m.fixada, canalNome: guild.channels.cache.get(m.canalId)?.name ?? null, link: `https://discord.com/channels/${guild.id}/${m.canalId}/${m.mensagemId}` };
}

/** Botão "Li e aceito": dá o cargo das regras (só pra quem clicou) */
async function aceitarRegras(i) {
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = dados.config().regras;
    const cargo = r.botao && r.cargoId ? i.guild.roles.cache.get(r.cargoId) : null;
    if (!cargo) return void (await i.editReply('Esse botão está sem cargo agora. Avisa a staff (ou abre um ticket).'));
    const sem = { allowedMentions: { parse: [] } };
    if (i.member.roles.cache.has(cargo.id)) return void (await i.editReply({ content: `Você já aceitou as regras e tem o cargo <@&${cargo.id}>. Pode ir pra resenha!`, ...sem }));
    if (ehPerigoso(cargo) || !cargo.editable) return void (await i.editReply('Não consigo te dar o cargo das regras agora (ele está acima do meu cargo). Avisa a staff.'));
    await i.member.roles.add(cargo, 'Aceitou as regras');
    await i.editReply({ content: `✅ Regras aceitas! Agora você tem o cargo <@&${cargo.id}>. Bem-vindo(a) à resenha.`, ...sem });
  } catch (erro) {
    console.error('Aceitar regras:', erro.message);
    await i.editReply(`⚠️ ${explicarErro(erro)}`).catch(() => {});
  }
}

/** /regras: as regras só pra quem pediu (com o botão, se a pessoa ainda não aceitou) */
async function responderRegras(i) {
  const cfg = dados.config();
  if (!lerRegistro().regrasMsg || !temRegras(cfg.regras)) return void (await i.reply(efemero({ content: 'A staff ainda não publicou as regras deste servidor.' })));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const aceitou = cfg.regras.cargoId && i.member.roles.cache.has(cfg.regras.cargoId);
  const msg = await montarRegras(i.guild, cfg, { comBotao: !aceitou });
  await i.editReply({ ...msg, flags: MessageFlags.IsComponentsV2 });
}

/** Abre o ticket e devolve o canal. Erros viram mensagem pra pessoa. @param {import('discord.js').GuildMember} membro */
async function abrirTicket(guild, membro, indice) {
  const t = dados.config().tickets;
  if (!t.on) throw comStatus(400, 'Os tickets estão desligados agora. Chama a staff de outro jeito.');
  const motivo = t.motivos[indice];
  if (!motivo?.on) throw comStatus(400, 'Esse motivo não existe mais. Escolhe outro.');
  const meus = abertosDe(membro.id).filter((x) => guild.channels.cache.has(x.canalId));
  if (meus.length >= t.limite) throw comStatus(400, `Você já tem ${meus.length === 1 ? 'um ticket aberto' : `${meus.length} tickets abertos`}: ${meus.map((x) => `<#${x.canalId}>`).join(', ')}. Fecha antes de abrir outro.`);
  const categoria = t.categoriaId ? guild.channels.cache.get(t.categoriaId) : null;
  const num = reservarNumero();
  const canal = await guild.channels.create({
    name: nomeDoCanal(num, membro.user.username),
    type: ChannelType.GuildText,
    parent: categoria?.type === ChannelType.GuildCategory ? categoria.id : undefined,
    topic: `Ticket #${numero(num)} · ${motivo.nome} · aberto por ${membro.user.username}`,
    permissionOverwrites: [
      { id: guild.id, deny: [P.ViewChannel] },
      { id: membro.id, allow: PERMS_TICKET },
      ...(t.staffId && guild.roles.cache.has(t.staffId) ? [{ id: t.staffId, allow: [...PERMS_TICKET, P.ManageMessages] }] : []),
      { id: client.user.id, allow: [...PERMS_TICKET, P.ManageChannels] },
    ],
  });
  const ticket = { num, canalId: canal.id, userId: membro.id, nome: membro.displayName, motivo: motivo.nome, emoji: motivo.emoji, aberto: Date.now(), resp: null, respNome: null };
  await salvarTickets({ abertos: [...lerTickets().abertos, ticket] });
  await canal.send(montarV2(pedacoDasBoasVindas(ticket, t, { staffId: guild.roles.cache.has(t.staffId) ? t.staffId : null, media: mediaDeResposta(lerTickets().fechados) })));
  return canal;
}

async function assumirTicket(ticket, membro) {
  if (ticket.resp === membro.id) return `Você já é o responsável pelo ticket #${numero(ticket.num)}.`;
  const t = lerTickets();
  const atualizado = { ...ticket, resp: membro.id, respNome: membro.displayName, assumidoEm: ticket.assumidoEm ?? Date.now() };
  await salvarTickets({ abertos: t.abertos.map((x) => (x.num === ticket.num ? atualizado : x)) });
  return null;
}

/** Lê o canal inteiro (até 2000 mensagens), da mais antiga pra mais nova */
async function mensagensDoCanal(canal) {
  const todas = [];
  let antes;
  for (let i = 0; i < 20; i++) {
    const lote = await canal.messages.fetch({ limit: 100, ...(antes && { before: antes }) });
    todas.push(...lote.values());
    if (lote.size < 100) break;
    antes = lote.lastKey();
  }
  const semTexto = !temConteudo();
  return todas.reverse().map((m) => ({
    autor: m.member?.displayName ?? m.author.username,
    avatar: m.author.displayAvatarURL({ size: 64, extension: 'png' }),
    bot: m.author.bot,
    ts: m.createdTimestamp,
    // Sem a intent "Message Content", o Discord manda o texto vazio (menos das mensagens do próprio bot)
    texto: m.content || (semTexto && !m.author.bot ? '(texto escondido: ligue a Message Content Intent no portal do Discord)' : ''),
    anexos: [...m.attachments.values()].map((a) => ({ nome: a.name, url: a.url })),
  }));
}

/**
 * Fecha: avisa no canal, salva a transcrição, manda DM com avaliação, arquiva e agenda o canal pra sumir.
 * por: quem fechou (membro) ou null (o próprio bot, por ficar parado)
 */
async function fecharTicket(guild, ticketPedido, { porId, porNome, motivo }) {
  return naFilaComErro(`ticket:${ticketPedido.num}`, async () => {
    // Dois cliques em Fechar ao mesmo tempo: o segundo não acha mais o ticket aberto
    const ticket = lerTickets().abertos.find((x) => x.num === ticketPedido.num);
    if (ticket) await fecharDeVez(guild, ticket, { porId, porNome, motivo });
  });
}

async function fecharDeVez(guild, ticket, { porId, porNome, motivo }) {
  const t = dados.config().tickets;
  const canal = guild.channels.cache.get(ticket.canalId);
  const fechado = Date.now();
  const dono = await client.users.fetch(ticket.userId).catch(() => null);
  const logs = t.transLog && t.logsId ? guild.channels.cache.get(t.logsId) : null;
  let arquivo = null, qtd = 0;
  if (canal?.isTextBased() && (logs || (t.transDm && dono))) {
    const msgs = await mensagensDoCanal(canal).catch(() => []);
    qtd = msgs.length;
    const html = transcricao({ ticket, servidor: guild.name, fechadoPor: porNome, motivo, fechado, mensagens: msgs });
    arquivo = () => ({ attachment: Buffer.from(html, 'utf8'), name: `ticket-${numero(ticket.num)}.html` });
  }
  const textoTransc = textoDaTranscricao(t, { logs: logs ? `<#${logs.id}>` : null, quem: dono ? `<@${dono.id}>` : 'quem abriu' });
  if (canal?.isTextBased()) {
    await canal.send(montarV2(pedacoDoFechamento(t, { por: porId ? `<@${porId}>` : porNome, motivo, transcricao: textoTransc }))).catch(() => {});
  }
  if (logs?.isTextBased() && arquivo) {
    const resumo = `🎫 **Ticket #${numero(ticket.num)}** · ${ticket.emoji} ${ticket.motivo} · aberto por <@${ticket.userId}>${ticket.resp ? `, atendido por <@${ticket.resp}>` : ''}, fechado por ${porId ? `<@${porId}>` : porNome}${motivo ? ` (${motivo})` : ''} · ${qtd} mensagens`;
    await logs.send({ content: resumo, files: [arquivo()], allowedMentions: { parse: [] } }).catch((erro) => console.error('Transcrição no canal de logs:', explicarErro(erro)));
  }
  if (dono) {
    if (t.transDm && arquivo) await dono.send({ content: `Comprovante do seu ticket #${numero(ticket.num)} (${ticket.motivo}) no **${guild.name}**.`, files: [arquivo()] }).catch(() => {});
    if (t.avaliacao) await dono.send(montarV2(pedacoDaAvaliacao(ticket, guild.name))).catch(() => {});
  }
  await arquivar(ticket, { fechado, porId: porId ?? null, porNome, motivoFechamento: motivo || null });
  if (canal) {
    const em = fechado + APAGAR[t.apagar][0];
    await salvarTickets({ apagar: [...lerTickets().apagar, { canalId: canal.id, em }] });
    setTimeout(() => apagarCanaisFechados().catch(() => {}), APAGAR[t.apagar][0] + 500);
  }
}

/** Apaga os canais de tickets fechados que já passaram do prazo (também roda depois de reiniciar) */
async function apagarCanaisFechados() {
  const { apagar } = lerTickets();
  const agora = Date.now();
  const vencidos = apagar.filter((a) => a.em <= agora);
  if (!vencidos.length) return;
  for (const a of vencidos) {
    const canal = client.channels.cache.get(a.canalId);
    if (canal) await canal.delete('Ticket fechado').catch((erro) => ![10003].includes(erro.code) && console.error('Apagar ticket:', explicarErro(erro)));
  }
  await salvarTickets({ apagar: lerTickets().apagar.filter((a) => !vencidos.includes(a)) });
}

/** A cada 10 min: veste o mascote, grava os contadores e confere os tickets de cada servidor */
async function aCada10Minutos() {
  await vestirMascote();
  await gravarEstatisticas();
  await gravarOuvidas();
  await paraCadaServidor('Tickets', conferirTickets);
}

/** Tira da fila ticket com canal apagado na mão e fecha os parados */
async function conferirTickets() {
  const guild = servidor();
  if (!guild || soPainel) return;
  await apagarCanaisFechados();
  const t = dados.config().tickets;
  for (const ticket of lerTickets().abertos) {
    const canal = guild.channels.cache.get(ticket.canalId);
    if (!canal) {
      await arquivar(ticket, { fechado: Date.now(), porId: null, porNome: 'canal apagado no Discord', motivoFechamento: null });
      continue;
    }
    const ultima = canal.lastMessageId ? Math.max(ticket.aberto, SnowflakeUtil.timestampFrom(canal.lastMessageId)) : ticket.aberto;
    if (estaParado(ultima, t.parado)) await fecharTicket(guild, ticket, { porId: null, porNome: 'Manda Chuva', motivo: `parado há mais de ${PARADO[t.parado][1]}` }).catch((erro) => console.error('Ticket parado:', explicarErro(erro)));
  }
}

/** Ticket do canal onde a interação aconteceu, ou erro */
function ticketAqui(canalId) {
  const ticket = ticketDoCanal(canalId);
  if (!ticket) throw comStatus(400, 'Isso só funciona dentro de um canal de ticket aberto.');
  return ticket;
}

/** É botão, menu ou comando de ticket (menos a avaliação na DM)? */
const ehDeTicket = (i) => (i.isChatInputCommand() && i.commandName === 'ticket') || ('customId' in i && i.customId.startsWith('tk:'));

/** Botões, menus e /ticket. @param {import('discord.js').Interaction<'cached'>} i */
async function responderTicket(i) {
  const ehComando = i.isChatInputCommand();
  const id = 'customId' in i ? i.customId : '';
  const efemero = (texto) => ({ content: texto, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  const responder = (texto) => (i.deferred && !i.replied ? i.editReply(texto) : i.replied ? i.followUp(efemero(texto)) : i.reply(efemero(texto)));
  try {
    const t = dados.config().tickets;
    const staff = ehStaffTicket(i.member, t);
    const sub = ehComando ? i.options.getSubcommand() : id.slice(3);
    if (sub === 'abrir') {
      const indice = ehComando ? Number(i.options.getString('motivo', true)) : Number(i.values[0]);
      // Menu: atualiza a mensagem com os mesmos componentes pra ele voltar ao "Escolha o motivo"
      if (ehComando) await i.deferReply({ flags: MessageFlags.Ephemeral });
      else await i.update({ components: i.message.components }).catch(() => i.deferReply({ flags: MessageFlags.Ephemeral }));
      const canal = await naFilaComErro(`tickets:${i.guildId}`, () => abrirTicket(i.guild, i.member, indice));
      return void (await responder(`Pronto! Seu ticket: ${canal}`));
    }
    if (sub === 'config') return void (await responder(`As configurações dos tickets ficam no painel (aba Tickets): ${URL_SITE}painel.html`));
    if (sub === 'painel') {
      if (!i.memberPermissions.has(P.ManageGuild)) throw comStatus(403, 'Só quem pode gerenciar o servidor manda o painel.');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const canal = i.options.getChannel('canal') ?? i.channel;
      const cfg = structuredClone(dados.config());
      cfg.tickets.canalId = canal.id;
      cfg.tickets.on = true;
      dados.salvarConfig(cfg);
      const rel = [];
      await publicarPainelTickets(i.guild, rel, cfg);
      return void (await i.editReply(rel.join('\n') || `O painel já estava em ${canal}.`));
    }
    const ticket = ticketAqui(i.channelId);
    if (sub === 'assumir') {
      if (!staff) throw comStatus(403, 'Só a staff assume ticket.');
      const ja = await assumirTicket(ticket, i.member);
      if (ja) return void (await responder(ja));
      return void (await i.reply({ content: `🙋 ${i.member} assumiu o ticket.`, allowedMentions: { parse: [] } }));
    }
    if (sub === 'fechar') {
      if (!staff && i.user.id !== ticket.userId) throw comStatus(403, 'Só a staff e quem abriu podem fechar.');
      await i.reply(efemero('Fechando…'));
      return void (await fecharTicket(i.guild, ticket, { porId: i.user.id, porNome: i.member.displayName, motivo: ehComando ? (i.options.getString('motivo') ?? '').slice(0, 200) : '' }));
    }
    if (!staff) throw comStatus(403, 'Só a staff mexe em quem está no ticket.');
    if (sub === 'add' && !ehComando) {
      return void (await i.reply({ ...efemero('Quem entra no ticket?'), components: [{ type: 1, components: [{ type: 5, custom_id: 'tk:addsel', placeholder: 'Escolha os membros', min_values: 1, max_values: 5 }] }] }));
    }
    const canal = /** @type {import('discord.js').TextChannel} */ (i.channel);
    if (sub === 'addsel' || sub === 'add') {
      const ids = sub === 'addsel' ? i.values : [i.options.getUser('membro', true).id];
      for (const u of ids) await canal.permissionOverwrites.edit(u, PERMS_TICKET_NOMES);
      const quem = ids.map((u) => `<@${u}>`).join(', ');
      if (sub === 'addsel') await i.update({ content: `Adicionei ${quem}.`, components: [] });
      else await i.reply(efemero(`Adicionei ${quem}.`));
      return void (await canal.send({ content: `➕ ${quem} entrou no ticket (por ${i.member}).`, allowedMentions: { users: ids } }));
    }
    if (sub === 'remover') {
      const u = i.options.getUser('membro', true);
      if (u.id === ticket.userId) throw comStatus(400, 'Quem abriu o ticket não sai dele. Fecha o ticket.');
      await canal.permissionOverwrites.delete(u.id);
      await i.reply(efemero(`Tirei ${u} do ticket.`));
      return void (await canal.send({ content: `➖ ${u} saiu do ticket (por ${i.member}).`, allowedMentions: { parse: [] } }));
    }
    if (sub === 'renomear') {
      const nome = i.options.getString('nome', true);
      await canal.setName(nomeDoCanal(ticket.num, nome));
      return void (await i.reply(efemero(`Agora o canal se chama #${canal.name}.`)));
    }
  } catch (erro) {
    await responder(`⚠️ ${erro.status ? erro.message : explicarErro(erro)}`).catch(() => {});
  }
}

/** Nota na DM (botões tkn:<num>:<nota>) */
async function avaliarTicket(i) {
  // A DM não tem servidor: o botão diz qual é (os antigos, sem isso, são do servidor padrão)
  const [, num, nota, servidorId] = i.customId.split(':');
  return noServidor(/^\d{15,25}$/.test(servidorId ?? '') ? servidorId : null, () => darNota(i, Number(num), Number(nota)));
}
async function darNota(i, num, nota) {
  const f = avaliar(num, nota);
  const guild = servidor();
  const msg = montarV2(pedacoDaAvaliacao(f ?? { num, motivo: 'ticket' }, guild?.name ?? 'servidor', nota));
  await i.update({ components: msg.components });
  const t = dados.config().tickets;
  const logs = f && t.logsId ? guild?.channels.cache.get(t.logsId) : null;
  if (logs?.isTextBased()) await logs.send({ content: `⭐ Ticket #${numero(num)} (${f.motivo}${f.respNome ? `, atendido por ${f.respNome}` : ''}) ganhou nota **${nota}/5**.`, allowedMentions: { parse: [] } }).catch(() => {});
}

// ---------- Login, papéis, Meu perfil e medalhas ----------
// Papel no site: admin (Gerenciar servidor), staff (cargo da staff dos tickets) ou membro. Conferido de novo a cada minuto.
// O papel vale por servidor: staff num pode ser só membro no outro.
const papeis = new Map();
async function papelDe(userId, guild = servidor()) {
  if (!guild) return null;
  const chave = `${guild.id}:${userId}`;
  const c = papeis.get(chave);
  if (c && Date.now() - c.ts < 60_000) return c.papel;
  const m = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
  // A staff dos tickets é da config de cada servidor
  const papel = !m || m.user.bot ? null : m.permissions.has(P.ManageGuild) ? 'admin' : noServidor(guild.id, () => ehStaffTicket(m)) ? 'staff' : 'membro';
  papeis.set(chave, { papel, ts: Date.now() });
  return papel;
}

/** Vincular perfil: ligado aqui? já tem um compartilhado? em que outros servidores ele aparece? */
const vinculoDe = (id) => ({ on: !!lerPerfis()[id]?.vinc, existe: !!lerVinculados()[id], servidores: servidoresVinculados(id) });

/** Spotify pelo link do perfil: confere no Spotify que existe e liga */
async function ligarPeloLink(userId, texto) {
  if (!temSpotify()) throw comStatus(503, 'O Spotify ainda não foi ligado no bot.');
  const id = idDoSpotify(texto);
  if (!id) return { erro: 'Cola o link do seu perfil do Spotify (no app: seu perfil › ⋯ › Compartilhar › Copiar link do perfil).' };
  let conta;
  try {
    conta = await perfilSpotify(id);
  } catch {
    throw comStatus(503, 'O Spotify não respondeu agora. Tenta de novo daqui a pouco.');
  }
  if (!conta) return { erro: 'Não achei esse perfil no Spotify. Confere o link.' };
  return ligarSpotify(userId, conta);
}

/** Nomes dos outros servidores em que a pessoa usa o perfil compartilhado */
function servidoresVinculados(userId) {
  if (!client?.isReady()) return [];
  return client.guilds.cache.filter((g) => g.id !== servidorAtual() && noServidor(g.id, () => !!lerPerfis()[userId]?.vinc)).map((g) => g.name);
}

/** Servidores do bot em que a pessoa está, com o papel dela em cada um (senha do painel: todos, como admin) */
async function servidoresDe(userId) {
  if (!client?.isReady()) throw comStatus(503, 'O bot está acordando. Tente de novo em 1 minuto.');
  const lista = [];
  for (const g of client.guilds.cache.values()) {
    const papel = userId ? await papelDe(userId, g) : 'admin';
    if (papel) lista.push({ id: g.id, nome: g.name, icone: g.iconURL({ size: 64 }), sigla: g.nameAcronym, papel });
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Cargos que aparecem no perfil (de cima pra baixo, sem @everyone e sem cargo de integração) */
const cargosVisiveis = (m, max = 4) =>
  [...m.roles.cache.values()]
    .filter((r) => r.id !== m.guild.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .slice(0, max)
    .map((r) => ({ nome: r.name, cor: r.colors.primaryColor ? intParaHex(r.colors.primaryColor) : '#99AAB5' }));

function medalhasDoMembro(m) {
  const e = lerEstatisticas();
  return medalhasDe(e.pessoas[m.id], {
    entrou: m.joinedTimestamp,
    staff: ehStaffTicket(m),
    niver: lerAniversarios().some((p) => p.userId === m.id),
    rei: Object.values(e.reis).includes(m.id),
    voz: tempoDeCall(m.id),
  });
}

// ---------- Imagens do perfil ----------
// Banner e cor de destaque do Discord só vêm pedindo o usuário de novo, então ficam 10 minutos guardados
const bannersDoDiscord = new Map();
async function bannerDoDiscord(m) {
  const g = bannersDoDiscord.get(m.id);
  if (g && Date.now() - g.quando < 600_000) return g;
  const u = await client.users.fetch(m.id, { force: true }).catch(() => null);
  const banner = { url: m.bannerURL({ size: 1024 }) ?? u?.bannerURL({ size: 1024 }) ?? null, cor: u?.hexAccentColor ?? null, quando: Date.now() };
  bannersDoDiscord.set(m.id, banner);
  return banner;
}

const fotoDoDiscord = (m) => m.displayAvatarURL({ size: 256, extension: 'png' });

/** O que o site mostra do perfil dessa pessoa */
async function visualDe(m, p = perfilDe(m.id)) {
  const discord = p.bOrig === 'discord' ? await bannerDoDiscord(m) : null;
  return visualDoPerfil(p, { id: m.id, avatar: fotoDoDiscord(m), discord }, extDoAnexo);
}

/** Arquivo que a pessoa escolheu por link ou anexo (k = 'b' ou 'a'). null = usar o plano B. */
async function arquivoDoPerfil(p, k) {
  if (p[`${k}Orig`] === 'anexo') return (await lerAnexo(p[`${k}Anexo`].slice(6)).catch(() => null))?.buffer ?? null;
  if (p[`${k}Orig`] === 'link') return (await lerLink(p[`${k}Link`]))?.buffer ?? null;
  return null;
}

/** Tudo o que a carteirinha precisa. Link quebrado ou anexo apagado caem no banner da galeria e na foto do Discord. */
async function dadosDaCarteirinha(m) {
  const p = perfilDe(m.id);
  const ganhas = medalhasDoMembro(m).filter((x) => x.ganha);
  const fixadas = p.fixadas.filter((id) => ganhas.some((x) => x.id === id));
  const discord = p.bOrig === 'discord' ? await bannerDoDiscord(m) : null;
  const banner = discord ? await baixarImagem(discord.url) : ((await arquivoDoPerfil(p, 'b')) ?? (await baixarImagem(midia(p.banner).url)));
  const avatar = (await arquivoDoPerfil(p, 'a')) ?? (await baixarImagem(fotoDoDiscord(m)));
  const medalhas = await Promise.all(fixadas.map((id) => baixarImagem(midia(`banners/medalhas/${id}.png`).url)));
  const s = lerEstatisticas().pessoas[m.id];
  return {
    banner, cor: discord?.cor ?? null, avatar, ap: p.ap,
    nome: m.displayName, usuario: m.user.username, entrou: tempoDeCasa(m.joinedTimestamp),
    medalhas: medalhas.filter(Boolean),
    cargos: cargosVisiveis(m),
    stats: [[(s?.m ?? 0).toLocaleString('pt-BR'), 'mensagens'], [`${Math.floor(tempoDeCall(m.id).total / 3600).toLocaleString('pt-BR')} h`, 'em call'], [String(ganhas.length), 'medalhas']],
    rodape: `${m.guild.name.toUpperCase()} · CARTEIRINHA`,
  };
}

// Depósito: anexo de membro fica como mensagem num canal escondido do servidor, não no Gist (lib/anexos.js explica por quê).
// A staff enxerga o canal: apagar uma mensagem lá tira a imagem do perfil de quem mandou.
const NOME_DEPOSITO = 'deposito-do-bot';
// Um canal por servidor; enquanto cria, quem pedir junto espera o mesmo
const criandoDeposito = new Map();
/** Erro do Discord não vai pra tela do membro: fica no log, e ele recebe um aviso que dá pra entender */
function naoGuardou(erro) {
  console.error('Depósito de imagens:', erro.message);
  throw comStatus(503, 'Não consegui guardar a imagem no Discord agora. Tenta de novo daqui a pouco, ou usa um link.');
}

async function canalDoDeposito() {
  const guild = servidor();
  if (!guild) throw comStatus(503, 'O bot está dormindo. Tente de novo em 1 minuto.');
  const canal = guild.channels.cache.find((c) => c.name === NOME_DEPOSITO && c.type === ChannelType.GuildText);
  if (canal) return canal;
  if (!guild.members.me?.permissions.has(P.ManageChannels)) {
    throw comStatus(503, 'Por enquanto não dá pra anexar: falta o bot ter a permissão Gerenciar canais. Usa um link, ou pede pra staff liberar.');
  }
  const staff = dados.config().tickets.staffId;
  if (!criandoDeposito.has(guild.id)) criandoDeposito.set(guild.id, guild.channels
    .create({
      name: NOME_DEPOSITO,
      type: ChannelType.GuildText,
      topic: 'Imagens que os membros mandaram pro perfil. Apagar uma mensagem aqui tira a imagem do perfil de quem mandou.',
      permissionOverwrites: [
        { id: guild.id, deny: [P.ViewChannel] },
        { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages] },
        ...(staff && guild.roles.cache.has(staff) ? [{ id: staff, allow: [P.ViewChannel, P.ReadMessageHistory, P.ManageMessages] }] : []),
      ],
    })
    .catch(naoGuardou)
    .finally(() => criandoDeposito.delete(guild.id)));
  return criandoDeposito.get(guild.id);
}

usarDeposito({
  async guardar(buffer, nome, legenda) {
    const canal = await canalDoDeposito();
    const msg = await canal.send({ content: legenda, files: [{ attachment: buffer, name: nome }], allowedMentions: { parse: [] } }).catch(naoGuardou);
    return { canal: canal.id, msg: msg.id };
  },
  // O link do arquivo vence depois de um tempo: pega um novo na mensagem a cada leitura
  async ler({ canal, msg }) {
    const c = await client.channels.fetch(canal).catch(() => null);
    const url = (await c?.messages.fetch(msg).catch(() => null))?.attachments.first()?.url;
    if (!url) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  },
  async apagar({ canal, msg }) {
    const c = await client.channels.fetch(canal).catch(() => null);
    await c?.messages.delete(msg).catch((erro) => {
      if (erro.code !== 10008) throw erro; // 10008 = a mensagem já não existe
    });
  },
});

/** Conta um envio de imagem da pessoa, ou recusa se ela passou do limite */
function limitarEnvios(userId) {
  if (!podeEnviar(userId)) throw comStatus(429, 'Calma aí: dá pra trocar de imagem até 5 vezes a cada 10 minutos.');
}

/** Apaga as imagens que nem as configs nem os perfis de NENHUM servidor usam mais. Falhar aqui não atrapalha quem chamou. */
const limparImagens = (opcoes) =>
  limparAnexos({ atual: dados.config(), configs: dados.todasAsConfigs(), perfis: todosOsPerfis() }, opcoes).catch((erro) => console.error('Não consegui apagar imagens antigas:', erro.message));

/** Cartão de alguém na lista pública: banner, foto, medalhas fixadas (que ainda valem) e 3 cargos */
async function cartaoDoMembro(m) {
  const p = perfilDe(m.id);
  const v = await visualDe(m, p);
  const ganhas = new Set(medalhasDoMembro(m).filter((x) => x.ganha).map((x) => x.id));
  // Aniversário só sai daqui do jeito que a pessoa deixou ver (escondido = nem a data vai pro site)
  const niver = textoDoAniversario(lerAniversarios().find((x) => x.userId === m.id), p.niverVis, hojeNoBrasil());
  return {
    id: m.id, nome: m.displayName, usuario: m.user.username, avatar: v.avatar, entrou: m.joinedTimestamp,
    banner: v.banner, cor: v.cor, bio: p.bio, medalhas: p.fixadas.filter((id) => ganhas.has(id)), cargos: cargosVisiveis(m, 3),
    ap: p.ap, niver,
    // Só as listas que a pessoa deixou aparecer
    fav: favoritosPublicos(p).map((f) => ({ tipo: f.tipo, itens: f.itens })),
    // Quais redes aparecem (os cartões vêm por /api/redes, só quando abrem o perfil)
    redes: redesPublicas(p).map((r) => r.rede),
  };
}

/** Quem pode aparecer na lista pública sem a intent "Server Members": quem o bot já viu + quem montou perfil */
async function membrosConhecidos(guild) {
  if (temMembros()) return [...guild.members.cache.values()];
  const faltam = Object.keys(lerPerfis()).filter((id) => !guild.members.cache.has(id)).slice(0, 50);
  for (const id of faltam) await guild.members.fetch(id).catch(() => null);
  return [...guild.members.cache.values()];
}

/** /medalha (staff): soma (ou tira) medalha de evento */
async function responderMedalha(i) {
  try {
    if (!ehStaffTicket(i.member)) return void (await i.reply({ content: 'Só a staff dá medalha.', flags: MessageFlags.Ephemeral }));
    const alvo = i.options.getUser('membro', true);
    if (alvo.bot) return void (await i.reply({ content: 'Bot não ganha medalha (nem eu).', flags: MessageFlags.Ephemeral }));
    const m = MEDALHAS.find((x) => x.id === i.options.getString('medalha', true));
    const qtd = i.options.getInteger('quantidade') ?? 1;
    const total = somarEvento(alvo.id, m.id, qtd);
    await gravarEstatisticas();
    const texto = total >= m.max && total - qtd < m.max
      ? `🏅 ${alvo} conquistou a medalha **${m.nome}**!`
      : `${qtd >= 0 ? '➕' : '➖'} ${alvo} agora tem ${Math.min(total, m.max)}/${m.max} em **${m.nome}**.`;
    await i.reply({ content: texto, allowedMentions: { users: [alvo.id] } });
  } catch (erro) {
    console.error('Medalha:', erro);
  }
}

/** Conta mensagem pras medalhas (só do servidor configurado e de gente, não de bot) */
function contarParaMedalhas(msg) {
  if (soPainel || !msg.inGuild() || msg.author.bot || msg.webhookId || msg.guildId !== dados.config().servidorId) return;
  contarMensagemDaPessoa(msg.author.id);
}

/** Entrou/saiu de call (mudar de canal não para o relógio; canal de AFK não conta) */
function mudouDeCall(antes, depois) {
  if (soPainel || depois.guild.id !== dados.config().servidorId || depois.member?.user.bot) return;
  const afk = depois.guild.afkChannelId;
  const naCall = !!depois.channelId && depois.channelId !== afk;
  if (naCall) entrouNaCall(depois.id);
  else saiuDaCall(depois.id);
}

/** Desligando (deploy novo na Render): fecha as calls abertas e grava os contadores */
async function salvarAntesDeSair() {
  fecharCalls();
  await gravarEstatisticas();
  await gravarOuvidas();
  await dados.esperarGravacao();
}

// ---------- /perfil, /medalhas, /painel, /tema simular e /privacidade ----------
const efemero = (conteudo) => ({ ...conteudo, flags: (conteudo.flags ?? 0) | MessageFlags.Ephemeral });
const linhaDeStats = (m) => {
  const s = lerEstatisticas().pessoas[m.id];
  return `💬 ${(s?.m ?? 0).toLocaleString('pt-BR')} mensagens · 🎧 ${Math.floor(tempoDeCall(m.id).total / 3600)} h em call · entrou <t:${Math.floor((m.joinedTimestamp ?? Date.now()) / 1000)}:R>`;
};

/** Plano B do /perfil: se a imagem não sair, a pessoa ainda recebe os dados em texto */
function perfilEmTexto(m) {
  const p = perfilDe(m.id);
  const medalhas = medalhasDoMembro(m);
  const ganhas = medalhas.filter((x) => x.ganha);
  const fixadas = p.fixadas.map((id) => ganhas.find((x) => x.id === id)).filter(Boolean);
  const cargos = cargosVisiveis(m, 3).map((c) => c.nome).join(' · ');
  return [
    `**${m.displayName}**`,
    cargos && `-# ${cargos}`,
    p.bio && `> ${p.bio}`,
    `🏅 **${ganhas.length} de ${medalhas.length} medalhas**${fixadas.length ? `: ${fixadas.map((x) => x.nome).join(', ')}` : ''}`,
    linhaDeStats(m),
    `-# Perfil completo no site: ${URL_SITE}painel.html`,
  ].filter(Boolean).join('\n');
}

/** /perfil [membro]: a carteirinha desenhada, como imagem anexada (GIF se o banner ou a foto for animado) */
/** Aniversário na ficha: do jeito que a pessoa deixou ver */
function aniversarioDaFicha(m) {
  const registro = lerAniversarios().find((x) => x.userId === m.id);
  if (!registro) return 'Ainda não cadastrou (é com /aniversario cadastrar).';
  return textoDoAniversario(registro, perfilDe(m.id).niverVis, hojeNoBrasil()) ?? 'Escondido pelo dono do perfil.';
}

/** Medalhas ganhas, em imagem, pra ficha */
async function trofeusDe(m) {
  const ganhas = medalhasDoMembro(m).filter((x) => x.ganha);
  const imgs = await Promise.all(ganhas.map((x) => baixarImagem(midia(`banners/medalhas/${x.id}.png`).url)));
  return { imgs: imgs.filter(Boolean), ganhas: ganhas.length, total: MEDALHAS.length };
}

/** Só o que a ficha com título usa: foto, nome, aparência e rodapé */
async function dadosDoCabecalho(m) {
  const p = perfilDe(m.id);
  return {
    avatar: (await arquivoDoPerfil(p, 'a')) ?? (await baixarImagem(fotoDoDiscord(m))),
    nome: m.displayName, usuario: m.user.username, ap: p.ap,
    rodape: `${m.guild.name.toUpperCase()} · CARTEIRINHA`,
  };
}

const FICHAS = { completo: ['perfil', ''], trofeus: ['trofeus', 'TROFÉUS'], niver: ['aniversario', 'ANIVERSÁRIO'], favoritos: ['favoritos', 'FAVORITOS'], redes: ['redes', 'REDES'] };

/** Imagem de cartão de rede: só das próprias redes (pôster do Letterboxd, capa da Steam) */
function imagemDeRede(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ['ltrbxd.com', 'steamstatic.com', 'scdn.co', 'spotifycdn.com', 'jtvnw.net'].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Cartões das redes que a pessoa deixou aparecer, com as imagens baixadas */
/** Spotify: a música de agora (status do Discord) e as últimas ouvidas por cima do cartão (que fica guardado 30 min) */
function comOuvindo(cartao, userId) {
  if (cartao.rede !== 'spotify') return cartao;
  const agora = ouvindoAgora(userId);
  const ultimas = ultimasOuvidas(userId);
  if (!ultimas.length) return cartao;
  const itens = ultimas.slice(0, 3).map((x) => ({ t: x.artista ? `${x.t} — ${x.artista}` : x.t, src: x.capa, s: agora?.id === x.id ? 'tocando agora' : haQuanto(x.quando) }));
  return { ...cartao, status: agora ? 'OUVINDO AGORA' : cartao.status, itens, rotulo: agora ? 'OUVINDO AGORA' : 'OUVIDAS RECENTEMENTE' };
}

/** Spotify pelo status do Discord: só de quem ligou o Spotify no perfil (do servidor de onde veio o evento) */
function mudouPresenca(_, depois) {
  const userId = depois?.userId;
  if (!userId || !perfilGuardado(userId)?.redes?.spotify) return;
  mudouOuvindo(userId, faixaDoStatus(depois.activities));
}

async function redesDaFicha(m) {
  const cartoes = (await Promise.all(redesPublicas(perfilDe(m.id)).map(({ rede, conta }) => cartaoGuardado(rede, conta)))).map((c) => comOuvindo(c, m.id));
  return Promise.all(cartoes.map(async (c) => ({ ...c, itens: await Promise.all((c.itens ?? []).map(async (it) => ({ ...it, img: imagemDeRede(it.src) ? await baixarImagem(it.src) : null }))) })));
}
const PROPORCAO = { jogos: 3 / 4, filmes: 2 / 3, livros: 2 / 3, musicas: 1 };

/** Favoritos públicos com as capas baixadas (a capa que falhar vira o banner da galeria) */
async function favoritosDaFicha(m) {
  return Promise.all(
    favoritosPublicos(perfilDe(m.id)).map(async (f) => ({
      nome: f.nome.toUpperCase(),
      proporcao: PROPORCAO[f.tipo],
      itens: await Promise.all(f.itens.map(async (x) => ({ t: x.t, img: (capaPermitida(x.capa) ? await baixarImagem(x.capa) : null) ?? (await baixarImagem(midia(capaDaGaleria(f.tipo, x.t)).url)) }))),
    })),
  );
}

/** /perfil completo, /trofeus e /aniversario ver: ficha em imagem de alguém (padrão: quem pediu) */
async function responderFicha(i, tipo) {
  const alvo = i.options.getUser('membro') ?? i.user;
  const m = await i.guild.members.fetch(alvo.id).catch(() => null);
  if (!m) return void (await i.reply(efemero({ content: 'Essa pessoa não está no servidor.' })));
  if (m.user.bot) return void (await i.reply(efemero({ content: 'Bot não tem ficha (nem eu, infelizmente).' })));
  await i.deferReply();
  const [prefixo, titulo] = FICHAS[tipo];
  const completo = tipo === 'completo';
  // Sem imagem (canvas ou download falhou): responde em texto, sem deixar o "pensando…" pendurado
  const emTexto = () => {
    const favs = favoritosPublicos(perfilDe(m.id)).map((f) => `⭐ ${f.nome}: ${f.itens.map((x) => x.t).join(', ')}`);
    return [
      completo ? perfilEmTexto(m) : `**${m.displayName}**`,
      (completo || tipo === 'niver') && `🎂 ${aniversarioDaFicha(m)}`,
      (completo || tipo === 'redes') && `🔗 ${redesPublicas(perfilDe(m.id)).map((r) => (r.conta.user ? `${r.rede}: ${r.conta.user}` : r.rede)).join(' · ') || 'nenhuma rede'}`,
      ...(completo || tipo === 'favoritos' ? favs : []),
      (completo || tipo === 'trofeus') && `🏅 ${medalhasDoMembro(m).filter((x) => x.ganha).map((x) => x.nome).join(', ')}`,
    ].filter(Boolean).join('\n');
  };
  try {
    const d = completo ? await dadosDaCarteirinha(m) : await dadosDoCabecalho(m);
    if (completo || tipo === 'niver') d.niver = aniversarioDaFicha(m);
    if (completo || tipo === 'redes') d.redes = await redesDaFicha(m);
    if (completo || tipo === 'favoritos') d.favoritos = await favoritosDaFicha(m);
    if (completo || tipo === 'trofeus') d.trofeus = await trofeusDe(m);
    const png = await desenharFicha(d, { tipo: completo ? 'completo' : 'titulo', titulo });
    if (!png) throw new Error('o canvas não carregou');
    await i.editReply({ files: [{ attachment: png, name: nomeDoArquivo(m.displayName, 'png').replace(/^perfil-/, `${prefixo}-`) }] });
  } catch (erro) {
    console.error('Ficha:', erro.message);
    await i.editReply({ content: emTexto(), allowedMentions: { parse: [] } }).catch(() => {});
  }
}

export async function responderPerfil(i) {
  if (i.options.getBoolean('completo')) return responderFicha(i, 'completo');
  const alvo = i.options.getUser('membro') ?? i.user;
  const m = await i.guild.members.fetch(alvo.id).catch(() => null);
  if (!m) return void (await i.reply(efemero({ content: 'Essa pessoa não está no servidor.' })));
  if (m.user.bot) return void (await i.reply(efemero({ content: 'Bot não tem carteirinha (nem eu, infelizmente).' })));
  await i.deferReply(); // GIF pode levar bem mais que os 3 segundos que o Discord espera
  try {
    const desenho = await desenharCarteirinha(await dadosDaCarteirinha(m));
    if (!desenho) throw new Error('o canvas não carregou');
    await i.editReply({ files: [{ attachment: desenho.buffer, name: nomeDoArquivo(m.displayName, desenho.ext) }] });
  } catch (erro) {
    console.error('Carteirinha:', erro.message);
    await i.editReply({ content: perfilEmTexto(m), allowedMentions: { parse: [] } });
  }
}

/** /medalhas: todas, com o que falta (só pra você) */
async function responderMedalhas(i) {
  const m = i.member;
  const linhas = medalhasDoMembro(m).map((x) => {
    if (x.ganha) return `✅ **${x.nome}** · ${x.desc}`;
    if (x.rar === 'SECRETA') return '❔ **Medalha secreta** · ninguém conta como ganha';
    const falta = x.max > 1 ? ` (${x.v}/${x.max}${x.un ? ` ${x.un}` : ''})` : '';
    return `⬜ **${x.nome}** · ${x.desc}${falta}${x.origem === 'evento' ? ' · a staff dá depois do evento' : ''}`;
  });
  const ganhas = linhas.filter((l) => l.startsWith('✅')).length;
  await i.reply(efemero(montarV2({ cor: 0xf2c14e, titulo: `🏅 Suas medalhas: ${ganhas} de ${linhas.length}`, texto: linhas.join('\n'), rodape: `Fixe até 3 no seu perfil: ${URL_SITE}painel.html` })));
}

/** /tema simular: como o painel de cores fica numa data festiva (só pra quem pediu) */
async function responderTema(i) {
  if (!ehStaffTicket(i.member)) return void (await i.reply(efemero({ content: 'Só a staff simula tema.' })));
  const cfg = dados.config();
  const tema = cfg.temas.lista.find((t) => t.id === i.options.getString('festa', true));
  if (!tema) return void (await i.reply(efemero({ content: 'Esse tema não existe mais.' })));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const msg = await montarMensagem(i.guild, cfg, tema);
  // A prévia vai numa mensagem nova (a resposta adiada é de texto e não vira layout novo do Discord)
  await i.editReply(`Prévia do painel de cores em **${tema.nome}** (só você vê; nada mudou no servidor):`);
  await i.followUp(efemero(msg));
}

/** /painel: cartão com os botões que abrem o site (o Discord abre o link direto, sem copiar e colar) */
async function responderPainel(i) {
  const msg = montarV2({
    cor: 0xf2c14e,
    titulo: '🎓 Painel do Manda Chuva',
    texto: 'Entra com a sua conta do Discord pra ver as notícias do bot, a turma toda e montar o seu perfil com banner e medalhas. A staff configura o bot por lá também.',
    linhas: [{ type: 1, components: [
      { type: 2, style: 5, label: 'Abrir painel', emoji: { name: '🖥️' }, url: `${URL_SITE}painel.html` },
      { type: 2, style: 5, label: 'Central do Bot', emoji: { name: '📘' }, url: `${URL_SITE}central.html` },
    ] }],
  });
  await i.reply(i.options.getBoolean('mostrar') ? msg : efemero(msg));
}

/** /privacidade ver | apagar: o que o bot guarda da pessoa e o botão pra apagar */
async function responderPrivacidade(i) {
  const id = i.user.id;
  const niver = lerAniversarios().find((p) => p.userId === id);
  const perfil = perfilGuardado(id);
  const s = lerEstatisticas().pessoas[id];
  const avisos = lerAvisos().filter((a) => a.userId === id).length;
  const lista = [
    `🎂 Aniversário: ${niver ? `${niver.d}${niver.ano ? `/${niver.ano}` : ''}` : 'nenhum'}`,
    `🪪 Perfil do site${perfil?.vinc ? ' (vinculado: o mesmo em outros servidores)' : ''}: ${perfil ? `banner, foto, bio, cores e fonte do cartão, quem vê seu aniversário${perfil.fixadas?.length ? ', medalhas fixadas' : ''}${Object.values(perfil.fav ?? {}).some((x) => Array.isArray(x) && x.length) ? ', favoritos' : ''}` : 'nunca mexeu'}`,
    `🔗 Redes vinculadas: ${Object.entries(perfil?.redes ?? {}).map(([r, c]) => (c.user ? `${r} (@${c.user})` : `${r} (ID ${c.id})`)).join(', ') || 'nenhuma'}`,
    ...(ultimasOuvidas(id).length ? [`🎧 Últimas músicas (Spotify pelo seu status do Discord): ${ultimasOuvidas(id).length}`] : []),
    `📊 Contadores das medalhas: ${s ? `${s.m} mensagens, ${Math.floor((s.voz ?? 0) / 3600)} h em call, ${s.cores} trocas de cor` : 'nada ainda'}`,
    `📒 Avisos de moderação: ${avisos} (ficam com a staff até vencer, não dá pra apagar por aqui)`,
  ].join('\n');
  if (i.options.getSubcommand() === 'ver') {
    return void (await i.reply(efemero(montarV2({ cor: 0x1f2a5c, titulo: '🔒 O que o Manda Chuva guarda de você', texto: lista, rodape: `Política de Privacidade: ${URL_SITE}central.html#privacidade` }))));
  }
  await i.reply(efemero(montarV2({
    cor: 0xc4363c,
    titulo: 'Apagar seus dados?',
    texto: `${lista}\n\nVai apagar aniversário, perfil (com as imagens que você enviou) e contadores das medalhas. Não tem volta.`,
    linhas: [{ type: 1, components: [{ type: 2, style: 4, custom_id: `priv:apagar:${id}`, label: 'Apagar tudo', emoji: { name: '🗑️' } }] }],
  })));
}

/** Botão "Apagar tudo" do /privacidade apagar */
export async function apagarMeusDados(i) {
  const id = i.customId.split(':')[2];
  if (id !== i.user.id) return void (await i.reply(efemero({ content: 'Esse botão não é seu.' })));
  await i.deferUpdate();
  await tirarAniversario(id);
  const imagens = refsDeAnexo(perfilGuardado(id));
  await apagarPerfil(id);
  await limparImagens({ imediatos: imagens });
  apagarEstatisticas(id);
  esquecerOuvidas(id);
  await gravarEstatisticas();
  await gravarOuvidas();
  await i.editReply(montarV2({ cor: 0x2f8f5b, titulo: '🗑️ Pronto, apagado', texto: 'Seu aniversário, perfil, imagens enviadas e contadores das medalhas sumiram. Se continuar no servidor, os contadores recomeçam do zero.' }));
}

/** Fila do painel: abertos, do mais novo pro mais velho */
function filaDeTickets(guild) {
  return lerTickets()
    .abertos.filter((x) => guild.channels.cache.has(x.canalId))
    .sort((a, b) => b.aberto - a.aberto)
    .map((x) => ({ num: numero(x.num), emoji: x.emoji, quem: x.nome, userId: x.userId, motivo: x.motivo, aberto: x.aberto, quando: haQuanto(x.aberto), resp: x.respNome, canalId: x.canalId, link: `https://discord.com/channels/${guild.id}/${x.canalId}` }));
}

async function donoDoBot() {
  const app = await client.application.fetch();
  const dono = app.owner;
  if (!dono) return null;
  return 'ownerId' in dono ? client.users.fetch(dono.ownerId) : dono;
}

// A API (api.js) só conversa com o bot por aqui
export const api = {
  saude: () => ({ ok: true, bot: client.isReady() ? 'online' : 'offline', desde: NO_AR_DESDE, convite: client.isReady() ? linkConvite() : null }),
  clientId: () => client.application?.id ?? client.user?.id ?? null,
  servidoresDe,
  /** O bot está nesse servidor? (o painel escolhe com o X-Servidor) */
  temServidor: (id) => !!servidor(String(id ?? '')),
  // /convite da API: o que vai no link do Discord
  dadosDoConvite: () => (client.isReady() ? { clientId: client.application?.id ?? client.user.id, permissoes: PERMISSOES.reduce((a, b) => a | b, 0n).toString() } : null),
  // Depois do convite: o bot está no servidor? (o aviso do Discord pode chegar um pouco depois da confirmação)
  async servidorDoConvite(id) {
    for (let i = 0; i < 16 && client.isReady() && !client.guilds.cache.has(id); i++) await new Promise((ok) => setTimeout(ok, 500));
    const g = client.isReady() ? client.guilds.cache.get(id) : null;
    return g ? { nome: g.name } : null;
  },
  papelDe,

  // Quem entrou no site: papel, conta, perfil, medalhas e números (com a senha do painel: só o papel)
  async eu(quem) {
    if (quem.tipo !== 'discord') return { papel: quem.papel, papelTxt: 'Senha do painel', usuario: null };
    const guild = servidor();
    const m = guild && (await guild.members.fetch(quem.id).catch(() => null));
    if (!m) throw comStatus(403, 'Você não está no servidor do bot.');
    const medalhas = medalhasDoMembro(m);
    const staffNome = guild.roles.cache.get(dados.config().tickets.staffId)?.name;
    const s = lerEstatisticas().pessoas[m.id];
    return {
      papel: quem.papel,
      papelTxt: quem.papel === 'admin' ? 'Staff · Reitoria' : quem.papel === 'staff' ? `Staff · ${staffNome ?? 'Staff'}` : 'Membro',
      usuario: { id: m.id, nome: m.displayName, usuario: m.user.username, avatar: m.displayAvatarURL({ size: 128, extension: 'png' }), entrou: m.joinedTimestamp, cargos: cargosVisiveis(m) },
      perfil: perfilDe(m.id),
      // Em que outros servidores do bot a pessoa usa o perfil compartilhado
      vinculo: vinculoDe(m.id),
      // Spotify e Twitch só ligam quando o dono pôs as chaves do app na hospedagem
      redesApp: { spotify: temSpotify(), twitch: temTwitch() },
      visual: await visualDe(m),
      // O próprio aniversário (só pra quem é dono): o site mostra a data e a prévia de cada visibilidade
      niver: (({ d, ano } = {}) => (d ? { d, ano: ano ?? null } : null))(lerAniversarios().find((x) => x.userId === m.id)),
      medalhas,
      stats: { mensagens: s?.m ?? 0, horas: Math.floor(tempoDeCall(m.id).total / 3600), medalhas: medalhas.filter((x) => x.ganha).length },
    };
  },

  // Meu perfil › Vincular: usar neste servidor o perfil compartilhado (ou voltar a ter um só daqui)
  async vincularPerfil(quem, corpo) {
    if (quem.tipo !== 'discord') throw comStatus(400, 'Entre com o Discord pra ter perfil.');
    const m = await servidor()?.members.fetch(quem.id).catch(() => null);
    if (!m) throw comStatus(403, 'Você não está no servidor do bot.');
    const r = await vincularPerfil(m.id, corpo?.on === true);
    if (r.erro) throw comStatus(500, r.erro);
    return { ok: true, perfil: r.perfil, vinculo: vinculoDe(m.id), visual: await visualDe(m, r.perfil) };
  },

  async salvarPerfil(quem, corpo) {
    if (quem.tipo !== 'discord') throw comStatus(400, 'Entre com o Discord pra ter perfil.');
    const m = await servidor()?.members.fetch(quem.id).catch(() => null);
    if (!m) throw comStatus(403, 'Você não está no servidor do bot.');
    // Link novo: o bot baixa pra conferir, então conta no mesmo limite dos anexos
    const provas = {
      async link(link) {
        limitarEnvios(m.id);
        const imagem = await lerLink(link);
        return imagem && { gif: imagem.tipo === 'image/gif' };
      },
    };
    const r = await salvarPerfil(m.id, corpo, medalhasDoMembro(m).filter((x) => x.ganha).map((x) => x.id), provas);
    if (r.erro) throw comStatus(400, r.erro);
    return { ok: true, perfil: r.perfil, visual: await visualDe(m, r.perfil) };
  },

  // Favoritos de Meu perfil: adicionar (o bot procura a capa), tirar ou esconder uma lista
  async favorito(quem, corpo) {
    if (quem.tipo !== 'discord') throw comStatus(400, 'Entre com o Discord pra ter perfil.');
    const m = await servidor()?.members.fetch(quem.id).catch(() => null);
    if (!m) throw comStatus(403, 'Você não está no servidor do bot.');
    if (corpo?.acao === 'add' && !podeProcurar(m.id)) throw comStatus(429, 'Calma aí: dá pra adicionar até 15 favoritos a cada 10 minutos.');
    // Escolheu uma sugestão: fica a capa dela (se foi o bot que sugeriu); escreveu à mão: o bot procura
    const escolhida = corpo?.acao === 'add' && capaSugerida(corpo.capa) ? corpo.capa : null;
    const r = await mudarFavorito(m.id, corpo, (tipo, nome) => escolhida ?? acharCapa(tipo, nome));
    if (r.erro) throw comStatus(400, r.erro);
    return { ok: true, perfil: r.perfil };
  },

  // Sugestões enquanto a pessoa digita um favorito (nome certo e capa)
  async sugestoesDeFavorito(quem, params) {
    const tipo = params.get('tipo');
    if (!TIPOS_FAVORITOS.includes(tipo)) throw comStatus(400, 'Essa lista de favoritos não existe.');
    const itens = await sugerir(tipo, params.get('q'), { podeBuscar: () => podeSugerir(quem.id ?? 'senha') });
    if (!itens) throw comStatus(429, 'Calma aí, digitando rápido demais. Espera um pouquinho.');
    return { itens };
  },

  // Redes de Meu perfil: ligar (Letterboxd, Instagram), desligar ou esconder
  async rede(quem, corpo) {
    if (quem.tipo !== 'discord') throw comStatus(400, 'Entre com o Discord pra ter perfil.');
    const m = await servidor()?.members.fetch(quem.id).catch(() => null);
    if (!m) throw comStatus(403, 'Você não está no servidor do bot.');
    const antes = perfilDe(m.id).redes?.[corpo?.rede];
    const r = corpo?.rede === 'spotify' && corpo?.acao === 'ligar' ? await ligarPeloLink(m.id, corpo.user) : await mudarRede(m.id, corpo);
    if (r.erro) throw comStatus(400, r.erro);
    if (antes) esquecerCartao(corpo.rede, antes);
    if (corpo?.rede === 'spotify' && corpo?.acao === 'desligar') esquecerOuvidas(m.id);
    return { ok: true, perfil: r.perfil };
  },
  // Volta do login da Twitch, já conferida com a Twitch (api.js)
  async ligarTwitch(userId, conta) {
    const antes = perfilDe(userId).redes?.twitch;
    const r = await ligarTwitch(userId, conta);
    if (r.erro) console.error('Ligar a Twitch:', r.erro);
    if (antes) esquecerCartao('twitch', antes);
    esquecerCartao('twitch', conta);
  },
  // Volta do login da Steam, já conferida com a Steam (api.js)
  async ligarSteam(userId, steamid) {
    const r = await ligarSteam(userId, steamid);
    if (r.erro) console.error('Ligar a Steam:', r.erro);
    esquecerCartao('steam', { id: steamid });
  },
  // Cartões das redes de alguém (o que a pessoa deixou aparecer), pro site
  async cartoesDe(id) {
    const guild = servidor();
    if (!guild) throw comStatus(503, 'O bot está dormindo. Tente de novo em 1 minuto.');
    const m = /^\d{15,25}$/.test(String(id ?? '')) ? await guild.members.fetch(String(id)).catch(() => null) : null;
    if (!m) throw comStatus(404, 'Não achei essa pessoa no servidor.');
    return { redes: (await Promise.all(redesPublicas(perfilDe(m.id)).map(({ rede, conta }) => cartaoGuardado(rede, conta)))).map((c) => comOuvindo(c, m.id)) };
  },

  // Antes de ler o corpo da imagem: quem passou do limite nem chega a mandar os 8 MB pra memória do bot
  podeEnviarAnexo: (quem) => quem.tipo === 'discord' && limitarEnvios(quem.id),

  // Banner ou foto enviada em Meu perfil: guarda no depósito e já passa a usar
  async anexoDoPerfil(quem, corpo) {
    if (quem.tipo !== 'discord') throw comStatus(400, 'Entre com o Discord pra ter perfil.');
    const m = await servidor()?.members.fetch(quem.id).catch(() => null);
    if (!m) throw comStatus(403, 'Você não está no servidor do bot.');
    const alvo = corpo?.alvo === 'foto' ? 'foto' : 'banner';
    const { ref } = await salvarAnexo(corpo, { noDeposito: true, legenda: `${alvo === 'foto' ? 'Foto' : 'Banner'} de <@${m.id}>` });
    const r = await definirAnexo(m.id, alvo, ref, corpo?.nome);
    if (r.erro) throw comStatus(500, r.erro);
    return { ok: true, perfil: r.perfil, visual: await visualDe(m, r.perfil) };
  },

  // Imagem de link que o site mostra pelo bot (só o link salvo no perfil, nunca um endereço que venha no pedido)
  async imagemDoPerfil(id, tipo) {
    const link = perfilGuardado(id)?.[tipo === 'foto' ? 'aLink' : 'bLink'];
    return link ? lerLink(link) : null;
  },

  // O que membro (sem ser staff) vê: o bot, o nome do servidor e o jornal
  publico() {
    const user = client.isReady() ? client.user : null;
    const guild = servidor();
    return {
      bot: user ? { online: true, nome: user.username, avatar: user.displayAvatarURL({ size: 64 }), versao: VERSAO } : { online: false, versao: VERSAO },
      servidor: guild ? { id: guild.id, nome: guild.name, membros: guild.memberCount } : null,
      noticias: NOVIDADES,
    };
  },

  // Lista pública da turma (9 por página)
  async turma(params) {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot está dormindo. Tente de novo em 1 minuto.');
    const q = String(params.get('q') ?? '').trim().replace(/^@/, '').toLowerCase();
    let lista = await membrosConhecidos(guild);
    if (q && !temMembros()) lista = [...lista, ...(await guild.members.search({ query: q, limit: 50 }).catch(() => new Map())).values()];
    const vistos = new Set();
    lista = lista
      .filter((m) => !m.user.bot && !vistos.has(m.id) && vistos.add(m.id))
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
    const p = pagina(lista, params.get('pagina'), 9);
    return { ...p, itens: await Promise.all(p.itens.map(cartaoDoMembro)), completa: temMembros() };
  },

  // Medalha de evento pelo painel (a mesma conta do /medalha)
  async darMedalha(corpo) {
    const m = MEDALHAS.find((x) => x.id === corpo?.medalha && DE_EVENTO.includes(x.id));
    if (!m) throw comStatus(400, 'Essa medalha não é de evento.');
    const qtd = Math.max(-10, Math.min(10, Math.trunc(Number(corpo?.qtd)) || 1));
    const total = somarEvento(String(corpo?.userId ?? ''), m.id, qtd);
    await gravarEstatisticas();
    return { ok: true, total, mensagem: `${m.nome}: ${Math.min(total, m.max)}/${m.max}.` };
  },

  async estado() {
    const cfg = dados.config();
    const guild = servidor();
    const user = client.isReady() ? client.user : null;
    // recursos.membros = a intent "Server Members" está liberada no portal (sem ela: sem contagem de membros)
    const recursos = { membros: temMembros(), conteudo: temConteudo() };
    return {
      config: cfg,
      bot: user
        ? { online: true, soPainel, versao: VERSAO, recursos, nome: user.username, avatar: user.displayAvatarURL({ size: 64 }), convite: linkConvite() }
        : { online: false, soPainel, versao: VERSAO, recursos },
      // icone: null quando o servidor não tem ícone (o painel mostra a sigla, como o Discord)
      servidores: user ? client.guilds.cache.map((g) => ({ id: g.id, nome: g.name, icone: g.iconURL({ size: 64 }), sigla: g.nameAcronym })) : [],
      servidor: guild ? infoServidor(guild) : null,
      noticias: NOVIDADES,
      aniversarios: guild ? await comFoto(guild, lerAniversarios()) : [],
      ocorrencias: guild ? lerOcorrencias().slice(0, 100) : [],
      tickets: guild ? filaDeTickets(guild) : [],
      regrasMsg: guild ? mensagemDasRegras(guild) : null,
      obra: obraDaVez(),
      srvMontado: lerRegistro().srvMontado ?? null,
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

  async salvar(entradaBruta, quem) {
    // Hierarquia mexe em permissões: só quem gerencia o servidor (ou a senha do painel)
    const entrada = quem && quem.papel !== 'admin' && entradaBruta?.hierarquia ? { ...entradaBruta, hierarquia: null } : entradaBruta;
    const { cfg, erros } = dados.normalizar(entrada);
    erros.push(...errosDoPainel(cfg), ...errosDaHierarquia(entrada?.hierarquia));
    if (erros.length) throw comStatus(400, erros.join('\n'));
    // A config é sempre do servidor da vez (o painel escolhe qual com o X-Servidor)
    if (servidorAtual()) cfg.servidorId = servidorAtual();
    const rel = [];
    if (entrada !== entradaBruta) rel.push('A hierarquia de cargos só muda com quem gerencia o servidor: essa parte ficou de fora.');
    const guild = servidor();
    if (guild) {
      await sincronizarCargos(guild, cfg, rel);
      await aplicarHierarquia(guild, cfg, entrada?.hierarquia ?? null, rel);
      await sincronizarAutomod(guild, cfg, rel);
      await prepararTickets(guild, cfg, rel);
      await prepararRegras(guild, cfg, rel);
    } else rel.push(client.isReady() ? 'Escolha um servidor pra criar os cargos.' : 'Bot offline: a configuração foi salva; cargos e painéis atualizam quando salvar com ele online.');
    dados.salvarConfig(cfg);
    if (guild) {
      await atualizarPaineis(guild, rel);
      await publicarPainelTickets(guild, rel, cfg);
      await publicarRegras(guild, rel, cfg);
      await registrarComandos(guild);
    }
    const postadas = guild ? await anunciarNovidades() : [];
    if (postadas.length) rel.push(`Jornal do Campus: ${postadas.map((v) => `v${v}`).join(', ')} anunciada(s) no Discord.`);
    await avisarSeNaoGravou(rel);
    limparImagens();
    return { config: cfg, relatorio: rel };
  },

  // Imagem enviada pelo painel ("Anexar"): guarda e devolve a referência pra pôr na config
  anexo: (corpo) => salvarAnexo(corpo),
  lerAnexo: (id) => lerAnexo(id),

  // Lista de aniversários: adicionar alguém na mão ou tirar da lista (vale na hora, não espera o Salvar)
  // Aba Membros: busca, filtro por cargo e página (o painel escolhe quantos por página). Sem a intent "Server Members", só com busca.
  async membros(params) {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    const q = String(params.get('q') ?? '').trim();
    const cargo = String(params.get('cargo') ?? '');
    let membros;
    if (temMembros()) membros = [...guild.members.cache.values()];
    else if (q) membros = [...(await noDiscord(guild.members.search({ query: q.replace(/^@/, ''), limit: 100 }))).values()];
    else return { itens: [], pagina: 1, paginas: 1, total: 0, precisaBusca: true };
    const lista = filtrarMembros(membros.map((m) => ({ m, nome: m.displayName, usuario: m.user.username, cargos: [...m.roles.cache.keys()] })), { q, cargo });
    // Quantos por página o painel pediu (de 1 a 100)
    const por = Math.min(100, Math.max(1, Math.trunc(Number(params.get('por'))) || 6));
    const p = pagina(lista, params.get('pagina'), por);
    const avisos = lerAvisos();
    return { ...p, itens: p.itens.map((x) => descreverMembro(x.m, avisos)) };
  },

  async acaoMembro(corpo, quem) {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    const membro = await guild.members.fetch(String(corpo?.userId ?? '')).catch(() => null);
    if (!membro) throw comStatus(404, 'Essa pessoa não está mais no servidor.');
    const motivo = String(corpo?.motivo ?? '').trim().slice(0, 300);
    let por = POR_PAINEL;
    if (quem?.tipo === 'discord') {
      const eu = await guild.members.fetch(quem.id).catch(() => null);
      if (!eu) throw comStatus(403, 'Você não está no servidor.');
      if (membro.id === guild.ownerId || (eu.id !== guild.ownerId && membro.id !== eu.id && membro.roles.highest.position >= eu.roles.highest.position)) throw comStatus(403, 'Você não pode mexer em quem está no mesmo nível ou acima de você.');
      por = `por ${eu.displayName} (painel)`;
    }
    const mensagem = await moderar(guild, membro, { acao: String(corpo?.acao ?? ''), cargoId: corpo?.cargoId, motivo, duracao: corpo?.duracao, por });
    await dados.esperarGravacao();
    const agora = await guild.members.fetch({ user: membro.id, force: true }).catch(() => null);
    return { ok: true, mensagem, membro: agora ? descreverMembro(agora) : null };
  },

  // Fila de tickets no painel: Fechar (e Assumir, quando o painel sabe quem é a pessoa)
  async ticketAcao(corpo, quem) {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    const ticket = lerTickets().abertos.find((x) => numero(x.num) === String(corpo?.num ?? ''));
    if (!ticket) throw comStatus(404, 'Esse ticket já foi fechado.');
    if (corpo?.acao === 'fechar') {
      const pessoa = quem?.tipo === 'discord' ? quem : null;
      await fecharTicket(guild, ticket, { porId: pessoa?.id ?? null, porNome: pessoa?.nome ?? 'a staff (pelo painel)', motivo: String(corpo.motivo ?? '').trim().slice(0, 200) });
      await dados.esperarGravacao();
      return { ok: true, mensagem: `Ticket #${numero(ticket.num)} fechado. O canal some em ${APAGAR[dados.config().tickets.apagar][1]}.` };
    }
    if (corpo?.acao === 'assumir') {
      const membro = await guild.members.fetch(String(quem?.tipo === 'discord' ? quem.id : (corpo.userId ?? ''))).catch(() => null);
      if (!membro) throw comStatus(400, 'Não sei quem você é no servidor.');
      const ja = await assumirTicket(ticket, membro);
      if (!ja) await guild.channels.cache.get(ticket.canalId)?.send({ content: `🙋 ${membro} assumiu o ticket (pelo painel).`, allowedMentions: { parse: [] } }).catch(() => {});
      return { ok: true, mensagem: ja ?? `Você assumiu o ticket #${numero(ticket.num)}.` };
    }
    throw comStatus(400, 'Ação desconhecida.');
  },

  // Livro de ocorrências: desfaz aviso, silêncio ou ban (expulsão não tem volta)
  async desfazer(corpo) {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    const o = lerOcorrencias().find((x) => x.id === corpo?.id);
    if (!o) throw comStatus(404, 'Essa ocorrência não está mais no livro.');
    if (o.desfeito) return { ok: true, mensagem: 'Já estava desfeito.' };
    if (!o.desfazer) throw comStatus(400, 'Essa não tem volta: quem foi expulso só volta com convite.');
    if (o.desfazer.startsWith('aviso:')) tirarAviso(o.desfazer.slice(6));
    else if (o.desfazer === 'silencio') {
      const membro = await guild.members.fetch(o.userId).catch(() => null);
      if (membro?.isCommunicationDisabled()) await noDiscord(membro.timeout(null, 'Desfeito no painel do Manda Chuva'));
      await marcarSemPrazo(o.userId, false);
    } else if (o.desfazer === 'ban') await noDiscord(guild.bans.remove(o.userId, 'Desfeito no painel do Manda Chuva'));
    marcarDesfeita(o.id);
    await dados.esperarGravacao();
    return { ok: true, mensagem: `Desfeito: ${o.nome} ${o.tipo === 'AVISO' ? 'ficou com um aviso a menos' : o.tipo === 'BAN' ? 'pode voltar pro servidor' : 'pode falar de novo'}.` };
  },

  async aniversario(corpo) {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    if (corpo?.acao === 'remover') {
      await tirarAniversario(String(corpo.userId ?? ''));
      return { ok: true };
    }
    const q = String(corpo?.membro ?? '').trim().replace(/^@/, '');
    if (!q) throw comStatus(400, 'Faltou o nome do membro.');
    const ano = String(corpo?.ano ?? '').trim();
    const lida = lerData(`${String(corpo?.data ?? '').trim()}${ano ? `/${ano}` : ''}`, hojeNoBrasil());
    if (lida.erro) throw comStatus(400, lida.erro);
    const membro = await acharMembro(guild, q);
    if (!membro) throw comStatus(400, 'Não achei esse membro no servidor.');
    if (lerAniversarios().some((p) => p.userId === membro.id)) throw comStatus(400, `${membro.displayName} já está na lista.`);
    const erro = await salvarAniversario({ userId: membro.id, nome: membro.displayName, d: lida.d, ano: lida.ano });
    if (erro) throw comStatus(500, `Não consegui guardar: ${erro}`);
    return { ok: true, nome: membro.displayName, d: lida.d };
  },

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

  // Aba Servidor (só quem gerencia o servidor): a config já foi salva antes; a obra roda em segundo plano
  montarServidor() {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    if (!dados.config().srv.cats.length) throw comStatus(400, 'Escolhe pelo menos uma categoria.');
    return { obra: comecarObra('montar', (t) => montarServidor(guild, t)) };
  },
  renomearServidor() {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    return { obra: comecarObra('renomear', (t) => renomearServidor(guild, t)) };
  },
  // Copiar a config de outro servidor (canais e cargos viram os de mesmo nome aqui). Não grava: o painel mostra e só vale no Salvar.
  async copiarConfig(corpo, quem) {
    const destino = servidor();
    const origem = servidor(String(corpo?.de ?? ''));
    if (!destino || !origem || origem.id === destino.id) throw comStatus(400, 'Escolha outro servidor pra copiar.');
    if (quem?.tipo === 'discord' && (await papelDe(quem.id, origem)) !== 'admin') throw comStatus(403, 'Só dá pra copiar de um servidor que você também gerencia.');
    const { cfg: nova, achados, faltando } = traduzirConfig(noServidor(origem.id, () => dados.config()), origem, destino);
    const { cfg } = dados.normalizar(nova, dados.config());
    const rel = [`Configuração de ${origem.name} copiada. Confira as abas e clique em Salvar pra valer aqui.`];
    if (achados) rel.push(`${achados} canal(is) e cargo(s) achado(s) pelo nome.`);
    if (faltando.length) rel.push(`Não tem aqui (ficou vazio pra escolher): ${faltando.slice(0, 12).join(', ')}${faltando.length > 12 ? '…' : ''}.`);
    return { config: cfg, relatorio: rel };
  },
  andamentoServidor: () => ({ obra: obraDaVez(), montado: lerRegistro().srvMontado ?? null }),

  // Aba Regras: "Enviar no #canal" / "Atualizar mensagem" (a config já foi salva antes)
  async enviarRegras() {
    const guild = servidor();
    if (!guild) throw comStatus(400, 'O bot precisa estar online e com um servidor escolhido e salvo.');
    const rel = [];
    const primeira = !lerRegistro().regrasMsg;
    const msg = await publicarRegras(guild, rel, dados.config(), { forcar: true });
    // Na primeira vez o /regras passa a existir
    if (primeira) await registrarComandos(guild);
    await avisarSeNaoGravou(rel);
    return { link: msg.url, relatorio: rel, regrasMsg: mensagemDasRegras(guild) };
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
  eventosPorServidor(c);
  // Modo só painel: este processo só mexe no painel; quem responde aos botões é o bot hospedado
  if (!soPainel) c.on(Events.InteractionCreate, responderInteracao);
  if (!soPainel) c.on(Events.AutoModerationActionExecution, (ex) => tratarAutomod(ex).catch((erro) => console.error('Auto-mod:', erro)));
  if (!soPainel) c.on(Events.MessageCreate, (msg) => contarMensagem(msg).catch((erro) => console.error('Anti-spam:', erro)));
  if (!soPainel) c.on(Events.MessageCreate, contarParaMedalhas);
  if (!soPainel) c.on(Events.VoiceStateUpdate, mudouDeCall);
  if (!soPainel) c.on(Events.PresenceUpdate, mudouPresenca);
  if (!soPainel) c.on(Events.GuildMemberAdd, (membro) => voltouSilenciado(membro).catch((erro) => console.error('Silêncio sem prazo:', explicarErro(erro))));
  if (!soPainel) ligarPortaria(c, postarPortaria);
  c.once(Events.ClientReady, async (pronto) => {
    console.log(`✅ Bot online como ${pronto.user.tag} (versão ${VERSAO})${soPainel ? ' (modo só painel: não responde aos botões)' : ''}`);
    console.log(`🔗 Link para adicionar o bot a um servidor:\n${pronto.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: PERMISSOES })}`);
    // Em cada servidor: comandos sempre na versão deste código (uma atualização pode ter mudado o /aniversario, por exemplo)
    // e o relógio da call de quem já está numa
    if (!soPainel) {
      await paraCadaServidor('Comandos', async () => {
        const guild = servidor();
        await registrarComandos(guild);
        for (const v of guild.voiceStates.cache.values()) if (v.channelId && v.channelId !== guild.afkChannelId && !v.member?.user.bot) entrouNaCall(v.id);
        // Quem já está ouvindo Spotify quando o bot liga (o Discord só avisa na próxima troca de música)
        for (const p of guild.presences?.cache.values() ?? []) mudouPresenca(null, p);
      });
    }
    // Versão nova no ar? Conta no jornal de cada servidor (espera um pouco pra conexão assentar)
    setTimeout(() => paraCadaServidor('Jornal', anunciarNovidades), 5000);
    if (!soPainel) {
      setTimeout(() => paraCadaServidor('Aniversários', conferirAniversarios), 20_000);
      setInterval(() => paraCadaServidor('Aniversários', conferirAniversarios), 10 * 60_000);
      setTimeout(() => aCada10Minutos().catch((e) => console.error('Tickets:', e.message)), 25_000);
      setInterval(() => aCada10Minutos().catch((e) => console.error('Tickets:', e.message)), 10 * 60_000);
    }
    // Virou o dia e mudou a data festiva? Os painéis já enviados trocam de visual sozinhos
    if (!soPainel) {
      setTimeout(() => paraCadaServidor('Tema', conferirTema), 15_000);
      setInterval(() => paraCadaServidor('Tema', conferirTema), 30 * 60_000);
      setTimeout(() => manutencao().catch((e) => console.error('Manutenção:', e.message)), 60_000);
      setInterval(() => manutencao().catch((e) => console.error('Manutenção:', e.message)), 6 * 3_600_000);
    }
    // Com a intent "Server Members", baixa a lista de membros uma vez; depois os eventos mantêm atualizada
    if (pronto.options.intents.has(I.GuildMembers)) {
      for (const guild of pronto.guilds.cache.values()) await guild.members.fetch().catch((erro) => console.error(`Não consegui listar os membros de ${guild.name}:`, explicarErro(erro)));
    }
  });
  // Entrou num servidor novo: já funciona lá (começa com a config padrão; o painel deixa copiar a de outro servidor)
  c.on(Events.GuildCreate, async (guild) => {
    if (soPainel) return;
    await registrarComandos(guild);
    if (c.options.intents.has(I.GuildMembers)) await guild.members.fetch().catch(() => {});
  });
  c.on(Events.Error, (erro) => console.error('Erro do bot:', erro));
  return c;
}

/** @param {string} token @param {{ soPainel?: boolean }} [opcoes] */
export async function iniciarBot(token, opcoes = {}) {
  soPainel = !!opcoes.soPainel;
  if (!soPainel) process.once('SIGTERM', () => salvarAntesDeSair().catch(() => {}).finally(() => process.exit(0)));
  ({ client } = await conectar(token, (intents) => prepararCliente(new Client({ intents })), INTENTS));
}
