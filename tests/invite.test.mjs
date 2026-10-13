import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/invite.js';
const envNames = ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'];
function response() { return { setHeader(){}, status(code){this.code=code;return this;}, json(body){this.body=body;return this;} }; }
async function scenario(options, run) {
 const saved=Object.fromEntries(envNames.map(k=>[k,process.env[k]])), original=globalThis.fetch, calls=[];
 Object.assign(process.env,{VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test'});
 globalThis.fetch=async(url,init)=>{
  const path=String(url);calls.push({path,body:init?.body});
  if(path.includes('/auth/v1/user'))return Response.json({id:'00000000-0000-0000-0000-000000000001',email_confirmed_at:'2026-10-13'});
  if(path.includes('/rest/v1/glow_access'))return Response.json({role:options.role||'admin',active:true});
  if(path.includes('/rest/v1/rpc/glow_admin_invite'))return options.prepareError ? Response.json({message:'Account already exists'}, {status:400}) : Response.json(null);
  if(path.includes('/auth/v1/invite'))return options.deliveryError ? Response.json({msg:'Mail error',code:options.deliveryError}, {status:options.deliveryError==='over_email_send_rate_limit'?429:500}) : Response.json({id:'00000000-0000-0000-0000-000000000002'});
  throw new Error('Unexpected call');
 };
 try { await run(calls); } finally {globalThis.fetch=original;for(const k of envNames){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}
const request=(body={email:'tester@example.com',credits:1000000})=>({method:'POST',headers:{authorization:'Bearer session-test',host:'glow.example.com',origin:'https://glow.example.com'},body});
test('invites refuse anonymous and non-admin requests before sending mail',async()=>scenario({role:'member'},async calls=>{
 let res=response();await handler({...request(),headers:{host:'glow.example.com'}},res);assert.equal(res.code,401);assert.equal(calls.length,0);
 res=response();await handler(request(),res);assert.equal(res.code,403);assert.ok(!calls.some(c=>c.path.includes('/invite')));
}));
test('invites reject invalid limits and cross-origin requests',async()=>scenario({},async calls=>{
 let res=response();await handler({...request(),headers:{...request().headers,origin:'https://evil.example'}},res);assert.equal(res.code,403);assert.equal(calls.length,0);
 res=response();await handler(request({email:'tester@example.com',credits:1000001}),res);assert.equal(res.code,400);assert.ok(!calls.some(c=>c.path.includes('/invite')));
}));
test('invite prepares allowance before email and redirects only to current site',async()=>scenario({},async calls=>{
 const res=response();await handler(request(),res);assert.equal(res.code,200);
 const prepared=calls.findIndex(c=>c.path.includes('glow_admin_invite')), mail=calls.findIndex(c=>c.path.includes('/auth/v1/invite'));
 assert.ok(prepared>=0&&mail>prepared);assert.equal(JSON.parse(calls[mail].body).data,undefined);
 assert.ok(calls[mail].path.includes('redirect_to=https%3A%2F%2Fglow.example.com'));assert.ok(!JSON.stringify(res.body).includes('private-test'));
}));
test('existing account does not trigger an invitation email',async()=>scenario({prepareError:true},async calls=>{
 const res=response();await handler(request(),res);assert.equal(res.code,409);assert.ok(!calls.some(c=>c.path.includes('/auth/v1/invite')));
}));
test('mail failures and rate limits preserve an honest pending status',async()=>{
 for(const deliveryError of ['unexpected_failure','over_email_send_rate_limit'])await scenario({deliveryError},async()=>{
 const res=response();await handler(request(),res);assert.equal(res.code,deliveryError==='over_email_send_rate_limit'?429:502);assert.match(res.body.message,/сохранено/);
 });
});
