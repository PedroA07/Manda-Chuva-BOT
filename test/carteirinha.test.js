import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import omggif from 'omggif';
import { desenharCarteirinha, desenharFicha, nomeDoArquivo, tempoDeCasa, textoDesenhavel } from '../lib/carteirinha.js';
import { AZUL, fazerGif, VERDE, VERMELHO } from './ajuda-gif.js';

const { GifReader } = omggif;
const DIA = 864e5;

function pngLiso(cor, l = 200, a = 100) {
  const c = createCanvas(l, a);
  const ctx = c.getContext('2d');
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, l, a);
  return c.toBuffer('image/png');
}
const hex = ([r, g, b]) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
async function corEm(png, x, y) {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return hex(ctx.getImageData(x, y, 1, 1).data);
}
const tamanhoPng = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];

/** Lê o GIF final como quem assiste: compõe os quadros até o índice pedido */
function telaDoGif(buffer, ate) {
  const r = new GifReader(new Uint8Array(buffer));
  const px = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i <= ate; i++) r.decodeAndBlitFrameRGBA(i, px);
  return { r, cor: (x, y) => hex(px.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 3)) };
}
/** O GIF tem poucas cores, mas a paleta final pode arredondar um pouco */
function perto(a, b, folga = 24) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return x.every((v, i) => Math.abs(v - y[i]) <= folga);
}

const BASE = {
  banner: null, cor: '#123456', avatar: null, nome: 'pedrinho', usuario: 'pedrinho', entrou: 'entrou há 3 dias', medalhas: [],
  cargos: [{ nome: 'Azul', cor: '#3366ff' }, { nome: '⚜️ Monarca', cor: '#99AAB5' }],
  stats: [['1.284', 'mensagens'], ['32 h', 'em call'], ['5', 'medalhas']],
  rodape: 'SERVIDOR DOS CRIA · CARTEIRINHA',
};
const CENTRO_BANNER = [500, 100];
const CENTRO_FOTO = [103, 307];
const FOTO_ABAIXO = 103; // x da foto em y=350, já na parte creme
const BANNER_GIF = () => fazerGif(100, 30, [{ cor: VERMELHO, delay: 20 }, { cor: VERDE, delay: 20 }, { cor: AZUL, delay: 20 }]);
const FOTO_GIF = () => fazerGif(40, 40, [{ cor: VERMELHO, delay: 20 }, { cor: AZUL, delay: 20 }]);

test('tempo de casa em português, do jeito que a pessoa fala', () => {
  const agora = Date.UTC(2026, 10, 7);
  const tabela = [
    [agora - 3_600_000, 'entrou hoje'],
    [agora - DIA, 'entrou há 1 dia'],
    [agora - 29 * DIA, 'entrou há 29 dias'],
    [agora - 30 * DIA, 'entrou há 1 mês'],
    [agora - 31 * DIA, 'entrou há 1 mês'],
    [agora - 90 * DIA, 'entrou há 2 meses'],
    [agora - 364 * DIA, 'entrou há 11 meses'],
    [agora - 370 * DIA, 'entrou há 1 ano'],
    [agora - 800 * DIA, 'entrou há 2 anos'],
  ];
  for (const [quando, texto] of tabela) assert.equal(tempoDeCasa(quando, agora), texto);
  assert.equal(tempoDeCasa(null, agora), '');
});

test('nome do arquivo sem acento nem espaço', () => {
  assert.equal(nomeDoArquivo('Pedrão da Silva', 'png'), 'perfil-pedrao-da-silva.png');
  assert.equal(nomeDoArquivo('--rafa_cringe!!', 'gif'), 'perfil-rafa-cringe.gif');
  assert.equal(nomeDoArquivo('⚜️🔥', 'png'), 'perfil-membro.png');
});

test('texto sem o que as fontes do bot não têm: emoji sai, letra enfeitada vira letra', () => {
  assert.equal(textoDesenhavel('⚜️ Monarca'), 'Monarca');
  assert.equal(textoDesenhavel('João 🎮  Silva'), 'João Silva');
  assert.equal(textoDesenhavel('𝓟𝓮𝓭𝓻𝓸'), 'Pedro');
  assert.equal(textoDesenhavel('🇧🇷 BR 1️⃣'), 'BR 1');
  assert.equal(textoDesenhavel('🔥🔥'), '');
  assert.equal(textoDesenhavel(null), '');
});

test('sem GIF sai um PNG 1000×560', async () => {
  const { buffer, ext } = await desenharCarteirinha({ ...BASE, banner: pngLiso('#aa0000'), avatar: pngLiso('#00aa00') });
  assert.equal(ext, 'png');
  assert.deepEqual(tamanhoPng(buffer), [1000, 560]);
});

