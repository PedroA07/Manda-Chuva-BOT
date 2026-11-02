// Carrega o @napi-rs/canvas (binário nativo) só quando precisa. Se não carregar na hospedagem,
// o bot continua: sem card de boas-vindas desenhado e com os banners de evento originais.
import { fileURLToPath } from 'node:url';

let carregado;

/** @returns {Promise<typeof import('@napi-rs/canvas') | null>} */
export function canvas() {
  carregado ??= import('@napi-rs/canvas')
    .then((c) => {
      const fonte = (arq) => fileURLToPath(new URL(`../fontes/${arq}`, import.meta.url));
      c.GlobalFonts.registerFromPath(fonte('Graduate-Regular.ttf'), 'Graduate');
      c.GlobalFonts.registerFromPath(fonte('BricolageGrotesque-Bold.ttf'), 'Bricolage Bold');
      c.GlobalFonts.registerFromPath(fonte('BricolageGrotesque-ExtraBold.ttf'), 'Bricolage ExtraBold');
      return c;
    })
    .catch((erro) => {
      console.error('⚠️  Não consegui carregar o canvas (cards e placas ficam desligados):', erro.message);
      return null;
    });
  return carregado;
}
