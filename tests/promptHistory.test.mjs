import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let source=await readFile(new URL('../src/lib/llm/smartapi.ts',import.meta.url),'utf8');
source=source.replace('import { getModel } from "../models";','const getModel = () => null;')
 .replace('import { DESIGN_MODE_SYSTEM } from "../designMode";','const DESIGN_MODE_SYSTEM = "design";')
 .replace('import { betaAuthEnabled, supabase } from "../../auth/client";','const betaAuthEnabled = false; const supabase = null;');
for(const [specifier,path] of [['../types','../src/lib/types.ts'],['../utils','../src/lib/utils.ts'],['../studyPlan','../src/lib/studyPlan.ts'],['./uiPrompt','../src/lib/llm/uiPrompt.ts'],['../../auth/accountStorage','../src/auth/accountStorage.ts']]) {
 source=source.replaceAll(`from "${specifier}"`,`from ${JSON.stringify(new URL(path,import.meta.url).href)}`);
}
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const { buildChatPayload }=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('prompt optimization preserves 100 turns, project instructions and user memory',()=>{
 const history=Array.from({length:200},(_,i)=>({role:i%2?'assistant':'user',content:`Constraint ${i}`,status:'done'}));
 const payload=buildChatPayload('home',history,'Project constraint: no libraries',['User prefers concise replies']);
 assert.equal(payload.length,201);
 assert.deepEqual(payload.slice(1).map(m=>m.content),history.map(m=>m.content));
 assert.ok(payload[0].content.includes('Project constraint: no libraries'));
 assert.ok(payload[0].content.includes('User prefers concise replies'));
});
test('compact system text retains native schemas and clarification policy',()=>{
 const payload=buildChatPayload('home',[{role:'user',content:'Hello',status:'done'}]);
 assert.ok(payload[0].content.length<7000);
 for(const type of ['calculator','diagram','study_plan','questionnaire']) assert.ok(payload[0].content.includes(type));
});
