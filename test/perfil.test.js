import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contarCor, contarMensagem, de, entrouNaCall, fecharCalls, fecharMes, lerEstatisticas, mesDe, saiuDaCall, somarEvento, tempoDeCall, zerarEstatisticas } from '../lib/estatisticas.js';
import { bannerPadrao, MEDALHAS, medalhasDe, perfilDe, salvarPerfil, zerarPerfis } from '../lib/perfil.js';
import { abrir, criarEstado, criarSessao, lerEstado, lerSessao, linkDoDiscord, selar, voltaPermitida } from '../lib/sessao.js';

const ID = '123456789012345678';
const H = 3_600_000;

test('sessão assinada: abre a mesma, recusa mexida e vencida', () => {
  const t = criarSessao({ id: ID, nome: 'Pedrinho', usuario: 'pedrinho', avatar: null }, 1000);
  assert.equal(lerSessao(t, 2000).nome, 'Pedrinho');
  const [corpo, ass] = t.split('.');
  const mexido = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(corpo, 'base64url')), id: '999999999999999999' })).toString('base64url');
  assert.equal(lerSessao(`${mexido}.${ass}`, 2000), null);
  assert.equal(lerSessao(t, 1000 + 8 * 864e5), null);
  assert.equal(lerSessao('lixo'), null);
  // "state" do OAuth não serve como sessão (e vice-versa)
  assert.equal(lerSessao(criarEstado('http://localhost:3000/', 1000), 2000), null);
  assert.equal(lerEstado(t, 2000), null);
  assert.equal(abrir(selar({ exp: 5 }), 10), null);
});

test('login: link do Discord com os escopos e volta só pra site liberado', () => {
  const link = new URL(linkDoDiscord({ clientId: '42', redirect: 'https://bot/auth/callback', estado: 'x' }));
  assert.equal(link.searchParams.get('scope'), 'identify guilds');
  assert.equal(link.searchParams.get('redirect_uri'), 'https://bot/auth/callback');
  assert.equal(voltaPermitida('https://pedroa07.github.io/Interface-Manda-Chuva-Bot/', ['https://pedroa07.github.io']), true);
  assert.equal(voltaPermitida('http://localhost:5500/', []), true);
  assert.equal(voltaPermitida('https://golpe.com/', ['https://pedroa07.github.io']), false);
  assert.equal(voltaPermitida('javascript:alert(1)', ['https://pedroa07.github.io']), false);
});

test('medalhas: tempo de casa, mensagens, call, staff, aniversário e evento', () => {
  const agora = Date.UTC(2026, 10, 2);
  const s = { m: 1200, cores: 3, coruja: 1, ev: { construtor: 12, detetive: 2 } };
  const ms = medalhasDe(s, { entrou: agora - 7 * 30.44 * 864e5, staff: false, niver: true, rei: false, voz: { total: 51 * 3600, maior: 7 * 3600 } }, agora);
  const g = Object.fromEntries(ms.map((m) => [m.id, m]));
  assert.equal(ms.length, 16);
  assert.ok(g.calouro.ganha && g.veterano.ganha && !g.lenda.ganha);
  assert.equal(g.lenda.v, 7);
  assert.ok(g.tagarela.ganha && g['rato-call'].ganha && g.capivara.ganha && g.coruja.ganha && g.aniversario.ganha);
  assert.ok(!g.moderador.ganha && !g['rei-resenha'].ganha);
  assert.equal(g.pintor.v, 3);
  assert.ok(g.construtor.ganha);
  assert.equal(g.construtor.v, 10); // não passa do máximo
  assert.equal(g.detetive.v, 2);
  const novato = medalhasDe(undefined, { entrou: agora, staff: true, niver: false, rei: true, voz: { total: 0, maior: 0 } }, agora);
  assert.deepEqual(novato.filter((m) => m.ganha).map((m) => m.id), ['calouro', 'rei-resenha', 'moderador']);
});

test('perfil: banner da galeria, bio até 120 e só medalha ganha fixa (até 3)', async () => {
  zerarPerfis();
  assert.match(bannerPadrao(ID), /^banners\/perfil\/(jogos|musica|diversos|animais|desenhos|codigo)-[1-8]\.jpg$/);
  assert.equal(bannerPadrao(ID), bannerPadrao(ID));
  assert.deepEqual(perfilDe(ID).fixadas, []);
  const ok = await salvarPerfil(ID, { banner: 'banners/perfil/animais-3.jpg', bio: '  Main  suporte  ', fixadas: ['calouro', 'calouro'] }, ['calouro']);
  assert.deepEqual(ok.perfil, { banner: 'banners/perfil/animais-3.jpg', bio: 'Main suporte', fixadas: ['calouro'] });
  assert.equal(perfilDe(ID).banner, 'banners/perfil/animais-3.jpg');
  assert.match((await salvarPerfil(ID, { banner: 'https://x/y.jpg' }, [])).erro, /galeria/);
  assert.match((await salvarPerfil(ID, { bio: 'x'.repeat(121) }, [])).erro, /120/);
  assert.match((await salvarPerfil(ID, { fixadas: ['lenda'] }, ['calouro'])).erro, /já ganhou/);
  assert.match((await salvarPerfil(ID, { fixadas: ['a', 'b', 'c', 'd'] }, ['a', 'b', 'c', 'd'])).erro, /até 3/);
  // Só a bio muda: o resto fica
  assert.equal((await salvarPerfil(ID, { bio: 'oi' }, ['calouro'])).perfil.banner, 'banners/perfil/animais-3.jpg');
});

test('estatísticas: mensagens por mês, coruja, rei do mês, call e eventos', () => {
  zerarEstatisticas();
  const out = Date.UTC(2026, 9, 10, 15); // 10/10 12h em Brasília
  contarMensagem('a', out);
  contarMensagem('a', out);
  contarMensagem('b', out);
  assert.equal(de('a').mes[mesDe(out)], 2);
  assert.equal(de('a').coruja, 0);
  contarMensagem('b', Date.UTC(2026, 9, 11, 7)); // 4h da manhã em Brasília
  assert.equal(de('b').coruja, 1);
  contarMensagem('b', Date.UTC(2026, 9, 12, 15));
  // Virou o mês: o rei de outubro é quem mais falou
  fecharMes(Date.UTC(2026, 10, 1, 15));
  assert.equal(lerEstatisticas().reis['2026-10'], 'b');
  entrouNaCall('a', 0);
  entrouNaCall('a', 5000); // trocar de canal não reinicia
  assert.deepEqual(tempoDeCall('a', 2 * H), { total: 7200, maior: 7200 });
  saiuDaCall('a', 3 * H);
  assert.equal(de('a').voz, 3 * 3600);
  entrouNaCall('a', 4 * H);
  fecharCalls(5 * H);
  assert.equal(de('a').voz, 4 * 3600);
  contarCor('a');
  assert.equal(de('a').cores, 1);
  assert.equal(somarEvento('a', 'foliao', 2), 2);
  assert.equal(somarEvento('a', 'foliao', -5), 0);
});

test('a lista de medalhas bate com as imagens do site (16 ids únicos)', () => {
  const ids = MEDALHAS.map((m) => m.id);
  assert.equal(new Set(ids).size, 16);
  assert.ok(ids.includes('rei-resenha') && ids.includes('mira-ouro'));
});
