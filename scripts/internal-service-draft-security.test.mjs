import test from'node:test';import assert from'node:assert/strict';import{checkInternalServiceDraftIsolation as check}from'../internal-service-draft-security.mjs';
const rt={staging:true,url:'https://qemjnekgcbuddayzhdtr.supabase.co'},a='78dfaec9-27a6-48c3-a1cf-a1a63ecabb71';
const fixture=r=>({auth:{getUser:async()=>({data:{user:{id:a}}})},from:()=>({select:()=>({eq:async()=>r})})});
test('internal draft absence requires successful signed reads; leaked rows and transport errors fail',async()=>{assert.equal((await check(fixture({data:[]}),rt)).passed,true);for(const r of[{data:[{id:'leak',status:'draft'}]},{error:{message:'network'}},{data:null}])assert.equal((await check(fixture(r),rt)).passed,false);await assert.rejects(check(fixture({data:[]}),{...rt,staging:false}));});
