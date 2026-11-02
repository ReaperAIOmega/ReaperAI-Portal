import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../documents.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
function setup(){
 const context=vm.createContext({window:{},document:{getElementById:()=>null,addEventListener(){}},console});
 vm.runInContext(src+'\nglobalThis.api={bestDocumentForCategory,isCanonicalFundingArtifact};',context);
 return context.api;
}
test('canonical generic approved rows cannot satisfy user-upload requirements',()=>{
 const api=setup();
 assert.equal(api.bestDocumentForCategory([{category:'identity',storage_path:'funding-artifacts/x.pdf',review_status:'approved'}],'identity','case'),null);
 assert.equal(api.bestDocumentForCategory([{category:'funding-document',storage_path:'any',review_status:'approved'}],'funding-document','case'),null);
});
test('ordinary client document selection and case isolation are preserved',()=>{
 const api=setup(),own={id:'own',category:'identity',case_id:'case',storage_path:'client/identity.pdf',review_status:'pending'};
 const foreign={id:'foreign',category:'identity',case_id:'other',review_status:'approved'};
 assert.equal(api.bestDocumentForCategory([foreign,own],'identity','case').id,'own');
 assert.equal(api.isCanonicalFundingArtifact(own),false);
});
test('funding access retains private worker and blocks generic category fallback',()=>{
 assert.match(src,/if\(isCanonicalFundingArtifact\(documentRow\)&&!artifact\)/);
 assert.match(src,/retrieveFundingArtifact\(supabase,artifact.artifactId\)/);
 assert.match(src,/!fundingArtifactDownloadsEnabled/);
 assert.match(src,/canonicalDeliverable \|\| documentRow\?\.review_status/);
});
