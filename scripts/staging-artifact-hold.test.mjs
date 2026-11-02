import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('signed staging login alone cannot enable separately held artifact acceptance',async()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:true,textContent:'',listeners:[],addEventListener(...args){this.listeners.push(args);}});return nodes.get(id);};
 let artifactCalls=0;
 const context=vm.createContext({window:{location:{},reaperAuth:{supabase:{}}},document:{getElementById:get,addEventListener(){}},resolveRuntime:()=>({staging:true}),runClientAcceptance:async()=>({}),runArtifactRetrievalAcceptance:async()=>{artifactCalls++;},localStorage:{setItem(){}}});
 const source=readFileSync(new URL('../staging-acceptance-ui.js',import.meta.url),'utf8').replace(/import .*?from '[^']+';/g,'');
 vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(get('check-active').disabled,false);
 for(const id of ['check-artifact-denial','retrieve-artifact-bytes']){assert.equal(get(id).disabled,true);assert.equal(get(id).listeners.length,0);}
 assert.match(get('artifact-retrieval-result').textContent,/separate synthetic-test authorization/);assert.equal(artifactCalls,0);
});
