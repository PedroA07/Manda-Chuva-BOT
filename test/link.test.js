import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baixarLink, ipPrivado, lerLink, linkPublico, procurarPublico } from '../lib/link.js';

const PNG = (() => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(100, 16);
  b.writeUInt32BE(50, 20);
  return b;
})();
const LINK = 'https://i.imgur.com/banner.png';

/** Servidor de mentira: { url: resposta }. Anota o que foi aberto. */
function site(respostas) {
  const abertos = [];
  const abrir = async (url) => {
    abertos.push(String(url));
    const r = respostas[String(url)];
    if (!r) throw new Error('rede caiu');
    return { status: r.status ?? 200, headers: r.headers ?? {}, corpo: r.corpo ?? [PNG], fechar: r.fechar };
  };
  return { abrir, abertos };
}

test('rede interna, nuvem e endereços especiais contam como privados', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
    assert.equal(ipPrivado(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '151.101.1.140', '172.15.0.1', '172.32.0.1', '2606:4700::6810:84e5']) assert.equal(ipPrivado(ip), false, ip);
  assert.equal(ipPrivado('nem-e-ip'), true);
});

test('só aceita https de endereço público pelo nome', () => {
  assert.equal(linkPublico('https://i.imgur.com/a.gif')?.hostname, 'i.imgur.com');
  assert.equal(linkPublico('  https://site.com:443/a.png  ')?.hostname, 'site.com');
  const recusados = [
    '', 'nada', 'http://i.imgur.com/a.gif', 'ftp://site.com/a.gif', 'javascript:alert(1)', 'data:image/png;base64,AAAA',
    'https://usuario:senha@site.com/a.png', 'https://site.com:8443/a.png', 'https://site.com/com espaco.png',
    'https://localhost/a.png', 'https://localhost./a.png', 'https://intranet/a.png', 'https://servidor.local/a.png', 'https://db.internal/a.png',
    'https://127.0.0.1/a.png', 'https://2130706433/a.png', 'https://0x7f.1/a.png', 'https://[::1]/a.png', 'https://169.254.169.254/latest/meta-data', 'https://8.8.8.8/a.png',
    `https://site.com/${'a'.repeat(500)}.png`, null, undefined,
  ];
  for (const r of recusados) assert.equal(linkPublico(r), null, String(r).slice(0, 40));
});

test('nome que aponta pra rede interna é barrado na hora de conectar', async () => {
  const dnsFalso = (ips) => (_host, op, cb) => (op.all ? cb(null, ips.map((address) => ({ address, family: 4 }))) : cb(null, ips[0], 4));
  const perguntar = (procurar, op = {}) => new Promise((ok) => procurar('golpe.com', op, (erro, ...resto) => ok({ erro, resto })));
  assert.match((await perguntar(procurarPublico(dnsFalso(['10.0.0.5'])))).erro.message, /interna/);
  assert.match((await perguntar(procurarPublico(dnsFalso(['8.8.8.8', '127.0.0.1'])), { all: true })).erro.message, /interna/);
  assert.equal((await perguntar(procurarPublico(dnsFalso(['8.8.8.8'])))).erro, null);
  assert.deepEqual((await perguntar(procurarPublico(dnsFalso(['8.8.8.8'])), { all: true })).resto[0], [{ address: '8.8.8.8', family: 4 }]);
});

test('baixa a imagem e o tipo vem do conteúdo, não do que o site diz', async () => {
  const { abrir } = site({ [LINK]: { headers: { 'content-type': 'text/html' } } });
  const r = await baixarLink(LINK, { abrir });
  assert.equal(r.tipo, 'image/png');
  assert.equal(r.ext, 'png');
  assert.deepEqual(r.buffer, PNG);
});

test('redirecionamento público é seguido, até 3 saltos', async () => {
  const salto = (de, para) => ({ [de]: { status: 302, headers: { location: para } } });
  const a = 'https://a.com/1', b = 'https://b.com/2', c = 'https://c.com/3', d = 'https://d.com/4', e = 'https://e.com/5';
  const tres = site({ ...salto(a, b), ...salto(b, c), ...salto(c, d), [d]: {} });
  assert.deepEqual((await baixarLink(a, { abrir: tres.abrir })).buffer, PNG);
  const quatro = site({ ...salto(a, b), ...salto(b, c), ...salto(c, d), ...salto(d, e), [e]: {} });
  assert.equal(await baixarLink(a, { abrir: quatro.abrir }), null);
  assert.ok(!quatro.abertos.includes(e));
});

