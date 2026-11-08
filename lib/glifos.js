// Quais caracteres as fontes desenham (tabela cmap de cada TTF/OTF/TTC). Quando a fonte do texto não tem um caractere,
// o desenho procura em outra fonte instalada; se nenhuma tiver, vira um quadradinho ("tofu"), como nos cargos cheios de
// enfeite ("꒰ Humano ꒱"). O texto passa por aqui e perde só o que nenhuma fonte desenha.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Faixas [início, fim] de code points de uma fonte (sfnt começando em "base"): cmap formato 12 ou 4 */
function faixasDoSfnt(buf, base = 0) {
  const tabelas = buf.readUInt16BE(base + 4);
  let cmap = -1;
  for (let i = 0; i < tabelas; i++) {
    const r = base + 12 + i * 16;
    if (buf.toString('latin1', r, r + 4) === 'cmap') cmap = buf.readUInt32BE(r + 8);
  }
  if (cmap < 0) return [];
  let f12 = -1, f4 = -1;
  for (let i = 0; i < buf.readUInt16BE(cmap + 2); i++) {
    const r = cmap + 4 + i * 8;
    const plataforma = buf.readUInt16BE(r), codigo = buf.readUInt16BE(r + 2), onde = cmap + buf.readUInt32BE(r + 4);
    const formato = buf.readUInt16BE(onde);
    const unicode = plataforma === 0 || (plataforma === 3 && (codigo === 1 || codigo === 10));
    if (unicode && formato === 12) f12 = onde;
    if (unicode && formato === 4) f4 = onde;
  }
  const faixas = [];
  if (f12 >= 0) {
    for (let g = 0, n = buf.readUInt32BE(f12 + 12); g < n; g++) {
      const p = f12 + 16 + g * 12;
      faixas.push([buf.readUInt32BE(p), buf.readUInt32BE(p + 4)]);
    }
  } else if (f4 >= 0) {
    const dobro = buf.readUInt16BE(f4 + 6);
    const fins = f4 + 14, inicios = fins + dobro + 2, deltas = inicios + dobro, saltos = deltas + dobro;
    for (let s = 0; s < dobro / 2; s++) {
      const ini = buf.readUInt16BE(inicios + s * 2), fim = buf.readUInt16BE(fins + s * 2);
      if (ini === 0xffff) continue;
      const salto = buf.readUInt16BE(saltos + s * 2);
      if (!salto) {
        faixas.push([ini, fim]);
        continue;
      }
      // Com salto: cada caractere aponta pra um glifo na tabela; glifo 0 = a fonte não tem
      for (let c = ini; c <= fim; c++) if (buf.readUInt16BE(saltos + s * 2 + salto + (c - ini) * 2)) faixas.push([c, c]);
    }
  }
  return faixas;
}

/** Faixas de um arquivo de fonte (TTC = várias fontes no mesmo arquivo) */
export function faixasDaFonte(buf) {
  if (buf.toString('latin1', 0, 4) === 'ttcf') {
    const n = buf.readUInt32BE(8);
    return Array.from({ length: n }, (_, i) => faixasDoSfnt(buf, buf.readUInt32BE(12 + i * 4))).flat();
  }
  return faixasDoSfnt(buf);
}

/** Junta faixas sobrepostas e devolve a função que diz se o code point está nelas (busca binária) */
export function cobertura(todas) {
  const faixas = [];
  for (const [a, b] of [...todas].sort((x, y) => x[0] - y[0])) {
    const ult = faixas.at(-1);
    if (ult && a <= ult[1] + 1) ult[1] = Math.max(ult[1], b);
    else faixas.push([a, b]);
  }
  return (cp) => {
    let a = 0, b = faixas.length - 1;
    while (a <= b) {
      const m = (a + b) >> 1;
      if (cp < faixas[m][0]) b = m - 1;
      else if (cp > faixas[m][1]) a = m + 1;
      else return true;
    }
    return false;
  };
}

/** Arquivos de fonte numa pasta (e nas de dentro, até 4 níveis) */
function arquivosDeFonte(pasta, nivel = 0) {
  let nomes;
  try {
    nomes = readdirSync(pasta);
  } catch {
    return [];
  }
  return nomes.flatMap((n) => {
    const caminho = join(pasta, n);
    if (/\.(ttf|otf|ttc)$/i.test(n)) return [caminho];
    try {
      return nivel < 4 && statSync(caminho).isDirectory() ? arquivosDeFonte(caminho, nivel + 1) : [];
    } catch {
      return [];
    }
  });
}

// A fonte do texto (Bricolage) e as do sistema (Linux, onde o bot roda), que o desenho usa quando falta um caractere.
// As outras fontes do bot não entram: o desenho não procura nelas (por isso a estrela ★ virava quadradinho).
const NOSSAS = new URL('../fontes/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DO_SISTEMA = ['/usr/share/fonts', '/usr/local/share/fonts'];
let desenha = null;
/** O caractere (code point) sai desenhado por alguma fonte? */
export function temGlifo(cp) {
  if (!desenha) {
    const faixas = [];
    const arquivos = [...arquivosDeFonte(NOSSAS).filter((a) => /BricolageGrotesque/.test(a)), ...DO_SISTEMA.flatMap((p) => arquivosDeFonte(p))];
    for (const arquivo of arquivos) {
      try {
        faixas.push(...faixasDaFonte(readFileSync(arquivo)));
      } catch {}
    }
    desenha = faixas.length ? cobertura(faixas) : () => true;
  }
  return desenha(cp);
}

/** Tira os caracteres que nenhuma fonte desenha (espaço sempre fica) */
export const soOQueDesenha = (texto) => Array.from(String(texto ?? '')).filter((ch) => /\s/.test(ch) || temGlifo(ch.codePointAt(0))).join('');
