// Caracteres que nenhuma fonte desenha saem do texto das imagens (senão viram quadradinho)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { textoDesenhavel } from '../lib/carteirinha.js';
import { cobertura, faixasDaFonte, soOQueDesenha } from '../lib/glifos.js';

test('lê o cmap da fonte: letras e acentos sim, enfeites que ela não tem não', () => {
  const tem = cobertura(faixasDaFonte(readFileSync(new URL('../fontes/BricolageGrotesque-ExtraBold.ttf', import.meta.url))));
  for (const ch of ['A', 'z', 'é', 'ç', 'ã', '·', '—', '€']) assert.ok(tem(ch.codePointAt(0)), ch);
  for (const ch of ['꒰', '꒱', '⊱', '✦']) assert.ok(!tem(ch.codePointAt(0)), ch);
});

test('cargo cheio de enfeite sai limpo; texto normal não muda', () => {
  assert.equal(soOQueDesenha('꒰ Bardo ꒱').trim(), 'Bardo');
  assert.equal(textoDesenhavel('꒰ Humano ꒱'), 'Humano');
  assert.equal(textoDesenhavel('Gerente Pernambucano'), 'Gerente Pernambucano');
  assert.equal(textoDesenhavel('𝓟𝓮𝓭𝓻𝓸 🎮'), 'Pedro');
  assert.equal(textoDesenhavel('꒰꒱'), '');
});
