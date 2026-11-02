// Jornal do Campus: o que mudou em cada versão do bot (a mais nova primeiro).
// A primeira entrada é sempre a versão do package.json. O painel mostra tudo; o bot anuncia as novas no canal escolhido.
// grande: entra no "Só as grandes". adesivo: o meme colado no cartão da notícia no painel.

export const NOVIDADES = [
  {
    versao: '3.4.0',
    data: '02/11/2026',
    tag: 'NOVIDADE',
    titulo: 'Mais um ano sem trancar: aniversários!',
    texto: 'Cadastre o seu com /aniversario 14/05/2003 (o ano é opcional) ou pelo botão "Cadastrar aniversário" do painel de cores. No dia, o bot posta um card com a sua foto, dá o cargo "Aniversariante do dia" por 24 horas e pode mandar parabéns na DM.',
    grande: true,
    adesivo: 'já pode comprar o bolo',
  },
  {
    versao: '3.3.0',
    data: '02/11/2026',
    tag: 'NOVIDADE',
    titulo: 'O bot se fantasia sozinho nas datas festivas',
    texto: 'Natal, Ano Novo, Carnaval, Páscoa, Festa Junina, Halloween e outras: em cada data o bot troca o banner, a cor e põe uma frase nas mensagens, e volta ao normal quando a data passa. Carnaval e Páscoa são calculados todo ano. Dá pra criar avisos com data e simular um dia na aba Temas.',
    grande: true,
    adesivo: 'vestiu a fantasia',
  },
  {
    versao: '3.2.0',
    data: '02/11/2026',
    tag: 'NOVIDADE',
    titulo: 'Portaria: quem entra, quem sai, quem vai pra diretoria',
    texto: 'O bot recebe os calouros com mensagem e um card com a foto e o nome, avisa quando alguém sai e registra expulsões, bans e silêncios. Tem modelos prontos, cargo automático pra quem chega e o botão "Testar comigo". Tudo na aba Portaria do painel.',
    grande: true,
    adesivo: 'ele chegou, galera',
  },
  {
    versao: '3.1.1',
    data: '02/11/2026',
    tag: 'MELHORIA',
    titulo: 'Galeria completa e as 11 cores do redesign',
    texto: 'A galeria de imagens ganhou todos os banners animados das datas festivas (um pra cada mensagem), as versões em imagem, os fundos e os banners de evento com o nome do seu servidor na placa. Preto, Cinza e Marrom entraram na chamada da turma.',
    grande: false,
    adesivo: 'tá tudo aí',
  },
  {
    versao: '3.1.0',
    data: '02/11/2026',
    tag: 'NOVIDADE',
    titulo: 'Extra! O bot agora tem jornal',
    texto: 'Toda vez que o Manda Chuva ganhar novidade, ele posta a notícia num canal do servidor. Escolha o canal e quem mencionar na aba Notícias do painel.',
    grande: true,
    adesivo: 'extra! extra!',
  },
  {
    versao: '3.0.0',
    data: '02/11/2026',
    tag: 'NOVIDADE',
    titulo: 'Visual novo: o painel virou campus',
    texto: 'Cada cor virou um cartão de matrícula, o painel de cores ganhou banner em cima, miniatura e imagens no final, e dá pra mandar suas próprias imagens. Também chegaram a cor em degradê e o botão com a bolinha da cor.',
    grande: true,
    adesivo: 'stonks',
  },
  {
    versao: '2.0.0',
    data: '01/11/2026',
    tag: 'NOVIDADE',
    titulo: 'Painel na web pra configurar as cores',
    texto: 'Cores, textos, botões e respostas passaram a ser configurados pelo navegador, com prévia do jeitinho que fica no Discord.',
    grande: true,
    adesivo: 'confia',
  },
];
