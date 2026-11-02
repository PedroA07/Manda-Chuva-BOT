// Guarda a configuração e os painéis enviados: em dados/*.json ou, com GIST_ID e GIST_TOKEN definidos,
// num Gist secreto do GitHub (pra hospedagem grátis que apaga os arquivos ao reiniciar, como a Render)
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
};

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
};

/**
 * Confere e arruma uma config. Devolve { cfg, erros }, com os erros em português prontos pra mostrar.
 * Pedaço que não veio em "entrada" continua como está em "atual".
 */
export function normalizar(entrada, atual = configAtual) {
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
let configAtual = normalizar(PADRAO, {}).cfg;
let paineisAtuais = [];
/** @type {{ id: string, token: string } | null} */
let gist = null;

export const config = () => configAtual;
export const paineis = () => paineisAtuais;

export async function carregar() {
  const { GIST_ID, GIST_TOKEN } = process.env;
  gist = GIST_ID && GIST_TOKEN ? { id: GIST_ID.trim(), token: GIST_TOKEN.trim() } : null;
  let bruto, lista;
  if (gist) {
    const arquivos = await lerGist();
    bruto = interpretar(arquivos['config.json']?.conteudo, 'config.json do Gist');
    lista = interpretar(arquivos['paineis.json']?.conteudo, 'paineis.json do Gist');
    extras = arquivos;
    console.log(`💾 Configuração guardada no Gist ${gist.id}`);
  } else {
    mkdirSync(PASTA, { recursive: true });
    bruto = lerJson(ARQ_CONFIG);
    lista = lerJson(ARQ_PAINEIS);
  }
  const { cfg, erros } = normalizar(bruto ?? PADRAO);
  if (bruto && erros.length) console.warn('⚠️  Avisos na configuração:\n- ' + erros.join('\n- '));
  paineisAtuais = Array.isArray(lista) ? lista.filter((x) => x?.servidorId && x?.canalId && x?.mensagemId) : [];
  if (bruto) configAtual = cfg;
  else salvarConfig(cfg);
}

export function salvarConfig(cfg) {
  configAtual = cfg;
  if (gist) enviarGist();
  else gravar(ARQ_CONFIG, cfg);
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

// ---------- Arquivos extras (anexos e, nas próximas versões, aniversários e ocorrências) ----------
// No Gist, arquivo grande (> 1 MB) vem cortado na leitura inicial: só baixa quando alguém pedir.
/** @type {Record<string, { conteudo?: string, raw?: string }>} */
let extras = {};

/** Texto de um arquivo extra já carregado (pequeno), ou null */
export function lerExtra(nome) {
  return gist ? (extras[nome]?.conteudo ?? null) : lerTexto(new URL(nome, PASTA));
}

/** Texto de um arquivo extra, baixando do Gist se precisar, ou null */
export async function lerExtraGrande(nome) {
  if (!gist) return lerTexto(new URL(nome, PASTA));
  const e = extras[nome];
  if (!e) return null;
  if (e.conteudo == null) {
    const r = await fetch(e.raw, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`o GitHub respondeu ${r.status} ao baixar ${nome}`);
    e.conteudo = await r.text();
  }
  return e.conteudo;
}

/**
 * Grava (texto) ou apaga (null) arquivos extras. Devolve a mensagem de erro, ou null se deu certo.
 * @param {Record<string, string | null>} arquivos
 */
export async function gravarExtras(arquivos) {
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

// Manda o estado atual pro Gist, um envio por vez. Se já tem um esperando na fila, ele leva o estado mais novo.
function enviarGist() {
  if (esperando) return;
  esperando = true;
  envio = envio.then(async () => {
    esperando = false;
    try {
      await chamarGist('PATCH', {
        files: {
          'config.json': { content: JSON.stringify(configAtual, null, 2) },
          'paineis.json': { content: JSON.stringify(paineisAtuais, null, 2) },
        },
      });
      erroGist = null;
    } catch (erro) {
      erroGist = erro.message;
      console.error('⚠️  Não consegui salvar no Gist:', erro.message);
    }
  });
}
