// Monta as mensagens do bot no layout novo do Discord (Components V2). Fica igual à prévia do painel:
//   texto de cima → banner do topo → texto de fora → caixa colorida (título, texto, miniatura, imagem, rodapé) → card → imagens do final → botões
import { MessageFlags } from 'discord.js';

const T = { linha: 1, secao: 9, texto: 10, miniatura: 11, galeria: 12, caixa: 17 };
export const MAX_PECAS = 40;
export const MAX_TEXTO = 4000;

const galeria = (url) => ({ type: T.galeria, items: [{ media: { url } }] });
const texto = (content) => ({ type: T.texto, content });

/**
 * @param {{
 *   acima?: string, topo?: string, fora?: string, cor?: number | null, titulo?: string, texto?: string, mini?: string, imagem?: string,
 *   rodape?: string, card?: string, finais?: string[], abaixo?: string, linhas?: object[],
 *   mencoes?: { users?: string[], roles?: string[], everyone?: boolean }, arquivos?: object[]
 * }} p imagens são URLs (https ou attachment://nome); linhas são action rows já prontas
 */
export function montarV2(p) {
  const components = [];
  if (p.acima) components.push(texto(p.acima));
  if (p.topo) components.push(galeria(p.topo));
  if (p.fora) components.push(texto(p.fora));

  const dentro = [];
  const corpo = [p.titulo && `### ${p.titulo}`, p.texto].filter(Boolean).join('\n');
  if (p.mini) dentro.push({ type: T.secao, components: [texto(corpo || '​')], accessory: { type: T.miniatura, media: { url: p.mini } } });
  else if (corpo) dentro.push(texto(corpo));
  if (p.imagem) dentro.push(galeria(p.imagem));
  if (p.rodape) dentro.push(texto(`-# ${p.rodape}`));
  if (dentro.length) components.push({ type: T.caixa, ...(p.cor != null && { accent_color: p.cor }), components: dentro });

  if (p.card) components.push(galeria(p.card));
  for (const f of p.finais ?? []) components.push(galeria(f));
  if (p.abaixo) components.push(texto(p.abaixo));
  components.push(...(p.linhas ?? []));

  const m = p.mencoes ?? {};
  return {
    components,
    files: p.arquivos ?? [],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: m.everyone ? ['everyone'] : [], users: m.users ?? [], roles: m.roles ?? [] },
  };
}

/** Quantas peças a mensagem tem (as de dentro contam também) */
export function contarComponentes(lista) {
  let n = 0;
  for (const c of lista ?? []) {
    n += 1 + contarComponentes(c.components);
    if (c.accessory) n += 1;
  }
  return n;
}

/** Quantos caracteres de texto a mensagem tem */
export function tamanhoTexto(lista) {
  let n = 0;
  for (const c of lista ?? []) n += (c.type === T.texto ? c.content.length : 0) + tamanhoTexto(c.components);
  return n;
}

/** Erros (em português) que o Discord daria pra esta mensagem */
export function validarV2(msg) {
  const erros = [];
  const pecas = contarComponentes(msg.components);
  if (pecas > MAX_PECAS) erros.push(`A mensagem ficou com ${pecas} peças e o Discord aceita até ${MAX_PECAS}. Tire imagens do final, campos ou cores.`);
  const tam = tamanhoTexto(msg.components);
  if (tam > MAX_TEXTO) erros.push(`O texto da mensagem passou de ${MAX_TEXTO} caracteres (ficou com ${tam}).`);
  return erros;
}
