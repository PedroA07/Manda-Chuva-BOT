import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contarCor, contarMensagem, de, entrouNaCall, fecharCalls, fecharMes, lerEstatisticas, mesDe, saiuDaCall, somarEvento, tempoDeCall, zerarEstatisticas } from '../lib/estatisticas.js';
import { bannerPadrao, definirAnexo, lerPerfis, MEDALHAS, medalhasDe, perfilDe, salvarPerfil, textoDoAniversario, textoSobre, visualDoPerfil, zerarPerfis } from '../lib/perfil.js';
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
  assert.equal(ok.perfil.banner, 'banners/perfil/animais-3.jpg');
  assert.equal(ok.perfil.bio, 'Main suporte');
  assert.deepEqual(ok.perfil.fixadas, ['calouro']);
  assert.equal(perfilDe(ID).banner, 'banners/perfil/animais-3.jpg');
  assert.match((await salvarPerfil(ID, { banner: 'https://x/y.jpg' }, [])).erro, /galeria/);
  assert.match((await salvarPerfil(ID, { bio: 'x'.repeat(121) }, [])).erro, /120/);
  assert.match((await salvarPerfil(ID, { fixadas: ['lenda'] }, ['calouro'])).erro, /já ganhou/);
  assert.match((await salvarPerfil(ID, { fixadas: ['a', 'b', 'c', 'd'] }, ['a', 'b', 'c', 'd'])).erro, /até 3/);
  // Só a bio muda: o resto fica
  assert.equal((await salvarPerfil(ID, { bio: 'oi' }, ['calouro'])).perfil.banner, 'banners/perfil/animais-3.jpg');
});

const LINK = 'https://i.imgur.com/banner.gif';
const linkBom = { link: async (l) => ({ gif: l.endsWith('.gif') }) };

test('perfil de antes da v10 continua igual: banner da galeria e foto do Discord', () => {
  zerarPerfis();
  lerPerfis()[ID] = { banner: 'banners/perfil/jogos-2.jpg', bio: 'oi', fixadas: ['calouro'] };
  const p = perfilDe(ID);
  assert.equal(p.bOrig, 'galeria');
  assert.equal(p.aOrig, 'discord');
  assert.equal(p.banner, 'banners/perfil/jogos-2.jpg');
  assert.equal(p.bio, 'oi');
  assert.deepEqual(p.fixadas, ['calouro']);
});

test('quem nunca mexeu começa na galeria e com a foto do Discord', () => {
  zerarPerfis();
  const p = perfilDe(ID);
  assert.equal(p.bOrig, 'galeria');
  assert.equal(p.aOrig, 'discord');
  assert.equal(p.bLink, '');
  assert.equal(p.aAnexo, '');
});

test('banner por link: guarda o link, diz se é GIF e muda a origem', async () => {
  zerarPerfis();
  const r = await salvarPerfil(ID, { bOrig: 'link', bLink: `  ${LINK}  ` }, [], linkBom);
  assert.equal(r.perfil.bOrig, 'link');
  assert.equal(r.perfil.bLink, LINK);
  assert.equal(r.perfil.bLinkGif, true);
  assert.equal(perfilDe(ID).bLink, LINK);
});

test('foto por link: não mexe no banner', async () => {
  zerarPerfis();
  const antes = perfilDe(ID).banner;
  const r = await salvarPerfil(ID, { aOrig: 'link', aLink: 'https://i.imgur.com/foto.png' }, [], linkBom);
  assert.equal(r.perfil.aOrig, 'link');
  assert.equal(r.perfil.aLink, 'https://i.imgur.com/foto.png');
  assert.equal(r.perfil.aLinkGif, false);
  assert.equal(r.perfil.bOrig, 'galeria');
  assert.equal(r.perfil.banner, antes);
});

test('banner do Discord e volta pra galeria: o link fica guardado', async () => {
  zerarPerfis();
  await salvarPerfil(ID, { bOrig: 'link', bLink: LINK }, [], linkBom);
  assert.equal((await salvarPerfil(ID, { bOrig: 'discord' }, [])).perfil.bOrig, 'discord');
  const r = await salvarPerfil(ID, { bOrig: 'galeria', banner: 'banners/perfil/codigo-1.jpg' }, []);
  assert.equal(r.perfil.bOrig, 'galeria');
  assert.equal(r.perfil.banner, 'banners/perfil/codigo-1.jpg');
  assert.equal(r.perfil.bLink, LINK);
});

