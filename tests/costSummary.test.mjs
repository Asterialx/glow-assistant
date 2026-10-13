import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCosts } from '../src/auth/costSummary.ts';
import { COMPACT_UI_PROMPT } from '../src/lib/llm/uiPrompt.ts';

test('subscription cost estimate uses only priced confirmed samples',()=>{
 const summary=summarizeCosts([
  {status:'settled',total_tokens:1000,cost_usd:0.001},
  {status:'settled',total_tokens:1000,cost_usd:0.003},
  {status:'settled',total_tokens:99999,cost_usd:null},
  {status:'pending',total_tokens:100,cost_usd:100},
 ]);
 assert.equal(summary.tokens,2000); assert.equal(summary.dollars,0.004);
 assert.ok(Math.abs(summary.per100k-0.2)<1e-12); assert.equal(summary.unknownRequests,1);
});
test('missing cost is unknown, actual zero cost is allowed',()=>{
 assert.equal(summarizeCosts([]).per100k,null);
 assert.equal(summarizeCosts([{status:'settled',total_tokens:10,cost_usd:0}]).per100k,0);
});
test('compact contract retains all GenUI families and safety without repeated calculator rules',()=>{
 assert.ok(COMPACT_UI_PROMPT.length<6000);
 for(const feature of ['table','chart','calculator','diagram','study_plan','questionnaire','flashcards','biomarker_table','HTML','sin/cos/tan']) {
  assert.ok(COMPACT_UI_PROMPT.includes(feature),feature);
 }
 assert.equal((COMPACT_UI_PROMPT.match(/Formula grammar/g)||[]).length,1);
});
