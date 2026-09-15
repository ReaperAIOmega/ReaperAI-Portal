const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));
const money=(v)=>v===null||v===undefined?'—':new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(v));
const fmt=(v)=>v?new Date(v).toLocaleDateString():'—';
function render(container,headers,rows){container.replaceChildren();if(!rows.length){container.textContent='No records have been published to this engagement yet.';return;}const t=document.createElement('table');t.innerHTML=`<thead><tr>${headers.map(h=>`<th>${h.label}</th>`).join('')}</tr></thead>`;const b=document.createElement('tbody');for(const r of rows){const tr=document.createElement('tr');for(const h of headers){const td=document.createElement('td');td.textContent=(h.render?h.render(r):r[h.key])??'—';tr.appendChild(td);}b.appendChild(tr);}t.appendChild(b);container.appendChild(t);}
ready.then(async({supabase})=>{
  const [readiness,applications,matches]=await Promise.all([
    supabase.from('funding_readiness_assessments').select('id,score,summary,strengths,gaps,status,published_at').order('published_at',{ascending:false}),
    supabase.from('funding_applications').select('id,lender_name,product_type,amount_requested,amount_approved,apr,term_months,application_date,status,denial_reasons').order('created_at',{ascending:false}),
    supabase.from('funding_matches').select('id,eligibility,rank,estimated_amount,reasons,created_at').order('rank',{ascending:true}),
  ]);
  if(readiness.error||applications.error||matches.error)throw readiness.error||applications.error||matches.error;
  render(document.getElementById('readiness-list'),[{label:'Score',key:'score'},{label:'Summary',key:'summary'},{label:'Strengths',render:r=>Array.isArray(r.strengths)?r.strengths.join('; '):''},{label:'Gaps',render:r=>Array.isArray(r.gaps)?r.gaps.join('; '):''},{label:'Published',render:r=>fmt(r.published_at)}],readiness.data||[]);
  render(document.getElementById('application-list'),[{label:'Lender',key:'lender_name'},{label:'Product',key:'product_type'},{label:'Requested',render:r=>money(r.amount_requested)},{label:'Approved',render:r=>money(r.amount_approved)},{label:'Status',key:'status'},{label:'Applied',render:r=>fmt(r.application_date)}],applications.data||[]);
  render(document.getElementById('match-list'),[{label:'Eligibility',key:'eligibility'},{label:'Rank',key:'rank'},{label:'Estimated amount',render:r=>money(r.estimated_amount)},{label:'Rationale',render:r=>Array.isArray(r.reasons)?r.reasons.join('; '):''}],matches.data||[]);
}).catch((error)=>{console.error('Funding progress load failed',error);document.getElementById('readiness-list').textContent='Funding progress is unavailable.';});
