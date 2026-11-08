import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizar, PADRAO } from '../dados.js';
import { noServidor } from '../lib/contexto.js';
import { montarV2, validarV2 } from '../lib/mensagem.js';
import {
  estaParado, haQuanto, mediaDeResposta, nomeDoCanal, numero, pedacoDaAvaliacao, pedacoDasBoasVindas, pedacoDoFechamento,
  pedacoDoPainelTickets, textoDaTranscricao, transcricao,
} from '../lib/tickets.js';

const T = () => structuredClone(PADRAO.tickets);
const TICKET = { num: 42, canalId: '1', userId: '200000000000000000', nome: 'pedrinho', motivo: 'Denúncia', emoji: '🚨', aberto: Date.UTC(2026, 10, 2, 17), resp: null };

test('número e nome do canal: 4 dígitos, sem acento e só letras, números e hífen', () => {
  assert.equal(numero(42), '0042');
  assert.equal(nomeDoCanal(42, 'Pedrinho'), 'ticket-0042-pedrinho');
  assert.equal(nomeDoCanal(7, 'João_da Silva!!'), 'ticket-0007-joao-da-silva');
  assert.equal(nomeDoCanal(1234, '✨✨'), 'ticket-1234');
  assert.ok(nomeDoCanal(1, 'x'.repeat(80)).length <= 'ticket-0001-'.length + 20);
});

test('config: padrão desligado com 5 motivos; motivo sem nome e motivos demais dão erro', () => {
  const { cfg } = normalizar({});
  assert.equal(cfg.tickets.on, false);
  assert.equal(cfg.tickets.motivos.length, 5);
  assert.equal(cfg.tickets.limite, 1);
  const ruim = normalizar({ tickets: { ...T(), motivos: [{ emoji: '❓', nome: '', desc: '' }] } });
  assert.match(ruim.erros.join(), /todo motivo precisa de um nome/);
  const muitos = normalizar({ tickets: { ...T(), motivos: Array.from({ length: 26 }, (_, i) => ({ emoji: '📌', nome: `M${i}`, desc: '' })) } });
  assert.match(muitos.erros.join(), /até 25 motivos/);
  const ligadoSemMotivo = normalizar({ tickets: { ...T(), on: true, motivos: [{ emoji: '📌', nome: 'X', desc: '', on: false }] } });
  assert.match(ligadoSemMotivo.erros.join(), /pelo menos um motivo/);
});

test('config: valores fora da lista voltam pro padrão; categoria "nova" e canais "novo" passam', () => {
  const { cfg, erros } = normalizar({ tickets: { ...T(), limite: 9, parado: '3h', apagar: 'nunca', categoriaId: 'nova', canalId: 'novo', logsId: 'novo', staffId: 'abc', motivos: [{ emoji: 'texto', nome: 'Oi', desc: 'd' }] } });
  assert.deepEqual(erros, []);
  assert.equal(cfg.tickets.limite, 1);
  assert.equal(cfg.tickets.parado, '24h');
  assert.equal(cfg.tickets.apagar, '10s');
  assert.equal(cfg.tickets.categoriaId, 'nova');
  assert.equal(cfg.tickets.canalId, 'novo');
  assert.equal(cfg.tickets.logsId, 'novo');
  assert.equal(cfg.tickets.staffId, null);
  assert.equal(cfg.tickets.motivos[0].emoji, '📌'); // emoji inválido vira o alfinete
});

test('painel: menu só com os motivos ligados, valor = posição na lista', () => {
  const t = T();
  t.motivos[1].on = false;
  const p = pedacoDoPainelTickets(t, (ref, padrao) => `https://img/${ref || padrao}`);
  const menu = p.linhas[0].components[0];
  assert.equal(menu.custom_id, 'tk:abrir');
  assert.deepEqual(menu.options.map((o) => o.value), ['0', '2', '3', '4']);
  assert.equal(menu.options[0].emoji.name, '❓');
  assert.equal(p.imagem, 'https://img/banners/eventos/news.jpg');
  assert.deepEqual(validarV2(montarV2(p)), []);
});