test('redirecionamento pra rede interna é barrado antes de abrir', async () => {
  for (const destino of ['https://169.254.169.254/latest/meta-data', 'http://site.com/a.png', 'https://localhost/a.png']) {
    const { abrir, abertos } = site({ [LINK]: { status: 301, headers: { location: destino } }, [destino]: {} });
    assert.equal(await baixarLink(LINK, { abrir }), null, destino);
    assert.deepEqual(abertos, [LINK]);
  }
});

test('redirecionamento relativo continua no mesmo site', async () => {
  const { abrir, abertos } = site({ [LINK]: { status: 302, headers: { location: '/outro.png' } }, 'https://i.imgur.com/outro.png': {} });
  assert.deepEqual((await baixarLink(LINK, { abrir })).buffer, PNG);
  assert.equal(abertos.length, 2);
});

test('arquivo maior que o limite para no meio da leitura', async () => {
  let lidos = 0, fechou = false;
  async function* corpo() {
    for (let i = 0; i < 100; i++) {
      lidos++;
      yield i ? Buffer.alloc(10) : PNG;
    }
  }
  const { abrir } = site({ [LINK]: { corpo: corpo(), fechar: () => (fechou = true) } });
  assert.equal(await baixarLink(LINK, { abrir, max: 60 }), null);
  assert.ok(lidos < 10, `leu ${lidos} pedaços`);
  assert.ok(fechou);
});

test('content-length acima do limite nem começa a ler', async () => {
  let leu = false;
  const corpo = { async *[Symbol.asyncIterator]() { leu = true; yield PNG; } };
  const { abrir } = site({ [LINK]: { headers: { 'content-length': '9000' }, corpo } });
  assert.equal(await baixarLink(LINK, { abrir, max: 100 }), null);
  assert.equal(leu, false);
});

test('página de erro, html e imagem gigante não passam', async () => {
  assert.equal(await baixarLink(LINK, { abrir: site({ [LINK]: { status: 404 } }).abrir }), null);
  assert.equal(await baixarLink(LINK, { abrir: site({ [LINK]: { corpo: [Buffer.from('<html>oi</html>')] } }).abrir }), null);
  const bomba = Buffer.from(PNG);
  bomba.writeUInt32BE(30000, 16);
  bomba.writeUInt32BE(30000, 20);
  assert.equal(await baixarLink(LINK, { abrir: site({ [LINK]: { corpo: [bomba] } }).abrir }), null);
});

test('rede caiu: devolve null em vez de estourar', async () => {
  assert.equal(await baixarLink(LINK, { abrir: site({}).abrir }), null);
});

test('link privado nem é aberto', async () => {
  const { abrir, abertos } = site({});
  assert.equal(await baixarLink('https://127.0.0.1/a.png', { abrir }), null);
  assert.deepEqual(abertos, []);
});

test('lerLink guarda o resultado (até a falha) por um tempo', async () => {
  const bom = 'https://bom.com/a.png', ruim = 'https://ruim.com/a.png';
  const { abrir, abertos } = site({ [bom]: {} });
  assert.deepEqual((await lerLink(bom, { abrir, agora: 0 })).buffer, PNG);
  assert.deepEqual((await lerLink(bom, { abrir, agora: 1000 })).buffer, PNG);
  assert.equal(abertos.filter((x) => x === bom).length, 1);
  await lerLink(bom, { abrir, agora: 2 * 3_600_000 });
  assert.equal(abertos.filter((x) => x === bom).length, 2);
  // Link quebrado não fica batendo no site a cada visita
  assert.equal(await lerLink(ruim, { abrir, agora: 0 }), null);
  assert.equal(await lerLink(ruim, { abrir, agora: 1000 }), null);
  assert.equal(abertos.filter((x) => x === ruim).length, 1);
  await lerLink(ruim, { abrir, agora: 10 * 60_000 });
  assert.equal(abertos.filter((x) => x === ruim).length, 2);
});
