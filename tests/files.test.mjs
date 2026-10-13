import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { extractOfficeText } from '../src/lib/officeExtract.ts';
import { parseNotebook, notebookContext } from '../src/lib/notebook.ts';
import { isCloudTextFile } from '../src/lib/filePolicy.ts';

test('reads real DOCX paragraphs, runs and tables without treating ZIP bytes as text', () => {
  const text=extractOfficeText(readFileSync(new URL('./fixtures/office/sample.docx',import.meta.url)), 'sample.docx');
  for (const expected of ['Исследование Glow','Контрольная группа','Placebo','42']) assert.ok(text.includes(expected), expected);
  assert.ok(!text.startsWith('PK'));
});
test('reads real Excel sheets, references, inline strings and labels cached formulas', () => {
  const text=extractOfficeText(readFileSync(new URL('./fixtures/office/sample.xlsx',import.meta.url)), 'sample.xlsx');
  for (const expected of ['Trials','Notes','B2: 42','B3: Источник проверен','формула: B2*2','не пересчитано']) assert.ok(text.includes(expected), expected);
});
test('reads real PowerPoint slides in order', () => {
  const text=extractOfficeText(readFileSync(new URL('./fixtures/office/sample.pptx',import.meta.url)), 'sample.pptx');
  assert.ok(text.indexOf('Glow Research') < text.indexOf('Limitations'));
  assert.match(text,/Не является рекомендацией лечения/);
});
test('rejects old formats, corrupt/enormous ZIPs and XML entity declarations', () => {
  assert.throws(()=>extractOfficeText(new Uint8Array([1,2]),'bad.docx'));
  assert.throws(()=>extractOfficeText(new Uint8Array(10_000_001),'big.docx'));
  assert.throws(()=>extractOfficeText(new Uint8Array(),'legacy.doc'));
  const malicious=zipSync({'word/document.xml':strToU8('<!DOCTYPE x><document/>')});
  assert.throws(()=>extractOfficeText(malicious,'unsafe.docx'),/XML/);
  const bomb=zipSync({'word/document.xml':new Uint8Array(5_000_001)});
  assert.throws(()=>extractOfficeText(bomb,'large.docx'),/распакованный/);
});
test('notebook preserves cell order, joins source lines and never imports active HTML output', () => {
  const notebook=parseNotebook(JSON.stringify({nbformat:4,metadata:{kernelspec:{language:'python'}},cells:[
    {cell_type:'markdown',source:['# Heading\n','Text']},
    {cell_type:'code',source:['x = 2\n','print(x+3)'],outputs:[{output_type:'stream',text:['5\n']},{output_type:'display_data',data:{'text/html':'<script>evil()</script>','text/plain':['Plain result']}}]},
  ]}));
  assert.equal(notebook.cells.length,2); assert.equal(notebook.cells[1].source,'x = 2\nprint(x+3)');
  assert.match(notebookContext(notebook),/Plain result/); assert.ok(!notebookContext(notebook).includes('<script>'));
  assert.throws(()=>parseNotebook('{"nbformat":3,"cells":[]}'));
  assert.throws(()=>parseNotebook('{"nbformat":4,"cells":[{"cell_type":"code","source":42}]}'));
  assert.equal(isCloudTextFile('BOOK.XLSX'),true); assert.equal(isCloudTextFile('image.png'),false);
});
