// Meu perfil (site): banner, foto, bio e até 3 medalhas fixadas. As medalhas são calculadas aqui com os contadores
// (lib/estatisticas.js), o tempo de casa, o cadastro de aniversário e o papel de staff. Perfis ficam em perfis.json.
import { createHash } from 'node:crypto';
import * as dados from '../dados.js';
import { noServidor, porServidor, servidorAtual } from './contexto.js';
import { AP_PADRAO, DEGRADES, FONTES_NOME, HEX } from './aparencia.js';
import { linkPublico } from './link.js';

export { DEGRADES, FONTES_NOME, textoSobre } from './aparencia.js';

// 48 banners: banners/perfil/<categoria>-<1..8>.jpg (o site tem os nomes de cada um)
export const CATEGORIAS = ['jogos', 'musica', 'diversos', 'animais', 'desenhos', 'codigo'];
const BANNER = new RegExp(`^banners/perfil/(${CATEGORIAS.join('|')})-[1-8]\\.jpg$`);
export const MAX_BIO = 120;
export const MAX_FIXADAS = 3;
const ORIGENS = { b: ['discord', 'galeria', 'link', 'anexo'], a: ['discord', 'link', 'anexo'] };

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
// Perfis de cada servidor
const memo = porServidor();
export function lerPerfis() {
  let perfis = memo.ler();
  if (!perfis) {
    try {
      perfis = JSON.parse(dados.lerExtra('perfis.json') ?? '{}');
    } catch {
      perfis = {};
    }
    memo.guardar(perfis);
  }
  return perfis;
}

// ---------- Perfil vinculado: o mesmo perfil em vários servidores ----------
// Quem liga "Vincular" num servidor passa a usar ali o perfil compartilhado (perfis-vinculados.json, de todos os servidores).
// No perfil do servidor fica só { vinc: true, fixadas }: as medalhas fixadas são sempre do servidor (cada um conta as suas).
let vinculados = null;
export function lerVinculados() {
  if (!vinculados) {
    try {
      vinculados = JSON.parse(dados.lerExtra('perfis-vinculados.json') ?? '{}');
    } catch {
      vinculados = {};
    }
  }
  return vinculados;
}
const gravarVinculados = () => dados.gravarExtras({ 'perfis-vinculados.json': JSON.stringify(lerVinculados()) });

/** O que está guardado da pessoa no servidor da vez, já com o compartilhado no lugar quando está vinculado (ou undefined) */
export function perfilGuardado(userId) {
  const local = lerPerfis()[userId];
  if (!local?.vinc) return local;
  return { ...(lerVinculados()[userId] ?? {}), fixadas: local.fixadas ?? [], vinc: true };
}

/** Grava o perfil da pessoa no servidor da vez (no compartilhado, se estiver vinculado). Devolve a mensagem de erro ou null. */
async function gravarPerfil(userId, perfil) {
  const { vinc, fixadas = [], ...resto } = perfil;
  if (lerPerfis()[userId]?.vinc) {
    lerVinculados()[userId] = resto;
    lerPerfis()[userId] = { vinc: true, fixadas };
    return (await gravarVinculados()) ?? (await gravarPerfis());
  }
  lerPerfis()[userId] = { ...resto, fixadas };
  return gravarPerfis();
}

/**
 * Liga ou desliga o vínculo no servidor da vez. Ligar: o servidor passa a mostrar o perfil compartilhado (se ainda não tem
 * um, o deste servidor vira o compartilhado). Desligar: fica aqui uma cópia do compartilhado, que daí em diante é só daqui.
 */
export async function vincularPerfil(userId, on) {
  const local = lerPerfis()[userId];
  const atual = perfilDe(userId);
  if (!!local?.vinc === !!on) return { perfil: atual };
  const { vinc, fixadas, ...resto } = atual;
  if (on) {
    if (!lerVinculados()[userId]) {
      lerVinculados()[userId] = resto;
      const erro = await gravarVinculados();
      if (erro) return { erro: `Não consegui guardar: ${erro}` };
    }
    lerPerfis()[userId] = { vinc: true, fixadas: local?.fixadas ?? [] };
  } else lerPerfis()[userId] = { ...resto, fixadas };
  const erro = await gravarPerfis();
  return erro ? { erro: `Não consegui guardar: ${erro}` } : { perfil: perfilDe(userId) };
}

