// Aba Servidor: montar o servidor a partir de um modelo (categorias, canais e cargos) e as "fontes" dos nomes.
// O Discord não deixa trocar a fonte de verdade: as letras viram símbolos Unicode que parecem outra fonte.
// Tudo aqui é sem Discord (testável); quem cria e renomeia é o bot.js.

/** [id, nome, emoji, [[tipo 't' texto | 'v' voz, nome, emoji], ...]] */
export const CATS_SRV = [
  ['portaria', 'Portaria', '📌', [['t', 'regras', '📜'], ['t', 'anúncios', '📢'], ['t', 'boas-vindas', '👋'], ['t', 'escolha-sua-cor', '🎨']]],
  ['resenha', 'Resenha', '💬', [['t', 'geral', '💬'], ['t', 'memes', '🤡'], ['t', 'mídia', '📸'], ['t', 'off-topic', '🌀'], ['t', 'comandos', '🤖']]],
  ['jogatina', 'Jogatina', '🎮', [['t', 'procurando-time', '🔎'], ['t', 'clipes', '🎬'], ['t', 'minecraft', '⛏️'], ['t', 'among-us', '🔪'], ['t', 'roblox', '🧱'], ['t', 'cs-e-valorant', '🎯'], ['t', 'free-fire', '🔥']]],
  ['calls', 'Calls', '🔊', [['v', 'Resenha 1', '🔊'], ['v', 'Resenha 2', '🔊'], ['v', 'Jogando', '🎮'], ['v', 'AFK', '💤']]],
  ['eventos', 'Eventos', '🎉', [['t', 'eventos', '📅'], ['t', 'sorteios', '🎁'], ['v', 'Palco', '🎤']]],
  ['estudos', 'Estudos', '📚', [['t', 'dúvidas', '❓'], ['t', 'materiais', '📎'], ['v', 'Sala de estudos', '📚']]],
  ['staff', 'Staff', '🛡️', [['t', 'staff-chat', '🛡️'], ['t', 'registros', '📒'], ['t', 'tickets-log', '🎫']]],
];
/** [id, nome, descrição, categorias] */
export const MODELOS_SRV = [
  ['resenha_jogos', 'Resenha + Jogos', 'O pacote completo da casa.', ['portaria', 'resenha', 'jogatina', 'calls', 'eventos', 'staff']],
  ['resenha', 'Só resenha', 'Bate-papo, memes e call.', ['portaria', 'resenha', 'calls', 'eventos', 'staff']],
  ['gamer', 'Gamer raiz', 'Foco em jogatina e time.', ['portaria', 'jogatina', 'calls', 'eventos', 'staff']],
  ['campus', 'Campus', 'Resenha com sala de estudos.', ['portaria', 'resenha', 'estudos', 'calls', 'staff']],
];
/** [nome, cor, emoji, quando ('sempre' ou a categoria), papel] */
export const CARGOS_SRV = [
  ['Reitor', '#C4363C', '👑', 'sempre', 'dono'], ['Coordenação', '#E67E22', '🛠️', 'sempre', 'admin'], ['Monitor', '#3498DB', '🛡️', 'sempre', 'moderação'],
  ['Bots', '#99AAB5', '🤖', 'sempre', ''], ['Veterano', '#F2C14E', '🎓', 'sempre', ''], ['Calouro', '#B9DCB0', '🎒', 'sempre', ''], ['Verificado', '#2ECC71', '✅', 'sempre', 'aceitou as regras'],
  ['Minecraft', '#5D9C3A', '⛏️', 'jogatina', ''], ['Among Us', '#C51111', '🔪', 'jogatina', ''], ['Roblox', '#E2231A', '🧱', 'jogatina', ''], ['CS', '#F0A33A', '💣', 'jogatina', ''],
  ['Valorant', '#FF4655', '🎯', 'jogatina', ''], ['Free Fire', '#F6B91C', '🔥', 'jogatina', ''], ['Ping de eventos', '#FF6EC7', '🎉', 'eventos', ''], ['Grupo de estudos', '#9B59B6', '📚', 'estudos', ''],
];
// Cargos que a pessoa pega sozinha pelo botão (jogos e avisos)
export const CARGOS_POR_BOTAO = ['Minecraft', 'Among Us', 'Roblox', 'CS', 'Valorant', 'Free Fire', 'Ping de eventos', 'Grupo de estudos'];
export const CARGOS_STAFF = ['Reitor', 'Coordenação', 'Monitor'];
// Canais da Portaria em que só o bot (e a staff) escreve
export const SO_LEITURA = ['regras', 'anúncios', 'boas-vindas', 'escolha-sua-cor'];

export const FONTES_U = [['normal', 'Normal'], ['negrito', 'Negrito'], ['italico', 'Itálico'], ['cursiva', 'Cursiva'], ['gotica', 'Gótica'], ['duplo', 'Contorno'], ['mono', 'Máquina'], ['largo', 'Largo'], ['versalete', 'Versalete'], ['bolinha', 'Bolinha']];
export const DECO = {
  categorias: ['{nome}', '{emoji} {nome}', '─ {nome} ─', '꒰ {nome} ꒱', '┏━ {nome}', '✦ {nome} ✦'],
  canais: ['{nome}', '{emoji}・{nome}', '{emoji}┃{nome}', '{emoji}﹒{nome}', '╰・{nome}', '»{nome}'],
  cargos: ['{nome}', '{emoji} {nome}', '・{nome}', '〔{nome}〕', '★ {nome}', '» {nome}'],
};
export const CAIXAS = ['manter', 'maiusculas', 'minusculas'];
export const ALVOS = ['categorias', 'canais', 'cargos'];

