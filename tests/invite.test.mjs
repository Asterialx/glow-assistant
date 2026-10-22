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
  if(path.includes('/auth/v1/admin/users/'))return Response.json({id:'00000000-0000-0000-0000-000000000002',email:'tester@example.com',email_confirmed_at:options.confirmed?'2026-10-13':null});
  if(path.includes('/rest/v1/glow_invites'))return Response.json({claimed_by:options.claimed?'00000000-0000-0000-0000-000000000002':null,expires_at:'2030-01-01'});
  if(path.includes('/auth/v1/otp'))return Response.json({});
  if(path.includes('/auth/v1/user'))return Response.json({id:'00000000-0000-0000-0000-000000000001',email_confirmed_at:'2026-10-13'});
  if(path.includes('/rest/v1/glow_access'))return Response.json({role:options.role||'admin',active:options.inactive && path.includes('00000000-0000-0000-0000-000000000002')?false:true});
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
 res=response();await handler(request({email:'tester@example.com',credits:10000001}),res);assert.equal(res.code,400);assert.ok(!calls.some(c=>c.path.includes('/invite')));
}));
test('invite prepares allowance before email and redirects only to current site',async()=>scenario({},async calls=>{
 const res=response();await handler(request(),res);assert.equal(res.code,200);
 const prepared=calls.findIndex(c=>c.path.includes('glow_admin_invite')), mail=calls.findIndex(c=>c.path.includes('/auth/v1/invite'));
 assert.ok(prepared>=0&&mail>prepared);assert.equal(JSON.parse(calls[mail].body).data,undefined);
 assert.ok(calls[mail].path.includes('redirect_to=https%3A%2F%2Fglowai-ashy.vercel.app'));assert.ok(!JSON.stringify(res.body).includes('private-test'));
}));
test('existing account does not trigger an invitation email',async()=>scenario({prepareError:true},async calls=>{
 const res=response();await handler(request(),res);assert.equal(res.code,409);assert.ok(!calls.some(c=>c.path.includes('/auth/v1/invite')));
}));
test('mail failures and rate limits preserve an honest pending status',async()=>{
 for(const deliveryError of ['unexpected_failure','over_email_send_rate_limit'])await scenario({deliveryError},async()=>{
 const res=response();await handler(request(),res);assert.equal(res.code,deliveryError==='over_email_send_rate_limit'?429:502);assert.match(res.body.message,/сохранено/);
 });
});

test('resend uses existing allowance and public site for unconfirmed invitations',async()=>scenario({claimed:true},async calls=>{
 const res=response();await handler(request({email:'tester@example.com',action:'resend'}),res);assert.equal(res.code,200);
 assert.ok(!calls.some(c=>c.path.includes('glow_admin_invite')));
 assert.ok(calls.some(c=>c.path.includes('/auth/v1/invite')));
}));
test('confirmed users receive a login link without creating users or changing limits',async()=>scenario({claimed:true,confirmed:true},async calls=>{
 const res=response();await handler(request({email:'tester@example.com',action:'resend'}),res);assert.equal(res.code,200);
 const otp=calls.find(c=>c.path.includes('/auth/v1/otp'));assert.ok(otp);assert.equal(JSON.parse(otp.body).create_user,false);
 assert.ok(otp.path.includes('glowai-ashy.vercel.app'));assert.ok(!calls.some(c=>c.path.includes('glow_admin_invite')));
}));
test('resend refuses blocked accounts before sending',async()=>scenario({claimed:true,inactive:true},async calls=>{
 const res=response();await handler(request({email:'tester@example.com',action:'resend'}),res);assert.equal(res.code,403);
 assert.ok(!calls.some(c=>c.path.includes('/auth/v1/invite')||c.path.includes('/auth/v1/otp')));
}));
