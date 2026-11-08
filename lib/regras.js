// Regras do servidor (aba Regras): o bot posta no canal e depois edita a mesma mensagem.
// Opções: escada de punições (tirada da Moderação), botão "Li e aceito" que dá um cargo, fixar e /regras (só pra quem pediu).

export const MAX_REGRAS = 15;
export const ID_ACEITO = 'regras:aceito';
export const BANNER_PADRAO = 'banners/boas-quadro.gif';
// Limites de cada campo: com 15 regras cheias a mensagem ainda cabe nos 4000 caracteres do Discord
export const LIMITES = { titulo: 100, intro: 500, regra: 80, explicacao: 110, botao: 80 };

/** [nome, [[título, explicação], ...]] (os mesmos da interface) */
export const MODELOS_REGRAS = [
  ['Resenha de boa', [
    ['Respeito acima de tudo', 'Zoeira sim, ofensa não. Nada de preconceito, assédio ou ataque pessoal.'],
    ['Sem spam e flood', 'Uma figurinha é meme. Vinte seguidas é castigo.'],
    ['Cada assunto no seu canal', 'Clipe em #clipes, meme em #memes, treta em canal nenhum.'],
    ['Nada de +18 ou gore', 'Nem “de zoeira”, nem com spoiler.'],
    ['Divulgação só com permissão', 'Convite de outro servidor só com aval da staff.'],
    ['Golpe é ban na hora', 'Nitro grátis, link suspeito ou venda de conta: ban sem aviso.'],
    ['Respeite a call', 'Sem gritar no microfone e sem soundboard infinito.'],
    ['Discordou? Abre ticket', 'Reclamação de punição vai no ticket, não no #geral.'],
  ]],
  ['Gamer', [
    ['Sem toxicidade na partida', 'Perdeu? Respira. Xingar o time não sobe o rank.'],
    ['Sem hack ou trapaça', 'Cheat, exploit ou smurf pra humilhar: ban.'],
    ['Nada de vender conta ou item', 'Comércio fica fora do servidor.'],
    ['Procurando time? Canal certo', 'Use #procurando-time e marque o cargo do jogo.'],
    ['Spoiler com aviso', 'Lançamento novo? Usa a marcação de spoiler.'],
    ['Respeite a call', 'Microfone aberto sem barulho de fundo, por favor.'],
  ]],
  ['Curto e grosso', [['Respeite todo mundo', ''], ['Sem spam', ''], ['Sem conteúdo +18', ''], ['Golpe é ban', '']]],
];

export const PADRAO_REGRAS = {
  canalId: null,
  cor: '#C4363C',
  titulo: 'REGIMENTO INTERNO DO CAMPUS',
  intro: 'Leia antes de cair na resenha. Quebrou regra, a staff sobe a escada de punições.',
  banner: '',
  regras: MODELOS_REGRAS[0][1].map(([t, d]) => ({ t, d })),
  escada: true,
  botao: true,
  botaoTxt: 'Li e aceito',
  cargoId: null,
  fixar: true,
  cmd: true,
};

const ordinal = (n) => `${n}º aviso`;

/** "1º aviso → 2º aviso → 3º aviso: silêncio de 1 h → 5º aviso: expulsão → ban", com os limites da aba Moderação (0 = nunca) */
export function escadaDePunicoes({ silenciar, expulsar }) {
  if (!silenciar && !expulsar) return 'aviso → silêncio → expulsão → ban';
  const silencia = silenciar > 0 && (!expulsar || silenciar < expulsar);
  const primeira = silencia ? silenciar : expulsar;
  const passos = [];
  const soAviso = primeira - 1;
  if (soAviso > 3) passos.push(`1º ao ${ordinal(soAviso)}`);
  else for (let n = 1; n <= soAviso; n++) passos.push(ordinal(n));
  if (silencia) passos.push(`${ordinal(silenciar)}: silêncio de 1 h`);
  passos.push(expulsar ? `${ordinal(expulsar)}: expulsão` : 'expulsão');
  passos.push('ban');
  return passos.join(' → ');
}

/** Corpo da mensagem: introdução, regras com título (numeradas) e a escada */
export function textoDasRegras(r, moderacao) {
  const regras = r.regras.filter((x) => x.t.trim()).map((x, i) => [`**${i + 1}. ${x.t.trim()}**`, x.d.trim()].filter(Boolean).join('\n'));
  const partes = [r.intro.trim(), regras.join('\n\n'), r.escada && `**Escada de punições**\n${escadaDePunicoes(moderacao)}`];
  return partes.filter(Boolean).join('\n\n');
}

/** Tem o que mandar? (pelo menos uma regra com título) */
export const temRegras = (r) => r.regras.some((x) => x.t.trim());

/**
 * Pedaço pro montarV2.
 * @param {typeof PADRAO_REGRAS} r
 * @param {{ servidor: string, hoje: string, url: (ref: string, padrao: string) => string | null, moderacao: { silenciar: number, expulsar: number }, comBotao?: boolean }} o
 */
export function pedacoDasRegras(r, { servidor, hoje, url, moderacao, comBotao = true }) {
  return {
    topo: url(r.banner, BANNER_PADRAO),
    cor: parseInt(r.cor.slice(1), 16),
    titulo: r.titulo,
    texto: textoDasRegras(r, moderacao),
    rodape: `${servidor} · atualizado em ${hoje}`,
    linhas: comBotao && r.botao ? [{ type: 1, components: [{ type: 2, style: 3, custom_id: ID_ACEITO, label: r.botaoTxt, emoji: { name: '✅' } }] }] : [],
  };
}
