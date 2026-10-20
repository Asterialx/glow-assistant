import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCourseworkRequest, parseOutline, sanitizeChapterText, assembleCoursework, generateCoursework, COURSEWORK_MAX_CHARS,
  parseClarification, formatQuestions, COURSEWORK_QUESTIONS_MARK, isAwaitingCourseworkAnswer, courseworkRequestBefore,
} from '../src/lib/coursework.ts';

const outlineJson = JSON.stringify({
  title: 'Анализ рынка',
  chapters: [
    { title: 'Введение', points: ['актуальность'] },
    { title: 'Теория', points: ['модели'] },
    { title: 'Заключение', points: [] },
  ],
});

test('detects coursework requests in Russian and English', () => {
  assert.equal(isCourseworkRequest('Напиши курсовую работу по экономике'), true);
  assert.equal(isCourseworkRequest('сделай курсовик про маркетинг'), true);
  assert.equal(isCourseworkRequest('write a coursework on biology'), true);
  assert.equal(isCourseworkRequest('создай презентацию'), false);
});

test('parses an outline wrapped in extra text', () => {
  const outline = parseOutline(`Вот план:\n${outlineJson}\nГотово`);
  assert.equal(outline.title, 'Анализ рынка');
  assert.equal(outline.chapters.length, 3);
});

test('rejects outlines with too few chapters or broken JSON', () => {
  assert.throws(() => parseOutline('{"title":"x","chapters":[{"title":"a"}]}'), /от 3 до 8/);
  assert.throws(() => parseOutline('no json here'), /не удалось|Не удалось/i);
  assert.throws(() => parseOutline('{"title": broken}'), /формат/);
});

test('demotes headings and strips stray glow-file blocks from chapter text', () => {
  const text = sanitizeChapterText('# Big\n\nText\n\n## Sub\n\n```glow-file\n{}\n```\n\nEnd');
  assert.match(text, /^### Big/m);
  assert.match(text, /^### Sub/m);
  assert.equal(text.includes('glow-file'), false);
});

test('assembles title, contents, chapters and bibliography in order', () => {
  const md = assembleCoursework(parseOutline(outlineJson), ['one', 'two', 'three'], '1. Source');
  assert.ok(md.startsWith('# Анализ рынка'));
  assert.ok(md.indexOf('## Содержание') < md.indexOf('## 1. Введение'));
  assert.ok(md.indexOf('## 2. Теория') < md.indexOf('## 3. Заключение'));
  assert.ok(md.trim().endsWith('1. Source'));
});

test('refuses to assemble a document over the single-file limit', () => {
  assert.throws(() => assembleCoursework(parseOutline(outlineJson), ['x'.repeat(COURSEWORK_MAX_CHARS), 'b', 'c'], 'r'), /слишком длинной/);
});

test('runs outline, chapters and references in order with status updates', async () => {
  const calls = [];
  const statuses = [];
  const replies = [outlineJson, 'Текст введения', 'Текст теории', 'Текст заключения', '1. Реальный источник'];
  const result = await generateCoursework('Тема', {
    complete: async (messages, maxTokens) => { calls.push({ system: messages[0].content, maxTokens }); return replies[calls.length - 1]; },
    onStatus: (status) => statuses.push(status),
    pages: 30,
  });
  assert.equal(calls.length, 5);
  assert.match(calls[1].system, /академическ/);
  assert.equal(calls[1].maxTokens, 8000);
  assert.match(result.markdown, /Текст теории/);
  assert.equal(statuses.filter((s) => s.startsWith('Пишу главу')).length, 3);
});

test('retries the outline once when the first answer is not valid JSON', async () => {
  const replies = ['не план', outlineJson, 'a', 'b', 'c', 'refs'];
  let i = 0;
  const result = await generateCoursework('Тема', { complete: async () => replies[i++] });
  assert.equal(result.title, 'Анализ рынка');
  assert.equal(i, 6);
});

test('stops between steps when the request is aborted', async () => {
  const controller = new AbortController();
  await assert.rejects(generateCoursework('Тема', {
    complete: async (messages) => { controller.abort(); return messages[0].content.includes('план') ? outlineJson : 'x'; },
    signal: controller.signal,
  }), /остановлена/);
});

test('parses clarification questions and treats broken answers as ready', () => {
  assert.deepEqual(parseClarification('{"ready":false,"questions":["Кто аудитория?",{"prompt":"Формат?","options":["Эссе","Исследование"]}]}'), { ready: false, questions: [{ prompt: 'Кто аудитория?' }, { prompt: 'Формат?', options: ['Эссе', 'Исследование'] }] });
  assert.deepEqual(parseClarification('{"ready":true,"questions":[]}'), { ready: true, questions: [] });
  assert.deepEqual(parseClarification('не json'), { ready: true, questions: [] });
});

test('questions message carries the marker that the next reply is read against', () => {
  const message = formatQuestions([{ prompt: 'Кто аудитория?' }]);
  assert.ok(message.startsWith(COURSEWORK_QUESTIONS_MARK));
  assert.match(message, /```glow-ui\n\{"type":"questionnaire"/);
  assert.match(message, /"prompt":"Кто аудитория\?"/);
  assert.equal(isAwaitingCourseworkAnswer([{ role: 'user', content: 'курсовая' }, { role: 'assistant', content: message }, { role: 'user', content: 'для вузовских преподавателей' }]), true);
  assert.equal(isAwaitingCourseworkAnswer([{ role: 'user', content: 'курсовая' }, { role: 'assistant', content: 'готово' }]), false);
});

test('finds the original coursework request before the questions', () => {
  const history = [
    { role: 'user', content: 'Напиши курсовую по экономике' },
    { role: 'assistant', content: formatQuestions([{ prompt: 'Какой объём?' }]) },
    { role: 'user', content: '10 страниц' },
  ];
  assert.equal(courseworkRequestBefore(history), 'Напиши курсовую по экономике');
});
