// Temas de datas festivas: qual tema vale hoje e como ele muda as imagens, a cor e o texto das mensagens
const FUSO = process.env.FUSO || 'America/Sao_Paulo';
// Temas com banners próprios na galeria (banners/festas/<id>-<mensagem>.gif, mini/<id>.jpg, festas/card-<id>.jpg)
export const FESTAS = ['natal', 'ano', 'halloween', 'carnaval', 'pascoa', 'namorados', 'junina', 'estudante', 'criancas', 'niver'];
// Mensagem → onde o tema pode ser ligado ("Usar em")
const ONDE = { painel: 'painel', news: 'news', entrada: 'portaria', saida: 'portaria', expulsao: 'portaria', ban: 'portaria', silencio: 'portaria' };

const dois = (n) => String(n).padStart(2, '0');

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
export function pascoaDe(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return { dia: (n % 31) + 1, mes: Math.floor(n / 31), ano };
}

const somarDias = ({ dia, mes, ano }, dias) => {
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}`;
};

/** Período do tema naquele ano. Carnaval: sábado a quarta (Páscoa −50 a −46); Páscoa: sexta a domingo. */
export function datasDoTema(t, ano) {
  if (t.movel === 'carnaval') return { ini: somarDias(pascoaDe(ano), -50), fim: somarDias(pascoaDe(ano), -46) };
  if (t.movel === 'pascoa') return { ini: somarDias(pascoaDe(ano), -2), fim: somarDias(pascoaDe(ano), 0) };
  return { ini: t.ini, fim: t.fim };
}

/** 'dd/mm' → número mmdd, ou null se não for uma data */
export function chaveDia(x) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec((x || '').trim());
  return m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 ? +m[2] * 100 + +m[1] : null;
}

const diaDoAno = (chave) => {
  const mes = Math.floor(chave / 100), dia = chave % 100;
  return Math.round((Date.UTC(2025, mes - 1, dia) - Date.UTC(2025, 0, 1)) / 864e5);
};

/** Quantos dias o período dura (pra decidir quem ganha quando dois temas caem no mesmo dia) */
function duracao(ini, fim) {
  const a = diaDoAno(ini), b = diaDoAno(fim);
  return b >= a ? b - a + 1 : 365 - a + b + 1;
}

/** Tema que vale no dia (o de período menor ganha; empate: aviso personalizado, depois a ordem da lista) */
export function temaAtivo(temas, hoje) {
  if (!temas?.auto) return null;
  const k = hoje.mes * 100 + hoje.dia;
  const candidatos = [];
  temas.lista.forEach((t, i) => {
    if (!t.on) return;
    const { ini, fim } = datasDoTema(t, hoje.ano);
    const a = chaveDia(ini), b = chaveDia(fim);
    if (a == null || b == null) return;
    if (a <= b ? k >= a && k <= b : k >= a || k <= b) candidatos.push({ t, i, dias: duracao(a, b) });
  });
  candidatos.sort((x, y) => x.dias - y.dias || (y.t.custom ? 1 : 0) - (x.t.custom ? 1 : 0) || x.i - y.i);
  return candidatos[0]?.t ?? null;
}

/** Dia de hoje no fuso do servidor (padrão: horário de Brasília) */
export function hojeNoBrasil(agora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(agora).map((x) => [x.type, x.value]));
  return { dia: +p.day, mes: +p.month, ano: +p.year };
}

/** Banner do tema pra uma mensagem: o escolhido no painel, o festivo daquela mensagem ou o do aviso */
export const bannerDoTema = (t, tipo) => t.msgs?.[tipo] || (FESTAS.includes(t.id) ? `banners/festas/${t.id}-${tipo}.gif` : t.banner || 'banners/tema-aviso.gif');

/**
 * Como o tema muda uma mensagem. null quando o tema não vale pra ela ("Usar em").
 * respeitar = "Manter minhas imagens": só troca a imagem que ainda está no padrão ('').
 * @returns {{ imgs: object, cor: string, frase: string, cardBg: string | null } | null}
 */
export function aplicarTema(tipo, imgs, t, respeitar) {
  if (!t || !t.onde?.[ONDE[tipo]]) return null;
  const festa = FESTAS.includes(t.id);
  const troca = (ref) => !respeitar || !ref;
  return {
    imgs: {
      ...imgs,
      topo: troca(imgs.topo) ? bannerDoTema(t, tipo) : imgs.topo,
      mini: festa && troca(imgs.mini) ? `banners/mini/${t.id}.jpg` : imgs.mini,
    },
    cor: t.cor,
    frase: t.frase,
    cardBg: festa ? `banners/festas/card-${t.id}.jpg` : null,
  };
}