export const PADRAO_SRV = {
  modelo: 'resenha_jogos',
  cats: ['portaria', 'resenha', 'jogatina', 'calls', 'eventos', 'staff'],
  opt: { fontes: true, perms: true, autoJogos: true, apagar: false },
  f: { categorias: { fonte: 'negrito', deco: 4, caixa: 'maiusculas' }, canais: { fonte: 'normal', deco: 1, caixa: 'manter' }, cargos: { fonte: 'normal', deco: 1, caixa: 'manter' } },
};

// Letras "enfeitadas": [maiúscula, minúscula, dígito] de cada fonte. Contorno tem letras que já existiam fora do bloco (buracos).
const MAPA = { negrito: [0x1d5d4, 0x1d5ee, 0x1d7ec], italico: [0x1d608, 0x1d622, 0], cursiva: [0x1d4d0, 0x1d4ea, 0], gotica: [0x1d56c, 0x1d586, 0], duplo: [0x1d538, 0x1d552, 0x1d7d8], mono: [0x1d670, 0x1d68a, 0x1d7f6], largo: [0xff21, 0xff41, 0xff10], bolinha: [0x24b6, 0x24d0, 0] };
const BURACOS = { duplo: { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 } };
const VERSALETE = [...'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ'];

/** Troca as letras pela fonte (sem acento: as fontes Unicode não têm). 'normal' devolve igual. */
export function fancy(texto, fonte) {
  const t = String(texto ?? '');
  if (!fonte || fonte === 'normal') return t;
  return [...t.normalize('NFD').replace(/[̀-ͯ]/g, '')]
    .map((ch) => {
      const c = ch.charCodeAt(0), up = c >= 65 && c <= 90, lo = c >= 97 && c <= 122, dg = c >= 48 && c <= 57;
      if (fonte === 'versalete') return up || lo ? VERSALETE[(c | 32) - 97] : ch;
      const m = MAPA[fonte];
      if (!m) return ch;
      if (up) return String.fromCodePoint(BURACOS[fonte]?.[ch] || m[0] + c - 65);
      if (lo) return String.fromCodePoint(m[1] + c - 97);
      if (dg && m[2]) return String.fromCodePoint(m[2] + c - 48);
      if (dg && fonte === 'bolinha') return c === 48 ? '⓪' : String.fromCodePoint(0x2460 + c - 49);
      return ch;
    })
    .join('');
}

const caixa = (t, c) => (c === 'maiusculas' ? t.toUpperCase() : c === 'minusculas' ? t.toLowerCase() : t);

/** Nome como fica no Discord. alvo: categorias, canais ou cargos. voz: canal de voz aceita espaço e maiúscula. */
export function formatarNome(alvo, nome, emoji, voz, cfg) {
  let n = caixa(nome, cfg.caixa);
  if (alvo === 'canais' && !voz) {
    n = n.replace(/\s+/g, '-');
    if (cfg.fonte === 'normal') n = n.toLowerCase();
  }
  return (DECO[alvo][cfg.deco] ?? DECO[alvo][0]).replace('{emoji}', emoji).replace('{nome}', fancy(n, cfg.fonte)).slice(0, 100);
}

/** Nome sem enfeite, fonte, acento nem emoji, pra achar o que já existe: "┏━ 𝗥𝗘𝗦𝗘𝗡𝗛𝗔" → "resenha" */
export function chave(nome) {
  return [...String(nome ?? '').normalize('NFKC')]
    .map((ch) => {
      const i = VERSALETE.indexOf(ch);
      return i >= 0 ? String.fromCharCode(97 + i) : ch;
    })
    .join('')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** O que o modelo escolhido vai ter: categorias (com canais) e cargos */
export function planoDoModelo(srv) {
  const cats = CATS_SRV.filter((c) => srv.cats.includes(c[0])).map(([id, nome, emoji, canais]) => ({ id, nome, emoji, canais: canais.map(([tipo, n, e]) => ({ voz: tipo === 'v', nome: n, emoji: e })) }));
  const cargos = CARGOS_SRV.filter((r) => r[3] === 'sempre' || srv.cats.includes(r[3])).map(([nome, cor, emoji, , papel]) => ({ nome, cor, emoji, papel }));
  return { cats, cargos, resumo: `${cats.length} categorias, ${cats.reduce((a, c) => a + c.canais.length, 0)} canais e ${cargos.length} cargos` };
}

/** Confere a config da aba (o que não veio fica como o padrão) */
export function normalizarSrv(bruto) {
  const s = bruto && typeof bruto === 'object' ? bruto : {};
  const p = PADRAO_SRV;
  const ids = CATS_SRV.map((c) => c[0]);
  const opt = s.opt && typeof s.opt === 'object' ? s.opt : {};
  const f = s.f && typeof s.f === 'object' ? s.f : {};
  const umaFonte = (alvo) => {
    const x = f[alvo] && typeof f[alvo] === 'object' ? f[alvo] : {};
    return {
      fonte: FONTES_U.some(([id]) => id === x.fonte) ? x.fonte : p.f[alvo].fonte,
      deco: Number.isInteger(x.deco) && x.deco >= 0 && x.deco < DECO[alvo].length ? x.deco : p.f[alvo].deco,
      caixa: CAIXAS.includes(x.caixa) ? x.caixa : p.f[alvo].caixa,
    };
  };
  return {
    modelo: MODELOS_SRV.some((m) => m[0] === s.modelo) ? s.modelo : p.modelo,
    cats: Array.isArray(s.cats) ? ids.filter((id) => s.cats.includes(id)) : [...p.cats],
    opt: Object.fromEntries(Object.keys(p.opt).map((k) => [k, typeof opt[k] === 'boolean' ? opt[k] : p.opt[k]])),
    f: Object.fromEntries(ALVOS.map((a) => [a, umaFonte(a)])),
  };
}
