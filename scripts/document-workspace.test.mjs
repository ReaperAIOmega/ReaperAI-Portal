import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../documents.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'');
class Node {
 constructor(){this.children=[];this.textContent='';this.listeners={};this.style={};}
 appendChild(n){this.children.push(n);return n;} append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;this.textContent='';}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setAttribute(name,v){this[name]=v;}
}
const text=n=>[n.textContent,...n.children.map(text)].join(' ');
function fixture({stage=true,missingChecklist=false,documents=[],cases=[{id:'case',case_type:'funding',title:'Fictional case'}]}={}){
 const nodes=Object.fromEntries(['document-upload-form','document-file','document-category','document-submit','document-status','document-list','document-requirements','document-upload-card'].map(id=>[id,new Node()]));
 const calls=[];
 const context=vm.createContext({window:{},document:{getElementById:id=>nodes[id],createElement:()=>new Node(),addEventListener(){}},console,
 fundingArtifactFromPath:()=>null,fundingArtifactDownloadsEnabled:false,retrieveFundingArtifact:()=>{throw Error('No retrieval permitted');}});
 vm.runInContext(source+'\nglobalThis.api={loadDocuments};',context);
 const supabase={supabaseUrl:stage?'https://qemjnekgcbuddayzhdtr.supabase.co':'https://itswbmjvuxumfjqkkqgx.supabase.co',
 from(table){const chain={select(){return chain;},eq(){return chain;},in(){return chain;},
 maybeSingle:async()=>({data:{id:'client',status:'active'}}),
 order:async(column)=>{calls.push({table,column});
 if(table==='documents')return {data:documents};
 if(table==='cases')return column==='created_at'?{error:{code:'42703'}}:{data:cases};
 return missingChecklist?{error:{code:'PGRST205'}}:{data:[]};}};return chain;}};
 return {nodes,calls,load:()=>context.api.loadDocuments({supabase})};
}
test('canonical document reads survive unavailable checklist without implying no evidence is required',async()=>{
 const f=fixture({missingChecklist:true,documents:[{file_name:'fictional-v5.pdf',category:'funding-document',storage_path:'funding-artifacts/invalid',review_status:'pending'}]});
 await f.load();assert.match(text(f.nodes['document-list']),/fictional-v5.pdf/);
 assert.match(text(f.nodes['document-list']),/exact-version authorization/);
 assert.match(f.nodes['document-requirements'].textContent,/Required evidence has not been determined/);
 assert.equal(f.nodes['document-submit'].disabled,true);
 assert.equal(f.calls.find(x=>x.table==='cases').column,'id');
});
test('unrelated empty client view remains empty and incomplete staging uploads stay disabled',async()=>{
 const f=fixture({cases:[]});await f.load();assert.match(f.nodes['document-list'].textContent,/No documents/);
 assert.equal(f.nodes['document-submit'].disabled,true);
 await f.nodes['document-upload-form'].listeners.submit({preventDefault(){}});
 assert.match(f.nodes['document-status'].textContent,/uploads are unavailable/);
});
test('existing nonstaging workspace can still enable uploads after supported reads',async()=>{
 const f=fixture({stage:false});await f.load();assert.equal(f.nodes['document-submit'].disabled,false);
});
