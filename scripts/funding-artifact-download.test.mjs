import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {fundingArtifactDownloadsEnabled,fundingArtifactFromPath,retrieveFundingArtifact,acknowledgeFundingArtifact} from '../funding-artifact-download.mjs';
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,id=u(201),client=u(11),token=u(401),bytes=new TextEncoder().encode('%PDF-1.7 SYNTHETIC PRIVATE BYTES'),hash=createHash('sha256').update(bytes).digest('hex'),expires=new Date(Date.now()+240000).toISOString();
function fixture(overrides={}){
 const fileBytes=overrides.kind==='xlsx'?new Uint8Array([80,75,3,4,0,255,128,254]):bytes,fileHash=createHash('sha256').update(fileBytes).digest('hex');
 let calls=0,acks=0;const headers={'content-type':'application/octet-stream','x-reaper-media-type':overrides.kind==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf','content-length':String(fileBytes.length),'content-disposition':`attachment; filename="synthetic.${overrides.kind??'pdf'}"`,'x-reaper-artifact-id':id,'x-reaper-sha256':fileHash,'x-reaper-receipt':token,'x-reaper-receipt-expires-at':expires,...overrides.headers};
 const api={functions:{invoke:async(name,args)=>{calls++;assert.equal(name,'retrieve-funding-artifact');assert.equal(args.headers['x-artifact-id'],id);return {data:new Blob([overrides.corrupt?new Uint8Array(fileBytes.length):fileBytes]),response:new Response(null,{status:200,headers})};}},rpc:async(name,args)=>{acks++;assert.equal(name,'confirm_funding_artifact_receipt');assert.deepEqual(args,{p_artifact:id,p_receipt:token,p_received_sha256:fileHash});return overrides.ack??{data:{artifact_id:id,state:'CLIENT_ACKNOWLEDGED',acknowledged_at:new Date().toISOString()}};}};
 return {api,calls:()=>calls,acks:()=>acks};
}
test('reserved paths are classified and incomplete funding retrieval stays disabled',async()=>{
 assert.equal(fundingArtifactDownloadsEnabled,false);assert.deepEqual(fundingArtifactFromPath(`funding-artifacts/${client}/${id}.pdf`),{clientId:client,artifactId:id,kind:'pdf'});assert.equal(fundingArtifactFromPath('ordinary/legacy.pdf'),null);
 for(const path of ['funding-artifacts/invalid.pdf','funding-artifacts/../client/file.pdf'])assert.throws(()=>fundingArtifactFromPath(path));
 const f=fixture();await assert.rejects(retrieveFundingArtifact(f.api,id),/not available/);assert.equal(f.calls(),0);
});
test('canonical private response bytes are independently hashed with no automatic acknowledgment',async()=>{
 const f=fixture(),r=await retrieveFundingArtifact(f.api,id,{enabled:true});assert.equal(r.artifactId,id);assert.equal(r.sha256,hash);assert.equal(r.fileName,'synthetic.pdf');assert.equal(f.acks(),0);assert.deepEqual(new Uint8Array(await r.blob.arrayBuffer()),bytes);
 const ack=await acknowledgeFundingArtifact(f.api,r);assert.equal(ack.state,'CLIENT_ACKNOWLEDGED');assert.equal(f.acks(),1);
});
test('wrong identity, altered bytes, malformed size and expired receipt never get acknowledged',async()=>{
 for(const options of [{corrupt:true},{headers:{'x-reaper-artifact-id':u(999)}},{headers:{'content-length':'1e3'}},{headers:{'x-reaper-receipt-expires-at':'2000-01-01'}},{headers:{'content-disposition':'attachment; filename="../unsafe.pdf"'}}]){const f=fixture(options);await assert.rejects(retrieveFundingArtifact(f.api,id,{enabled:true}));assert.equal(f.acks(),0);}
});
test('unknown acknowledgment outcomes retain the exact receipt and never claim delivery',async()=>{
 for(const ack of [{error:{code:'08007'}},{error:{code:'40003'}},{data:null},{data:{artifact_id:id,state:'DELIVERED',acknowledged_at:new Date().toISOString()}}]){const f=fixture({ack}),r=await retrieveFundingArtifact(f.api,id,{enabled:true});await assert.rejects(acknowledgeFundingArtifact(f.api,r),e=>e.outcome==='UNKNOWN'&&e.artifactId===id&&e.receipt===token);}
});
test('existing Documents interface routes reserved funding paths away from broad signed URLs',async()=>{
 const source=await readFile(new URL('../documents.js',import.meta.url),'utf8');assert.match(source,/fundingArtifactFromPath/);assert.match(source,/if\(fundingDocumentPath&&!artifact\)/);assert.match(source,/if\(artifact&&!fundingArtifactDownloadsEnabled\)/);assert.ok(source.indexOf('if(artifact){')<source.indexOf('createSignedUrl'));assert.match(source,/retrieveFundingArtifact\(supabase,artifact.artifactId\)/);
});

test('already committed acknowledgment can recover with the same expired local receipt',async()=>{
 const f=fixture(),r=await retrieveFundingArtifact(f.api,id,{enabled:true});let calls=0;
 f.api.rpc=async()=>{calls++;if(calls===1)throw Error('response lost after commit');return {data:{artifact_id:id,state:'CLIENT_ACKNOWLEDGED',acknowledged_at:'2026-10-28T00:00:00Z'}};};
 await assert.rejects(acknowledgeFundingArtifact(f.api,r),e=>e.outcome==='UNKNOWN');
 assert.equal((await acknowledgeFundingArtifact(f.api,{...r,receiptExpiresAt:'2000-01-01T00:00:00Z'})).state,'CLIENT_ACKNOWLEDGED');assert.equal(calls,2);
});

test('XLSX octet-stream bytes retain their binary values and filename',async()=>{
 const f=fixture({kind:'xlsx'}),r=await retrieveFundingArtifact(f.api,id,{enabled:true});assert.equal(r.fileName,'synthetic.xlsx');assert.deepEqual(new Uint8Array(await r.blob.arrayBuffer()),new Uint8Array([80,75,3,4,0,255,128,254]));assert.equal(f.acks(),0);
});
