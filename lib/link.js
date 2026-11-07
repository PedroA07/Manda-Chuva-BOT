// Baixa imagem de link que veio de membro. O bot é quem abre o endereço, então sem esses cuidados um link poderia
// fazer ele chamar a rede interna da hospedagem (SSRF), travar num arquivo infinito ou abrir uma imagem-bomba.
import { lookup } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { cabeNaMemoria, EXT, tipoDaImagem } from './imagem.js';
import { MemoriaLimitada } from './memoria.js';

const MAX_BAIXADO = 8 * 1024 * 1024;
const MAX_SALTOS = 3;
const UMA_HORA = 3_600_000;
const CINCO_MIN = 300_000;

const internos = new BlockList();
for (const [ip, tam] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) {
  internos.addSubnet(ip, tam, 'ipv4');
}
for (const [ip, tam] of [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) internos.addSubnet(ip, tam, 'ipv6');

/** Endereço que não é da internet aberta (o que não é IP também conta: na dúvida, não conecta) */
export function ipPrivado(ip) {
  const versao = isIP(ip);
  return !versao || internos.check(ip, versao === 6 ? 'ipv6' : 'ipv4');
}

/** URL do link, se for https de um nome público. IP direto não passa: imagem de verdade mora em domínio. */
export function linkPublico(texto) {
  const t = String(texto ?? '').trim();
  if (!t || t.length > 500 || !/^https:\/\/\S+$/i.test(t)) return null;
  let u;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.replace(/\.$/, '').toLowerCase();
  if (host.startsWith('[') || isIP(host) || !host.includes('.') || /\.(local|localhost|internal|intranet|lan|home|corp)$/.test(host)) return null;
  return u;
}

/** dns.lookup que recusa rede interna na hora de conectar (um nome pode mudar de IP depois de conferido) */
export function procurarPublico(procurar = lookup) {
  return (host, opcoes, feito) => {
    procurar(host, opcoes, (erro, endereco, familia) => {
      if (erro) return feito(erro);
      const ips = Array.isArray(endereco) ? endereco.map((e) => e.address) : [endereco];
      if (ips.some(ipPrivado)) return feito(new Error('Esse endereço aponta pra rede interna.'));
      return Array.isArray(endereco) ? feito(null, endereco) : feito(null, endereco, familia);
    });
  };
}

/** Abre o link de verdade. agent: false = conexão só pra esse pedido, sempre passando pelo procurarPublico. */
function abrirHttps(url, tempo = 15_000) {
  return new Promise((ok, falha) => {
    const pedido = request(url, {
      method: 'GET',
      agent: false,
      lookup: procurarPublico(),
      headers: { 'User-Agent': 'MandaChuvaBot (imagem de perfil)', Accept: 'image/*' },
      signal: AbortSignal.timeout(tempo),
    }, (resposta) => ok({ status: resposta.statusCode, headers: resposta.headers, corpo: resposta, fechar: () => resposta.destroy() }));
    pedido.on('error', falha);
    pedido.end();
  });
}

/** Lê a resposta até "max". Passou disso, fecha a conexão e devolve null. */
async function lerAte(resposta, max) {
  if (Number(resposta.headers['content-length']) > max) {
    resposta.fechar?.();
    return null;
  }
  const partes = [];
  let tamanho = 0;
  for await (const parte of resposta.corpo) {
    tamanho += parte.length;
    if (tamanho > max) {
      resposta.fechar?.();
      return null;
    }
    partes.push(parte);
  }
  return Buffer.concat(partes);
}

/**
 * Baixa a imagem do link. Qualquer problema vira null: quem chama cai no plano B (ou avisa o membro).
 * @returns {Promise<{ buffer: Buffer, tipo: string, ext: string } | null>}
 */
export async function baixarLink(link, { abrir = abrirHttps, max = MAX_BAIXADO } = {}) {
  try {
    let url = linkPublico(link);
    for (let salto = 0; url && salto <= MAX_SALTOS; salto++) {
      const r = await abrir(url);
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        r.fechar?.();
        url = linkPublico(new URL(r.headers.location, url).href);
        continue;
      }
      if (r.status !== 200) {
        r.fechar?.();
        return null;
      }
      const buffer = await lerAte(r, max);
      if (!cabeNaMemoria(buffer)) return null; // inclui o que não é imagem
      const tipo = tipoDaImagem(buffer);
      return { buffer, tipo, ext: EXT[tipo] };
    }
    return null;
  } catch {
    return null;
  }
}

const guardados = new MemoriaLimitada(32 * 1024 * 1024, (x) => x.buffer?.length ?? 64);

/** baixarLink com memória: imagem boa fica 1 hora, link quebrado fica 5 minutos (pra não bater no site a cada visita) */
export async function lerLink(link, { abrir, agora = Date.now() } = {}) {
  const g = guardados.ler(link);
  if (g && agora - g.quando < (g.buffer ? UMA_HORA : CINCO_MIN)) return g.buffer ? g : null;
  const r = await baixarLink(link, abrir && { abrir });
  guardados.guardar(link, { ...r, quando: agora });
  return r;
}
