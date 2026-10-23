import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFormula, extractGenUiBlocks, stripGenUiFences, validateGenUiBlock, recoverInlineArtifacts, isArtifactEditRequest, requestedChartType } from '../src/lib/genUi.ts';

const field = { id: 'angle', label: 'Angle', min: 0, max: 90, step: 1, initial: 30, control: 'range' };
test('calculator permits an empty optional unit without leaking JSON', () => {
  const block = { type: 'calculator', title: 'Area', fields: [field], formula: 'angle*2', resultLabel: 'Area', unit: '', precision: 2 };
  assert.ok(validateGenUiBlock(block));
  assert.equal(validateGenUiBlock({ ...block, unit: 42 }), null);
});
const diagram = {
  type: 'diagram', title: 'Tangent', fields: [field],
  points: [{ id: 'A', x: '0', y: '0' }, { id: 'B', x: 'cos(angle*pi/180)', y: '0' }, { id: 'C', x: 'cos(angle*pi/180)', y: 'sin(angle*pi/180)' }],
  lines: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C', accent: true }],
  outputs: [{ label: 'Tangent', formula: 'tan(angle*pi/180)' }], precision: 3,
};

test('legacy arithmetic and operator precedence', () => {
  assert.equal(calculateFormula('price*(1-discount/100)', { price: 10000, discount: 10 }), 9000);
  assert.equal(calculateFormula('-2^2', {}), -4);
  assert.equal(calculateFormula('2^3^2', {}), 512);
  assert.equal(calculateFormula('2^-2', {}), 0.25);
  assert.equal(calculateFormula('1e-3+1', {}), 1.001);
});
test('compound interest and monthly contributions', () => {
  const f = 'initial*pow(1+rate/1200,months)+monthly*(pow(1+rate/1200,months)-1)/(rate/1200)';
  const values = { initial: 10000, monthly: 5000, rate: 12, months: 12 };
  assert.ok(Math.abs(calculateFormula(f, values) - 74680.7653673045) < 0.01);
  assert.equal(calculateFormula('initial+monthly*months', values), 70000);
});
test('trigonometry and undefined results', () => {
  assert.ok(Math.abs(calculateFormula('tan(angle*pi/180)', { angle: 45 }) - 1) < 1e-12);
  assert.ok(Math.abs(calculateFormula('tan(angle*pi/180)', { angle: 60 }) - Math.sqrt(3)) < 1e-12);
  assert.equal(calculateFormula('tan(angle*pi/180)', { angle: 90 }), null);
  assert.equal(calculateFormula('1/0', {}), null);
  assert.equal(calculateFormula('sqrt(-1)', {}), null);
  assert.equal(calculateFormula('pow(10,100)', {}), null);
});
test('only whitelisted expressions are accepted', () => {
  for (const f of ['Math.tan(angle)', 'alert(1)', 'constructor(1)', 'unknown+1', 'min(1)', 'max(1,2,3)', '2**3', 'window.location']) {
    assert.equal(calculateFormula(f, { angle: 45 }), null, f);
  }
});
test('diagram validates geometry and rejects broken references', () => {
  assert.equal(validateGenUiBlock(diagram)?.type, 'diagram');
  assert.equal(validateGenUiBlock({ ...diagram, lines: [{ from: 'A', to: 'missing' }] }), null);
  assert.equal(validateGenUiBlock({ ...diagram, points: [{ id: 'A', x: 'eval(1)', y: '0' }] }), null);
});
test('supported power calculators survive validation', () => {
  assert.equal(validateGenUiBlock({ type: 'calculator', title: 'Power', fields: [field], formula: 'angle^2', resultLabel: 'Result' })?.type, 'calculator');
});
test('JSON and Glow fences render without leaking raw JSON', () => {
  for (const fence of ['glow-ui', 'genui', 'json']) {
    const text = `Before\n\`\`\`${fence}\n${JSON.stringify(diagram)}\n\`\`\`\nAfter`;
    assert.equal(extractGenUiBlocks(text)[0]?.type, 'diagram');
    assert.equal(stripGenUiFences(text), 'Before\n\nAfter');
  }
  const unrelated = '```json\n{"hello":"world"}\n```';
  assert.equal(stripGenUiFences(unrelated), unrelated);
});