test('banner cobre o topo, a foto fica no círculo e o corpo é creme', async () => {
  const { buffer } = await desenharCarteirinha({ ...BASE, banner: pngLiso('#aa0000'), avatar: pngLiso('#00aa00') });
  assert.equal(await corEm(buffer, ...CENTRO_BANNER), '#aa0000');
  assert.equal(await corEm(buffer, ...CENTRO_FOTO), '#00aa00');
  assert.equal(await corEm(buffer, 990, 553), '#fffcf4');
});

test('sem banner entra a cor de destaque', async () => {
  const { buffer } = await desenharCarteirinha(BASE);
  assert.equal(await corEm(buffer, ...CENTRO_BANNER), '#123456');
});

test('sem foto entra a inicial num fundo azul', async () => {
  const { buffer } = await desenharCarteirinha(BASE);
  assert.equal(await corEm(buffer, CENTRO_FOTO[0] - 50, CENTRO_FOTO[1]), '#5865f2');
});

test('até 3 medalhas, encostadas na direita', async () => {
  const medalha = pngLiso('#ff00ff', 64, 64);
  const { buffer } = await desenharCarteirinha({ ...BASE, medalhas: [medalha, medalha, medalha, medalha] });
  // Da direita pra esquerda: 3 quadrados de 64 com 6 de vão, a 32 da borda
  for (const x of [936, 866, 796]) assert.equal(await corEm(buffer, x, 344), '#ff00ff', `medalha em x=${x}`);
  assert.equal(await corEm(buffer, 726, 344), '#fffcf4');
});

test('medalhas na ordem em que a pessoa fixou', async () => {
  const cores = ['#ff0000', '#00ff00', '#0000ff'];
  const { buffer } = await desenharCarteirinha({ ...BASE, medalhas: cores.map((c) => pngLiso(c, 64, 64)) });
  assert.deepEqual([await corEm(buffer, 796, 344), await corEm(buffer, 866, 344), await corEm(buffer, 936, 344)], cores);
});

test('imagem de verdade, mas grande demais pra abrir, fica de fora', async () => {
  const gigante = pngLiso('#aa0000', 4100, 4100);
  const { buffer } = await desenharCarteirinha({ ...BASE, banner: gigante });
  assert.equal(await corEm(buffer, ...CENTRO_BANNER), '#123456');
});

test('imagem quebrada ou que seria uma bomba não derruba: entra o plano B', async () => {
  const bomba = pngLiso('#000000');
  bomba.writeUInt32BE(30000, 16);
  bomba.writeUInt32BE(30000, 20);
  for (const ruim of [Buffer.from('nada'), bomba]) {
    const { buffer, ext } = await desenharCarteirinha({ ...BASE, banner: ruim, avatar: ruim, medalhas: [ruim] });
    assert.equal(ext, 'png');
    assert.equal(await corEm(buffer, ...CENTRO_BANNER), '#123456');
  }
});

test('nome gigante e cargos demais não estouram', async () => {
  const cargos = Array.from({ length: 12 }, (_, i) => ({ nome: `Cargo com nome bem comprido ${i}`, cor: '#ff0000' }));
  const { buffer } = await desenharCarteirinha({ ...BASE, nome: 'x'.repeat(120), cargos });
  assert.deepEqual(tamanhoPng(buffer), [1000, 560]);
  // Rodapé continua no lugar: a última linha da imagem é o creme
  assert.equal(await corEm(buffer, 500, 559), '#fffcf4');
});

test('banner GIF: sai um GIF 1000×560 que troca de cor no topo e mantém o resto', async () => {
  const { buffer, ext } = await desenharCarteirinha({ ...BASE, banner: BANNER_GIF(), avatar: pngLiso('#00aa00') });
  assert.equal(ext, 'gif');
  const primeiro = telaDoGif(buffer, 0);
  assert.equal(primeiro.r.width, 1000);
  assert.equal(primeiro.r.height, 560);
  assert.equal(primeiro.r.numFrames(), 3);
  assert.equal(primeiro.r.loopCount(), 0);
  assert.ok(perto(primeiro.cor(...CENTRO_BANNER), '#ff0000'), primeiro.cor(...CENTRO_BANNER));
  const ultimo = telaDoGif(buffer, 2);
  assert.ok(perto(ultimo.cor(...CENTRO_BANNER), '#0000ff'), ultimo.cor(...CENTRO_BANNER));
  // A foto parada e o corpo continuam lá no último quadro
  assert.ok(perto(ultimo.cor(...CENTRO_FOTO), '#00aa00'), ultimo.cor(...CENTRO_FOTO));
  assert.ok(perto(ultimo.cor(990, 553), '#fffcf4'), ultimo.cor(990, 553));
});

