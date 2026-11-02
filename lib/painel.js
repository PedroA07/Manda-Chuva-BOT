// O painel de cores: texto, imagens e botões, no formato do montarV2
import { estiloMaisProximo } from './emojis.js';
import { midia, PADROES } from './imagens.js';
import { montarV2, validarV2 } from './mensagem.js';

export const REMOVER = 'remover';
const ESTILO = { Primary: 1, Secondary: 2, Success: 3, Danger: 4 };
const EMOJI_SERVIDOR = /^<(a?):(\w{2,32}):(\d{15,25})>$/;

/** Emoji de um botão: unicode vira { name }, emoji do servidor vira { id, name, animated } */
export function emojiDoBotao(texto) {
  if (!texto) return undefined;
  const m = EMOJI_SERVIDOR.exec(texto);
  return m ? { id: m[3], name: m[2], animated: !!m[1] } : { name: texto };
}

/** Cor da bolinha do botão, ou null quando é botão normal do Discord */
export const corDoBotao = (c) => (c.botaoModo === 'cargo' ? c.hex : c.botaoModo === 'propria' ? c.botaoHex : null);

function botaoDaCor(c, bolinha) {
  const corBolinha = corDoBotao(c);
  const base = { type: 2, custom_id: `cor:${c.cargoId}` };
  if (!corBolinha) return { ...base, style: ESTILO[c.estilo], label: c.nome, emoji: emojiDoBotao(c.emoji) };
  const style = ESTILO[estiloMaisProximo(corBolinha)];
  // Botão só tem um emoji: com a bolinha, o emoji da cor (se for unicode) vai junto do nome
  if (!bolinha) return { ...base, style, label: c.nome, emoji: emojiDoBotao(c.emoji) };
  const label = (c.emoji && !c.emoji.startsWith('<') ? `${c.emoji} ${c.nome}` : c.nome).slice(0, 80);
  return { ...base, style, label, emoji: { id: bolinha.id, name: bolinha.name } };
}

/**
 * Linhas de botões (action rows em JSON). Só cor que já tem cargo ganha botão.
 * @param {Map<string, { id: string, name: string }>} [bolinhas] emoji da bolinha por cor (#RRGGBB)
 */
export function linhasDoPainel(cfg, bolinhas = new Map()) {
  const comCargo = cfg.cores.filter((c) => c.cargoId);
  const linhas = [];
  for (let i = 0; i < comCargo.length; i += cfg.botoes.porLinha) {
    linhas.push({ type: 1, components: comCargo.slice(i, i + cfg.botoes.porLinha).map((c) => botaoDaCor(c, bolinhas.get(corDoBotao(c)))) });
  }
  // Última linha: tirar a cor e, com os aniversários ligados, o cadastro de aniversário
  const r = cfg.botoes.remover;
  const extras = [];
  if (r.ativo) extras.push({ type: 2, style: ESTILO[r.estilo], custom_id: `cor:${REMOVER}`, label: r.texto || undefined, emoji: emojiDoBotao(r.emoji) });
  if (cfg.niver?.on && cfg.niver.botao) extras.push({ type: 2, style: ESTILO.Secondary, custom_id: 'niver:cadastrar', label: 'Cadastrar aniversário', emoji: { name: '🎂' } });
  if (extras.length) linhas.push({ type: 1, components: extras });
  return linhas;
}

/** Descrição, lista de cores (com a menção colorida de cada cargo) e campos. @param {(cor) => string} mencao */
export function textoDoPainel(cfg, mencao) {
  const p = cfg.painel;
  const lista = cfg.cores.map((c) => `${c.emoji ? `${c.emoji}  ` : ''}${mencao(c)}`).join('\n');
  const campos = p.campos.map((f) => `**${f.nome}**\n${f.valor}`).join('\n\n');
  return [p.descricao, p.listarCores ? lista : '', campos].filter(Boolean).join('\n\n');
}

/**
 * Entrada do montarV2 para o painel.
 * @param {{ mencao: (cor) => string, bolinhas?: Map, url: (ref: string, padrao: string) => string | null }} ajuda
 */
export function pedacoDoPainel(cfg, { mencao, bolinhas, url }) {
  const p = cfg.painel, i = p.imgs, P = PADROES.painel;
  return {
    topo: url(i.topo, P.topo),
    cor: parseInt(p.corDoEmbed.slice(1), 16),
    titulo: p.titulo,
    texto: textoDoPainel(cfg, mencao),
    mini: url(i.mini, P.mini),
    imagem: url(i.imagem, P.imagem),
    rodape: p.rodape,
    finais: i.finais.map((f) => url(f, P.final)).filter(Boolean),
    linhas: linhasDoPainel(cfg, bolinhas),
  };
}

/** Confere se o painel cabe numa mensagem do Discord, contando que todas as cores vão ganhar cargo ao salvar */
export function errosDoPainel(cfg) {
  const comCargo = { ...cfg, cores: cfg.cores.map((c) => ({ ...c, cargoId: c.cargoId ?? '000000000000000000' })) };
  const pedaco = pedacoDoPainel(comCargo, { mencao: (c) => `<@&${c.cargoId}>`, url: (ref, padrao) => (midia(ref, padrao) ? 'https://x' : null) });
  return validarV2(montarV2(pedaco));
}
