import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/auth/profile.ts';

test('name is explicit, trimmed, and age is optional', () => {
  assert.deepEqual(validateProfile('  Сергей  ', ''), { display_name: 'Сергей', age: null, onboarding_completed: true });
  assert.equal(validateProfile('Анна', '19').age, 19);
});
test('profile rejects missing name and invalid ages', () => {
  for (const [name, age] of [['', '18'], ['x'.repeat(61), ''], ['Имя', '0'], ['Имя', '121'], ['Имя', '18.5'], ['Имя', 'abc']])
    assert.throws(() => validateProfile(name, age));
});
