import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageCollector,reservationFor } from '../api/tokenUsage.js';

test('reserves an agent continuation containing null assistant content and tool results', () => {
 const calls = [{ id: 'call_1', type: 'function', function: { name: 'workspace_list_files', arguments: '{}' } }];
 const messages = [{ role: 'assistant', content: null, tool_calls: calls }, { role: 'tool', tool_call_id: 'call_1', content: '{"files":[]}' }];
 assert.equal(reservationFor(messages, 2048), 256 + 128 + Buffer.byteLength(JSON.stringify(calls), 'utf8') + Buffer.byteLength(messages[1].content, 'utf8') + 2048);
});

test('actual usage survives split SSE chunks and an unterminated final line',()=>{
 const c=createUsageCollector();
 const bytes=Buffer.from('data: {"choices":[{"delta":{"content":"Привет"}}]}\r\n\r\ndata: {"usage":{"prompt_tokens":120,"completion_tokens":13,"total_tokens":133}}');
 for(let i=0;i<bytes.length;i+=7) c.push(bytes.subarray(i,i+7));
 assert.deepEqual(c.finish(),{input:120,output:13,total:133,costUsd:null,cacheReadTokens:null,cacheWriteTokens:null});
});
test('provider cost is preserved without guessing missing prices',()=>{
 for(const [cost,expected] of [[0,0],[0.00123,0.00123],[-1,null],['0.01',null],[null,null]]) {
  const c=createUsageCollector(); c.push(Buffer.from(`data: ${JSON.stringify({usage:{prompt_tokens:1,completion_tokens:2,total_tokens:3,cost}})}\n`));
  assert.equal(c.finish().costUsd,expected);
 }
});
test('missing or invalid usage is not silently estimated',()=>{
 for(const u of [null,{prompt_tokens:1,completion_tokens:2,total_tokens:4},{prompt_tokens:-1,completion_tokens:2,total_tokens:1},{prompt_tokens:1.5,completion_tokens:2,total_tokens:3.5}]) {
  const c=createUsageCollector(); c.push(Buffer.from(`data: ${JSON.stringify({usage:u})}\ndata: [DONE]\n`));
  assert.equal(c.finish(),null);
 }
});
test('reservation is separate from the real provider usage and includes UTF8 history',()=>{
 assert.equal(reservationFor([{content:'Привет'}],1024),256+64+12+1024);
});
