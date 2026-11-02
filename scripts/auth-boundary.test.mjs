import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolveRuntime} from '../runtime-config.mjs';
const source=(await readFile(new URL('../auth-guard.js',import.meta.url),'utf8')).replace(/^import [^\r\n]*\r?\n/gm,'');
async function boot({email='reaper-synthetic-client-a-20261028@example.invalid',status='active',security={password_initialized:true},securityError=null}={}){
 const calls=[];const doc={title:'Synthetic',documentElement:{style:{visibility:'hidden'}},dispatchEvent(){calls.push('ready');},addEventListener(){}};
 const session={user:{id:'fixture-id',email}};
 const client={auth:{getSession:async()=>({data:{session}}),signOut:async()=>{calls.push('signOut');}},from(table){calls.push(table);return{select(){return this;},eq(){return this;},single:async()=>table==='profiles'?{data:{id:'fixture-id',email,role:'client',status}}:{data:security,error:securityError}};}};
 const window={location:{href:'http://127.0.0.1:4173/dashboard.html',hash:'',replace(){calls.push('redirect');}},history:{replaceState(){}},reaperAuth:null};
 await vm.runInNewContext('(async()=>{'+source+'})()',{window,document:doc,resolveRuntime,createClient:()=>client,CustomEvent:class{},console:{error(){}}});
 return{calls,doc,window};
}
test('uninitialized or failed account security never reveals Portal or dispatches ready',async()=>{
 for(const options of [{security:{password_initialized:false}},{security:null},{securityError:Error('fixture failure')}]){
 const r=await boot(options);assert.ok(r.calls.includes('signOut'));assert.ok(r.calls.includes('redirect'));assert.ok(!r.calls.includes('ready'));assert.equal(r.window.reaperAuth,null);assert.equal(r.doc.documentElement.style.visibility,'hidden');
 }
});
test('persisted disallowed identities and suspended profiles stop before ready',async()=>{
 const r=await boot({email:'ordinary@example.com'});assert.ok(r.calls.includes('signOut'));assert.ok(!r.calls.includes('profiles'));assert.ok(!r.calls.includes('ready'));
 const suspended=await boot({status:'suspended'});assert.ok(!suspended.calls.includes('ready'));assert.equal(suspended.window.reaperAuth,null);
});
test('active approved synthetic owner with initialized security reaches existing Portal',async()=>{
 const r=await boot();assert.ok(r.calls.includes('ready'));assert.equal(r.doc.documentElement.style.visibility,'visible');assert.equal(r.window.reaperAuth.profile.role,'client');
});
