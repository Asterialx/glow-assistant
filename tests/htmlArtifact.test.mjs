import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlPresentation, htmlSourceKey, validateHtmlPreviewState, isInlineHtmlArtifact } from '../src/lib/htmlArtifact.ts';

test('HTML artifacts without a glow-display hint stay in the workspace', () => {
  assert.equal(htmlPresentation('<p>plain</p>'), 'workspace');
  assert.equal(htmlPresentation('<meta name="glow-display" content="inline"><p>x</p>'), 'inline');
});

test('inline presentation is read only from artifact metadata', () => {
  assert.equal(isInlineHtmlArtifact({ kind: 'html', meta_json: '{"presentation":"inline"}' }), true);
  assert.equal(isInlineHtmlArtifact({ kind: 'html', meta_json: 'not json' }), false);
  assert.equal(isInlineHtmlArtifact({ kind: 'code', meta_json: '{"presentation":"inline"}' }), false);
});

test('source key changes with the HTML content', () => {
  assert.notEqual(htmlSourceKey('<p>a</p>'), htmlSourceKey('<p>b</p>'));
  assert.equal(htmlSourceKey('<p>a</p>'), htmlSourceKey('<p>a</p>'));
});

test('preview state keeps small valid form values and custom JSON', () => {
  const state = validateHtmlPreviewState({ forms: { 'name:0': { value: 'Ana', checked: true } }, custom: { step: 2, tags: ['a'] } });
  assert.deepEqual(state, { forms: { 'name:0': { value: 'Ana', checked: true } }, custom: { step: 2, tags: ['a'] } });
});

test('preview state rejects prototype pollution keys and oversized payloads', () => {
  assert.equal(validateHtmlPreviewState({ forms: {}, custom: JSON.parse('{"__proto__":{"x":1}}') }), null);
  assert.equal(validateHtmlPreviewState({ forms: {}, custom: { big: 'x'.repeat(20000) } }), null);
  assert.equal(validateHtmlPreviewState({ forms: [], custom: {} }), null);
  assert.equal(validateHtmlPreviewState(null), null);
});

test('preview state drops oversized form values instead of accepting them', () => {
  const state = validateHtmlPreviewState({ forms: { ok: { value: 'v' }, long: { value: 'x'.repeat(1001) } }, custom: {} });
  assert.deepEqual(state.forms, { ok: { value: 'v' } });
});
