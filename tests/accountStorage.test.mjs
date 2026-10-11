import test from 'node:test';
import assert from 'node:assert/strict';

// Separate module instances represent separate page loads, as required on account switch.
async function page() { return import(`../src/auth/accountStorage.ts?page=${Math.random()}`); }
test('beta storage refuses anonymous access; legacy keys are preserved', async () => {
  const scope = await page();
  assert.equal(scope.accountStorageKey('glow.instructions'), 'glow.instructions');
  scope.configureAccountStorage(true);
  assert.throws(() => scope.accountStorageKey('glow.instructions'));
});
test('accounts cannot read or remove each others settings or legacy data', async () => {
  const entries = new Map([['glow.instructions', 'legacy']]);
  const backing = { getItem: key => entries.get(key) ?? null, setItem: (key,value) => entries.set(key,value), removeItem: key => entries.delete(key) };
  const alice = await page(); const bob = await page();
  alice.configureAccountStorage(true); bob.configureAccountStorage(true);
  alice.setStorageOwner('alice'); bob.setStorageOwner('bob');
  const a = alice.createAccountStorage(() => backing); const b = bob.createAccountStorage(() => backing);
  a.setItem('glow.instructions', 'private A');
  assert.equal(b.getItem('glow.instructions'), null);
  b.setItem('glow.instructions', 'private B'); b.removeItem('glow.instructions');
  assert.equal(a.getItem('glow.instructions'), 'private A');
  assert.equal(entries.get('glow.instructions'), 'legacy');
  assert.throws(() => alice.setStorageOwner('bob'));
  const reload = await page(); reload.configureAccountStorage(true); reload.setStorageOwner('alice');
  assert.equal(reload.createAccountStorage(() => backing).getItem('glow.instructions'), 'private A');
  assert.notEqual(alice.accountStorageKey('glow_home'), bob.accountStorageKey('glow_home'));
});
