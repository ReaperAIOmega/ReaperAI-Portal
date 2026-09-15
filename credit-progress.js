const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));
const fmt=(v)=>v?new Date(v).toLocaleDateString():'—';
function render(container,headers,rows){container.replaceChildren();if(!rows.length){container.textContent='No records have been published to this engagement yet.';return;}const t=document.createElement('table');t.innerHTML=`<thead><tr>${headers.map(h=>`<th>${h.label}</th>`).join('')}</tr></thead>`;const b=document.createElement('tbody');for(const r of rows){const tr=document.createElement('tr');for(const h of headers){const td=document.createElement('td');td.textContent=(h.render?h.render(r):r[h.key])??'—';tr.appendChild(td);}b.appendChild(tr);}t.appendChild(b);container.appendChild(t);}
ready.then(async({supabase})=>{
  const [reports,issues,rounds]=await Promise.all([
    supabase.from('credit_reports').select('id,report_date,source,status,created_at').order('created_at',{ascending:false}),
    supabase.from('credit_issues').select('id,bureau,issue_code,issue_type,description,severity,status,created_at').order('created_at',{ascending:false}),
    supabase.from('dispute_rounds').select('id,round_number,target_type,target_name,bureau,status,sent_at,delivered_at,response_due_at,response_received_at').order('round_number',{ascending:false}),
  ]);
  if(reports.error||issues.error||rounds.error)throw reports.error||issues.error||rounds.error;
  render(document.getElementById('credit-reports'),[{label:'Report date',render:r=>fmt(r.report_date)},{label:'Source',key:'source'},{label:'Status',key:'status'}],reports.data||[]);
  render(document.getElementById('credit-issues'),[{label:'Bureau',key:'bureau'},{label:'Issue',key:'issue_type'},{label:'Description',key:'description'},{label:'Severity',key:'severity'},{label:'Status',key:'status'}],issues.data||[]);
  render(document.getElementById('credit-rounds'),[{label:'Round',key:'round_number'},{label:'Target',render:r=>`${r.target_type}: ${r.target_name}`},{label:'Bureau',key:'bureau'},{label:'Status',key:'status'},{label:'Sent',render:r=>fmt(r.sent_at)},{label:'Response due',render:r=>fmt(r.response_due_at)}],rounds.data||[]);
}).catch((error)=>{console.error('Credit progress load failed',error);document.getElementById('credit-reports').textContent='Credit progress is unavailable.';});
