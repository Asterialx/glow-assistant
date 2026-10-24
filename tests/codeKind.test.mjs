import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationKind, idPrefixFor, parseCodeKind, DEV_ID_PREFIX } from '../src/lib/codeKind.ts';

test('chats belong to Code only when their id carries the Code prefix', () => {
  assert.equal(conversationKind(`${DEV_ID_PREFIX}7c1e`), 'dev');
  for (const id of ['7c1e', 'chat', '', 'dev', 'xdev_1', 'DEV_1']) assert.equal(conversationKind(id), 'work', id);
});

test('a new chat id is prefixed for Code and left as it was for Work, so old chats stay in Work', () => {
  assert.equal(idPrefixFor('dev'), DEV_ID_PREFIX);
  assert.equal(idPrefixFor('work'), '');
  assert.equal(conversationKind(`${idPrefixFor('dev')}abc`), 'dev');
  assert.equal(conversationKind(`${idPrefixFor('work')}abc`), 'work');
});

test('only the exact stored value switches to Code; anything else is Work', () => {
  assert.equal(parseCodeKind('dev'), 'dev');
  for (const value of ['work', '', null, undefined, 'code', 'DEV', 1, {}]) assert.equal(parseCodeKind(value), 'work', String(value));
});
