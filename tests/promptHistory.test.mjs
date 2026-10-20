import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const filePromptUrl = new URL('../src/lib/generatedFile.ts', import.meta.url).href;

let source=await readFile(new URL('../src/lib/llm/smartapi.ts',import.meta.url),'utf8');
source=source.replace('import { getModel } from "../models";','const getModel = () => null;')
 .replace('import { DESIGN_MODE_SYSTEM } from "../designMode";','const DESIGN_MODE_SYSTEM = "design";')
 .replace('import { betaAuthEnabled, supabase } from "../../auth/client";','const betaAuthEnabled = false; const supabase = null;')
 .replace('import { messagesFitTransport } from "../../../api/messageValidation.js";','const messagesFitTransport = () => true;')
 .replace('import { WORKSPACE_TOOL_DEFINITIONS } from "../workspaceTools";','const WORKSPACE_TOOL_DEFINITIONS = [];');
for(const [specifier,path] of [['../attachments','../src/lib/attachments.ts'],['../../../api/researchPolicy.js','../api/researchPolicy.js'],['../types','../src/lib/types.ts'],['../utils','../src/lib/utils.ts'],['../studyPlan','../src/lib/studyPlan.ts'],['./uiPrompt','../src/lib/llm/uiPrompt.ts'],['../../auth/accountStorage','../src/auth/accountStorage.ts']]) {
 source=source.replaceAll(`from "${specifier}"`,`from ${JSON.stringify(new URL(path,import.meta.url).href)}`);
}
source=source.replace('import { appendSearchSources } from "../searchSources";', `const appendSearchSources = (content, sources) => sources.length ? content + "\\n\\n" + JSON.stringify(sources) : content;`)
 .replace('import { splitSearchSources } from "../searchSources";', 'const splitSearchSources = content => ({ text: content, sources: [] });');
source=source.replace('from "../generatedFile"', `from ${JSON.stringify(filePromptUrl)}`);
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const { buildChatPayload }=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('Plan overrides file creation requests and leaves the generated-file contract out',()=>{
 const payload=buildChatPayload('code',[{role:'user',content:'Создай Word документ',status:'done'}],'',[],false,undefined,false,false,true);
 assert.match(payload[0].content,/PLAN MODE/);
 assert.match(payload[0].content,/Do not implement/);
 assert.ok(!payload[0].content.includes('glow-file/v1'));
});

test('images become actual vision parts and attached document text stays in model context',()=>{
 const content='Read files\n\n```glow-attachments\n'+JSON.stringify([{name:'sample.png',image:'data:image/jpeg;base64,YWJj'},{name:'table.xlsx',text:'Patients: 42'}])+'\n```';
 const payload=buildChatPayload('home',[{role:'user',content,status:'done'}]);
 assert.ok(payload[1].content.some(part=>part.type === 'image_url'));
 assert.match(payload[1].content[0].text,/Patients: 42/);
 assert.ok(!payload[1].content[0].text.includes('YWJj'));
});

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
