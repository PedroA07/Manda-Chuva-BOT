// Coisas usadas por vários testes
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let n = 0;

/** Importa o dados.js do zero, gravando numa pasta temporária (nunca no Gist de produção) */
export async function dadosNovos() {
  const pasta = mkdtempSync(join(tmpdir(), 'manda-chuva-'));
  process.env.DADOS_PASTA = pasta;
  delete process.env.GIST_ID;
  delete process.env.GIST_TOKEN;
  const dados = await import(`../dados.js?teste=${++n}`);
  return { dados, pasta };
}