/** Perfis de todos os servidores guardados e os compartilhados (a limpeza de imagens olha todos: uma imagem pode estar em outro servidor) */
export const todosOsPerfis = () => [lerPerfis(), ...dados.servidoresGuardados().map((id) => noServidor(id, lerPerfis)), lerVinculados()];

/** Banner de quem nunca escolheu: um dos 48, sempre o mesmo pra mesma pessoa */
export function bannerPadrao(userId) {
  let h = 0;
  for (const c of String(userId)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `banners/perfil/${CATEGORIAS[h % CATEGORIAS.length]}-${(Math.floor(h / CATEGORIAS.length) % 8) + 1}.jpg`;
}

// b* = banner, a* = foto (avatar). Orig = de onde vem. O link e o anexo ficam guardados mesmo quando a origem muda,
// pra pessoa poder voltar sem mandar de novo. Perfil de antes da v10 não tem esses campos e cai nos padrões.
export const perfilDe = (userId) => ({
  bOrig: 'galeria', banner: bannerPadrao(userId), bLink: '', bLinkGif: false, bAnexo: '', bArqNome: '',
  aOrig: 'discord', aLink: '', aLinkGif: false, aAnexo: '', aArqNome: '',
  bio: '', fixadas: [],
  ap: { ...AP_PADRAO }, niverVis: 'data', fav: FAV_PADRAO(), redes: {},
  ...perfilGuardado(userId),
});

// ---------- Redes (v12, lib/redes.js): { steam: { id, mostrar }, letterboxd: { user, mostrar }, instagram: { user, mostrar } } ----------
const ORDEM_REDES = ['steam', 'spotify', 'letterboxd', 'instagram', 'twitch'];
const POR_NOME = ['letterboxd', 'instagram'];
const USUARIO = /^[A-Za-z0-9_.]{2,30}$/;

/** Redes ligadas que a pessoa deixou aparecer, na ordem do perfil: [{ rede, conta }] */
export const redesPublicas = (p) =>
  ORDEM_REDES.filter((r) => p.redes?.[r] && p.redes[r].mostrar !== false).map((rede) => ({ rede, conta: p.redes[rede] }));

async function gravarRedes(userId, mexer) {
  const p = perfilDe(userId);
  const redes = structuredClone(p.redes ?? {});
  const erro = mexer(redes);
  if (erro) return { erro };
  const perfil = { ...p, redes };
  const falhou = await gravarPerfil(userId, perfil);
  return falhou ? { erro: `Não consegui guardar: ${falhou}` } : { perfil };
}

/** Letterboxd e Instagram pelo nome ({ acao: 'ligar', rede, user }); qualquer uma: 'desligar' e 'mostrar' (on) */
export function mudarRede(userId, pedido) {
  const { acao, rede } = pedido && typeof pedido === 'object' ? pedido : {};
  if (!ORDEM_REDES.includes(rede)) return { erro: 'Essa rede não existe.' };
  return gravarRedes(userId, (redes) => {
    if (acao === 'ligar') {
      if (!POR_NOME.includes(rede)) return rede === 'steam' ? 'A Steam liga pelo login da própria Steam.' : 'Essa rede ainda não liga por aqui.';
      const user = String(pedido.user ?? '').trim().replace(/^@/, '');
      if (!USUARIO.test(user)) return 'Esse nome de usuário não parece válido (letras, números, ponto e _).';
      redes[rede] = { user, mostrar: true };
    } else if (acao === 'desligar') delete redes[rede];
    else if (acao === 'mostrar') {
      if (!redes[rede]) return 'Liga a rede primeiro.';
      redes[rede].mostrar = pedido.on !== false;
    } else return 'Ação inválida.';
    return null;
  });
}

/** Depois do login da Steam (conferido com a própria Steam) */
export const ligarSteam = (userId, steamid) => gravarRedes(userId, (redes) => ((redes.steam = { id: String(steamid), mostrar: true }), null));

// ---------- Favoritos (v12): até 5 por lista, cada um com a capa achada (lib/capas.js) ----------
export const MAX_FAVORITOS = 5;
export const MAX_NOME_FAVORITO = 60;
export const NOMES_FAVORITOS = { jogos: 'Jogos', filmes: 'Filmes', livros: 'Livros', musicas: 'Músicas' };
const FAV_PADRAO = () => ({ jogos: [], filmes: [], livros: [], musicas: [], mostrar: { jogos: true, filmes: true, livros: true, musicas: true } });
const favoritosDe = (p) => {
  const f = { ...FAV_PADRAO(), ...structuredClone(p.fav ?? {}) };
  f.mostrar = { ...FAV_PADRAO().mostrar, ...f.mostrar };
  return f;
};

/** Listas que a pessoa deixou aparecer e que têm alguma coisa: [{ tipo, nome, itens: [{ t, capa }] }] */
export const favoritosPublicos = (p) =>
  Object.keys(NOMES_FAVORITOS)
    .map((tipo) => ({ tipo, nome: NOMES_FAVORITOS[tipo], itens: favoritosDe(p)[tipo] }))
    .filter((f) => f.itens.length && favoritosDe(p).mostrar[f.tipo] !== false);

/**
 * Mexe nos favoritos: { acao: 'add', tipo, t } (procura a capa), { acao: 'tirar', tipo, t } ou { acao: 'mostrar', tipo, on }.
 * achar(tipo, nome) devolve o endereço da capa ou ''. Devolve { perfil } ou { erro }.
 */
export async function mudarFavorito(userId, pedido, achar) {
  const { acao, tipo } = pedido && typeof pedido === 'object' ? pedido : {};
  if (!(tipo in NOMES_FAVORITOS)) return { erro: 'Essa lista de favoritos não existe.' };
  const t = String(pedido.t ?? '').replace(/\s+/g, ' ').trim();
  // Antes de procurar a capa (demora): confere; depois, confere de novo no perfil mais novo (dois cliques ao mesmo tempo)
  const problema = (fav) => {
    if (!t) return 'Escreve o nome primeiro.';
    if (t.length > MAX_NOME_FAVORITO) return `Nome grande demais (até ${MAX_NOME_FAVORITO} letras).`;
    if (fav[tipo].length >= MAX_FAVORITOS) return `Máximo de ${MAX_FAVORITOS} em ${NOMES_FAVORITOS[tipo].toLowerCase()}. Escolhe os melhores.`;
    if (fav[tipo].some((x) => x.t.toLowerCase() === t.toLowerCase())) return 'Esse já está na lista.';
    return null;
  };
  let capa = '';
  if (acao === 'add') {
    const antes = problema(favoritosDe(perfilDe(userId)));
    if (antes) return { erro: antes };
    capa = await achar(tipo, t);
  } else if (acao !== 'tirar' && acao !== 'mostrar') return { erro: 'Ação inválida.' };
  const p = perfilDe(userId);
  const fav = favoritosDe(p);
  if (acao === 'add') {
    const depois = problema(fav);
    if (depois) return { erro: depois };
    fav[tipo].push({ t, capa });
  } else if (acao === 'tirar') fav[tipo] = fav[tipo].filter((x) => x.t !== t);
  else fav.mostrar[tipo] = pedido.on !== false;
  const perfil = { ...p, fav };
  const erro = await gravarPerfil(userId, perfil);
  return erro ? { erro: `Não consegui guardar: ${erro}` } : { perfil };
}

// ---------- Aparência do cartão (v12, lib/aparencia.js) ----------
// Quem vê o aniversário no perfil: ninguém, só o dia e o mês, ou também a idade
export const VISIBILIDADES = ['oculto', 'data', 'idade'];

/** Junta o que veio com a aparência atual e confere. Devolve { ap } ou { erro }. */
function conferirAparencia(bruto, atual) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { erro: 'Aparência inválida.' };
  const ap = { ...atual, ...bruto };
  if (!HEX.test(ap.fundo) || !HEX.test(ap.destaque) || (ap.nome !== '' && !HEX.test(ap.nome))) return { erro: 'Cor inválida: use o formato #RRGGBB.' };
  if (!['solida', 'degrade'].includes(ap.nomeTipo)) return { erro: 'O nome é de cor sólida ou degradê.' };
  if (!Number.isInteger(ap.grad) || ap.grad < 0 || ap.grad >= DEGRADES.length) return { erro: 'Esse degradê não existe.' };
  if (!FONTES_NOME.includes(ap.fonte)) return { erro: 'Essa fonte não existe.' };
  return { ap: { fundo: ap.fundo.toUpperCase(), nome: ap.nome.toUpperCase(), nomeTipo: ap.nomeTipo, grad: ap.grad, fonte: ap.fonte, destaque: ap.destaque.toUpperCase() } };
}

