// Liga tudo: carrega a configuração, abre a API do painel e conecta o bot
// Rodar: npm install && npm start   (precisa do .env com DISCORD_TOKEN)
import { iniciarApi } from './api.js';
import { api, iniciarBot } from './bot.js';
import { carregar } from './dados.js';

// Lê o .env. Se a hospedagem já define as variáveis, o arquivo nem precisa existir.
try {
  process.loadEnvFile();
} catch {}

process.on('unhandledRejection', (erro) => console.error('Erro não tratado:', erro));

try {
  await carregar();
} catch (erro) {
  console.error('❌ Não consegui carregar a configuração:', erro.message);
  process.exit(1);
}

// PORT vem da hospedagem (Render e parecidas). PAINEL_PORTA=0 desliga a API (hospedagem que não abre porta).
const porta = Number(process.env.PORT || process.env.PAINEL_PORTA || 3000);
const senha = process.env.PAINEL_SENHA ?? '';
const origemDe = (texto) => {
  try {
    return new URL(texto.trim()).origin;
  } catch {
    return null;
  }
};
const origens = (process.env.PAINEL_ORIGENS ?? '').split(',').map(origemDe).filter((o) => o !== null);

if (porta && senha && senha.length < 12) {
  console.error('❌ A PAINEL_SENHA precisa ter pelo menos 12 caracteres. A API do painel não foi ligada.');
} else if (porta) {
  if (!senha && process.env.PORT) console.warn('⚠️  Sem PAINEL_SENHA a API só aceita acesso deste computador, e a hospedagem não alcança ela. Defina PAINEL_SENHA.');
  iniciarApi({ porta, senha, origens, api });

  // A Render grátis desliga o serviço depois de 15 min sem acesso, e o bot sai do ar junto.
  // Com MANTER_ACORDADO=1 ele acessa o próprio endereço público a cada 10 min.
  const urlPublica = process.env.URL_PUBLICA || process.env.RENDER_EXTERNAL_URL;
  if (process.env.MANTER_ACORDADO === '1' && urlPublica) {
    setInterval(() => fetch(new URL('/saude', urlPublica)).catch(() => {}), 10 * 60_000);
    console.log(`⏰ Mantendo acordado: ${urlPublica}`);
  }
}

if (!process.env.DISCORD_TOKEN) {
  console.error('⚠️  Falta o DISCORD_TOKEN. A API abre, mas o bot fica offline.');
} else {
  iniciarBot(process.env.DISCORD_TOKEN, { soPainel: process.env.SO_PAINEL === '1' }).catch((erro) =>
    console.error('❌ Não consegui conectar o bot:', erro.message),
  );
}
