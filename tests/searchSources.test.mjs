import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/searchSources.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { appendSearchSources, splitSearchSources, publicFaviconUrl } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('source metadata round-trips without exposing it as answer prose', () => {
  const answer = appendSearchSources('Answer.', [{ title: 'Study', url: 'https://pubmed.ncbi.nlm.nih.gov/1' }]);
  const parsed = splitSearchSources(answer);
  assert.equal(parsed.text, 'Answer.');
  assert.equal(parsed.sources[0].title, 'Study');
  assert.match(publicFaviconUrl(parsed.sources[0]), /pubmed\.ncbi\.nlm\.nih\.gov/);
});

test('untrusted URLs and incomplete streaming metadata are never shown as sources', () => {
  const invalid = appendSearchSources('Answer', [{ title: 'x', url: 'javascript:alert(1)' }]);
  assert.deepEqual(splitSearchSources(invalid).sources, []);
  assert.deepEqual(splitSearchSources('Answer\n\n```glow-search-sources\n[{').sources, []);
  assert.equal(publicFaviconUrl({ title: 'Local', url: 'http://localhost:3000' }), null);
});