/** "14/05 · 22 anos", "14/05" ou null (escondido ou sem cadastro). niver = { d: 'dd/mm', ano }, hoje = { dia, mes, ano } */
export function textoDoAniversario(niver, vis, hoje) {
  if (!niver || vis === 'oculto') return null;
  if (vis !== 'idade' || !niver.ano) return niver.d;
  const [dia, mes] = niver.d.split('/').map(Number);
  const idade = hoje.ano - niver.ano - (hoje.mes < mes || (hoje.mes === mes && hoje.dia < dia) ? 1 : 0);
  return `${niver.d} · ${idade} anos`;
}

/** Confere origem e link de uma imagem (k = 'b' ou 'a') e anota no perfil. Devolve a mensagem de erro, se tiver. */
async function conferirImagem(perfil, e, k, provas) {
  const orig = e[`${k}Orig`] ?? perfil[`${k}Orig`];
  if (!ORIGENS[k].includes(orig)) return 'Essa origem de imagem não existe.';
  const link = e[`${k}Link`] === undefined ? perfil[`${k}Link`] : String(e[`${k}Link`]).trim();
  if (link !== perfil[`${k}Link`]) {
    if (!/^https:\/\//i.test(link)) return 'O link tem que começar com https://';
    const prova = linkPublico(link) ? await provas.link(link) : null;
    if (!prova) return 'Não consegui abrir essa imagem. Confere se é o link direto de um PNG, JPG, GIF ou WEBP de até 8 MB.';
    perfil[`${k}Link`] = link;
    perfil[`${k}LinkGif`] = prova.gif;
  }
  if (orig === 'link' && !perfil[`${k}Link`]) return 'Cola o link da imagem primeiro.';
  if (orig === 'anexo' && !perfil[`${k}Anexo`]) return 'Anexa uma imagem primeiro.';
  perfil[`${k}Orig`] = orig;
  return null;
}

const gravarPerfis = () => dados.gravarExtras({ 'perfis.json': JSON.stringify(lerPerfis()) });

/**
 * Confere e guarda. ganhas = ids das medalhas que a pessoa tem (só essas podem ser fixadas).
 * provas.link(link) baixa o link novo e devolve { gif }, ou null se não for uma imagem que abre.
 * O anexo não vem por aqui: só o definirAnexo põe arquivo no perfil, depois do envio.
 * Devolve { perfil } ou { erro }.
 */
export async function salvarPerfil(userId, entrada, ganhas, provas = {}) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const atual = perfilDe(userId);
  const banner = e.banner === undefined ? atual.banner : String(e.banner);
  if (!BANNER.test(banner)) return { erro: 'Escolha um dos banners da galeria.' };
  const bio = e.bio === undefined ? atual.bio : String(e.bio).replace(/\s+/g, ' ').trim();
  if (bio.length > MAX_BIO) return { erro: `A bio cabe até ${MAX_BIO} caracteres.` };
  const fixadas = e.fixadas === undefined ? atual.fixadas : Array.isArray(e.fixadas) ? [...new Set(e.fixadas.map(String))] : [];
  if (fixadas.length > MAX_FIXADAS) return { erro: `Dá pra fixar até ${MAX_FIXADAS} medalhas.` };
  if (fixadas.some((id) => !ganhas.includes(id))) return { erro: 'Só dá pra fixar medalha que você já ganhou.' };
  const ap = e.ap === undefined ? { ap: atual.ap } : conferirAparencia(e.ap, atual.ap);
  if (ap.erro) return { erro: ap.erro };
  const niverVis = e.niverVis === undefined ? atual.niverVis : e.niverVis;
  if (!VISIBILIDADES.includes(niverVis)) return { erro: 'Essa visibilidade do aniversário não existe.' };
  const perfil = { ...atual, banner, bio, fixadas, ap: ap.ap, niverVis };
  const erroImagem = (await conferirImagem(perfil, e, 'b', provas)) ?? (await conferirImagem(perfil, e, 'a', provas));
  if (erroImagem) return { erro: erroImagem };
  const erro = await gravarPerfil(userId, perfil);
  return erro ? { erro: `Não consegui guardar: ${erro}` } : { perfil };
}

