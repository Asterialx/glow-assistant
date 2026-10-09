import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStudyPlan, studyTaskKeys, studyProgress, setStudyCompletion, validateStudyCompletion, isStudyPlanRequest } from '../src/lib/studyPlan.ts';
import { extractGenUiBlocks, stripGenUiFences } from '../src/lib/genUi.ts';

const plan = { type: 'study_plan', title: 'Подготовка по физике', days: [
  { id: 'day1', title: 'Электричество', topics: [{ id: 'ohm', title: 'Закон Ома', tasks: [{ id: 'theory', title: 'Разобрать формулу', minutes: 15 }, { id: 'practice', title: 'Решить 5 задач', minutes: 25 }] }] },
  { id: 'day2', title: 'Повторение', topics: [{ id: 'review', title: 'Проверка знаний', tasks: [{ id: 'test', title: 'Пройти тест' }, { id: 'errors', title: 'Разобрать ошибки' }] }] },
] };

test('study-format hint targets preparation requests, not ordinary questions', () => {
  assert.equal(isStudyPlanRequest('Подготовь меня к контрольной по физике за 3 дня'), true);
  assert.equal(isStudyPlanRequest('Составь план подготовки по темам'), true);
  assert.equal(isStudyPlanRequest('Make a study plan for my exam'), true);
  assert.equal(isStudyPlanRequest('Объясни закон Ома'), false);
  assert.equal(isStudyPlanRequest('План поездки в Казань'), false);
});

test('structured plan is extracted and raw JSON disappears from message', () => {
  const text = `План готов.\n\`\`\`glow-ui\n${JSON.stringify(plan)}\n\`\`\``;
  assert.equal(extractGenUiBlocks(text)[0]?.type, 'study_plan');
  assert.equal(stripGenUiFences(text), 'План готов.');
});
test('progress tracks tasks and whole days reversibly', () => {
  const keys = studyTaskKeys(validateStudyPlan(plan));
  let marks = setStudyCompletion(keys, {}, [keys[0]], true);
  assert.deepEqual(studyProgress(keys, marks), { done: 1, total: 4, percent: 25 });
  marks = setStudyCompletion(keys, marks, keys.slice(0, 2), true);
  assert.equal(studyProgress(keys, marks).percent, 50);
  marks = setStudyCompletion(keys, marks, keys, true);
  assert.equal(studyProgress(keys, marks).percent, 100);
  marks = setStudyCompletion(keys, marks, keys.slice(0, 2), false);
  assert.equal(studyProgress(keys, marks).percent, 50);
  assert.deepEqual(studyProgress([], {}), { done: 0, total: 0, percent: 0 });
});
test('marks survive JSON storage and changed tasks do not inherit completion', () => {
  const original = validateStudyPlan(plan), keys = studyTaskKeys(original);
  const marks = setStudyCompletion(keys, {}, [keys[0]], true);
  const loaded = validateStudyCompletion(JSON.parse(JSON.stringify(marks)));
  assert.equal(studyProgress(keys, loaded).done, 1);
  const changed = structuredClone(original);
  changed.days[0].topics[0].tasks[0].title = 'Другая задача';
  assert.equal(studyProgress(studyTaskKeys(changed), loaded).done, 0);
  assert.equal(studyProgress(keys, { ...loaded, obsolete: true }).done, 1);
});
test('invalid plans fail before rendering', () => {
  assert.equal(validateStudyPlan({ ...plan, days: [] }), null);
  assert.equal(validateStudyPlan({ ...plan, days: [...plan.days, plan.days[0]] }), null);
  const emptyTopic = structuredClone(plan); emptyTopic.days[0].topics[0].tasks = [];
  assert.equal(validateStudyPlan(emptyTopic), null);
  const duplicate = structuredClone(plan); duplicate.days[0].topics[0].tasks.push(duplicate.days[0].topics[0].tasks[0]);
  assert.equal(validateStudyPlan(duplicate), null);
  const invalidMinutes = structuredClone(plan); invalidMinutes.days[0].topics[0].tasks[0].minutes = -1;
  assert.equal(validateStudyPlan(invalidMinutes), null);
  assert.equal(validateStudyCompletion([]), undefined);
  assert.deepEqual(validateStudyCompletion({ 'bad.key': true, valid: 'true', safe: true }), { safe: true });
});
