import test from 'node:test';
import assert from 'node:assert/strict';
import { splitAttachments, attachToMessage, preserveAttachments } from '../src/lib/attachments.ts';
import { validMessages } from '../api/messageValidation.js';
import { reservationFor } from '../api/tokenUsage.js';
test('file content survives persistence and editing without becoming visible message text',()=>{
  const files=[{name:'table.xlsx',text:'Patients: 42'},{name:'photo.jpg',image:'data:image/jpeg;base64,YWJj'}];
  const saved=attachToMessage('Explain these files',files);
  assert.deepEqual(splitAttachments(saved),{text:'Explain these files',files});
  assert.deepEqual(splitAttachments(preserveAttachments(saved,'Follow-up')),{text:'Follow-up',files});
  assert.equal(splitAttachments(saved).text.includes('Patients'),false);
});
test('backend accepts bounded image inputs and refuses remote URLs and active formats',()=>{
  const parts=[{type:'text',text:'Read image'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,YWJj'}}];
  assert.equal(validMessages([{role:'user',content:parts}]),true);
  assert.equal(validMessages([{role:'system',content:parts}]),false);
  for(const url of ['https://internal.example/photo.png','data:image/svg+xml;base64,YWJj','data:text/html;base64,YWJj']) assert.equal(validMessages([{role:'user',content:[{type:'image_url',image_url:{url}}]}]),false);
  assert.equal(validMessages([{role:'user',content:[{type:'text',text:'x'.repeat(200001)}]}]),false);
  assert.ok(reservationFor([{role:'user',content:parts}],1000)>10000);
});
