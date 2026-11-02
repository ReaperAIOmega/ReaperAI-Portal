import {resolveRuntime} from './runtime-config.mjs';import {runClientAcceptance} from './staging-acceptance.mjs';
const runtime=resolveRuntime(window.location,'portal'),output=document.getElementById('acceptance-result');
const ready=window.reaperAuth?Promise.resolve(window.reaperAuth):new Promise(resolve=>document.addEventListener('reaper:auth-ready',e=>resolve(e.detail),{once:true}));
ready.then(context=>{if(!runtime.staging){output.textContent='Synthetic acceptance unavailable.';return;}for(const [id,mode]of [['check-active','active'],['check-suspended','suspended']]){const b=document.getElementById(id);b.disabled=false;b.addEventListener('click',async()=>{b.disabled=true;try{const r=await runClientAcceptance(context.supabase,runtime,mode);output.textContent=JSON.stringify(r,null,2);localStorage.setItem('reaper.qemjnekgcbuddayzhdtr.client-acceptance.'+r.principal_id+'.'+mode,JSON.stringify(r));}catch{output.textContent='Client acceptance unavailable or unverified. No success is inferred.';}finally{b.disabled=false;}});}output.textContent='Ready for signed client isolation checks.';});

import {runArtifactRetrievalAcceptance} from './staging-acceptance.mjs';
// Test-only UI hold. Requires separate owner authorization after canonical approval.
// This flag never grants canonical approval or backend retrieval authority.
const artifactAcceptanceAuthorized=false;
ready.then(context=>{if(!runtime.staging)return;
 if(!artifactAcceptanceAuthorized){document.getElementById('artifact-retrieval-result').textContent='Artifact tests are disabled outside an authorized staging test window; separate synthetic-test authorization is required.';return;}
 for(const [id,mode]of [['check-artifact-denial','expect_denied'],['retrieve-artifact-bytes','retrieve']]){
  const button=document.getElementById(id);button.disabled=false;button.addEventListener('click',async()=>{button.disabled=true;const out=document.getElementById('artifact-retrieval-result'),links=document.getElementById('artifact-downloads');links.replaceChildren();try{
   const r=await runArtifactRetrievalAcceptance(context.supabase,runtime,mode);out.textContent=JSON.stringify(r.report,null,2);
   localStorage.setItem('reaper.qemjnekgcbuddayzhdtr.artifact-retrieval.'+r.report.principal_id+'.'+mode,JSON.stringify(r.report));
   for(const f of r.downloads){const a=document.createElement('a'),url=URL.createObjectURL(f.blob);a.href=url;a.download=f.fileName;a.textContent='Save verified '+f.kind.toUpperCase();a.addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(url),60000),{once:true});links.append(a,document.createElement('br'));}
  }catch(e){out.textContent=JSON.stringify({outcome:'HELD',error:e.message},null,2);}finally{button.disabled=false;}});
 }
});

import {checkExistingIntakeIsolation} from "./existing-intake-security.mjs";
ready.then(context=>{if(!runtime.staging)return;const b=document.getElementById("check-new-intake");b.disabled=false;b.addEventListener("click",async()=>{b.disabled=true;try{document.getElementById("new-intake-result").textContent=JSON.stringify(await checkExistingIntakeIsolation(context.supabase,runtime),null,2);}catch(e){document.getElementById("new-intake-result").textContent=JSON.stringify({passed:false,error:e.message});}finally{b.disabled=false;}});});
