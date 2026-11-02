// New intake capability only. No artifact retrieval or previous MFA campaign.
export async function checkExistingIntakeIsolation(s,runtime){
 if(!runtime.staging||runtime.url!=='https://qemjnekgcbuddayzhdtr.supabase.co')throw Error('Isolated staging only');
 const who=await s.auth.getUser(),principal=who.data?.user?.id;
 const a='78dfaec9-27a6-48c3-a1cf-a1a63ecabb71',b='b4dd0968-e4f5-4ffc-812d-1f6f824d26cf';
 if(who.error||![a,b].includes(principal))throw Error('Existing fictional signed client required');
 const request={client_id:'b886bc64-e931-46df-8451-e8ae08de46e8',business_entity_id:'5eb18004-6373-4e77-9b51-ef55f5faaf1d',case_id:null,expected_entity_revision:1,expected_case_revision:0,use_of_funds:'Synthetic client-role denial probe',amount_requested:null,time_horizon:'',repayment_source:null,underwriting:{}};
 const [reader,link,rows]=await Promise.all([s.rpc('read_existing_funding_intakes'),s.rpc('link_existing_funding_intake',{p_key:crypto.randomUUID(),p_intake_id:'9499b417-2124-4960-8ceb-ec211e84dc10',p_funding_request:request}),s.from('cases').select('id,client_id,business_entity_id').eq('id','e458aa3b-7cd5-4e97-a16f-c6427f54e2ad')]);
 const own=principal===a,checks={intake_reader_denied:reader.error?.code==='42501',intake_link_denied:link.error?.code==='42501',new_case_scope:!rows.error&&Array.isArray(rows.data)&&rows.data.length===(own?1:0)&&(!own||(rows.data[0].client_id===request.client_id&&rows.data[0].business_entity_id===request.business_entity_id))};
 return{kind:'SIGNED_HTTP_NEW_INTAKE_ISOLATION',principal_id:principal,checks,passed:Object.values(checks).every(Boolean),observed_at:new Date().toISOString(),limitations:['No payment, approval, delivery, account creation or financial qualification. Transport failure is not an authorization pass.']};
}
