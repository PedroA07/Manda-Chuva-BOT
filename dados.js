// Guarda a configuração e os painéis enviados: em dados/*.json ou, com GIST_ID e GIST_TOKEN definidos,
// num Gist secreto do GitHub (pra hospedagem grátis que apaga os arquivos ao reiniciar, como a Render)
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PALAVROES } from './lib/automod.js';
import { definirPadrao, noServidor, servidorAtual } from './lib/contexto.js';
import { LIMITES as LIM_REGRAS, MAX_REGRAS, PADRAO_REGRAS } from './lib/regras.js';
import { normalizarSrv, PADRAO_SRV } from './lib/servidor.js';

// DADOS_PASTA troca a pasta (os testes usam uma temporária)
const PASTA = process.env.DADOS_PASTA ? pathToFileURL(resolve(process.env.DADOS_PASTA) + sep) : new URL('./dados/', import.meta.url);
const ARQ_CONFIG = new URL('config.json', PASTA);
const ARQ_PAINEIS = new URL('paineis.json', PASTA);

export const ESTILOS = ['Primary', 'Secondary', 'Success', 'Danger'];
export const MAX_CORES = 24; // o /cor aceita 25 opções e uma é "Tirar a cor"
export const MAX_FINAIS = 4;
const HEX = /^#[0-9a-f]{6}$/i;
const EMOJI_SERVIDOR = /^<a?:\w{2,32}:\d{15,25}>$/;
const ID = /^\d{15,25}$/;
// Imagem: '' = padrão do lugar, 'none' = sem imagem, modelo da galeria, link https ou arquivo enviado pelo painel
const REF_IMAGEM = /^(|none|banners\/[\w\-/.]+\.(gif|jpe?g|png|webp)|https:\/\/\S+|anexo:[0-9a-f]{16})$/i;

