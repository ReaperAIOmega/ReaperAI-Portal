import {test} from 'node:test';import assert from 'node:assert/strict';import {runClientAcceptance,stagingFixture as f} from '../staging-acceptance.mjs';
const runtime={staging:true,url:'https://qemjnekgcbuddayzhdtr.supabase.co'};
function client(id=f.ownerA,{suspended=false,leak=false,unavailable=false}={}){let calls=0;const owned=id===f.ownerA&&!suspended;return{get calls(){return calls;},auth:{getUser:async()=>({data:{user:{id}}})},from(table){calls++;return{select(){return this;},eq:async()=>unavailable?{error:{code:'08006'}}:{data:table==='funding_readiness_assessments'?[]:(owned||leak?[table==='cases'?{id:f.caseA,client_id:f.clientA,business_entity_id:f.entityA}:{id:f.entityA,client_id:f.clientA}]:[])}};},rpc:async()=>{calls++;return{error:{code:'42501'}};}};}
test('active owner, unrelated signed client and suspended owner have distinct expected row scopes',async()=>{
 for(const [id,options,mode]of [[f.ownerA,{},'active'],[f.ownerB,{},'active'],[f.ownerA,{suspended:true},'suspended']])assert.equal((await runClientAcceptance(client(id,options),runtime,mode)).passed,true);
});
test('cross-client leaks or unavailable queries never become passing isolation evidence',async()=>{
 assert.equal((await runClientAcceptance(client(f.ownerB,{leak:true}),runtime)).passed,false);
 assert.equal((await runClientAcceptance(client(f.ownerA,{unavailable:true}),runtime)).passed,false);
});
test('wrong environment, unknown principal and unapproved suspension target stop before reads',async()=>{
 for(const [c,config,mode]of [[client(),{...runtime,staging:false},'active'],[client('not-designated'),runtime,'active'],[client(f.ownerB),runtime,'suspended']]){await assert.rejects(runClientAcceptance(c,config,mode));assert.equal(c.calls,0);}
});

import {runArtifactRetrievalAcceptance} from '../staging-acceptance.mjs';
test('artifact acceptance requires the named stage and designated signed principal',async()=>{
 let invokes=0;const s={auth:{getUser:async()=>({data:{user:{id:'unknown'}}})},functions:{invoke:async()=>{invokes++;}}};
 await assert.rejects(runArtifactRetrievalAcceptance(s,{...runtime,staging:false},'expect_denied'));
 await assert.rejects(runArtifactRetrievalAcceptance(s,runtime,'expect_denied'));assert.equal(invokes,0);
});
test('HTTP errors without canonical 403 rejection cannot count as artifact isolation',async()=>{
 for(const [status,error]of [[401,'authentication_required'],[503,'retrieval_outcome_unknown_retry'],[403,'origin_not_allowed']]){
  const s={auth:{getUser:async()=>({data:{user:{id:f.ownerB}}})},functions:{invoke:async()=>({error:{context:{status,json:async()=>({error})}}})}};
  await assert.rejects(runArtifactRetrievalAcceptance(s,runtime,'expect_denied'),/not verified/);
 }
});
