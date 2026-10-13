import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillMarkdown, skillInstructions, BUILTIN_SKILLS } from '../src/lib/skills.ts';

test('imports self-contained Claude-format instructions and applies only an explicit current selection', () => {
  const skill = parseSkillMarkdown('---\nname: clear-writing\ndescription: "Rewrite clearly"\n---\nUse short sentences.');
  assert.equal(skill.name, 'clear-writing');
  assert.equal(skill.description, 'Rewrite clearly');
  assert.match(skillInstructions('/skill clear-writing\nRewrite my text', [skill]), /Use short sentences/);
  assert.equal(skillInstructions('Continue without a skill', [skill]), '');
  assert.throws(() => skillInstructions('/skill missing\nHi', [skill]), /не найден/);
  assert.match(skillInstructions('/skill morning\nPlan today', BUILTIN_SKILLS), /three concrete priorities/);
});
test('rejects unsupported executable packages, malformed headers and excessive size', () => {
  for (const source of ['no header', '---\nname: ../outside\ndescription: bad\n---\nDo it', '---\nname: script\ndescription: Run\n---\nRun scripts/task.py', 'x'.repeat(24001)]) {
    assert.throws(() => parseSkillMarkdown(source));
  }
});
