import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const source = ts.transpileModule(readFileSync(new URL('../src/auth/emailCooldown.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const cooldown = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('email cooldown survives reload, normalizes email and expires after one minute',()=>{
 const oldStorage=globalThis.localStorage, oldNow=Date.now; const map=new Map();let now=1000;
 globalThis.localStorage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};Date.now=()=>now;
 try{assert.equal(cooldown.emailCooldown('Tester@example.com'),0);assert.equal(cooldown.beginEmailCooldown(' Tester@example.com '),61000);
 assert.equal(cooldown.emailCooldown('tester@EXAMPLE.com'),61000);assert.equal(cooldown.emailCooldown('other@example.com'),0);
 now=61000;assert.equal(cooldown.emailCooldown('tester@example.com'),0);
 }finally{Date.now=oldNow;globalThis.localStorage=oldStorage;}
});
test('unavailable storage does not break login and server remains responsible for limits',()=>{
 const oldStorage=globalThis.localStorage;globalThis.localStorage={getItem(){throw new Error('disabled');},setItem(){throw new Error('disabled');}};
 try{assert.equal(cooldown.emailCooldown('tester@example.com'),0);assert.ok(cooldown.beginEmailCooldown('tester@example.com')>Date.now());}
 finally{globalThis.localStorage=oldStorage;}
});
