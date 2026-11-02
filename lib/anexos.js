// Imagens enviadas pelo painel ("Anexar"). Ficam guardadas junto da config (Gist ou pasta de dados) em base64,
// partidas em pedaços de 5 MB, e o bot manda o arquivo junto com a mensagem. Na config viram 'anexo:<id>'.
import { createHash } from 'node:crypto';
import * as dados from '../dados.js';

export const MAX_ANEXO = 8 * 1024 * 1024;
const PEDACO = 5 * 1024 * 1024;
const UMA_HORA = 60 * 60 * 1000;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const ID = /^[0-9a-f]{16}$/;
const comStatus = (status, mensagem) => Object.assign(new Error(mensagem), { status });

export function partir(texto, tam = PEDACO) {
  const partes = [];
  for (let i = 0; i < texto.length; i += tam) partes.push(texto.slice(i, i + tam));
  return partes.length ? partes : [''];
}
export const juntar = (partes) => partes.join('');

/** Tipo pela assinatura do arquivo (não confia no que o navegador diz) */
function tipoReal(b) {
  if (b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** @type {Record<string, { tipo: string, ext: string, tamanho: number, partes: number, criado: number }> | null} */
let indice = null;
const memoria = new Map();
const lerIndice = () => (indice ??= JSON.parse(dados.lerExtra('anexos.json') ?? '{}'));
const nomeDoPedaco = (id, n) => `anexo-${id}-${n}.b64`;

/** Guarda a imagem enviada. @returns {Promise<{ id: string, ref: string }>} */
export async function salvarAnexo({ base64, tipo } = {}) {
  if (!EXT[tipo]) throw comStatus(400, 'Isso não parece uma imagem.');
  const buffer = Buffer.from(String(base64 ?? ''), 'base64');
  if (buffer.length > MAX_ANEXO) throw comStatus(400, 'Arquivo maior que 8 MB.');
  const real = tipoReal(buffer);
  if (!real) throw comStatus(400, 'Isso não parece uma imagem.');
  const id = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const ind = lerIndice();
  if (!ind[id]) {
    const partes = partir(buffer.toString('base64'));
    ind[id] = { tipo: real, ext: EXT[real], tamanho: buffer.length, partes: partes.length, criado: Date.now() };
    const erro = await dados.gravarExtras({ ...Object.fromEntries(partes.map((p, n) => [nomeDoPedaco(id, n), p])), 'anexos.json': JSON.stringify(ind) });
    if (erro) {
      delete ind[id];
      throw comStatus(500, `Não consegui guardar a imagem: ${erro}`);
    }
  }
  memoria.set(id, buffer);
  return { id, ref: `anexo:${id}` };
}

/** @returns {Promise<{ buffer: Buffer, tipo: string, ext: string } | null>} */
export async function lerAnexo(id) {
  const info = ID.test(id ?? '') ? lerIndice()[id] : undefined;
  if (!info) return null;
  let buffer = memoria.get(id);
  if (!buffer) {
    const partes = await Promise.all(Array.from({ length: info.partes }, (_, n) => dados.lerExtraGrande(nomeDoPedaco(id, n))));
    if (partes.some((p) => p == null)) return null;
    buffer = Buffer.from(juntar(partes), 'base64');
    memoria.set(id, buffer);
  }
  return { buffer, tipo: info.tipo, ext: info.ext };
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

/** Apaga as imagens que a config não usa mais (e que foram enviadas faz mais de 1 hora: pode ter alguém editando) */
export async function limparAnexos(cfg) {
  const usados = refsDeAnexo(cfg);
  const ind = lerIndice();
  const velhos = Object.entries(ind).filter(([id, info]) => !usados.has(id) && Date.now() - info.criado > UMA_HORA);
  if (!velhos.length) return;
  const apagar = {};
  for (const [id, info] of velhos) {
    for (let n = 0; n < info.partes; n++) apagar[nomeDoPedaco(id, n)] = null;
    delete ind[id];
    memoria.delete(id);
  }
  await dados.gravarExtras({ ...apagar, 'anexos.json': JSON.stringify(ind) });
}
