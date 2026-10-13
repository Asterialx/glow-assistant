import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageCollector,reservationFor } from '../api/tokenUsage.js';

test('actual usage survives split SSE chunks and an unterminated final line',()=>{
 const c=createUsageCollector();
 const bytes=Buffer.from('data: {"choices":[{"delta":{"content":"Привет"}}]}\r\n\r\ndata: {"usage":{"prompt_tokens":120,"completion_tokens":13,"total_tokens":133}}');
 for(let i=0;i<bytes.length;i+=7) c.push(bytes.subarray(i,i+7));
 assert.deepEqual(c.finish(),{input:120,output:13,total:133});
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
