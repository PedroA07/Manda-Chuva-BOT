// Versão do bot (a mesma do package.json). Aparece no /saude e no painel, e diz quais notícias são novas.
import { readFileSync } from 'node:fs';

export const VERSAO = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
