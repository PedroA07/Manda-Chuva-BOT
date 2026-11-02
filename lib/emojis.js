// Botão com "cor do cargo" ou "cor própria": o Discord só pinta o fundo do botão em 4 cores, então o bot
// põe uma bolinha da cor como emoji (emoji da própria aplicação: não gasta os espaços de emoji do servidor)
// e usa o fundo mais parecido.
import { pngCirculo } from './png.js';

/** 'Danger' | 'Success' | 'Primary' | 'Secondary', pelo matiz da cor (mesma regra da prévia do painel) */
export function estiloMaisProximo(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d < 40) return 'Secondary';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 20 || h >= 330) return 'Danger';
  if (h >= 75 && h < 170) return 'Success';
  if (h >= 185 && h < 290) return 'Primary';
  return 'Secondary';
}

const buscou = new WeakSet();
const criando = new Map();

/** Emoji da bolinha dessa cor (cria na aplicação se ainda não existe). @returns {Promise<{ id: string, name: string }>} */
export async function emojiDaCor(client, hex) {
  const nome = `cor_${hex.slice(1).toLowerCase()}`;
  const gerenciador = client.application.emojis;
  const achar = () => [...gerenciador.cache.values()].find((e) => e.name === nome);
  if (!achar() && !buscou.has(gerenciador)) {
    buscou.add(gerenciador);
    await gerenciador.fetch();
  }
  let emoji = achar();
  if (!emoji) {
    // Duas cores iguais salvando juntas não criam dois emojis
    if (!criando.has(nome)) criando.set(nome, gerenciador.create({ attachment: pngCirculo(hex), name: nome }).finally(() => criando.delete(nome)));
    emoji = await criando.get(nome);
  }
  return { id: emoji.id, name: emoji.name };
}
