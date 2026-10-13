import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the actual class in memory; no generated test files or app stubs.
const source = (await readFile(new URL('../src/conversation/ConversationEngine.ts',import.meta.url),'utf8'))
  .replace('"../lib/utils"', JSON.stringify(new URL('../src/lib/utils.ts',import.meta.url).href));
const compiled = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const { ConversationEngine } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture(failSave = false) {
  const messages = [];
  const conversations = [{id:'chat',title:'Existing',active_leaf_id:null}];
  let saves = 0;
  const repository = {
    listConversations: async () => conversations,
    listMessages: async () => messages.map(m=>({...m})),
    insertMessage: async (_,m) => { messages.push({...m}); },
    setActiveLeaf: async (_,__,id) => { conversations[0].active_leaf_id=id; },
    updateMessage: async (_,id,content,status) => {
      saves++; if (failSave) throw new Error('offline');
      Object.assign(messages.find(m=>m.id===id),{content,status});
    },
    recordUsage: async () => {},
  };
  let callbacks;
  const generator = { stream: async (_,c) => { callbacks=c; c.onToken('Useful partial answer'); } };
  let id=0;
  const engine = new ConversationEngine(repository,generator,()=>String(++id),()=>1);
  return {engine,repository,messages,get callbacks(){return callbacks;},get saves(){return saves;}};
}
async function begin(f) {
  const pending = f.engine.send({scope:'home',conversationId:'chat',content:'Hello',modelId:'model',generation:{}});
  while (!f.callbacks) await new Promise(resolve=>setImmediate(resolve));
  return { pending };
}
test('failed save settles generation and preserves the answer in memory', async () => {
  const f=fixture(true); const {pending}=await begin(f);
  f.callbacks.onDone();
  const result=await pending;
  assert.equal(f.engine.getState().streaming,false);
  assert.match(result.error.message,/Скопируйте/);
  assert.equal(f.engine.getState().messages.at(-1).content,'Useful partial answer');
});
test('duplicate completion callbacks save only once', async () => {
  const f=fixture(); const {pending}=await begin(f);
  f.callbacks.onDone(); f.callbacks.onError(new Error('late error'));
  await pending; assert.equal(f.saves,1);
});
test('network failure preserves partial output instead of replacing it with error text', async () => {
  const f=fixture(); const {pending}=await begin(f);
  f.callbacks.onError(new Error('network disconnected'));
  const result=await pending;
  assert.equal(result.assistantMessage.content,'Useful partial answer');
  assert.equal(f.messages.at(-1).status,'error');
});
test('slow chat selection cannot override a newer selection or new chat', async () => {
  const f=fixture(); let release;
  f.repository.listMessages=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.engine.select('home','chat');
  f.engine.startNew(); release([]); await pending;
  assert.equal(f.engine.getState().activeConversationId,null);
});
test('switching to a new chat does not discard output or reopen the generating chat', async () => {
  const f=fixture(); const {pending}=await begin(f);
  f.engine.startNew(); f.callbacks.onToken(' continued'); f.callbacks.onDone();
  await pending;
  assert.equal(f.messages.at(-1).content,'Useful partial answer continued');
  assert.equal(f.engine.getState().activeConversationId,null);
});
