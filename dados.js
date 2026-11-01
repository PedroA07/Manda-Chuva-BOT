// Guarda a configuração e os painéis enviados: em dados/*.json ou, com GIST_ID e GIST_TOKEN definidos,
// num Gist secreto do GitHub (pra hospedagem grátis que apaga os arquivos ao reiniciar, como a Render)
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PASTA = new URL('./dados/', import.meta.url);
const ARQ_CONFIG = new URL('config.json', PASTA);
const ARQ_PAINEIS = new URL('paineis.json', PASTA);

export const ESTILOS = ['Primary', 'Secondary', 'Success', 'Danger'];
export const MAX_CORES = 24; // o /cor aceita 25 opções e uma é "Tirar a cor"
const HEX = /^#[0-9a-f]{6}$/i;
const EMOJI_SERVIDOR = /^<a?:\w{2,32}:\d{15,25}>$/;
const ID = /^\d{15,25}$/;

export const PADRAO = {
  servidorId: null,
  cores: [
    { nome: 'Vermelho', emoji: '🔴', hex: '#E74C3C', estilo: 'Secondary' },
    { nome: 'Laranja', emoji: '🟠', hex: '#E67E22', estilo: 'Secondary' },
    { nome: 'Amarelo', emoji: '🟡', hex: '#F1C40F', estilo: 'Secondary' },
    { nome: 'Verde', emoji: '🟢', hex: '#2ECC71', estilo: 'Secondary' },
    { nome: 'Azul', emoji: '🔵', hex: '#3498DB', estilo: 'Secondary' },
    { nome: 'Roxo', emoji: '🟣', hex: '#9B59B6', estilo: 'Secondary' },
    { nome: 'Rosa', emoji: '🌸', hex: '#FF6EC7', estilo: 'Secondary' },
    { nome: 'Branco', emoji: '⚪', hex: '#FFFFFF', estilo: 'Secondary' },
  ],
  painel: {
    titulo: '🎨 Cor do nome',
    descricao: 'Escolha a cor do seu nome no servidor clicando num botão abaixo.\nÉ uma cor por vez: escolher outra troca automaticamente.',
    listarCores: true,
    campos: [{ nome: 'Como tirar', valor: 'Clique de novo na sua cor ou em **Tirar cor**. Também dá pelo comando `/cor`.', inline: false }],
    rodape: 'Painel de cores',
    corDoEmbed: '#5865F2',
    imagem: '',
    miniatura: '',
  },
  botoes: { porLinha: 4, remover: { ativo: true, texto: 'Tirar cor', emoji: '❌', estilo: 'Danger' } },
  mensagens: { ganhou: 'Pronto! Seu nome agora está {cor}.', removeu: 'Cor removida. Seu nome voltou ao padrão.' },
};

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const emojiValido = (e) => EMOJI_SERVIDOR.test(e) || (e.length <= 16 && !/[\sA-Za-z<>:]/.test(e));
const linkValido = (u) => /^https?:\/\/\S+$/i.test(u);