test('banner GIF: a imagem não vaza pra baixo da linha do banner', async () => {
  // GIF alto: sem o recorte, passaria dos 300 px e ficaria de sobra no primeiro quadro
  const alto = fazerGif(100, 100, [{ cor: VERMELHO, delay: 20 }, { cor: VERDE, delay: 20 }]);
  const { buffer } = await desenharCarteirinha({ ...BASE, banner: alto });
  const fim = telaDoGif(buffer, 1);
  assert.ok(perto(fim.cor(500, 340), '#fffcf4'), fim.cor(500, 340));
});

test('foto GIF: só o círculo se repete, os outros quadros são pequenos', async () => {
  const { buffer, ext } = await desenharCarteirinha({ ...BASE, banner: pngLiso('#aa0000'), avatar: FOTO_GIF() });
  assert.equal(ext, 'gif');
  const inicio = telaDoGif(buffer, 0);
  assert.ok(perto(inicio.cor(...CENTRO_FOTO), '#ff0000'), inicio.cor(...CENTRO_FOTO));
  const fim = telaDoGif(buffer, 1);
  assert.ok(perto(fim.cor(...CENTRO_FOTO), '#0000ff'), fim.cor(...CENTRO_FOTO));
  assert.ok(perto(fim.cor(...CENTRO_BANNER), '#aa0000'), fim.cor(...CENTRO_BANNER));
  const q = fim.r.frameInfo(1);
  assert.ok(q.width <= 170 && q.height <= 170, `${q.width}x${q.height}`);
});

test('banner e foto GIF ao mesmo tempo, com tempos diferentes', async () => {
  const banner = fazerGif(100, 30, [{ cor: VERMELHO, delay: 30 }, { cor: VERDE, delay: 30 }]); // 600 ms
  const avatar = fazerGif(40, 40, [{ cor: AZUL, delay: 20 }, { cor: VERMELHO, delay: 20 }]); // 400 ms
  const { buffer, ext } = await desenharCarteirinha({ ...BASE, banner, avatar });
  assert.equal(ext, 'gif');
  const { r } = telaDoGif(buffer, 0);
  // Foto muda em 0, 200 e 400; banner em 0 e 300. Termina em 600, o tempo do banner.
  assert.equal(r.numFrames(), 4);
  const tempos = Array.from({ length: 4 }, (_, i) => r.frameInfo(i).delay);
  assert.deepEqual(tempos, [20, 10, 10, 20]);
  // A parte da foto que fica abaixo da linha do banner também acompanha
  const abaixoDaLinha = [FOTO_ABAIXO, 350];
  assert.ok(perto(telaDoGif(buffer, 1).cor(...abaixoDaLinha), '#ff0000'), telaDoGif(buffer, 1).cor(...abaixoDaLinha));
  assert.ok(perto(telaDoGif(buffer, 3).cor(...abaixoDaLinha), '#0000ff'), telaDoGif(buffer, 3).cor(...abaixoDaLinha));
  assert.ok(perto(telaDoGif(buffer, 3).cor(...CENTRO_BANNER), '#00ff00'), telaDoGif(buffer, 3).cor(...CENTRO_BANNER));
});

test('quadro que volta a uma cor antiga aparece de verdade', async () => {
  const vaiEVolta = fazerGif(100, 30, [{ cor: VERMELHO, delay: 20 }, { cor: VERDE, delay: 20 }, { cor: VERMELHO, delay: 20 }]);
  const { buffer } = await desenharCarteirinha({ ...BASE, banner: vaiEVolta });
  const fim = telaDoGif(buffer, 2);
  assert.ok(perto(fim.cor(...CENTRO_BANNER), '#ff0000'), fim.cor(...CENTRO_BANNER));
});

test('quadros iguais não quebram o GIF', async () => {
  const parado = fazerGif(40, 40, [{ cor: VERDE, delay: 20 }, { cor: VERDE, delay: 20 }]);
  const { buffer, ext } = await desenharCarteirinha({ ...BASE, avatar: parado });
  assert.equal(ext, 'gif');
  assert.equal(telaDoGif(buffer, 1).r.numFrames(), 2);
});

test('GIF de um quadro só vira PNG', async () => {
  const { ext } = await desenharCarteirinha({ ...BASE, banner: fazerGif(100, 30, [{ cor: VERDE, delay: 10 }]) });
  assert.equal(ext, 'png');
});

