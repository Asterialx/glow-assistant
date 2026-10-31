import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMath } from '../src/lib/math.ts';

test('\\( \\) and \\[ \\] become $ and $$ so formulas are rendered', () => {
  assert.equal(normalizeMath('Корни: \\(x_1 = 2\\) и \\(x_2\\).'), 'Корни: $x_1 = 2$ и $x_2$.');
  assert.equal(normalizeMath('Итог:\n\\[ \\frac{a}{b} \\]\nГотово'), 'Итог:\n\n$$\n\\frac{a}{b}\n$$\n\nГотово');
});

test('formulas in code are left alone, and text without delimiters is unchanged', () => {
  const code = 'Пример: `\\(x\\)` и\n```tex\n\\[ y \\]\n```';
  assert.equal(normalizeMath(code), code);
  assert.equal(normalizeMath('Цена $5 и $x^2$'), 'Цена $5 и $x^2$');
});