/** Confere e arruma uma config. Devolve { cfg, erros }, com os erros em português prontos pra mostrar. */
export function normalizar(entrada) {
  const e = obj(entrada);
  const p = obj(e.painel);
  const b = obj(e.botoes);
  const r = obj(b.remover);
  const m = obj(e.mensagens);
  const erros = [];

  const cores = (Array.isArray(e.cores) ? e.cores : []).map((bruta, i) => {
    const c = obj(bruta);
    const cor = {
      nome: txt(c.nome, 80),
      emoji: txt(c.emoji, 100),
      hex: typeof c.hex === 'string' ? c.hex.trim().toUpperCase() : '#99AAB5',
      estilo: ESTILOS.includes(c.estilo) ? c.estilo : 'Secondary',
      cargoId: typeof c.cargoId === 'string' && ID.test(c.cargoId) ? c.cargoId : null,
    };
    const quem = cor.nome ? `"${cor.nome}"` : `A cor nº ${i + 1}`;
    if (!cor.nome) erros.push(`A cor nº ${i + 1} está sem nome.`);
    if (!HEX.test(cor.hex)) erros.push(`${quem}: cor inválida (use o formato #RRGGBB).`);
    else if (cor.hex === '#000000') erros.push(`${quem}: #000000 é "sem cor" no Discord. Para preto use #010101.`);
    if (cor.emoji && !emojiValido(cor.emoji)) erros.push(`${quem}: emoji inválido.`);
    return cor;
  });
  if (!cores.length) erros.push('Coloque pelo menos uma cor.');
  if (cores.length > MAX_CORES) erros.push(`O máximo é ${MAX_CORES} cores.`);
  const nomes = cores.map((c) => c.nome.toLowerCase()).filter(Boolean);
  if (new Set(nomes).size !== nomes.length) erros.push('Tem duas cores com o mesmo nome.');
  const cargos = cores.map((c) => c.cargoId).filter(Boolean);
  if (new Set(cargos).size !== cargos.length) erros.push('Tem duas cores usando o mesmo cargo.');

  const campos = (Array.isArray(p.campos) ? p.campos : []).slice(0, 25).map((bruto) => {
    const f = obj(bruto);
    return { nome: txt(f.nome, 256), valor: txt(f.valor, 1024), inline: f.inline === true };
  });
  campos.forEach((f, i) => {
    if (!f.nome || !f.valor) erros.push(`O campo nº ${i + 1} do embed precisa de título e texto.`);
  });
  const painel = {
    titulo: txt(p.titulo, 256),
    descricao: txt(p.descricao, 4096),
    listarCores: p.listarCores !== false,
    campos,
    rodape: txt(p.rodape, 2048),
    corDoEmbed: typeof p.corDoEmbed === 'string' && HEX.test(p.corDoEmbed) ? p.corDoEmbed.toUpperCase() : '#5865F2',
    imagem: txt(p.imagem, 2000),
    miniatura: txt(p.miniatura, 2000),
  };
  if (painel.imagem && !linkValido(painel.imagem)) erros.push('O link da imagem precisa começar com http:// ou https://.');
  if (painel.miniatura && !linkValido(painel.miniatura)) erros.push('O link da miniatura precisa começar com http:// ou https://.');
  const tamLista = painel.listarCores ? cores.reduce((soma, c) => soma + c.emoji.length + 30, 0) : 0;
  if (painel.descricao.length + tamLista > 4096) erros.push('A descrição do embed ficou grande demais (junto com a lista de cores).');
  const total = painel.titulo.length + painel.descricao.length + tamLista + painel.rodape.length + campos.reduce((s, f) => s + f.nome.length + f.valor.length, 0);
  if (total > 6000) erros.push('O embed passou do limite de 6000 caracteres do Discord.');
  if (!painel.titulo && !painel.descricao && !painel.listarCores && !campos.length) erros.push('O embed ficou vazio: coloque pelo menos um título ou uma descrição.');

  const porLinha = Math.min(5, Math.max(1, Math.round(Number(b.porLinha)) || 4));
  const remover = {
    ativo: r.ativo !== false,
    texto: txt(r.texto, 80),
    emoji: txt(r.emoji, 100),
    estilo: ESTILOS.includes(r.estilo) ? r.estilo : 'Danger',
  };
  if (remover.ativo && !remover.texto && !remover.emoji) erros.push('O botão de tirar a cor precisa de texto ou emoji.');
  if (remover.emoji && !emojiValido(remover.emoji)) erros.push('Emoji inválido no botão de tirar a cor.');
  const linhas = Math.ceil(cores.length / porLinha) + (remover.ativo ? 1 : 0);
  if (linhas > 5) erros.push(`Botões demais: o Discord aceita até 5 linhas e ficaram ${linhas}. Aumente "botões por linha" ou tire cores.`);

  const mensagens = {
    ganhou: txt(m.ganhou, 1500) || PADRAO.mensagens.ganhou,
    removeu: txt(m.removeu, 1500) || PADRAO.mensagens.removeu,
  };
  const servidorId = typeof e.servidorId === 'string' && ID.test(e.servidorId) ? e.servidorId : null;
  return { cfg: { servidorId, cores, painel, botoes: { porLinha, remover }, mensagens }, erros };
}

// ---------- Onde fica salvo ----------
let configAtual = normalizar(PADRAO).cfg;
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
    bruto = interpretar(arquivos['config.json'], 'config.json do Gist');
    lista = interpretar(arquivos['paineis.json'], 'paineis.json do Gist');
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

function lerJson(arquivo) {
  let texto;
  try {
    texto = readFileSync(arquivo, 'utf8');
  } catch (erro) {
    if (erro.code === 'ENOENT') return null;
    throw erro;
  }
  return interpretar(texto, fileURLToPath(arquivo));
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
function gravar(arquivo, conteudo) {
  const temp = new URL(`${arquivo.href}.tmp`);
  writeFileSync(temp, JSON.stringify(conteudo, null, 2));
  renameSync(temp, arquivo);
}

// ---------- Gist do GitHub ----------
let envio = Promise.resolve();
let esperando = false;
/** @type {string | null} */
let erroGist = null;

async function chamarGist(metodo, corpo) {
  const r = await fetch(`https://api.github.com/gists/${encodeURIComponent(gist.id)}`, {
    method: metodo,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${gist.token}`,
      'User-Agent': 'Manda-Chuva-BOT',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: corpo && JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
  if (r.ok) return r.json();
  if (r.status === 401) throw new Error('o GIST_TOKEN está errado ou venceu');
  if (r.status === 404) throw new Error('Gist não encontrado: confira o GIST_ID e se o token tem a permissão "gist"');
  throw new Error(`o GitHub respondeu ${r.status}`);
}

/** Lê os arquivos do Gist: { 'config.json': texto, ... } */
async function lerGist() {
  const resposta = await chamarGist('GET');
  const arquivos = {};
  for (const [nome, a] of Object.entries(resposta.files ?? {})) {
    arquivos[nome] = a.truncated ? await (await fetch(a.raw_url)).text() : a.content;
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
