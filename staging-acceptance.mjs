// Read/denial checks only. Uses existing signed SDK session, never reads or exports tokens.
export const stagingFixture=Object.freeze({ownerA:'78dfaec9-27a6-48c3-a1cf-a1a63ecabb71',ownerB:'b4dd0968-e4f5-4ffc-812d-1f6f824d26cf',clientA:'b886bc64-e931-46df-8451-e8ae08de46e8',entityA:'5eb18004-6373-4e77-9b51-ef55f5faaf1d',caseA:'f2ca9f07-ea33-4f7f-8351-c18f3cc43916',assessmentA:'45d38b72-c8fc-4861-aaab-e46e2f679d2d',taskA:'70a2c51e-8c22-400b-a349-4b07629f413a'});
export async function runClientAcceptance(supabase,runtime,mode='active'){
 if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co'||!['active','suspended'].includes(mode))throw Error('Isolated synthetic staging only');
 const {data:who,error}=await supabase.auth.getUser();const id=who?.user?.id;
 if(error||![stagingFixture.ownerA,stagingFixture.ownerB].includes(id))throw Error('Designated signed fictional client required');
 if(mode==='suspended'&&id!==stagingFixture.ownerA)throw Error('Only designated client A suspension is in scope');
 const [entity,caseRows,assessment,context]=await Promise.all([
  supabase.from('business_entities').select('id,client_id').eq('id',stagingFixture.entityA),
  supabase.from('cases').select('id,client_id,business_entity_id').eq('id',stagingFixture.caseA),
  supabase.from('funding_readiness_assessments').select('id').eq('id',stagingFixture.assessmentA),
  supabase.rpc('read_funding_task_context',{p_task_id:stagingFixture.taskA})]);
 const own=id===stagingFixture.ownerA&&mode==='active';
 const visible=(r,n)=>!r.error&&Array.isArray(r.data)&&r.data.length===n;
 const checks={entity_scope:visible(entity,own?1:0)&&(!own||(entity.data[0].id===stagingFixture.entityA&&entity.data[0].client_id===stagingFixture.clientA)),case_scope:visible(caseRows,own?1:0)&&(!own||(caseRows.data[0].id===stagingFixture.caseA&&caseRows.data[0].client_id===stagingFixture.clientA&&caseRows.data[0].business_entity_id===stagingFixture.entityA)),internal_readiness_draft_hidden:visible(assessment,0),administrator_context_denied:context.error?.code==='42501'};
 return {kind:'SIGNED_HTTP_CLIENT_ISOLATION',principal_id:id,expected_mode:mode,checks,passed:Object.values(checks).every(Boolean),observed_at:new Date().toISOString(),limitations:['No document delivery or financial qualification is inferred.','Suspended checks must run in the existing signed session; a generic transport failure never counts as row isolation.']};
}

import {retrieveFundingArtifact} from './funding-artifact-download.mjs';
export const stagingArtifacts=Object.freeze({pdf:{id:'d321cdb9-2a06-4da0-99f1-6b07b1f27f54',sha256:'28c02f037421ef4836c9ac6fae074edcfdcc409a049f8a9f2952132049bf1969',bytes:12338},xlsx:{id:'ae5853e8-cabd-47e6-9383-671fa3a73c17',sha256:'bec75fc56ccba2eb907c13d1aa385e8a67dcd26750666ecec42ca25995a32596',bytes:15861}});
export async function runArtifactRetrievalAcceptance(s,runtime,mode){
 if(runtime.staging!==true||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co'||!['expect_denied','retrieve'].includes(mode))throw Error('Isolated synthetic retrieval only');
 const auth=await s.auth.getUser(),id=auth.data?.user?.id;
 if(auth.error||!['78dfaec9-27a6-48c3-a1cf-a1a63ecabb71','b4dd0968-e4f5-4ffc-812d-1f6f824d26cf'].includes(id))throw Error('Designated signed synthetic client required');
 if(mode==='retrieve'&&id!=='78dfaec9-27a6-48c3-a1cf-a1a63ecabb71')throw Error('Only the designated owner can request the positive acceptance path');
 const checks=[],downloads=[];
 for(const [kind,f]of Object.entries(stagingArtifacts)){
  if(mode==='expect_denied'){
   const r=await s.functions.invoke('retrieve-funding-artifact',{method:'POST',headers:{'x-artifact-id':f.id}});
   let detail;try{detail=await r.error?.context?.json();}catch{}
   if(!r.error||r.error.context?.status!==403||detail?.error!=='canonical_request_rejected')throw Error('Signed canonical denial was not verified');
   checks.push({kind,artifact_id:f.id,denied:true,status:403,error:detail.error});
  }else{
   const r=await retrieveFundingArtifact(s,f.id,{enabled:true});
   if(r.sha256!==f.sha256||r.blob.size!==f.bytes)throw Error('Retrieved version differs from independent source package');
   checks.push({kind,artifact_id:f.id,bytes:r.blob.size,sha256:r.sha256,verified:true,receipt_expires_at:r.receiptExpiresAt});
   downloads.push({kind,blob:r.blob,fileName:r.fileName});
  }
 }
 return {report:{observed_at:new Date().toISOString(),principal_id:id,signed_http:true,mode,checks,acknowledgment_sent:false,delivery_claimed:false},downloads};
}
