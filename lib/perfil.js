// Meu perfil (site): banner, bio e até 3 medalhas fixadas. As medalhas são calculadas aqui com os contadores
// (lib/estatisticas.js), o tempo de casa, o cadastro de aniversário e o papel de staff. Perfis ficam em perfis.json.
import * as dados from '../dados.js';

// 48 banners: banners/perfil/<categoria>-<1..8>.jpg (o site tem os nomes de cada um)
export const CATEGORIAS = ['jogos', 'musica', 'diversos', 'animais', 'desenhos', 'codigo'];
const BANNER = new RegExp(`^banners/perfil/(${CATEGORIAS.join('|')})-[1-8]\\.jpg$`);
export const MAX_BIO = 120;
export const MAX_FIXADAS = 3;

// [id, nome, descrição, raridade, máximo, unidade, de onde vem]
// auto = o bot conta sozinho; evento = a staff dá (/medalha) depois de um evento do servidor
export const MEDALHAS = [
  ['calouro', 'Calouro', 'Entrou no servidor.', 'COMUM', 1, '', 'auto'],
  ['veterano', 'Veterano', '6 meses de casa.', 'RARA', 6, 'meses', 'auto'],
  ['lenda', 'Lenda do Campus', '2 anos de casa sem trancar.', 'LENDÁRIA', 24, 'meses', 'auto'],
  ['tagarela', 'Tagarela', 'Mandou 1.000 mensagens na resenha.', 'COMUM', 1000, '', 'auto'],
  ['rei-resenha', 'Rei da Resenha', 'Top 1 de mensagens de um mês.', 'ÉPICA', 1, '', 'auto'],
  ['rato-call', 'Rato de Call', '50 horas em call de voz.', 'RARA', 50, 'h', 'auto'],
  ['construtor', 'Mestre dos Blocos', 'Foi em 10 noites de Minecraft do servidor.', 'RARA', 10, '', 'evento'],
  ['detetive', 'Detetive Espacial', 'Achou o impostor 5 vezes nas noites de Among.', 'RARA', 5, '', 'evento'],
  ['mira-ouro', 'Mira de Ouro', 'Ganhou um campeonato de CS ou Valorant do servidor.', 'ÉPICA', 1, '', 'evento'],
  ['sobrevivente', 'Último de Pé', 'Venceu uma partida no evento de Free Fire.', 'RARA', 1, '', 'evento'],
  ['foliao', 'Folião', 'Participou de 3 festas do servidor.', 'COMUM', 3, '', 'evento'],
  ['aniversario', 'Parabéns!', 'Cadastrou o aniversário com /aniversario.', 'COMUM', 1, '', 'auto'],
  ['moderador', 'Guardião', 'Faz parte da staff.', 'ÉPICA', 1, '', 'auto'],
  ['coruja', 'Coruja da Madrugada', 'Mandou mensagem entre 3h e 5h da manhã.', 'SECRETA', 1, '', 'auto'],
  ['capivara', 'Capivara Zen', 'Ficou 6 horas seguidas numa call, de boa.', 'SECRETA', 1, '', 'auto'],
  ['pintor', 'Pintor de Nomes', 'Trocou de cor 10 vezes no painel.', 'COMUM', 10, '', 'auto'],
].map(([id, nome, desc, rar, max, un, origem]) => ({ id, nome, desc, rar, max, un, origem }));
export const DE_EVENTO = MEDALHAS.filter((m) => m.origem === 'evento').map((m) => m.id);
const MES = 30.44 * 864e5;

/**
 * Progresso de cada medalha. s = contadores da pessoa (estatisticas.de), extras = { entrou, staff, niver, reis, voz: { total, maior } }
 * @returns {{ id, nome, desc, rar, max, un, origem, v, ganha }[]}
 */
export function medalhasDe(s, { entrou, staff, niver, rei, voz }, agora = Date.now()) {
  const meses = entrou ? Math.floor((agora - entrou) / MES) : 0;
  const v = {
    calouro: 1,
    veterano: meses,
    lenda: meses,
    tagarela: s?.m ?? 0,
    'rei-resenha': rei ? 1 : 0,
    'rato-call': Math.floor((voz?.total ?? 0) / 3600),
    aniversario: niver ? 1 : 0,
    moderador: staff ? 1 : 0,
    coruja: s?.coruja ? 1 : 0,
    capivara: (voz?.maior ?? 0) >= 6 * 3600 ? 1 : 0,
    pintor: s?.cores ?? 0,
  };
  return MEDALHAS.map((m) => {
    const n = Math.min(m.max, m.origem === 'evento' ? (s?.ev?.[m.id] ?? 0) : v[m.id]);
    return { ...m, v: n, ganha: n >= m.max };
  });
}

// ---------- Perfis ----------
let perfis = null;
export function lerPerfis() {
  if (!perfis) {
    try {
      perfis = JSON.parse(dados.lerExtra('perfis.json') ?? '{}');
    } catch {
      perfis = {};
    }
  }
  return perfis;
}

/** Banner de quem nunca escolheu: um dos 48, sempre o mesmo pra mesma pessoa */
export function bannerPadrao(userId) {
  let h = 0;
  for (const c of String(userId)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `banners/perfil/${CATEGORIAS[h % CATEGORIAS.length]}-${(Math.floor(h / CATEGORIAS.length) % 8) + 1}.jpg`;
}

export const perfilDe = (userId) => ({ banner: bannerPadrao(userId), bio: '', fixadas: [], ...lerPerfis()[userId] });

/**
 * Confere e guarda. ganhas = ids das medalhas que a pessoa tem (só essas podem ser fixadas).
 * Devolve { perfil } ou { erro }.
 */
export async function salvarPerfil(userId, entrada, ganhas) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const atual = perfilDe(userId);
  const banner = e.banner === undefined ? atual.banner : String(e.banner);
  if (!BANNER.test(banner)) return { erro: 'Escolha um dos banners da galeria.' };
  const bio = e.bio === undefined ? atual.bio : String(e.bio).replace(/\s+/g, ' ').trim();
  if (bio.length > MAX_BIO) return { erro: `A bio cabe até ${MAX_BIO} caracteres.` };
  const fixadas = e.fixadas === undefined ? atual.fixadas : Array.isArray(e.fixadas) ? [...new Set(e.fixadas.map(String))] : [];
  if (fixadas.length > MAX_FIXADAS) return { erro: `Dá pra fixar até ${MAX_FIXADAS} medalhas.` };
  if (fixadas.some((id) => !ganhas.includes(id))) return { erro: 'Só dá pra fixar medalha que você já ganhou.' };
  const perfil = { banner, bio, fixadas };
  lerPerfis()[userId] = perfil;
  const erro = await dados.gravarExtras({ 'perfis.json': JSON.stringify(lerPerfis()) });
  return erro ? { erro: `Não consegui guardar: ${erro}` } : { perfil };
}

/** Só pros testes */
export function zerarPerfis() {
  perfis = {};
}