/** Põe no perfil o arquivo que acabou de ser enviado e já passa a usar ele. alvo = 'banner' ou 'foto'. */
export async function definirAnexo(userId, alvo, ref, nome) {
  const k = alvo === 'foto' ? 'a' : 'b';
  const perfil = { ...perfilDe(userId), [`${k}Orig`]: 'anexo', [`${k}Anexo`]: ref, [`${k}ArqNome`]: String(nome ?? '').slice(0, 80) };
  const erro = await gravarPerfil(userId, perfil);
  return erro ? { erro: `Não consegui guardar: ${erro}` } : { perfil };
}

const ehGif = (url) => /\.gif(\?|$)/i.test(url ?? '');

/**
 * O que o site mostra de um perfil. banner e avatar podem ser: caminho da galeria, 'anexo:<id>', '/perfis/...' (link de fora,
 * passando pelo bot) ou endereço do Discord. cor = cor de destaque de quem usa o banner do Discord sem ter um.
 * @param {object} p perfil
 * @param {{ id: string, avatar: string, discord?: { url: string | null, cor: string | null } | null }} fontes
 * @param {(ref: string) => string | null} extDoAnexo
 */
export function visualDoPerfil(p, { id, avatar, discord }, extDoAnexo) {
  const imagem = (k, tipo, doDiscord) => {
    const origem = p[`${k}Orig`];
    if (origem === 'link') {
      const versao = createHash('sha256').update(p[`${k}Link`]).digest('hex').slice(0, 8);
      // ?s= = de qual servidor é o perfil (cada servidor tem o seu)
      return { src: `/perfis/${id}/${tipo}?v=${versao}${servidorAtual() ? `&s=${servidorAtual()}` : ""}`, gif: p[`${k}LinkGif`] };
    }
    if (origem === 'anexo') return { src: p[`${k}Anexo`], gif: extDoAnexo(p[`${k}Anexo`]) === 'gif' };
    if (origem === 'discord') return { src: doDiscord, gif: ehGif(doDiscord) };
    return { src: p.banner, gif: false };
  };
  const b = imagem('b', 'banner', discord?.url ?? null), a = imagem('a', 'foto', avatar);
  return { banner: b.src, cor: b.src ? null : (discord?.cor ?? null), avatar: a.src, gif: !!(b.gif || a.gif) };
}

/** /privacidade apagar: tira o perfil da pessoa */
export async function apagarPerfil(userId) {
  if (!(userId in lerPerfis())) return null;
  // Vinculado: o compartilhado também é da pessoa e vai junto (os outros servidores voltam pro perfil padrão)
  if (lerPerfis()[userId].vinc && userId in lerVinculados()) {
    delete lerVinculados()[userId];
    const erro = await gravarVinculados();
    if (erro) return erro;
  }
  delete lerPerfis()[userId];
  return gravarPerfis();
}

/** Só pros testes */
export function zerarPerfis() {
  memo.limpar();
  memo.guardar({});
  vinculados = {};
}