export const PADRAO = {
  servidorId: null,
  cores: [
    ['Vermelho', '🔴', '#E74C3C'], ['Laranja', '🟠', '#E67E22'], ['Amarelo', '🟡', '#F1C40F'], ['Verde', '🟢', '#2ECC71'],
    ['Azul', '🔵', '#3498DB'], ['Roxo', '🟣', '#9B59B6'], ['Rosa', '🌸', '#FF6EC7'], ['Preto', '⚫', '#111111'],
    ['Branco', '⚪', '#FFFFFF'], ['Cinza', '🩶', '#95A5A6'], ['Marrom', '🟤', '#8B5A2B'],
  ].map(([nome, emoji, hex]) => ({ nome, emoji, hex, estilo: 'Secondary' })),
  painel: {
    titulo: '🎨 Escolha sua cor',
    descricao: 'Clique num botão pra pintar seu nome. Clicar de novo na mesma cor tira ela.',
    listarCores: true,
    campos: [{ nome: 'Como funciona', valor: 'Clicou, pintou. Clicou de novo, tirou. Também dá pelo comando `/cor`.' }],
    rodape: 'Manda Chuva',
    corDoEmbed: '#5865F2',
    imgs: { topo: '', mini: '', imagem: '', finais: [] },
  },
  botoes: { porLinha: 4, remover: { ativo: true, texto: 'Tirar cor', emoji: '❌', estilo: 'Danger' } },
  mensagens: { ganhou: 'Pronto! Agora você é {cor}.', removeu: 'Tirei {cor} de você.' },
  // Jornal do Campus: anuncia as versões novas do bot. Desligado até alguém escolher o canal.
  noticias: { on: false, canalId: null, mencao: '', quais: 'todas', imgs: { topo: '', mini: '', imagem: '', finais: [] } },
  // Portaria: mensagem quando alguém entra, sai ou leva punição. Tudo desligado até escolherem o canal.
  portaria: {
    entrada: {
      on: false, canalId: null, titulo: 'Bem-vindo(a) ao campus!', textoPos: 'fora', cor: '#F2C14E', dm: false,
      msg: 'Para nossa alegria, {usuario} acabou de chegar no **{servidor}**! 🎉\nPega sua cor em #escolha-sua-cor e se apresenta.',
      cargoAuto: { on: false, cargoId: null },
      card: { on: true, bg: '', cima: 'BEM-VINDO(A) AO CAMPUS', baixo: 'Membro nº {numero}', layout: 'centro', forma: 'circulo', texto: '#FFFFFF', borda: '#F2C14E' },
    },
    saida: { on: false, canalId: null, titulo: 'Matrícula trancada', textoPos: 'fora', cor: '#95A5A6', dm: false, msg: '{usuario} trancou a matrícula. A turma agora tem {numero} alunos.' },
    expulsao: { on: false, canalId: null, titulo: 'Expulsão', textoPos: 'fora', cor: '#E67E22', dm: true, mod: true, motivo: true, msg: '{usuario} foi pra diretoria e não volta hoje.' },
    ban: { on: false, canalId: null, titulo: 'Banimento', textoPos: 'fora', cor: '#C4363C', dm: true, mod: true, motivo: true, msg: '{usuario} foi **JUBILADO(A)** do {servidor}. Não volta nem com recurso.' },
    silencio: { on: false, canalId: null, titulo: 'Silenciado', textoPos: 'dentro', cor: '#3498DB', dm: true, mod: true, motivo: true, duracao: '1h', msg: 'Shhh, biblioteca! {usuario} ficou em silêncio por {tempo}.' },
  },
  // Temas de datas festivas: o bot troca banner, cor e frase das mensagens nessas datas (lib/temas.js)
  temas: {
    auto: true,
    respeitar: true,
    lista: [
      ['carnaval', 'Carnaval', '', '', '#9B59B6', 'Bloco dos Memes na rua! Quarta-feira de cinzas a gente volta.', 'carnaval'],
      ['pascoa', 'Páscoa', '', '', '#2ECC71', 'Caça aos ovos no campus: quem achar primeiro fica com o chocolate.', 'pascoa'],
      ['namorados', 'Dia dos Namorados', '12/06', '12/06', '#FF6EC7', 'Feliz dia pra quem tem mozão. E pra quem tem só o Wi-Fi da faculdade.'],
      ['junina', 'Festa Junina', '01/06', '30/06', '#E67E22', 'Olha a cobra! É mentira. Arraiá do campus liberado.'],
      ['estudante', 'Dia do Estudante', '11/08', '11/08', '#F2C14E', 'Feliz Dia do Estudante! Hoje o café da cantina é por nossa conta (não é).'],
      ['criancas', 'Dia das Crianças', '12/10', '12/10', '#3498DB', 'Feliz dia pra criança interior que ainda pede pra mãe marcar consulta.'],
      ['halloween', 'Halloween', '25/10', '31/10', '#E67E22', 'Semana do terror no campus. Cuidado com o DCE assombrado.'],
      ['natal', 'Natal', '01/12', '26/12', '#C4363C', 'Ho ho ho! O recesso tá chegando.'],
      ['ano', 'Ano Novo', '27/12', '02/01', '#F2C14E', 'Ano novo, semestre novo, memes novos.'],
      ['niver', 'Aniversário do servidor', '15/03', '15/03', '#9B59B6', 'Hoje o servidor faz aniversário! Parabéns pra nós.'],
    ].map(([id, nome, ini, fim, cor, frase, movel]) => ({ id, nome, ini, fim, ...(movel && { movel }), on: true, cor, frase, onde: { painel: true, portaria: true, news: true }, msgs: {} })),
  },
};
const MENSAGENS = ['painel', 'entrada', 'saida', 'expulsao', 'ban', 'silencio', 'news'];
// Aniversários (lib/aniversarios.js): mensagem com card no dia, cargo por 24 h, DM e botão no painel de cores
PADRAO.niver = {
  on: false, canalId: null, hora: '09:00', msg: 'Hoje é aniversário de {usuario}! {idade} anos e ainda não trancou o curso. Parabéns!',
  topo: 'PARABÉNS!', baixo: '{idade} ANOS DE PURA RESENHA', fundo: '', idade: true, cargo: true, dm: false, botao: true,
};
// Moderação (lib/moderacao.js): quantos avisos silenciam (1 h) e expulsam (0 = nunca), canal de registros e auto-mod
PADRAO.moderacao = {
  silenciar: 3,
  expulsar: 5,
  canalId: null,
  automod: {
    palavrao: { on: false, acao: 'apagar' },
    spam: { on: false, acao: 'silenciar' },
    convites: { on: false, acao: 'avisar' },
    mencoes: { on: false, acao: 'silenciar' },
    links: { on: false, acao: 'apagar' },
  },
  palavras: PALAVROES,
};
// Tickets (lib/tickets.js): o membro escolhe o motivo no painel e ganha um canal privado com a staff. Desligado até configurarem.
// categoriaId 'nova', canalId 'novo' e logsId 'novo' = o bot cria ao salvar.
PADRAO.tickets = {
  on: false, categoriaId: null, canalId: null, staffId: null, logsId: null,
  limite: 1, parado: '24h', apagar: '10s', transLog: true, transDm: true, avaliacao: true, mencionar: true,
  titulo: '🎫 Precisa de ajuda?',
  desc: 'Abre um ticket aqui embaixo e a staff te chama num canal privado.\nNada de treta no #geral, combinado?',
  imagem: '',
  motivos: [
    ['❓', 'Dúvida', 'Pergunta sobre o servidor ou o bot'], ['🚨', 'Denúncia', 'Alguém passou dos limites'],
    ['🤝', 'Parceria', 'Divulgação, eventos, collab'], ['🐛', 'Bug do bot', 'O Manda Chuva fez besteira'], ['🎨', 'Cargo', 'Pedir ou trocar um cargo'],
  ].map(([emoji, nome, desc]) => ({ emoji, nome, desc, on: true })),
};
// Regras (lib/regras.js): mensagem no canal que o bot edita, botão "Li e aceito" com cargo e /regras.
// canalId 'novo' e cargoId 'novo' = o bot cria ao salvar.
PADRAO.regras = PADRAO_REGRAS;
// Aba Servidor (lib/servidor.js): modelo, categorias, opções e as fontes dos nomes
PADRAO.srv = PADRAO_SRV;
export const PARADOS = ['12h', '24h', '48h', 'nunca'];
export const APAGARES = ['agora', '5s', '10s', '1min', '5min'];
export const MAX_MOTIVOS = 25; // limite de opções do menu do Discord
export const ACOES_AUTOMOD = ['apagar', 'avisar', 'silenciar', 'expulsar'];
export const EVENTOS = { entrada: 'Entrou', saida: 'Saiu', expulsao: 'Expulso', ban: 'Banido', silencio: 'Silenciado' };
export const DURACOES = ['10min', '1h', '1d', '7d', 'sem'];

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const hex = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : '');
const emojiValido = (e) => EMOJI_SERVIDOR.test(e) || (e.length <= 16 && !/[\sA-Za-z<>:]/.test(e));
const FORMATO_COR = 'use o formato #RRGGBB';

