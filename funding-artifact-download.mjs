// Customer UI stays held until authenticated staging acceptance.
export const fundingArtifactDownloadsEnabled=false;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function fundingArtifactFromPath(path){
 if(typeof path!=='string'||!path.startsWith('funding-artifacts/'))return null;
 const match=/^funding-artifacts\/([0-9a-f-]+)\/([0-9a-f-]+)\.(pdf|xlsx)$/.exec(path);
 if(!match||!uuid.test(match[1])||!uuid.test(match[2]))throw Error('Funding document access is unavailable.');
 return {clientId:match[1],artifactId:match[2],kind:match[3]};
}
export async function retrieveFundingArtifact(supabase,artifactId,{enabled=fundingArtifactDownloadsEnabled}={}){
 if(!enabled)throw Error('Funding document downloads are not available yet.');
 if(!uuid.test(artifactId))throw Error('Invalid funding document identity.');
 const id=artifactId.toLowerCase();
 const result=await supabase.functions.invoke('retrieve-funding-artifact',{method:'POST',headers:{'x-artifact-id':id}});
 if(result.error||!result.response?.ok||!(result.data instanceof Blob))throw Error('Private funding document could not be retrieved.');
 const h=result.response.headers,hash=h.get('x-reaper-sha256'),receipt=h.get('x-reaper-receipt'),expires=h.get('x-reaper-receipt-expires-at');
 const length=h.get('content-length'),size=Number(length),type=h.get('x-reaper-media-type');
 const kind=type==='application/pdf'?'pdf':type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'?'xlsx':null;
 const name=/^attachment; filename="([A-Za-z0-9_-][A-Za-z0-9_.-]{0,124})"$/.exec(h.get('content-disposition')??'')?.[1];
 if(h.get('x-reaper-artifact-id')!==id||!hash||!/^[0-9a-f]{64}$/.test(hash)||!uuid.test(receipt??'')||!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now()
 ||h.get('content-type')!=='application/octet-stream'||!length||!/^\d+$/.test(length)||!Number.isSafeInteger(size)||size<1||size>20971520||result.data.size!==size||!kind||!name?.endsWith('.'+kind))throw Error('Funding document receipt could not be verified.');
 const bytes=await result.data.arrayBuffer(),actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(actual!==hash)throw Error('Funding document integrity check failed.');
 // No acknowledgment or delivery mutation occurs here.
 return Object.freeze({blob:result.data,fileName:name,artifactId:id,sha256:hash,receipt,receiptExpiresAt:expires});
}
export async function acknowledgeFundingArtifact(supabase,input){
 const r=structuredClone(input);delete r.blob;
 if(!uuid.test(r.artifactId??'')||!uuid.test(r.receipt??'')||!/^[0-9a-f]{64}$/.test(r.sha256??'')||!Number.isFinite(Date.parse(r.receiptExpiresAt)))throw Error('Funding receipt is invalid or expired.');
 const unknown=()=>Object.assign(Error('Receipt outcome unknown. Retry the same receipt.'),{outcome:'UNKNOWN',artifactId:r.artifactId,receipt:r.receipt});
 let response;try{response=await supabase.rpc('confirm_funding_artifact_receipt',{p_artifact:r.artifactId,p_receipt:r.receipt,p_received_sha256:r.sha256});}catch{throw unknown();}
 if(response.error){if(/^(?:(?:22|23|42)[A-Z0-9]{3}|40001|40P01)$/.test(response.error.code??''))throw Object.assign(Error('Receipt was rejected.'),{outcome:'REJECTED'});throw unknown();}
 if(response.data?.artifact_id!==r.artifactId||response.data.state!=='CLIENT_ACKNOWLEDGED'||!Number.isFinite(Date.parse(response.data.acknowledged_at)))throw unknown();
 return response.data;
}
