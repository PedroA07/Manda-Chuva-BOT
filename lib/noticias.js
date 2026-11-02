// Jornal do Campus: decide quais versões anunciar no Discord e monta a mensagem de cada uma
import { PADROES } from './imagens.js';

const MAX_POR_VEZ = 3;

/** Compara "3.10.0" com "3.9.0" como números */
export function compararVersoes(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * O que postar agora. Na primeira vez (nada anunciado ainda) só a mais nova, pra não despejar o histórico.
 * Todas as versões da lista são marcadas como vistas, inclusive as pequenas que o "só as grandes" pulou.
 * @param {{ versao: string, grande: boolean }[]} lista mais nova primeiro
 * @returns {{ postar: object[], marcar: string[] }}
 */
export function paraAnunciar(lista, anunciadas, quais) {
  const passa = (n) => quais !== 'grandes' || n.grande;
  const marcar = lista.map((n) => n.versao);
  if (!anunciadas.length) return { postar: lista.filter(passa).slice(0, 1), marcar };
  const vistas = new Set(anunciadas);
  const novas = lista.filter((n) => !vistas.has(n.versao) && passa(n)).sort((a, b) => compararVersoes(a.versao, b.versao));
  return { postar: novas.slice(-MAX_POR_VEZ), marcar };
}

/**
 * Entrada do montarV2 pra uma notícia.
 * @param {{ mencao: string, imgs: object }} cfg config.noticias
 * @param {{ url: (ref: string, padrao: string) => string | null }} ajuda
 */
export function pedacoDaNoticia(n, cfg, { url }) {
  const i = cfg.imgs ?? {}, P = PADROES.news;
  // A menção vem antes do banner, como mensagem de anúncio
  const mencao = cfg.mencao === 'everyone' ? { acima: '@everyone', mencoes: { everyone: true } } : cfg.mencao ? { acima: `<@&${cfg.mencao}>`, mencoes: { roles: [cfg.mencao] } } : {};
  return {
    ...mencao,
    topo: url(i.topo, P.topo),
    cor: 0xf2c14e,
    texto: `-# **Jornal do Campus · v${n.versao}**\n### ${n.titulo}\n${n.texto}`,
    mini: url(i.mini, P.mini),
    imagem: url(i.imagem, P.imagem),
    rodape: 'Leia tudo no painel',
    finais: (i.finais ?? []).map((f) => url(f, P.final)).filter(Boolean),
  };
}
