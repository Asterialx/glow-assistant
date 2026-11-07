import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMemoryFacts, MEMORY_CAPTURE_PROMPT, sameFact } from '../src/lib/memory.ts';

test('the capture prompt names the exact marker the parser reads', () => {
  assert.match(MEMORY_CAPTURE_PROMPT, /Запомню: </);
});

test('marked lines become facts, including markdown emphasis and English', () => {
  const reply = 'Приятно познакомиться!\n\nЗапомню: Пользователя зовут Сергей.\n_Запомню: учится на 3 курсе_\n- **Remembered:** prefers short answers';
  assert.deepEqual(extractMemoryFacts(reply), ['Пользователя зовут Сергей.', 'учится на 3 курсе', 'prefers short answers']);
});

test('ordinary text, code and duplicates are not saved', () => {
  const reply = 'Запомни: сумма углов треугольника 180°.\nFact: water boils at 100 °C.\n```\nЗапомню: внутри кода\n```\nЗапомню: живёт в Казани\nЗапомню: Живет в Казани!';
  assert.deepEqual(extractMemoryFacts(reply), ['живёт в Казани']);
});

test('at most three facts per reply', () => {
  const reply = ['a', 'b', 'c', 'd'].map(x => `Запомню: факт ${x}`).join('\n');
  assert.equal(extractMemoryFacts(reply).length, 3);
});

test('facts compare without case, ё and punctuation', () => {
  assert.ok(sameFact('Живёт в Казани.', 'живет в казани'));
  assert.ok(!sameFact('Живёт в Казани', 'Живёт в Москве'));
});
