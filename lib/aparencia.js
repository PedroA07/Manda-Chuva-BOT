// Aparência do cartão do perfil (v12): fundo, cor do nome (sólida ou degradê), fonte do nome e cor de destaque.
// Sem dependências: a carteirinha usa isto dentro da linha de execução do GIF.

// Fontes do nome: as mesmas do site (o canvas registra os arquivos em lib/canvas.js)
export const FONTES_NOME = ['Graduate', 'Bricolage Grotesque', 'Permanent Marker', 'Caveat', 'Pacifico', 'Bungee', 'Press Start 2P', 'JetBrains Mono'];
export const DEGRADES = [['#C4363C', '#F2C14E'], ['#5865F2', '#FF6EC7'], ['#2ECC71', '#3498DB'], ['#FF8A00', '#E52E71'], ['#9B59B6', '#F1C40F'], ['#00C9FF', '#92FE9D']];
// nome '' = a cor do texto do cartão (clara ou escura, conforme o fundo)
export const AP_PADRAO = { fundo: '#FFFCF4', nome: '', nomeTipo: 'solida', grad: 0, fonte: 'Graduate', destaque: '#C4363C' };
export const HEX = /^#[0-9a-f]{6}$/i;

/** Cor do texto do cartão: clara em fundo escuro (luminância abaixo de 0,3), tinta em fundo claro */
export function textoSobre(fundo) {
  const canal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = HEX.test(fundo ?? '') ? [1, 3, 5].reduce((a, i, k) => a + canal(parseInt(fundo.slice(i, i + 2), 16) / 255) * [0.2126, 0.7152, 0.0722][k], 0) : 1;
  const escuro = lum < 0.3;
  return { escuro, txt: escuro ? '#FFFCF4' : '#1B1F33', sub: escuro ? '#C9CBE0' : '#5A5E6E' };
}
