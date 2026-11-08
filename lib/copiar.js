// Copiar a configuração de um servidor pra outro (aba Servidor do painel). Textos, imagens, cores e escolhas vão iguais;
// canais e cargos viram os de mesmo nome no servidor novo. O que não existir lá fica vazio, pra escolher no painel.
const ID = /^\d{15,25}$/;

/**
 * @param {object} cfg config do servidor de origem
 * @param {{ id: string, channels: { cache: any }, roles: { cache: any } }} origem
 * @param {{ id: string, channels: { cache: any }, roles: { cache: any } }} destino
 * @returns {{ cfg: object, achados: number, faltando: string[] }}
 */
export function traduzirConfig(cfg, origem, destino) {
  let achados = 0;
  const faltando = new Set();
  const traduzir = (v) => {
    if (typeof v === 'string' && ID.test(v)) {
      if (v === origem.id) return destino.id; // o servidor (e o @everyone, que tem o mesmo id)
      const canal = origem.channels.cache.get(v);
      if (canal) {
        const alvo = destino.channels.cache.find((c) => c.name === canal.name && c.type === canal.type);
        if (alvo) achados++;
        else faltando.add(`#${canal.name}`);
        return alvo?.id ?? null;
      }
      const cargo = origem.roles.cache.get(v);
      if (cargo) {
        const alvo = destino.roles.cache.find((r) => r.name === cargo.name && !r.managed && r.id !== destino.id);
        if (alvo) achados++;
        else faltando.add(`@${cargo.name}`);
        return alvo?.id ?? null;
      }
      return v; // outro id (de alguém, de emoji): fica igual
    }
    if (Array.isArray(v)) return v.map(traduzir).filter((x) => x !== null);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, traduzir(x)]));
    return v;
  };
  const nova = traduzir(structuredClone(cfg));
  nova.servidorId = destino.id;
  delete nova.hierarquia; // rascunho de cargos é do servidor de origem
  return { cfg: nova, achados, faltando: [...faltando] };
}
