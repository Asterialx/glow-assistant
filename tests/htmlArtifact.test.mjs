import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlPresentation, htmlSourceKey, validateHtmlPreviewState, isInlineHtmlArtifact, validateHtmlPreviewError, artifactFixPrompt } from '../src/lib/htmlArtifact.ts';

test('error reports from the sandbox are short plain strings only', () => {
  assert.equal(validateHtmlPreviewError('ReferenceError: x is not defined'), 'ReferenceError: x is not defined');
  assert.equal(validateHtmlPreviewError('a\n\tb'), 'a b');
  assert.equal(validateHtmlPreviewError('x'.repeat(900)).length, 500);
  assert.equal(validateHtmlPreviewError({ message: 'x' }), null);
  assert.equal(validateHtmlPreviewError('   '), null);
});

test('the fix prompt lists the errors and carries the code only while it is small', () => {
  const small = artifactFixPrompt('Калькулятор', ['TypeError: a is null'], '<p>x</p>', 'ru');
  assert.match(small, /Калькулятор/);
  assert.match(small, /- TypeError: a is null/);
  assert.match(small, /```html\n<p>x<\/p>\n```/);
  assert.doesNotMatch(artifactFixPrompt('Big', ['e'], 'x'.repeat(20_000), 'en'), /```html/);
});

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