test('boas-vindas: menciona quem abriu e a staff (se ligado), média e prazo', () => {
  const t = T();
  const p = pedacoDasBoasVindas(TICKET, t, { staffId: '300000000000000000', media: 12 });
  assert.equal(p.acima, '<@200000000000000000> <@&300000000000000000>');
  assert.deepEqual(p.mencoes.roles, ['300000000000000000']);
  assert.match(p.titulo, /🚨 Ticket #0042 · Denúncia/);
  assert.match(p.texto, /média de resposta: 12 min/);
  assert.match(p.rodape, /24 horas/);
  assert.deepEqual(p.linhas[0].components.map((b) => b.custom_id), ['tk:assumir', 'tk:add', 'tk:fechar']);
  const semStaff = pedacoDasBoasVindas(TICKET, { ...t, mencionar: false, parado: 'nunca' }, { staffId: '300000000000000000' });
  assert.equal(semStaff.acima, '<@200000000000000000>');
  assert.equal(semStaff.rodape, undefined);
});

test('fechamento e transcrição: onde foi parar e quando o canal some', () => {
  const t = T();
  assert.equal(textoDaTranscricao(t, { logs: '<#9>', quem: '<@2>' }), 'Transcrição salva em <#9> e cópia enviada na DM de <@2>.');
  assert.equal(textoDaTranscricao({ ...t, transDm: false }, { logs: null, quem: '<@2>' }), 'Sem transcrição.');
  const p = pedacoDoFechamento(t, { por: '<@5>', motivo: 'resolvido', transcricao: 'Sem transcrição.' });
  assert.match(p.texto, /fechado por <@5>\*\* · resolvido/);
  assert.match(p.texto, /some em 10 segundos/);
});

test('avaliação: 5 estrelas; depois de votar ficam travadas', () => {
  const antes = pedacoDaAvaliacao(TICKET, 'Servidor');
  assert.deepEqual(antes.linhas[0].components.map((b) => b.custom_id), ['tkn:42:1', 'tkn:42:2', 'tkn:42:3', 'tkn:42:4', 'tkn:42:5']);
  // A DM não diz de que servidor é o ticket: o botão leva o id junto
  const noOutro = noServidor('123456789012345678', () => pedacoDaAvaliacao(TICKET, 'Servidor'));
  assert.equal(noOutro.linhas[0].components[0].custom_id, 'tkn:42:1:123456789012345678');
  const depois = pedacoDaAvaliacao(TICKET, 'Servidor', 4);
  assert.ok(depois.linhas[0].components.every((b) => b.disabled));
  assert.match(depois.texto, /Nota 4\/5/);
});

test('parado, média de resposta e "há quanto tempo"', () => {
  const agora = Date.now();
  assert.equal(estaParado(agora - 25 * 3_600_000, '24h', agora), true);
  assert.equal(estaParado(agora - 23 * 3_600_000, '24h', agora), false);
  assert.equal(estaParado(0, 'nunca', agora), false);
  assert.equal(mediaDeResposta([{ aberto: 0, assumidoEm: 60_000 }]), null);
  assert.equal(mediaDeResposta([0, 1, 2].map(() => ({ aberto: 0, assumidoEm: 600_000 }))), 10);
  assert.equal(haQuanto(agora - 4 * 60_000, agora), 'há 4 min');
  assert.equal(haQuanto(agora - 25 * 3_600_000, agora), 'ontem');
});

test('transcrição em html escapa o texto e lista os anexos', () => {
  const html = transcricao({
    ticket: { ...TICKET, respNome: 'marina' }, servidor: 'Servidor <dos> Cria', fechadoPor: 'marina', fechado: TICKET.aberto + 60_000,
    mensagens: [{ autor: 'pedrinho', ts: TICKET.aberto, texto: '<script>alert(1)</script>', anexos: [{ nome: 'print.png', url: 'https://cdn/x.png' }] }],
  });
  assert.match(html, /Ticket #0042/);
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /📎 print\.png/);
  assert.match(html, /Servidor &lt;dos&gt; Cria/);
});
