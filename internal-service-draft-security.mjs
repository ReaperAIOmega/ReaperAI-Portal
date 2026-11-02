export async function checkInternalServiceDraftIsolation(s,runtime){
 if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Isolated staging only');
 const who=await s.auth.getUser(),id=who.data?.user?.id;
 if(who.error||!['78dfaec9-27a6-48c3-a1cf-a1a63ecabb71','b4dd0968-e4f5-4ffc-812d-1f6f824d26cf'].includes(id))throw Error('Designated fictional signed client required');
 const checks={};
 for(const table of['quotes','service_agreements','payments']){
  const r=await s.from(table).select('id,status').eq('case_id','e458aa3b-7cd5-4e97-a16f-c6427f54e2ad');
  checks[table+'_internal_draft_hidden']=!r.error&&Array.isArray(r.data)&&r.data.length===0;
 }
 return{kind:'SIGNED_HTTP_INTERNAL_SERVICE_DRAFT_ISOLATION',principal_id:id,checks,passed:Object.values(checks).every(Boolean),observed_at:new Date().toISOString(),limitations:['Requires separate administrator/database evidence that the named case has exactly one draft quote/agreement/payment. No agreement acceptance, payment processing, receipt or delivery is inferred.']};
}
