// Imagens enviadas pelo painel ("Anexar"). As da staff ficam junto da config (Gist ou pasta de dados) em base64,
// partidas em pedaços de 5 MB, e o bot manda o arquivo junto com a mensagem. Na config viram 'anexo:<id>'.
// As dos membros (banner e foto do perfil) vão pro depósito, um canal escondido do servidor (bot.js): são muitas, e
// cada arquivo no Gist pesa até 1 MB na leitura que o bot faz ao ligar, justo onde mora a config.
import { createHash } from 'node:crypto';
import * as dados from '../dados.js';
import { cabeNaMemoria, EXT, tipoDaImagem } from './imagem.js';
import { MemoriaLimitada } from './memoria.js';

export const MAX_ANEXO = 8 * 1024 * 1024;
const PEDACO = 5 * 1024 * 1024;
const UMA_HORA = 60 * 60 * 1000;
const DEZ_MIN = 10 * 60 * 1000;
const ID = /^[0-9a-f]{16}$/;
const MAX_ENVIOS = 5;
const JANELA_ENVIOS = 10 * 60 * 1000;
const comStatus = (status, mensagem) => Object.assign(new Error(mensagem), { status });

export function partir(texto, tam = PEDACO) {
  const partes = [];
  for (let i = 0; i < texto.length; i += tam) partes.push(texto.slice(i, i + tam));
  return partes.length ? partes : [''];
}
export const juntar = (partes) => partes.join('');

/**
 * Onde o arquivo mora: 'partes' = pedaços junto da config; 'onde' = mensagem no depósito.
 * @type {Record<string, { tipo: string, ext: string, tamanho: number, criado: number, partes?: number, onde?: { canal: string, msg: string } }> | null}
 */
let indice = null;
const memoria = new MemoriaLimitada(48 * 1024 * 1024, (x) => x.buffer.length);
const lerIndice = () => (indice ??= JSON.parse(dados.lerExtra('anexos.json') ?? '{}'));
const nomeDoPedaco = (id, n) => `anexo-${id}-${n}.b64`;

/** @type {{ guardar(buffer: Buffer, nome: string, legenda: string): Promise<object>, ler(onde: object): Promise<Buffer | null>, apagar(onde: object): Promise<void> } | null} */
let deposito = null;
/** O bot.js liga o depósito (precisa do Discord) */
export function usarDeposito(d) {
  deposito = d;
}

/** Limite de envios de quem é membro. Conta o envio quando deixa passar. */
const envios = new Map();
export function podeEnviar(userId, agora = Date.now()) {
  const recentes = (envios.get(userId) ?? []).filter((t) => agora - t < JANELA_ENVIOS);
  const pode = recentes.length < MAX_ENVIOS;
  if (pode) recentes.push(agora);
  envios.set(userId, recentes);
  return pode;
}

async function guardarJuntoDaConfig(id, buffer, base) {
  const ind = lerIndice();
  const partes = partir(buffer.toString('base64'));
  ind[id] = { ...base, partes: partes.length };
  const erro = await dados.gravarExtras({ ...Object.fromEntries(partes.map((p, n) => [nomeDoPedaco(id, n), p])), 'anexos.json': JSON.stringify(ind) });
  if (erro) {
    delete ind[id];
    throw comStatus(500, `Não consegui guardar a imagem: ${erro}`);
  }
}

async function guardarNoDeposito(id, buffer, base, legenda) {
  if (!deposito) throw comStatus(503, 'O bot ainda não consegue guardar imagens. Usa um link por enquanto.');
  const onde = await deposito.guardar(buffer, `${id}.${base.ext}`, legenda);
  const ind = lerIndice();
  ind[id] = { ...base, onde };
  const erro = await dados.gravarExtras({ 'anexos.json': JSON.stringify(ind) });
  if (erro) {
    delete ind[id];
    await deposito.apagar(onde).catch(() => {});
    throw comStatus(500, `Não consegui guardar a imagem: ${erro}`);
  }
}

/** Já tem esse arquivo? No depósito precisa conferir: a staff pode ter apagado a mensagem (ou o canal). */
async function jaGuardado(info) {
  if (!info) return false;
  if (!info.onde) return true;
  return !!(await deposito?.ler(info.onde).catch(() => null));
}

/**
 * Guarda a imagem enviada. noDeposito = veio de membro (vai pro canal, com a legenda dizendo de quem é).
 * @returns {Promise<{ id: string, ref: string }>}
 */
