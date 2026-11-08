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
      // Fontes do nome no perfil (Aparência): as mesmas do site
      c.GlobalFonts.registerFromPath(fonte('BricolageGrotesque-Medium.ttf'), 'Bricolage Medium');
      c.GlobalFonts.registerFromPath(fonte('PermanentMarker-Regular.ttf'), 'Permanent Marker');
      c.GlobalFonts.registerFromPath(fonte('Caveat-Bold.ttf'), 'Caveat');
      c.GlobalFonts.registerFromPath(fonte('Pacifico-Regular.ttf'), 'Pacifico');
      c.GlobalFonts.registerFromPath(fonte('Bungee-Regular.ttf'), 'Bungee');
      c.GlobalFonts.registerFromPath(fonte('PressStart2P-Regular.ttf'), 'Press Start 2P');
      c.GlobalFonts.registerFromPath(fonte('JetBrainsMono-Medium.ttf'), 'JetBrains Mono');
      return c;
    })
    .catch((erro) => {
      console.error('⚠️  Não consegui carregar o canvas (cards e placas ficam desligados):', erro.message);
      return null;
    });
  return carregado;
}
