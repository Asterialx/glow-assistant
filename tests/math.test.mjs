import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMath } from '../src/lib/math.ts';

test('\\( \\) becomes inline $$ and \\[ \\] a display block', () => {
  assert.equal(normalizeMath('Корни: \\(x_1 = 2\\) и \\(x_2\\).'), 'Корни: $$x_1 = 2$$ и $$x_2$$.');
  assert.equal(normalizeMath('Итог:\n\\[ \\frac{a}{b} \\]\nГотово'), 'Итог:\n\n$$\n\\frac{a}{b}\n$$\n\nГотово');
});

test('formulas in code are left alone, and text without delimiters is unchanged', () => {
  const code = 'Пример: `\\(x\\)` и `$x$`\n```tex\n\\[ y \\]\n$z$\n```';
  assert.equal(normalizeMath(code), code);
  assert.equal(normalizeMath('Обычный текст'), 'Обычный текст');
});

test('prices in dollars stay text', () => {
  for (const text of ['Тариф стоит $5 в месяц, а годовой $50.', 'Цена $5-$10', 'от $1,5 млн до $3 млн', 'Экранированный \\$x\\$']) {
    assert.equal(normalizeMath(text), text);
  }
});

test('single-dollar formulas become inline $$, next to prices too', () => {
  assert.equal(normalizeMath('Цена $5 и $x^2$'), 'Цена $5 и $$x^2$$');
  assert.equal(normalizeMath('$\\alpha$ и $\\ce{H2O}$.'), '$$\\alpha$$ и $$\\ce{H2O}$$.');
});

test('bare equation environments are wrapped in a display block, existing $$ is untouched', () => {
  assert.equal(normalizeMath('Формула:\n\\begin{equation} E=mc^2 \\end{equation}\nконец'), 'Формула:\n\n$$\n\\begin{equation} E=mc^2 \\end{equation}\n$$\n\nконец');
  assert.equal(normalizeMath('\\begin{align*}a&=b\\end{align*}'), '\n$$\n\\begin{align*}a&=b\\end{align*}\n$$\n');
  const wrapped = '$$\n\\begin{aligned} a&=b \\end{aligned}\n$$';
  assert.equal(normalizeMath(wrapped), wrapped);
  assert.equal(normalizeMath('\\[\\begin{equation}x\\end{equation}\\]'), '\n$$\n\\begin{equation}x\\end{equation}\n$$\n');
});
