import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotifyReply } from '../src/lib/notificationPolicy.ts';
test('notifications require opt-in, permission, background and successful completion',()=>{
  assert.equal(shouldNotifyReply(true,'granted',true,'done'),true);
  for(const args of [[false,'granted',true,'done'],[true,'denied',true,'done'],[true,'default',true,'done'],[true,'granted',false,'done'],[true,'granted',true,'error']]) assert.equal(shouldNotifyReply(...args),false);
});