const ohm = {
  type: 'diagram', title: 'Закон Ома: I = U / R',
  fields: [
    { id: 'U', label: 'Напряжение U (В)', min: 1, max: 24, step: 1, initial: 12, control: 'range' },
    { id: 'R', label: 'Сопротивление R (Ом)', min: 1, max: 100, step: 1, initial: 4, control: 'range' },
  ],
  points: [{ id: 'src', label: 'Источник U', x: '0', y: '0' }, { id: 'top', label: '', x: '0', y: '2' }, { id: 'res', label: 'R', x: '4', y: '2' }, { id: 'bot', label: '', x: '4', y: '0' }],
  lines: [{ from: 'src', to: 'top' }, { from: 'top', to: 'res', accent: true }, { from: 'res', to: 'bot' }, { from: 'bot', to: 'src' }],
  outputs: [{ label: 'Сила тока I (А)', formula: 'U/R' }, { label: 'Мощность P (Вт)', formula: 'U^2/R' }],
  precision: 2, note: 'Замкнутый контур — цепь с источником напряжения.',
};

test('reported Ohm block renders with empty optional point labels', () => {
  const source = `Объяснение\n\`\`\`glow-ui\n${JSON.stringify(ohm)}\n\n\`\`\`\nПосле`;
  const blocks = extractGenUiBlocks(source);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'diagram');
  assert.equal(blocks[0].points[1].label, undefined);
  assert.equal(stripGenUiFences(source), 'Объяснение\n\nПосле');
  assert.equal(calculateFormula(blocks[0].outputs[0].formula, { U: 12, R: 4 }), 3);
  assert.equal(calculateFormula(blocks[0].outputs[1].formula, { U: 12, R: 4 }), 36);
  assert.equal(calculateFormula(blocks[0].outputs[0].formula, { U: 24, R: 4 }), 6);
});

test('empty and whitespace labels are optional; invalid labels are rejected', () => {
  for (const label of ['', '  ', null, undefined]) {
    assert.equal(validateGenUiBlock({ ...diagram, points: [{ id: 'A', label, x: '0', y: '0' }], lines: [] })?.type, 'diagram');
  }
  for (const label of [42, {}, 'x'.repeat(41)]) {
    assert.equal(validateGenUiBlock({ ...diagram, points: [{ id: 'A', label, x: '0', y: '0' }], lines: [] }), null);
  }
});

test('saved rejected message can recover without duplicating persisted artifacts', () => {
  const message = { id: 'm1', conversation_id: 'c1', role: 'assistant', content: `\`\`\`glow-ui\n${JSON.stringify(ohm)}\n\`\`\``, created_at: 123 };
  const recovered = recoverInlineArtifacts(message, []);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].message_id, 'm1');
  assert.equal(recoverInlineArtifacts(message, [recovered[0]]).length, 0);
  assert.equal(recoverInlineArtifacts({ ...message, role: 'user' }, []).length, 0);
});

test('real edits of the open artifact are recognised', () => {
  for (const text of ['измени этот график на линейный', 'добавь в него колонку', 'сделай его больше', 'добавь в текущую таблицу строку', 'поменяй тип графика', 'make it a line chart', 'update the current table']) {
    assert.equal(isArtifactEditRequest(text), true, text);
  }
});

test('requested chart type follows the target, not words from the topic', () => {
  const cases = [
    ['сделай диаграмму: столбчатую про линейные уравнения', 'bar'],
    ['измени, пожалуйста, на линейный график', 'line'],
    ['поменяй столбчатый на линейный', 'line'],
    ['поменяй линейный на столбчатый', 'bar'],
    ['make it a bar chart', 'bar'],
    ['switch to a line chart', 'line'],
    ['покажи график продаж', null],
    ['линейный график', null],
  ];
  for (const [text, expected] of cases) assert.equal(requestedChartType(text), expected, text);
});

test('new requests are not treated as edits of the open artifact', () => {
  for (const text of ['сделай график продаж за этот год', 'сделай презентацию про это', 'сделай таблицу расходов за месяц, поэтому добавь еду и транспорт', 'сделай новую таблицу', 'сделай ещё один график', 'составь таблицу кого куда отправить']) {
    assert.equal(isArtifactEditRequest(text), false, text);
  }
});
