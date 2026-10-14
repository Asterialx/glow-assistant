import assert from 'node:assert/strict';
import test from 'node:test';
import { createUsageCollector } from './tokenUsage.js';

test('collects cached input reads, writes, and provider cost from streaming usage', () => {
  const collector = createUsageCollector();
  const usage = {
    prompt_tokens: 12000,
    completion_tokens: 200,
    total_tokens: 12200,
    prompt_tokens_details: { cached_tokens: 8000, cache_write_tokens: 3000 },
    cost: 0.00123,
  };
  collector.push(new TextEncoder().encode(`data: ${JSON.stringify({ usage })}\n`));

  assert.deepEqual(collector.finish(), {
    input: 12000,
    output: 200,
    total: 12200,
    costUsd: 0.00123,
    cacheReadTokens: 8000,
    cacheWriteTokens: 3000,
  });
});

test('accepts Anthropic usage field names and leaves cache metrics unknown when absent', () => {
  const collector = createUsageCollector();
  collector.push(new TextEncoder().encode(`data: ${JSON.stringify({ usage: {
    prompt_tokens: 100,
    completion_tokens: 10,
    total_tokens: 110,
    cache_read_input_tokens: 50,
    cache_creation_input_tokens: 25,
  } })}\n`));
  const usage = collector.finish();
  assert.equal(usage.cacheReadTokens, 50);
  assert.equal(usage.cacheWriteTokens, 25);
  assert.equal(usage.costUsd, null);
});
