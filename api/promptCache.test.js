import assert from 'node:assert/strict';
import test from 'node:test';
import { withPromptCache } from './promptCache.js';

test('caches the system prompt and the last stable assistant turn', () => {
  const messages = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: 'follow-up' },
  ];
  const result = withPromptCache(messages);

  assert.deepEqual(result[0].content, [{ type: 'text', text: 'system prompt', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(result[2].content, [{ type: 'text', text: 'first answer', cache_control: { type: 'ephemeral' } }]);
  assert.equal(result[3].content, 'follow-up');
  assert.equal(messages[0].content, 'system prompt');
  assert.equal(messages[2].content, 'first answer');
});

test('adds a breakpoint to the final text block without changing image blocks', () => {
  const messages = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'question' },
    { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
  ];
  const result = withPromptCache(messages);
  assert.deepEqual(result[2].content[0], { type: 'text', text: 'answer', cache_control: { type: 'ephemeral' } });
});

test('only marks the system prompt on a first-turn request', () => {
  const result = withPromptCache([
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'question' },
  ]);
  assert.ok(Array.isArray(result[0].content));
  assert.equal(result[1].content, 'question');
});
