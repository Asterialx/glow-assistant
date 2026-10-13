import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { validMessages } from '../api/messageValidation.js';
const source = (await readFile(new URL('../src/lib/mediaAttachment.ts', import.meta.url), 'utf8')).replace('import { imageForModel } from "./attachments";', 'const imageForModel = async () => "";');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { mediaFrameTimes, mediaTime } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('video samples cover the recording with honest timestamps and bounded duration', () => {
  assert.deepEqual(mediaFrameTimes(100), [10, 50, 90]);
  assert.equal(mediaTime(65.8), '1:05');
  for (const duration of [0, NaN, Infinity, 601]) assert.throws(() => mediaFrameTimes(duration));
});
test('several image messages remain valid within an explicit history bound', () => {
  const image = { type:'image_url', image_url:{ url:'data:image/jpeg;base64,YWJj' } };
  const history = Array.from({length:4}, () => ({ role:'user', content:[{type:'text',text:'frames'}, image, image, image] }));
  assert.equal(validMessages(history), true);
  history.push({role:'user',content:[image]});
  assert.equal(validMessages(history), false);
});
