import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import ts from 'typescript';
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
  assert.throws(()=>extractOfficeText(new Uint8Array(20_000_001),'big.docx'));
  assert.throws(()=>extractOfficeText(new Uint8Array(),'legacy.doc'));
  const malicious=zipSync({'word/document.xml':strToU8('<!DOCTYPE x><document/>')});
  assert.throws(()=>extractOfficeText(malicious,'unsafe.docx'),/XML/);
  const bomb=zipSync({'word/document.xml':new Uint8Array(20_000_001)});
  assert.throws(()=>extractOfficeText(bomb,'large.docx'),/распакованный/);
});

test('long text-only DOCX preserves all text through preparation and persistence', async () => {
  const source = readFileSync(new URL('../src/lib/attachments.ts', import.meta.url), 'utf8').replace('import("./officeExtract")', `import(${JSON.stringify(new URL('../src/lib/officeExtract.ts', import.meta.url).href)})`);
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { prepareAttachment, attachToMessage, splitAttachments } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const fullText = 'Текст диплома. '.repeat(24000) + 'КОНЕЦ ДИПЛОМА';
  const content = '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>' + fullText + '</w:t></w:r></w:p></w:body></w:document>';
  const bytes = zipSync({'word/document.xml': strToU8(content)});
  const file = new File([bytes], 'diploma.docx');
  const files = await prepareAttachment(file);
  assert.equal(files.length, 1);
  assert.ok(files[0].text.length > 200000);
  assert.equal(files[0].text, fullText);
  assert.deepEqual(splitAttachments(attachToMessage('Прочитай диплом', files)).files, files);
});

test('DOCX accepts verbose Word XML above five MB while retaining decompression bounds', () => {
  const content = '<w:document xmlns:w="urn:word"><w:body>' + '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:t>Текст.</w:t></w:r></w:p>'.repeat(65000) + '</w:body></w:document>';
  assert.ok(strToU8(content).length > 5_000_000);
  const text = extractOfficeText(zipSync({'word/document.xml': strToU8(content)}), 'diploma.docx');
  assert.match(text, /Текст/);
  assert.ok(text.length > 60000);
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
