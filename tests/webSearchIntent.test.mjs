import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/webSearchIntent.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { shouldSearchWeb } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('automatically searches for current events, medical evidence and explicit web research', () => {
  for (const prompt of [
    'Что нового сегодня в мире?',
    'Найди последние исследования по лечению мигрени',
    'Какие свежие новости о выборах?',
    'Compare recent peer-reviewed studies on GLP-1 cardiovascular outcomes',
    'What is the current exchange rate for EUR to USD?',
    'Проверь в интернете, какие рекомендации сейчас у ВОЗ',
  ]) assert.equal(shouldSearchWeb(prompt), true, prompt);
});

test('does not search for stable explanations or local coding tasks', () => {
  for (const prompt of [
    'Объясни фотосинтез простыми словами',
    'Переведи этот текст на английский',
    'Find the bug in this function',
    'Сравни эти два абзаца',
    'Напиши функцию сортировки массива',
  ]) assert.equal(shouldSearchWeb(prompt), false, prompt);
});
