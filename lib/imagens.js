// Imagens das mensagens. Na config, cada imagem é:
//   ''              → o padrão daquele lugar (PADROES)
//   'none'          → sem imagem
//   'banners/…'     → modelo da galeria, que fica no site da interface (GitHub Pages)
//   'https://…'     → link direto
//   'anexo:<id>'    → arquivo enviado pelo painel; o bot manda junto com a mensagem

/** Onde ficam os modelos da galeria. URL_IMAGENS troca (precisa terminar com /). */
export const BASE_IMAGENS = (process.env.URL_IMAGENS || 'https://pedroa07.github.io/Interface-Manda-Chuva-Bot/').replace(/\/?$/, '/');

export const PADROES = {
  painel: { topo: 'banners/painel-cores.gif', mini: 'banners/mini-paleta.gif', imagem: 'none', final: 'banners/rodape-campus.gif' },
  news: { topo: 'banners/noticias.gif', mini: 'banners/mini-selo.gif', imagem: 'none', final: 'banners/rodape-campus.gif' },
  entrada: { topo: 'banners/boas-vindas.gif', mini: 'banners/mini-capelo.gif', imagem: 'none', final: 'banners/rodape-campus.gif', card: 'banners/card-campus.gif' },
  saida: { topo: 'banners/saida-trancou.gif', mini: 'none', imagem: 'none', final: 'banners/rodape-campus.gif' },
  expulsao: { topo: 'banners/expulso-diretoria.gif', mini: 'none', imagem: 'none', final: 'banners/rodape-campus.gif' },
  ban: { topo: 'banners/ban-jubilado.gif', mini: 'none', imagem: 'none', final: 'banners/rodape-campus.gif' },
  tickets: { imagem: 'banners/eventos/news.jpg' },
  silencio: { topo: 'banners/silencio-biblioteca.gif', mini: 'none', imagem: 'none', final: 'banners/rodape-campus.gif' },
};

/**
 * Resolve uma imagem da config.
 * @param {string} ref
 * @param {string} [padrao] usado quando ref é ''
 * @returns {{ url: string } | { anexo: string } | null}
 */
export function midia(ref, padrao = 'none') {
  const r = ref || padrao;
  if (!r || r === 'none') return null;
  if (r.startsWith('anexo:')) return { anexo: r.slice(6) };
  if (r.startsWith('banners/')) return { url: BASE_IMAGENS + r };
  return { url: r };
}