/** Confere uma imagem (ver REF_IMAGEM) */
function imagem(v, rotulo, erros) {
  const ref = typeof v === 'string' ? v.trim() : '';
  if (!REF_IMAGEM.test(ref)) erros.push(`${rotulo}: o link precisa começar com https://.`);
  return ref;
}

/** Banner do topo, miniatura, imagem grande e imagens no final de uma mensagem. onde: "Notícias", "Entrou"... (vai no erro) */
export function imagens(v, erros, onde = '') {
  const i = obj(v);
  const de = onde ? ` (${onde})` : '';
  const finais = Array.isArray(i.finais) ? i.finais : [];
  if (finais.length > MAX_FINAIS) erros.push(`Até ${MAX_FINAIS} imagens no final${de}.`);
  return {
    topo: imagem(i.topo, `Banner do topo${de}`, erros),
    mini: imagem(i.mini, `Miniatura${de}`, erros),
    imagem: imagem(i.imagem, `Imagem grande${de}`, erros),
    finais: finais.slice(0, MAX_FINAIS).map((f, n) => imagem(f, `Imagem final ${n + 1}${de}`, erros)),
  };
}

// Cada pedaço da config tem seu conferidor. Pedaço que não veio na entrada fica como está: a interface
// antiga, ainda em cache no navegador de alguém, não apaga o que ela não conhece.
const SECOES = {
  servidorId: (v) => (typeof v === 'string' && ID.test(v) ? v : null),

  cores(lista, atuais, erros) {
    const anteriores = Array.isArray(atuais) ? atuais : [];
    const cores = (Array.isArray(lista) ? lista : []).map((bruta, i) => {
      const c = obj(bruta);
      const nome = txt(c.nome, 80);
      // A interface antiga não manda os campos novos: herda da mesma cor na config atual
      const par = anteriores.find((a) => c.cargoId && a.cargoId === c.cargoId) ?? anteriores.find((a) => a.nome.toLowerCase() === nome.toLowerCase()) ?? {};
      const de = (k) => (k in c ? c[k] : par[k]);
      const cor = {
        nome,
        emoji: txt(c.emoji, 100),
        hex: typeof c.hex === 'string' ? hex(c.hex) : '#99AAB5',
        tipo: de('tipo') === 'degrade' ? 'degrade' : 'solida',
        hex2: hex(de('hex2')),
        estilo: ESTILOS.includes(c.estilo) ? c.estilo : 'Secondary',
        botaoModo: ['cargo', 'propria'].includes(de('botaoModo')) ? de('botaoModo') : 'discord',
        botaoHex: hex(de('botaoHex')),
        cargoId: typeof c.cargoId === 'string' && ID.test(c.cargoId) ? c.cargoId : null,
      };
      const quem = nome ? `"${nome}"` : `A cor nº ${i + 1}`;
      if (!nome) erros.push(`A cor nº ${i + 1} está sem nome.`);
      if (!HEX.test(cor.hex)) erros.push(`${quem}: cor inválida (${FORMATO_COR}).`);
      else if (cor.hex === '#000000') erros.push(`${quem}: #000000 é "sem cor" no Discord. Para preto use #010101.`);
      if (cor.tipo === 'degrade' && !HEX.test(cor.hex2)) erros.push(`${quem}: a cor final do degradê está inválida (${FORMATO_COR}).`);
      if (cor.tipo === 'solida' && !HEX.test(cor.hex2)) cor.hex2 = '';
      if (cor.botaoModo === 'propria' && !HEX.test(cor.botaoHex)) erros.push(`${quem}: a cor do botão está inválida (${FORMATO_COR}).`);
      if (cor.botaoModo !== 'propria' && !HEX.test(cor.botaoHex)) cor.botaoHex = '';
      if (cor.emoji && !emojiValido(cor.emoji)) erros.push(`${quem}: emoji inválido.`);
      return cor;
    });
    if (!cores.length) erros.push('Coloque pelo menos uma cor.');
    if (cores.length > MAX_CORES) erros.push(`O máximo é ${MAX_CORES} cores.`);
    const nomes = cores.map((c) => c.nome.toLowerCase()).filter(Boolean);
    if (new Set(nomes).size !== nomes.length) erros.push('Tem duas cores com o mesmo nome.');
    const cargos = cores.map((c) => c.cargoId).filter(Boolean);
    if (new Set(cargos).size !== cargos.length) erros.push('Tem duas cores usando o mesmo cargo.');
    return cores;
  },

  painel(bruto, atual, erros) {
    const p = obj(bruto);
    const campos = (Array.isArray(p.campos) ? p.campos : []).slice(0, 25).map((f) => ({ nome: txt(obj(f).nome, 256), valor: txt(obj(f).valor, 1024) }));
    campos.forEach((f, i) => {
      if (!f.nome || !f.valor) erros.push(`O campo nº ${i + 1} do embed precisa de título e texto.`);
    });
    const imgs = imagens('imgs' in p ? p.imgs : (obj(atual).imgs ?? PADRAO.painel.imgs), erros);
    // Config da versão 2: imagem e miniatura eram links soltos no painel
    if (!('imgs' in p)) {
      if (txt(p.imagem, 2000)) imgs.imagem = imagem(p.imagem, 'Imagem grande', erros);
      if (txt(p.miniatura, 2000)) imgs.mini = imagem(p.miniatura, 'Miniatura', erros);
    }
    const painel = {
      titulo: txt(p.titulo, 256),
      descricao: txt(p.descricao, 4000),
      listarCores: p.listarCores !== false,
      campos,
      rodape: txt(p.rodape, 2048),
      corDoEmbed: typeof p.corDoEmbed === 'string' && HEX.test(p.corDoEmbed) ? hex(p.corDoEmbed) : '#5865F2',
      imgs,
    };
    if (!painel.titulo && !painel.descricao && !painel.listarCores && !campos.length) erros.push('O embed ficou vazio: coloque pelo menos um título ou uma descrição.');
    return painel;
  },

  botoes(bruto, _atual, erros) {
    const b = obj(bruto);
    const r = obj(b.remover);
    const remover = { ativo: r.ativo !== false, texto: txt(r.texto, 80), emoji: txt(r.emoji, 100), estilo: ESTILOS.includes(r.estilo) ? r.estilo : 'Danger' };
    if (remover.ativo && !remover.texto && !remover.emoji) erros.push('O botão de tirar a cor precisa de texto ou emoji.');
    if (remover.emoji && !emojiValido(remover.emoji)) erros.push('Emoji inválido no botão de tirar a cor.');
    return { porLinha: Math.min(5, Math.max(1, Math.round(Number(b.porLinha)) || 4)), remover };
  },

  mensagens(bruto) {
    const m = obj(bruto);
    return { ganhou: txt(m.ganhou, 1500) || PADRAO.mensagens.ganhou, removeu: txt(m.removeu, 1500) || PADRAO.mensagens.removeu };
  },

  noticias(bruto, _atual, erros) {
    const n = obj(bruto);
    return {
      on: n.on === true,
      canalId: typeof n.canalId === 'string' && ID.test(n.canalId) ? n.canalId : null,
      // '' = ninguém, 'everyone' ou o id de um cargo
      mencao: n.mencao === 'everyone' || (typeof n.mencao === 'string' && ID.test(n.mencao)) ? n.mencao : '',
      quais: n.quais === 'grandes' ? 'grandes' : 'todas',
      imgs: imagens(n.imgs, erros, 'Notícias'),
    };
  },

  portaria(bruto, _atual, erros) {
    const p = obj(bruto);
    const sim = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
    const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
    const cor = (v, padrao) => (typeof v === 'string' && HEX.test(v.trim()) ? hex(v) : padrao);
    return Object.fromEntries(
      Object.entries(PADRAO.portaria).map(([tipo, padrao]) => {
        const e = obj(p[tipo]);
        const ev = {
          on: sim(e.on, padrao.on),
          canalId: id(e.canalId),
          titulo: typeof e.titulo === 'string' ? txt(e.titulo, 256) : padrao.titulo,
          msg: txt(e.msg, 2000) || padrao.msg,
          textoPos: ['fora', 'dentro'].includes(e.textoPos) ? e.textoPos : padrao.textoPos,
          cor: cor(e.cor, padrao.cor),
          dm: sim(e.dm, padrao.dm),
          imgs: imagens(e.imgs, erros, EVENTOS[tipo]),
        };
        if ('mod' in padrao) Object.assign(ev, { mod: sim(e.mod, padrao.mod), motivo: sim(e.motivo, padrao.motivo) });
        if ('duracao' in padrao) ev.duracao = DURACOES.includes(e.duracao) ? e.duracao : padrao.duracao;
        if (tipo === 'entrada') {
          const ca = obj(e.cargoAuto), c = obj(e.card), pc = padrao.card;
          ev.cargoAuto = { on: ca.on === true, cargoId: id(ca.cargoId) };
          ev.card = {
            on: sim(c.on, pc.on),
            bg: imagem(c.bg, 'Fundo do card', erros),
            cima: typeof c.cima === 'string' ? txt(c.cima, 100) : pc.cima,
            baixo: typeof c.baixo === 'string' ? txt(c.baixo, 100) : pc.baixo,
            layout: c.layout === 'lado' ? 'lado' : 'centro',
            forma: c.forma === 'quadrado' ? 'quadrado' : 'circulo',
            texto: cor(c.texto, pc.texto),
            borda: cor(c.borda, pc.borda),
          };
        }
        return [tipo, ev];
      }),
    );
  },

  temas(bruto, _atual, erros) {
    const t = obj(bruto);
    const data = (v) => {
      const m = /^(\d{1,2})\/(\d{1,2})$/.exec(typeof v === 'string' ? v.trim() : '');
      return m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}` : null;
    };
    const fixos = new Map(PADRAO.temas.lista.map((x) => [x.id, x]));
    const vistos = new Set();
    const lista = [];
    for (const bruta of (Array.isArray(t.lista) ? t.lista : PADRAO.temas.lista).slice(0, 40)) {
      const x = obj(bruta);
      const padrao = fixos.get(x.id);
      const custom = !padrao;
      const id = custom ? (typeof x.id === 'string' && /^av[0-9a-z]{1,20}$/.test(x.id) ? x.id : `av${Date.now().toString(36)}${lista.length}`) : x.id;
      if (vistos.has(id)) continue;
      vistos.add(id);
      const nome = txt(x.nome, 60) || padrao?.nome || 'Aviso';
      const onde = obj(x.onde);
      const tema = {
        id,
        nome,
        ini: padrao?.movel ? '' : (data(x.ini) ?? ''),
        fim: padrao?.movel ? '' : (data(x.fim) ?? ''),
        ...(padrao?.movel && { movel: padrao.movel }),
        ...(custom && { custom: true, banner: imagem(x.banner, `Banner do aviso "${nome}"`, erros) }),
        on: typeof x.on === 'boolean' ? x.on : true,
        cor: typeof x.cor === 'string' && HEX.test(x.cor.trim()) ? hex(x.cor) : (padrao?.cor ?? '#F2C14E'),
        frase: typeof x.frase === 'string' ? txt(x.frase, 300) : (padrao?.frase ?? ''),
        onde: { painel: onde.painel !== false, portaria: onde.portaria !== false, news: onde.news !== false },
        msgs: Object.fromEntries(MENSAGENS.filter((m) => obj(x.msgs)[m]).map((m) => [m, imagem(x.msgs[m], `Imagem do tema "${nome}"`, erros)])),
      };
      if (!padrao?.movel && (!tema.ini || !tema.fim)) erros.push(`Tema "${nome}": use dia/mês, tipo 25/12.`);
      lista.push(tema);
    }
    // Data festiva da lista padrão nunca some (só os avisos personalizados podem ser apagados)
    for (const p of PADRAO.temas.lista) if (!vistos.has(p.id)) lista.push(structuredClone(p));
    return { auto: t.auto !== false, respeitar: t.respeitar !== false, lista };
  },

  niver(bruto, _atual, erros) {
    const n = obj(bruto), p = PADRAO.niver;
    const sim = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
    return {
      on: sim(n.on, p.on),
      canalId: typeof n.canalId === 'string' && ID.test(n.canalId) ? n.canalId : null,
      hora: typeof n.hora === 'string' && /^([01]\d|2[0-3]):00$/.test(n.hora) ? n.hora : p.hora,
      msg: txt(n.msg, 2000) || p.msg,
      topo: typeof n.topo === 'string' ? txt(n.topo, 60) : p.topo,
      baixo: typeof n.baixo === 'string' ? txt(n.baixo, 60) : p.baixo,
      fundo: imagem(n.fundo, 'Fundo do card de aniversário', erros),
      idade: sim(n.idade, p.idade),
      cargo: sim(n.cargo, p.cargo),
      dm: sim(n.dm, p.dm),
      botao: sim(n.botao, p.botao),
    };
  },

  moderacao(bruto) {
    const m = obj(bruto), p = PADRAO.moderacao;
    const limite = (v, padrao) => (Number.isFinite(v) ? Math.min(20, Math.max(0, Math.trunc(v))) : padrao);
    const automod = {};
    for (const [k, padrao] of Object.entries(p.automod)) {
      const a = obj(obj(m.automod)[k]);
      automod[k] = { on: typeof a.on === 'boolean' ? a.on : padrao.on, acao: ACOES_AUTOMOD.includes(a.acao) ? a.acao : padrao.acao };
    }
    return {
      silenciar: limite(m.silenciar, p.silenciar),
      expulsar: limite(m.expulsar, p.expulsar),
      canalId: typeof m.canalId === 'string' && ID.test(m.canalId) ? m.canalId : null,
      automod,
      // Filtro de palavrões: minúsculas, sem repetir, até 1000 de até 60 letras (limites do Discord)
      palavras: Array.isArray(m.palavras) ? [...new Set(m.palavras.map((x) => txt(x, 60).toLowerCase()).filter(Boolean))].slice(0, 1000) : [...p.palavras],
    };
  },

  tickets(bruto, _atual, erros) {
    const t = obj(bruto), p = PADRAO.tickets;
    const sim = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
    const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
    const motivos = (Array.isArray(t.motivos) ? t.motivos : p.motivos).map(obj).map((m) => {
      const emoji = txt(m.emoji, 64);
      return { emoji: emoji && emojiValido(emoji) ? emoji : '📌', nome: txt(m.nome, 100), desc: txt(m.desc, 100), on: m.on !== false };
    });
    if (motivos.length > MAX_MOTIVOS) erros.push(`Tickets: até ${MAX_MOTIVOS} motivos (é o limite do menu do Discord).`);
    if (motivos.some((m) => !m.nome)) erros.push('Tickets: todo motivo precisa de um nome.');
    const on = sim(t.on, p.on);
    if (on && !motivos.some((m) => m.on)) erros.push('Tickets: ligue pelo menos um motivo.');
    return {
      on,
      categoriaId: t.categoriaId === 'nova' ? 'nova' : id(t.categoriaId),
      canalId: t.canalId === 'novo' ? 'novo' : id(t.canalId),
      staffId: id(t.staffId),
      logsId: t.logsId === 'novo' ? 'novo' : id(t.logsId),
      limite: [1, 2, 3].includes(t.limite) ? t.limite : p.limite,
      parado: PARADOS.includes(t.parado) ? t.parado : p.parado,
      apagar: APAGARES.includes(t.apagar) ? t.apagar : p.apagar,
      transLog: sim(t.transLog, p.transLog),
      transDm: sim(t.transDm, p.transDm),
      avaliacao: sim(t.avaliacao, p.avaliacao),
      mencionar: sim(t.mencionar, p.mencionar),
      titulo: typeof t.titulo === 'string' ? txt(t.titulo, 200) : p.titulo,
      desc: typeof t.desc === 'string' ? txt(t.desc, 1500) : p.desc,
      imagem: imagem(t.imagem, 'Imagem do painel de tickets', erros),
      motivos: motivos.slice(0, MAX_MOTIVOS),
    };
  },

  regras(bruto, _atual, erros) {
    const r = obj(bruto), p = PADRAO.regras;
    const sim = (v, padrao) => (typeof v === 'boolean' ? v : padrao);
    const id = (v) => (v === 'novo' || (typeof v === 'string' && ID.test(v)) ? v : null);
    const lista = (Array.isArray(r.regras) ? r.regras : p.regras).map(obj).map((x) => ({ t: txt(x.t, LIM_REGRAS.regra), d: txt(x.d, LIM_REGRAS.explicacao) }));
    if (lista.length > MAX_REGRAS) erros.push(`Regras: até ${MAX_REGRAS} regras (ninguém lê mais que isso).`);
    return {
      canalId: id(r.canalId),
      cor: typeof r.cor === 'string' && HEX.test(r.cor.trim()) ? hex(r.cor) : p.cor,
      titulo: typeof r.titulo === 'string' ? txt(r.titulo, LIM_REGRAS.titulo) : p.titulo,
      intro: typeof r.intro === 'string' ? txt(r.intro, LIM_REGRAS.intro) : p.intro,
      banner: imagem(r.banner, 'Imagem do topo das regras', erros),
      regras: lista.slice(0, MAX_REGRAS),
      escada: sim(r.escada, p.escada),
      botao: sim(r.botao, p.botao),
      botaoTxt: txt(r.botaoTxt, LIM_REGRAS.botao) || p.botaoTxt,
      cargoId: id(r.cargoId),
      fixar: sim(r.fixar, p.fixar),
      cmd: sim(r.cmd, p.cmd),
    };
  },

  srv: (bruto) => normalizarSrv(bruto),
};

/**
 * Confere e arruma uma config. Devolve { cfg, erros }, com os erros em português prontos pra mostrar.
 * Pedaço que não veio em "entrada" continua como está em "atual".
 */
export function normalizar(entrada, atual = config()) {
  const e = obj(entrada);
  const a = obj(atual);
  const erros = [];
  const cfg = {};
  for (const [chave, conferir] of Object.entries(SECOES)) {
    cfg[chave] = chave in e || !(chave in a) ? conferir(chave in e ? e[chave] : PADRAO[chave], a[chave], erros) : structuredClone(a[chave]);
  }
  return { cfg, erros };
}

// ---------- Onde fica salvo ----------
// Cada servidor tem os próprios arquivos (s-<id>-config.json, s-<id>-perfis.json...): o prefixo entra sozinho quando tem
// servidor na vez (lib/contexto.js). Estes são de todos: imagens, a lista de painéis enviados (cada um diz o servidor),
// o registro dos servidores e os perfis vinculados.
const GLOBAIS = /^(anexos\.json|anexo-|paineis\.json|servidores\.json|perfis-vinculados\.json)/;
// O que era do servidor único (antes do bot cuidar de vários) e vira do servidor padrão na separação
const DO_SERVIDOR = ['config.json', 'registro.json', 'perfis.json', 'aniversarios.json', 'estatisticas.json', 'avisos.json', 'ocorrencias.json', 'tickets.json'];

/** Nome do arquivo do servidor da vez (ou do servidor id) */
export const nomeNoServidor = (nome, id = servidorAtual()) => (!id || GLOBAIS.test(nome) ? nome : `s-${id}-${nome}`);

/** Config de cada servidor ('' = sem servidor: os testes e a config de antes da separação) */
const configs = new Map();
let paineisAtuais = [];
/** @type {{ id: string, token: string } | null} */
let gist = null;

/** Config do servidor da vez. Servidor novo começa com a padrão. */
export function config() {
  const id = servidorAtual();
  let cfg = configs.get(id ?? '');
  if (!cfg) {
    let bruto = null;
    try {
      bruto = interpretar(lerExtra('config.json'), nomeNoServidor('config.json', id));
    } catch (erro) {
      console.error(`⚠️  ${erro.message}`);
    }
    cfg = normalizar(bruto ?? PADRAO, {}).cfg;
    if (id) cfg.servidorId = id;
    configs.set(id ?? '', cfg);
  }
  return cfg;
}
export const paineis = () => paineisAtuais;

/** Servidores que já têm algum dado guardado (ids) */
export function servidoresGuardados() {
  const ids = new Set([...configs.keys()].filter(Boolean));
  let nomes = [];
  if (gist) nomes = Object.keys(extras);
  else {
    try {
      nomes = readdirSync(PASTA);
    } catch {}
  }
  for (const n of nomes) {
    const m = /^s-(\d{15,25})-/.exec(n);
    if (m) ids.add(m[1]);
  }
  return [...ids];
}
/** A config de cada servidor guardado */
export const todasAsConfigs = () => servidoresGuardados().map((id) => noServidor(id, config));

export async function carregar() {
  const { GIST_ID, GIST_TOKEN } = process.env;
  gist = GIST_ID && GIST_TOKEN ? { id: GIST_ID.trim(), token: GIST_TOKEN.trim() } : null;
  configs.clear();
  definirPadrao(null);
  let lista;
  if (gist) {
    extras = await lerGist();
    lista = interpretar(extras['paineis.json']?.conteudo, 'paineis.json do Gist');
    console.log(`💾 Configuração guardada no Gist ${gist.id}`);
  } else {
    mkdirSync(PASTA, { recursive: true });
    extras = {};
    lista = lerJson(ARQ_PAINEIS);
  }
  paineisAtuais = Array.isArray(lista) ? lista.filter((x) => x?.servidorId && x?.canalId && x?.mensagemId) : [];
  const bruto = interpretar(lerExtra('config.json'), gist ? 'config.json do Gist' : fileURLToPath(ARQ_CONFIG));
  const { cfg, erros } = normalizar(bruto ?? PADRAO, {});
  if (bruto && erros.length) console.warn('⚠️  Avisos na configuração:\n- ' + erros.join('\n- '));
  configs.set('', cfg);
  if (!bruto) salvarConfig(cfg);
  await separarPorServidor(bruto);
}

/**
 * Uma vez só: o que era do servidor único vira do servidor padrão (s-<id>-*), e servidores.json anota qual é ele.
 * Os arquivos antigos ficam como cópia de segurança (o código de antes ainda funciona com eles, se precisar voltar).
 */
async function separarPorServidor(legado) {
  const reg = interpretar(lerExtra('servidores.json'), 'servidores.json');
  if (reg) return definirPadrao(reg.padrao ?? null);
  const id = typeof legado?.servidorId === 'string' ? legado.servidorId : null;
  const copias = {};
  if (id) {
    for (const nome of DO_SERVIDOR) {
      const texto = await lerExtraGrande(nome);
      if (texto != null) copias[`s-${id}-${nome}`] = texto;
    }
  }
  copias['servidores.json'] = JSON.stringify({ padrao: id, separadoEm: new Date().toISOString() }, null, 2);
  const erro = await gravarArquivos(copias);
  if (erro) throw new Error(`não consegui separar os dados por servidor (${erro})`);
  if (id) console.log(`🗂️  Dados separados por servidor: o que já existia ficou com o servidor ${id}.`);
  definirPadrao(id);
}

/** Troca a config do servidor da vez e grava */
export function salvarConfig(cfg) {
  const id = servidorAtual();
  if (id) cfg.servidorId = id;
  configs.set(id ?? '', cfg);
  if (gist) {
    sujos.add(id ?? '');
    enviarGist();
  } else gravar(new URL(nomeNoServidor('config.json', id), PASTA), cfg);
}

export function salvarPaineis(lista) {
  paineisAtuais = lista;
  if (gist) enviarGist();
  else gravar(ARQ_PAINEIS, lista);
}

/** Espera o Gist terminar de gravar. Devolve a mensagem de erro, ou null se deu certo (ou se não usa Gist). */
export async function esperarGravacao() {
  await envio;
  return erroGist;
}

// ---------- Arquivos extras (perfis, tickets, aniversários, imagens...) ----------
// No Gist, arquivo grande (> 1 MB) vem cortado na leitura inicial: só baixa quando alguém pedir.
/** @type {Record<string, { conteudo?: string, raw?: string }>} */
let extras = {};

/** Texto de um arquivo extra do servidor da vez, já carregado (pequeno), ou null */
export function lerExtra(nome) {
  const arq = nomeNoServidor(nome);
  return gist ? (extras[arq]?.conteudo ?? null) : lerTexto(new URL(arq, PASTA));
}

/** Texto de um arquivo extra do servidor da vez, baixando do Gist se precisar, ou null */
export async function lerExtraGrande(nome) {
  const arq = nomeNoServidor(nome);
  if (!gist) return lerTexto(new URL(arq, PASTA));
  const e = extras[arq];
  if (!e) return null;
  if (e.conteudo == null) {
    const r = await fetch(e.raw, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`o GitHub respondeu ${r.status} ao baixar ${arq}`);
    e.conteudo = await r.text();
  }
  return e.conteudo;
}

/**
 * Grava (texto) ou apaga (null) arquivos extras do servidor da vez. Devolve a mensagem de erro, ou null se deu certo.
 * @param {Record<string, string | null>} arquivos
 */
export const gravarExtras = (arquivos) => gravarArquivos(Object.fromEntries(Object.entries(arquivos).map(([nome, texto]) => [nomeNoServidor(nome), texto])));

async function gravarArquivos(arquivos) {
  if (!gist) {
    mkdirSync(PASTA, { recursive: true });
    for (const [nome, texto] of Object.entries(arquivos)) {
      if (texto == null) rmSync(new URL(nome, PASTA), { force: true });
      else gravarTexto(new URL(nome, PASTA), texto);
    }
    return null;
  }
  for (const [nome, texto] of Object.entries(arquivos)) {
    if (texto == null) delete extras[nome];
    else extras[nome] = { conteudo: texto };
  }
  const files = Object.fromEntries(Object.entries(arquivos).map(([nome, texto]) => [nome, texto == null ? null : { content: texto }]));
  let erro = null;
  envio = envio.then(() => chamarGist('PATCH', { files }, 120_000)).catch((e) => {
    erro = e.message;
    console.error('⚠️  Não consegui salvar no Gist:', e.message);
  });
  await envio;
  return erro;
}

function lerTexto(arquivo) {
  try {
    return readFileSync(arquivo, 'utf8');
  } catch (erro) {
    if (erro.code === 'ENOENT') return null;
    throw erro;
  }
}

function lerJson(arquivo) {
  return interpretar(lerTexto(arquivo), fileURLToPath(arquivo));
}

function interpretar(texto, nome) {
  if (texto == null) return null;
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`O arquivo ${nome} está com o JSON quebrado. Conserte ou apague ele.`);
  }
}

// Grava num arquivo temporário e renomeia: se o PC desligar no meio, o arquivo antigo continua inteiro
function gravarTexto(arquivo, texto) {
  const temp = new URL(`${arquivo.href}.tmp`);
  writeFileSync(temp, texto);
  renameSync(temp, arquivo);
}
const gravar = (arquivo, conteudo) => gravarTexto(arquivo, JSON.stringify(conteudo, null, 2));

// ---------- Gist do GitHub ----------
let envio = Promise.resolve();
let esperando = false;
/** Configs que mudaram e ainda não foram pro Gist ('' = a de antes da separação) */
const sujos = new Set();
/** @type {string | null} */
let erroGist = null;

async function chamarGist(metodo, corpo, tempo = 15_000) {
  const r = await fetch(`https://api.github.com/gists/${encodeURIComponent(gist.id)}`, {
    method: metodo,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${gist.token}`,
      'User-Agent': 'Manda-Chuva-BOT',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: corpo && JSON.stringify(corpo),
    signal: AbortSignal.timeout(tempo),
  });
  if (r.ok) return r.json();
  if (r.status === 401) throw new Error('o GIST_TOKEN está errado ou venceu');
  if (r.status === 404) throw new Error('Gist não encontrado: confira o GIST_ID e se o token tem a permissão "gist"');
  throw new Error(`o GitHub respondeu ${r.status}`);
}

/** Lê os arquivos do Gist: { 'config.json': { conteudo, raw }, ... }. Pedaço de anexo cortado fica pra baixar depois. */
async function lerGist() {
  const resposta = await chamarGist('GET');
  const arquivos = {};
  for (const [nome, a] of Object.entries(resposta.files ?? {})) {
    const depois = a.truncated && nome.startsWith('anexo-');
    arquivos[nome] = { raw: a.raw_url, conteudo: depois ? undefined : a.truncated ? await (await fetch(a.raw_url)).text() : a.content };
  }
  return arquivos;
}

// Manda pro Gist as configs que mudaram e a lista de painéis, um envio por vez. Se já tem um esperando na fila, ele leva
// o estado mais novo.
function enviarGist() {
  if (esperando) return;
  esperando = true;
  envio = envio.then(async () => {
    esperando = false;
    const chaves = [...sujos];
    sujos.clear();
    const files = { 'paineis.json': { content: JSON.stringify(paineisAtuais, null, 2) } };
    for (const k of chaves) {
      const nome = nomeNoServidor('config.json', k || null);
      const texto = JSON.stringify(configs.get(k), null, 2);
      files[nome] = { content: texto };
      extras[nome] = { conteudo: texto };
    }
    try {
      await chamarGist('PATCH', { files });
      erroGist = null;
    } catch (erro) {
      for (const k of chaves) sujos.add(k);
      erroGist = erro.message;
      console.error('⚠️  Não consegui salvar no Gist:', erro.message);
    }
  });
}
