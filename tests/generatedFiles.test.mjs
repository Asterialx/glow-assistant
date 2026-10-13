import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { unzipSync, strFromU8 } from 'fflate';
import ts from 'typescript';
import { validateGeneratedFile, extractGeneratedFiles, stripGeneratedFileFences, generatedCellValue } from '../src/lib/generatedFile.ts';
const require = createRequire(import.meta.url);
let source = await readFile(new URL('../src/lib/fileExport.ts', import.meta.url), 'utf8');
source = source.replaceAll('from "./generatedFile"', `from ${JSON.stringify(new URL('../src/lib/generatedFile.ts',import.meta.url).href)}`);
source = source.replace(/import\("([^"]+)"\)/g, (_match, name) => `import(${JSON.stringify(new URL(`file:///${require.resolve(name).replaceAll('\\','/')}`).href)})`);
const js = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const { exportGeneratedFile } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const doc = {format:'md',title:'Проверка Glow',filename:'../../report.md',content:'# Проверка Glow\n\n**Важное:** в исследовании 42 пациента.\n\n- Первый пункт\n- Второй пункт\n\n| Группа | Пациенты |\n|---|---|\n| Placebo | 42 |'};
test('file fences preserve prose, hide incomplete metadata and reject unsafe or malformed specs',()=>{
  const message='Готово\n\n```glow-file\n'+JSON.stringify(doc)+'\n```';
  assert.equal(extractGeneratedFiles(message).length,1);
  assert.equal(stripGeneratedFileFences(message),'Готово');
  assert.equal(stripGeneratedFileFences('Готово\n```glow-file\n{"format":'),'Готово');
  assert.ok(!validateGeneratedFile(doc).filename.includes('/'));
  assert.throws(()=>validateGeneratedFile({...doc,format:'exe'}));
  assert.throws(()=>validateGeneratedFile({format:'xlsx',title:'x',sheets:[{name:'x',rows:[[{formula:'HYPERLINK("http://evil")'}]]}]}));
});
test('spreadsheet formulas compute verified numeric ranges and fail on cycles',()=>{
  const rows=[['Item','Amount'],['A',20],['B',22],['Total',{formula:'SUM(B2:B3)'}]];
  assert.equal(generatedCellValue(rows,3,1),42);
  assert.equal(generatedCellValue([[{formula:'SUM(A1:A1)'}]],0,0),'#CYCLE!');
});
test('MD and Word exports are real files containing Cyrillic, lists and a table',async()=>{
  assert.match(await (await exportGeneratedFile(doc)).text(),/42 пациента/);
  const blob=await exportGeneratedFile({...doc,format:'docx'});
  const zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml=strFromU8(zip['word/document.xml']);
  assert.match(xml,/42 пациента/); assert.match(xml,/<w:tbl>/); assert.match(xml,/numPr/);
});
test('Excel export contains cached formula results and no fake renamed text',async()=>{
  const file={format:'xlsx',title:'Budget',filename:'budget.xlsx',sheets:[{name:'Budget',rows:[['Item','Amount'],['A',20],['B',22],['Total',{formula:'SUM(B2:B3)'}]]}]};
  const blob=await exportGeneratedFile(file);
  const zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']),/<f>SUM\(B2:B3\)<\/f><v>42<\/v>/);
});
test('PowerPoint export contains actual slides with Cyrillic title and notes',async()=>{
  const blob=await exportGeneratedFile({format:'pptx',title:'План',filename:'plan.pptx',slides:[{title:'Исследование',body:'- Первый пункт\n- Второй пункт',notes:'Описание'},{title:'Вывод',body:'42 пациента'}]});
  const zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.match(strFromU8(zip['ppt/slides/slide1.xml']),/Исследование/);
  assert.match(strFromU8(zip['ppt/slides/slide2.xml']),/42 пациента/);
  assert.ok(zip['ppt/notesSlides/notesSlide1.xml']);
});
test('PDF export has an actual PDF header and a substantial embedded font',async()=>{
  const blob=await exportGeneratedFile({...doc,format:'pdf'});
  const data=new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(data.slice(0,5)),'%PDF-');
  assert.ok(data.length>5000);
});