test('voltar pro link já salvo não baixa de novo', async () => {
  zerarPerfis();
  let baixou = 0;
  const contando = { link: async () => (baixou++, { gif: false }) };
  await salvarPerfil(ID, { bOrig: 'link', bLink: LINK }, [], contando);
  await salvarPerfil(ID, { bOrig: 'discord' }, [], contando);
  await salvarPerfil(ID, { bOrig: 'link', bLink: LINK }, [], contando);
  assert.equal(baixou, 1);
});

test('link sem https ou de rede interna nem chega a ser baixado', async () => {
  zerarPerfis();
  let baixou = 0;
  const contando = { link: async () => (baixou++, { gif: false }) };
  assert.match((await salvarPerfil(ID, { bOrig: 'link', bLink: 'http://site.com/a.png' }, [], contando)).erro, /https:\/\//);
  assert.match((await salvarPerfil(ID, { bOrig: 'link', bLink: 'https://127.0.0.1/a.png' }, [], contando)).erro, /imagem/);
  assert.equal(baixou, 0);
});

test('link que não abre: avisa e o perfil continua como estava', async () => {
  zerarPerfis();
  const r = await salvarPerfil(ID, { bOrig: 'link', bLink: LINK }, [], { link: async () => null });
  assert.match(r.erro, /imagem/);
  assert.equal(perfilDe(ID).bOrig, 'galeria');
  assert.equal(perfilDe(ID).bLink, '');
});

test('não dá pra escolher link ou anexo sem ter um, nem origem inventada', async () => {
  zerarPerfis();
  assert.match((await salvarPerfil(ID, { bOrig: 'link' }, [])).erro, /link/);
  assert.match((await salvarPerfil(ID, { aOrig: 'link' }, [])).erro, /link/);
  assert.match((await salvarPerfil(ID, { bOrig: 'anexo' }, [])).erro, /[Aa]nexa/);
  assert.match((await salvarPerfil(ID, { aOrig: 'anexo' }, [])).erro, /[Aa]nexa/);
  assert.ok((await salvarPerfil(ID, { bOrig: 'ftp' }, [])).erro);
  assert.ok((await salvarPerfil(ID, { aOrig: 'galeria' }, [])).erro); // foto não tem galeria
});

test('o site não aponta o perfil pra um anexo qualquer', async () => {
  zerarPerfis();
  const r = await salvarPerfil(ID, { bio: 'oi', bAnexo: 'anexo:0123456789abcdef', aAnexo: 'anexo:0123456789abcdef', bArqNome: 'x', bLinkGif: true }, []);
  assert.equal(r.perfil.bAnexo, '');
  assert.equal(r.perfil.aAnexo, '');
  assert.equal(r.perfil.bArqNome, '');
  assert.equal(r.perfil.bLinkGif, false);
});

test('definirAnexo grava o arquivo enviado e já troca a origem', async () => {
  zerarPerfis();
  const r = await definirAnexo(ID, 'banner', 'anexo:0123456789abcdef', 'meu banner.gif');
  assert.equal(r.perfil.bOrig, 'anexo');
  assert.equal(r.perfil.bAnexo, 'anexo:0123456789abcdef');
  assert.equal(r.perfil.bArqNome, 'meu banner.gif');
  assert.equal(r.perfil.aOrig, 'discord');
  const f = await definirAnexo(ID, 'foto', 'anexo:fedcba9876543210', 'x'.repeat(200));
  assert.equal(f.perfil.aOrig, 'anexo');
  assert.equal(f.perfil.aAnexo, 'anexo:fedcba9876543210');
  assert.equal(f.perfil.aArqNome.length, 80);
  assert.equal(f.perfil.bAnexo, 'anexo:0123456789abcdef');
  // Depois de enviado, dá pra voltar pro anexo sem mandar de novo
  await salvarPerfil(ID, { bOrig: 'discord' }, []);
  assert.equal((await salvarPerfil(ID, { bOrig: 'anexo' }, [])).perfil.bOrig, 'anexo');
});

test('salvar a bio não mexe na origem das imagens', async () => {
  zerarPerfis();
  await salvarPerfil(ID, { bOrig: 'link', bLink: LINK, aOrig: 'link', aLink: LINK }, [], linkBom);
  const r = await salvarPerfil(ID, { bio: 'nova' }, []);
  assert.equal(r.perfil.bOrig, 'link');
  assert.equal(r.perfil.aOrig, 'link');
  assert.equal(r.perfil.bLink, LINK);
});

const FOTO_DISCORD = 'https://cdn.discordapp.com/avatars/1/abc.png?size=256';
const semExt = () => null;

test('visual de quem nunca mexeu: banner da galeria e foto do Discord', () => {
  zerarPerfis();
  lerPerfis()[ID] = { banner: 'banners/perfil/jogos-2.jpg' };
  assert.deepEqual(visualDoPerfil(perfilDe(ID), { id: ID, avatar: FOTO_DISCORD }, semExt), { banner: 'banners/perfil/jogos-2.jpg', cor: null, avatar: FOTO_DISCORD, gif: false });
});

test('visual com banner do Discord: quem tem banner usa, quem não tem fica com a cor', () => {
  const p = { bOrig: 'discord', aOrig: 'discord', banner: 'banners/perfil/jogos-2.jpg' };
  const comBanner = visualDoPerfil(p, { id: ID, avatar: FOTO_DISCORD, discord: { url: 'https://cdn.discordapp.com/banners/1/x.webp', cor: '#112233' } }, semExt);
  assert.equal(comBanner.banner, 'https://cdn.discordapp.com/banners/1/x.webp');
  assert.equal(comBanner.cor, null);
  const semNitro = visualDoPerfil(p, { id: ID, avatar: FOTO_DISCORD, discord: { url: null, cor: '#112233' } }, semExt);
  assert.equal(semNitro.banner, null);
  assert.equal(semNitro.cor, '#112233');
  const semNada = visualDoPerfil(p, { id: ID, avatar: FOTO_DISCORD, discord: { url: null, cor: null } }, semExt);
  assert.equal(semNada.banner, null);
  assert.equal(semNada.cor, null);
});

test('visual com link: o site nunca recebe o endereço de fora', () => {
  const p = { bOrig: 'link', bLink: LINK, bLinkGif: true, aOrig: 'link', aLink: 'https://i.imgur.com/foto.png', aLinkGif: false };
  const v = visualDoPerfil(p, { id: ID, avatar: FOTO_DISCORD }, semExt);
  assert.match(v.banner, new RegExp(`^/perfis/${ID}/banner\\?v=[0-9a-f]{8}$`));
  assert.match(v.avatar, new RegExp(`^/perfis/${ID}/foto\\?v=[0-9a-f]{8}$`));
  assert.ok(!JSON.stringify(v).includes('imgur'));
  assert.equal(v.gif, true);
  // Trocou o link, muda o endereço (o navegador guarda a imagem por 1 hora)
  const outro = visualDoPerfil({ ...p, bLink: 'https://i.imgur.com/outro.gif' }, { id: ID, avatar: FOTO_DISCORD }, semExt);
  assert.notEqual(outro.banner, v.banner);
});

test('visual com anexo: manda a referência, e o tipo do arquivo diz se é GIF', () => {
  const ext = (ref) => ({ 'anexo:0123456789abcdef': 'gif', 'anexo:fedcba9876543210': 'png' })[ref];
  const p = { bOrig: 'anexo', bAnexo: 'anexo:fedcba9876543210', aOrig: 'anexo', aAnexo: 'anexo:0123456789abcdef' };
  assert.deepEqual(visualDoPerfil(p, { id: ID, avatar: FOTO_DISCORD }, ext), { banner: 'anexo:fedcba9876543210', cor: null, avatar: 'anexo:0123456789abcdef', gif: true });
  assert.equal(visualDoPerfil({ ...p, aAnexo: 'anexo:fedcba9876543210' }, { id: ID, avatar: FOTO_DISCORD }, ext).gif, false);
});

test('foto ou banner animado do Discord sai em GIF', () => {
  const p = { bOrig: 'discord', aOrig: 'discord' };
  const parado = { id: ID, avatar: FOTO_DISCORD, discord: { url: null, cor: null } };
  assert.equal(visualDoPerfil(p, parado, semExt).gif, false);
  assert.equal(visualDoPerfil(p, { ...parado, avatar: 'https://cdn.discordapp.com/avatars/1/a_abc.gif?size=256' }, semExt).gif, true);
  assert.equal(visualDoPerfil(p, { ...parado, discord: { url: 'https://cdn.discordapp.com/banners/1/a_x.gif?size=1024', cor: null } }, semExt).gif, true);
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

test('aparência: padrão creme com nome em Graduate e aniversário só com dia e mês', () => {
  zerarPerfis();
  const p = perfilDe(ID);
  assert.deepEqual(p.ap, { fundo: '#FFFCF4', nome: '', nomeTipo: 'solida', grad: 0, fonte: 'Graduate', destaque: '#C4363C' });
  assert.equal(p.niverVis, 'data');
  // Perfil de antes da v12 (sem ap) ganha a aparência padrão
  lerPerfis()[ID] = { banner: 'banners/perfil/jogos-2.jpg', bio: 'oi', fixadas: [] };
  assert.equal(perfilDe(ID).ap.fonte, 'Graduate');
});

test('aparência: muda só o que veio, confere cores, fonte, degradê e visibilidade', async () => {
  zerarPerfis();
  const ok = await salvarPerfil(ID, { ap: { fundo: '#1f2a5c', fonte: 'Pacifico' }, niverVis: 'idade' }, []);
  assert.deepEqual(ok.perfil.ap, { fundo: '#1F2A5C', nome: '', nomeTipo: 'solida', grad: 0, fonte: 'Pacifico', destaque: '#C4363C' });
  assert.equal(ok.perfil.niverVis, 'idade');
  const deg = await salvarPerfil(ID, { ap: { nomeTipo: 'degrade', grad: 3 } }, []);
  assert.equal(deg.perfil.ap.fundo, '#1F2A5C');
  assert.equal(deg.perfil.ap.grad, 3);
  for (const ruim of [{ fundo: 'azul' }, { nome: '#12345' }, { destaque: '' }, { fonte: 'Comic Sans' }, { grad: 6 }, { grad: 1.5 }, { nomeTipo: 'arco-iris' }]) {
    assert.ok((await salvarPerfil(ID, { ap: ruim }, [])).erro, JSON.stringify(ruim));
  }
  assert.ok((await salvarPerfil(ID, { ap: 'x' }, [])).erro);
  assert.match((await salvarPerfil(ID, { niverVis: 'todo mundo' }, [])).erro, /aniversário/);
  // Nome sólido com cor própria; '' volta pro automático
  assert.equal((await salvarPerfil(ID, { ap: { nomeTipo: 'solida', nome: '#ff6ec7' } }, [])).perfil.ap.nome, '#FF6EC7');
  assert.equal((await salvarPerfil(ID, { ap: { nome: '' } }, [])).perfil.ap.nome, '');
});

test('cor do texto: claro em fundo escuro, tinta em fundo claro', () => {
  assert.deepEqual(textoSobre('#1F2A5C'), { escuro: true, txt: '#FFFCF4', sub: '#C9CBE0' });
  assert.deepEqual(textoSobre('#1B1F33'), { escuro: true, txt: '#FFFCF4', sub: '#C9CBE0' });
  assert.deepEqual(textoSobre('#FFFCF4'), { escuro: false, txt: '#1B1F33', sub: '#5A5E6E' });
  assert.deepEqual(textoSobre('#F5C6D6'), { escuro: false, txt: '#1B1F33', sub: '#5A5E6E' });
  assert.equal(textoSobre('lixo').escuro, false);
});

test('aniversário no perfil: escondido, só dia e mês ou com a idade', () => {
  const hoje = { dia: 8, mes: 11, ano: 2026 };
  assert.equal(textoDoAniversario({ d: '14/05', ano: 2004 }, 'idade', hoje), '14/05 · 22 anos');
  assert.equal(textoDoAniversario({ d: '14/12', ano: 2004 }, 'idade', hoje), '14/12 · 21 anos');
  assert.equal(textoDoAniversario({ d: '08/11', ano: 2005 }, 'idade', hoje), '08/11 · 21 anos');
  assert.equal(textoDoAniversario({ d: '14/05', ano: 2004 }, 'data', hoje), '14/05');
  assert.equal(textoDoAniversario({ d: '14/05', ano: null }, 'idade', hoje), '14/05');
  assert.equal(textoDoAniversario({ d: '14/05', ano: 2004 }, 'oculto', hoje), null);
  assert.equal(textoDoAniversario(null, 'idade', hoje), null);
});

test('destaque que some no fundo vira a cor do texto', async () => {
  const { corDeDestaque } = await import('../lib/aparencia.js');
  assert.equal(corDeDestaque({ fundo: '#FFFCF4', destaque: '#C4363C' }), '#C4363C');
  assert.equal(corDeDestaque({ fundo: '#1F2A5C', destaque: '#1F2A5C' }), '#FFFCF4');
  assert.equal(corDeDestaque({ fundo: '#1B1F33', destaque: '#1F2A5C' }), '#FFFCF4');
  assert.equal(corDeDestaque({ fundo: '#F3D48A', destaque: '#F2C14E' }), '#1B1F33');
  assert.equal(corDeDestaque({ fundo: '#1F2A5C', destaque: '#F2C14E' }), '#F2C14E');
});

test('vermelho no azul-marinho tem pouco contraste: o rótulo vira a cor do texto', async () => {
  const { corDeDestaque } = await import('../lib/aparencia.js');
  assert.equal(corDeDestaque({ fundo: '#1F2A5C', destaque: '#C4363C' }), '#FFFCF4');
});

test('favoritos: adiciona com a capa achada, sem repetir, até 5 por lista; tirar e esconder', async () => {
  const { mudarFavorito, favoritosPublicos } = await import('../lib/perfil.js');
  zerarPerfis();
  const procurou = [];
  const achar = async (tipo, nome) => (procurou.push(`${tipo}:${nome}`), nome === 'Valorant' ? '' : `https://upload.wikimedia.org/${nome}.png`);
  const r = await mudarFavorito(ID, { acao: 'add', tipo: 'jogos', t: '  Minecraft  ' }, achar);
  assert.deepEqual(r.perfil.fav.jogos, [{ t: 'Minecraft', capa: 'https://upload.wikimedia.org/Minecraft.png' }]);
  assert.deepEqual(procurou, ['jogos:Minecraft']);
  assert.match((await mudarFavorito(ID, { acao: 'add', tipo: 'jogos', t: 'minecraft' }, achar)).erro, /já está/);
  assert.equal((await mudarFavorito(ID, { acao: 'add', tipo: 'jogos', t: 'Valorant' }, achar)).perfil.fav.jogos[1].capa, '');
  for (const t of ['A', 'B', 'C']) await mudarFavorito(ID, { acao: 'add', tipo: 'jogos', t }, achar);
  assert.match((await mudarFavorito(ID, { acao: 'add', tipo: 'jogos', t: 'D' }, achar)).erro, /Máximo de 5/);
  assert.match((await mudarFavorito(ID, { acao: 'add', tipo: 'filmes', t: 'x'.repeat(61) }, achar)).erro, /60/);
  assert.match((await mudarFavorito(ID, { acao: 'add', tipo: 'filmes', t: '   ' }, achar)).erro, /nome/);
  assert.match((await mudarFavorito(ID, { acao: 'add', tipo: 'series', t: 'X' }, achar)).erro, /não existe/);
  assert.match((await mudarFavorito(ID, { acao: 'trocar', tipo: 'jogos' }, achar)).erro, /inválida/);
  const tirou = await mudarFavorito(ID, { acao: 'tirar', tipo: 'jogos', t: 'Valorant' }, achar);
  assert.deepEqual(tirou.perfil.fav.jogos.map((x) => x.t), ['Minecraft', 'A', 'B', 'C']);
  await mudarFavorito(ID, { acao: 'add', tipo: 'musicas', t: 'Evidências' }, achar);
  assert.deepEqual(favoritosPublicos(perfilDe(ID)).map((f) => f.tipo), ['jogos', 'musicas']);
  await mudarFavorito(ID, { acao: 'mostrar', tipo: 'jogos', on: false }, achar);
  assert.deepEqual(favoritosPublicos(perfilDe(ID)).map((f) => f.tipo), ['musicas']);
  assert.equal(perfilDe(ID).fav.jogos.length, 4); // escondido não é apagado
});

test('favoritos: perfil antigo começa com as 4 listas vazias e aparecendo', () => {
  zerarPerfis();
  lerPerfis()[ID] = { banner: 'banners/perfil/jogos-2.jpg', bio: '', fixadas: [] };
  assert.deepEqual(perfilDe(ID).fav, { jogos: [], filmes: [], livros: [], musicas: [], mostrar: { jogos: true, filmes: true, livros: true, musicas: true } });
});
