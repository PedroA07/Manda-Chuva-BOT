// Aniversários: cada membro cadastra o seu (o Discord não mostra), o bot posta no dia com card e dá o cargo por 24 h.
// A lista fica em aniversarios.json (Gist ou pasta de dados): [{ userId, nome, d: 'dd/mm', ano: number | null }]
import * as dados from '../dados.js';
import { porServidor } from './contexto.js';

const ERRO_DATA = 'Data no formato dia/mês, tipo 14/05.';
const ERRO_ANO = 'Ano com 4 dígitos, tipo 2003 (ou deixa vazio).';
const dois = (n) => String(n).padStart(2, '0');
const bissexto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** '14/05/2003' ou '14/05' → { d, ano } (ou { erro } com a mensagem pra mostrar) */
export function lerData(texto, hoje) {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d+))?$/.exec(String(texto ?? '').trim());
  if (!m) return { erro: ERRO_DATA };
  const dia = +m[1], mes = +m[2];
  // 29/02 vale (sem ano dá pra nascer em ano bissexto); 31/04, 30/02... não
  const diasNoMes = new Date(Date.UTC(2024, mes, 0)).getUTCDate();
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes) return { erro: ERRO_DATA };
  let ano = null;
  if (m[3] !== undefined) {
    ano = +m[3];
    if (!/^(19|20)\d\d$/.test(m[3]) || ano > hoje.ano || (mes === 2 && dia === 29 && !bissexto(ano))) return { erro: ERRO_ANO };
  }
  return { d: `${dois(dia)}/${dois(mes)}`, ano };
}

/** Data em blocos ({ dia: DD, mes: MM, ano: AAAA ou vazio }), do /aniversario e do formulário do botão */
export function lerDataEmBlocos({ dia, mes, ano }, hoje) {
  const [d, m, a] = [dia, mes, ano].map((v) => String(v ?? '').trim());
  const invalida = { erro: 'Essa data não existe: confere o dia (DD) e o mês (MM), tipo dia 14 e mês 05.' };
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m)) return invalida;
  if (a && !/^\d{4}$/.test(a)) return { erro: ERRO_ANO };
  const lida = lerData(`${d}/${m}${a ? `/${a}` : ''}`, hoje);
  return lida.erro === ERRO_DATA ? invalida : lida;
}

/** Quem faz aniversário no dia. Nascido em 29/02 comemora em 28/02 quando o ano não é bissexto. */
export function aniversariantesDoDia(lista, hoje) {
  const chave = `${dois(hoje.dia)}/${dois(hoje.mes)}`;
  return lista.filter((p) => p.d === chave || (p.d === '29/02' && chave === '28/02' && !bissexto(hoje.ano)));
}

/** Dias até o próximo aniversário (0 = hoje) */
export function diasAteNiver(d, hoje) {
  const [dia, mes] = d.split('/').map(Number);
  const hoje0 = Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia);
  let alvo = Date.UTC(hoje.ano, mes - 1, dia);
  if (alvo < hoje0) alvo = Date.UTC(hoje.ano + 1, mes - 1, dia);
  return Math.round((alvo - hoje0) / 864e5);
}

/** Troca as variáveis. {idade} some (com o espaço depois) quando não tem ano ou a idade está desligada. */
export function textoDoNiver(texto, vars, mostrarIdade) {
  const temIdade = mostrarIdade && vars.idade != null;
  return String(texto ?? '')
    .replace(/\{idade\}\s*/g, temIdade ? `${vars.idade} ` : '')
    .replace(/\{(usuario|nome|servidor)\}/g, (_, k) => vars[k] ?? '')
    .trim();
}

// ---------- Lista guardada ----------
// Uma lista por servidor
const memo = porServidor();

export function lerAniversarios() {
  let lista = memo.ler();
  if (!lista) {
    try {
      lista = JSON.parse(dados.lerExtra('aniversarios.json') ?? '[]');
    } catch {
      lista = [];
    }
    memo.guardar(lista);
  }
  return lista;
}

/** Cadastra (ou troca a data de) alguém. Devolve a mensagem de erro do Gist, ou null. */
export function salvarAniversario({ userId, nome, d, ano }) {
  const lista = memo.guardar([...lerAniversarios().filter((p) => p.userId !== userId), { userId, nome, d, ano }]);
  return dados.gravarExtras({ 'aniversarios.json': JSON.stringify(lista, null, 2) });
}

export function tirarAniversario(userId) {
  const lista = memo.guardar(lerAniversarios().filter((p) => p.userId !== userId));
  return dados.gravarExtras({ 'aniversarios.json': JSON.stringify(lista, null, 2) });
}