export async function salvarAnexo({ base64, tipo } = {}, { noDeposito = false, legenda = '' } = {}) {
  if (!EXT[tipo]) throw comStatus(400, 'Isso não parece uma imagem.');
  const buffer = Buffer.from(String(base64 ?? ''), 'base64');
  if (buffer.length > MAX_ANEXO) throw comStatus(400, 'Arquivo maior que 8 MB.');
  const real = tipoDaImagem(buffer);
  if (!real) throw comStatus(400, 'Isso não parece uma imagem.');
  if (noDeposito && !cabeNaMemoria(buffer)) throw comStatus(400, 'Imagem grande demais: o máximo é 4096 × 4096.');
  const id = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  if (!(await jaGuardado(lerIndice()[id]))) {
    const base = { tipo: real, ext: EXT[real], tamanho: buffer.length, criado: Date.now() };
    await (noDeposito ? guardarNoDeposito(id, buffer, base, legenda) : guardarJuntoDaConfig(id, buffer, base));
  }
  memoria.guardar(id, { buffer, quando: Date.now() });
  return { id, ref: `anexo:${id}` };
}

/**
 * A memória de quem está no depósito vale 10 minutos: a staff tira uma imagem do ar apagando a mensagem do canal.
 * @returns {Promise<{ buffer: Buffer, tipo: string, ext: string } | null>}
 */
export async function lerAnexo(id, agora = Date.now()) {
  const info = ID.test(id ?? '') ? lerIndice()[id] : undefined;
  if (!info) return null;
  const guardado = memoria.ler(id);
  let buffer = guardado && (!info.onde || agora - guardado.quando < DEZ_MIN) ? guardado.buffer : null;
  if (!buffer) {
    if (info.onde) {
      buffer = await deposito?.ler(info.onde);
      if (!buffer) return null;
    } else {
      const partes = await Promise.all(Array.from({ length: info.partes }, (_, n) => dados.lerExtraGrande(nomeDoPedaco(id, n))));
      if (partes.some((p) => p == null)) return null;
      buffer = Buffer.from(juntar(partes), 'base64');
    }
    memoria.guardar(id, { buffer, quando: agora });
  }
  return { buffer, tipo: info.tipo, ext: info.ext };
}

/** Extensão de um 'anexo:<id>' guardado, ou null */
export function extDoAnexo(ref) {
  const m = /^anexo:([0-9a-f]{16})$/.exec(ref ?? '');
  return (m && lerIndice()[m[1]]?.ext) ?? null;
}

/** Ids de todos os 'anexo:<id>' que aparecem em qualquer lugar do objeto */
export function refsDeAnexo(obj, achados = new Set()) {
  if (typeof obj === 'string') {
    const m = /^anexo:([0-9a-f]{16})$/.exec(obj);
    if (m) achados.add(m[1]);
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) refsDeAnexo(v, achados);
  }
  return achados;
}

/**
 * Apaga as imagens que não estão em "fontes" (a config e os perfis). Só as enviadas faz mais de 1 hora, porque pode ter
 * alguém editando, menos as de "imediatos" (quem pediu pra apagar os próprios dados). O que falhar fica pra próxima.
 * @param {object} fontes
 * @param {{ agora?: number, imediatos?: Set<string> }} [opcoes]
 */
export async function limparAnexos(fontes, { agora = Date.now(), imediatos = new Set() } = {}) {
  const usados = refsDeAnexo(fontes);
  const ind = lerIndice();
  const velhos = Object.entries(ind).filter(([id, info]) => !usados.has(id) && (imediatos.has(id) || agora - info.criado > UMA_HORA));
  const apagar = {};
  let tirou = false;
  for (const [id, info] of velhos) {
    if (info.onde) {
      if (!deposito) continue;
      try {
        await deposito.apagar(info.onde);
      } catch (erro) {
        console.error(`Não consegui apagar a imagem ${id} do depósito:`, erro.message);
        continue;
      }
    } else {
      for (let n = 0; n < info.partes; n++) apagar[nomeDoPedaco(id, n)] = null;
    }
    delete ind[id];
    memoria.tirar(id);
    tirou = true;
  }
  if (tirou) await dados.gravarExtras({ ...apagar, 'anexos.json': JSON.stringify(ind) });
}
