import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { extractOpenDocument, extractRtf } from '../src/lib/documentExtract.ts';
import { extractOfficeImages } from '../src/lib/officeExtract.ts';

test('ODF keeps paragraphs, table values and slide text without executable content', () => {
  const bytes = zipSync({ 'content.xml': strToU8('<office:document-content xmlns:office="urn:o" xmlns:text="urn:t" xmlns:table="urn:table"><office:body><text:h>Исследование</text:h><table:table><table:table-row><table:table-cell><text:p>Placebo</text:p></table:table-cell><table:table-cell><text:p>42</text:p></table:table-cell></table:table-row></table:table><office:scripts><text:p>evil()</text:p></office:scripts><text:p>Конец</text:p></office:body></office:document-content>') });
  const text = extractOpenDocument(bytes);
  for (const value of ['Исследование', 'Placebo', '42', 'Конец']) assert.ok(text.includes(value));
  assert.ok(!text.includes('evil'));
  assert.throws(() => extractOpenDocument(zipSync({ 'content.xml': strToU8('<!DOCTYPE x><x/>') })), /XML/);
});

test('RTF reads Unicode, escapes and paragraphs while hiding embedded objects', () => {
  const text = extractRtf(String.raw`{\rtf1\ansi\uc1 Hello \u1046?\par {\pict secretbinary}\{42\} {\*\info hidden}}`);
  assert.equal(text, 'Hello Ж\n{42}');
  assert.throws(() => extractRtf('not rtf'));
});

test('Office images have a bounded preview and count; arbitrary objects are not decoded', () => {
  const files = {};
  for (let i=0;i<5;i++) files[`word/media/image${i}.png`] = new Uint8Array([1,2,3]);
  files['word/embeddings/program.exe'] = new Uint8Array([4]);
  const result = extractOfficeImages(zipSync(files));
  assert.equal(result.images.length, 3); assert.equal(result.total, 5);
  assert.equal(result.images[0].mime, 'image/png');
});