test('passou do limite do Discord: tenta menor', async () => {
  const d = { ...BASE, banner: BANNER_GIF() };
  const cheio = await desenharCarteirinha(d);
  const menor = await desenharCarteirinha(d, { limite: cheio.buffer.length - 1 });
  assert.equal(menor.ext, 'gif');
  assert.equal(telaDoGif(menor.buffer, 0).r.width, 700);
  assert.equal(telaDoGif(menor.buffer, 0).r.height, 392);
});

test('nem menor cabe: manda PNG com o primeiro quadro', async () => {
  const { buffer, ext } = await desenharCarteirinha({ ...BASE, banner: BANNER_GIF() }, { limite: 1000 });
  assert.equal(ext, 'png');
  assert.equal(await corEm(buffer, ...CENTRO_BANNER), '#ff0000');
});

test('demorou demais: desiste do GIF e manda PNG', async () => {
  const { ext } = await desenharCarteirinha({ ...BASE, banner: BANNER_GIF() }, { tempo: 1 });
  assert.equal(ext, 'png');
});

test('o GIF nem começou: manda PNG e a fila continua andando', async () => {
  // Função não atravessa pra outra linha de execução: é o jeito de fazer a criação do trabalhador falhar de verdade
  const { ext } = await desenharCarteirinha({ ...BASE, banner: BANNER_GIF(), usuario: () => {} });
  assert.equal(ext, 'png');
  assert.equal((await desenharCarteirinha({ ...BASE, banner: BANNER_GIF() })).ext, 'gif');
});

test('muita gente ao mesmo tempo: GIF um por vez, quem sobra recebe PNG', async () => {
  const d = { ...BASE, banner: BANNER_GIF() };
  const r = await Promise.all(Array.from({ length: 5 }, () => desenharCarteirinha(d)));
  assert.deepEqual(r.map((x) => x.ext), ['gif', 'gif', 'gif', 'png', 'png']);
  // A fila anda: depois de esvaziar, volta a sair GIF
  assert.equal((await desenharCarteirinha(d)).ext, 'gif');
});

// ---------- Ficha (/perfil completo, /trofeus, /aniversario ver) ----------
const FICHA = {
  banner: pngLiso('#3498db', 400, 120), avatar: pngLiso('#2ecc71', 100, 100), nome: 'Pedrinho', usuario: 'pedrinho', entrou: 'entrou há 3 meses',
  medalhas: [], cargos: [{ nome: 'Azul', cor: '#3498DB' }], stats: [['1', 'mensagens'], ['0 h', 'em call'], ['2', 'medalhas']], rodape: 'SERVIDOR DOS CRIA · CARTEIRINHA',
};

test('ficha completa: carteirinha em cima, aniversário e troféus embaixo, no fundo escolhido', async () => {
  const png = await desenharFicha({ ...FICHA, ap: { fundo: '#1F2A5C' }, niver: '14/05 · 22 anos', trofeus: { imgs: [pngLiso('#f2c14e', 64, 64), pngLiso('#c4363c', 64, 64)], total: 16 } }, { tipo: 'completo' });
  const [l, a] = tamanhoPng(png);
  assert.equal(l, 1000);
  assert.ok(a > 560, `altura ${a}`);
  assert.equal(await corEm(png, 500, 100), '#3498db'); // banner
  assert.equal(await corEm(png, 990, a - 60), '#1f2a5c'); // fundo até o fim
});

test('ficha com título: sem banner, mais baixa, e cresce com mais troféus', async () => {
  const um = await desenharFicha({ ...FICHA, trofeus: { imgs: [pngLiso('#f2c14e', 64, 64)], total: 16 } }, { tipo: 'titulo', titulo: 'TROFÉUS' });
  const muitos = await desenharFicha({ ...FICHA, trofeus: { imgs: Array.from({ length: 16 }, () => pngLiso('#f2c14e', 64, 64)), total: 16 } }, { tipo: 'titulo', titulo: 'TROFÉUS' });
  const [l1, a1] = tamanhoPng(um), [, a2] = tamanhoPng(muitos);
  assert.equal(l1, 1000);
  assert.ok(a1 < 560 && a2 > a1, `${a1} → ${a2}`);
  assert.equal(await corEm(um, 990, 10), '#fffcf4'); // fundo padrão, sem banner
  const niver = await desenharFicha({ ...FICHA, niver: 'Escondido pelo dono do perfil.' }, { tipo: 'titulo', titulo: 'ANIVERSÁRIO' });
  assert.ok(tamanhoPng(niver)[1] < a1);
});
