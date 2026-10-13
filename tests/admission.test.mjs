import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { admitRequest, waitForDrain } from '../api/admission.js';

test('admission passes only explicitly accepted requests', async () => {
  assert.equal(await admitRequest({ rpc: async () => ({ data: 'accepted' }) }, 'user', 'request'), null);
  for (const [data,status] of [['credits',429],['rate',429],['budget',429],['inactive',403],['concurrent',409],['disabled',503],['unknown',503]]) {
    assert.equal((await admitRequest({ rpc: async () => ({ data }) }, 'user', 'request')).status, status);
  }
});
test('budget database failure fails closed without exposing database details', async () => {
  const rejected = await admitRequest({ rpc: async () => ({ error: { message: 'private database details' } }) }, 'u', 'r');
  assert.equal(rejected.status,503);
  assert.ok(!rejected.message.includes('private'));
});
test('stream backpressure releases listeners on drain, disconnect, error or already closed socket', async () => {
  for (const event of ['drain','close','error']) {
    const socket = new EventEmitter();
    const pending = waitForDrain(socket);
    socket.emit(event);
    await pending;
    assert.deepEqual(socket.eventNames(),[]);
  }
  const socket = new EventEmitter(); socket.destroyed = true;
  await waitForDrain(socket);
  assert.deepEqual(socket.eventNames(),[]);
});
