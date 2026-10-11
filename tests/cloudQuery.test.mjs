import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCloudQuery } from '../src/db/cloudQuery.ts';

test('all current repository statements have an explicit cloud translation', () => {
  const source = readFileSync(new URL('../src/db/index.ts',import.meta.url),'utf8');
  const statements = [...source.matchAll(/(?:db\.execute|db\.select(?:<[^;]*?>)?)\(\s*[`"]([^`"]+)[`"]/g)];
  assert.ok(statements.length > 25);
  for (const match of statements) {
    const sql = match[1].replace('${limit}','200');
    const count = Math.max(0,...[...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])));
    const plan = parseCloudQuery(sql,Array.from({length:count},(_,i)=>`value-${i}`));
    if (/^ALTER TABLE/i.test(sql)) assert.equal(plan,null);
    else assert.ok(plan,sql);
  }
});
test('cloud bridge rejects unsafe or unsupported statements', () => {
  for (const sql of ['DELETE FROM messages','SELECT * FROM auth_users','SELECT * FROM messages WHERE user_id=$1','UPDATE messages SET scope=$1 WHERE id=$2','SELECT * FROM messages; DELETE FROM messages']) {
    assert.throws(()=>parseCloudQuery(sql,['a','b']),sql);
  }
  assert.throws(()=>parseCloudQuery('UPDATE messages SET content=$1 WHERE id=$2',['a']));
});
test('writes preserve parameters; selects preserve ordering and limits', () => {
  assert.deepEqual(parseCloudQuery('UPDATE messages SET content=$1, status=$2 WHERE id=$3',["O\'Brien",'done','id']).values,{content:"O\'Brien",status:'done'});
  const read=parseCloudQuery('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',['chat']);
  assert.deepEqual(read.filter,{column:'conversation_id',value:'chat'});
  assert.equal(read.order.ascending,true);
  assert.equal(parseCloudQuery('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 200').limit,200);
});
