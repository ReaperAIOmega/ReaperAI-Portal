const ready = window.reaperAuth ? Promise.resolve(window.reaperAuth)
  : new Promise(resolve => document.addEventListener('reaper:auth-ready', e => resolve(e.detail), { once: true }));
const authBox = document.getElementById('letter-authorizations');
const lettersBox = document.getElementById('generated-letters');
const statusBox = document.getElementById('letter-action-status');
const fmtDate = v => v ? new Date(v).toLocaleString() : '—';
let supabase;
let grants = [];
let letters = [];
let mailingRequests = [];

function button(text, handler) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'button';
  el.textContent = text;
  el.addEventListener('click', async () => {
    el.disabled = true;
    statusBox.textContent = '';
    try { await handler(); } catch (error) {
      statusBox.textContent = error.message || 'Unable to complete the request.';
    } finally { el.disabled = false; }
  });
  return el;
}

function section(parent, title, detail) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.padding = '16px';
  card.style.margin = '12px 0';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const description = document.createElement('p');
  description.textContent = detail;
  card.append(heading, description);
  parent.appendChild(card);
  return card;
}

async function load() {
  const results = await Promise.all([
    supabase.from('letter_authorizations')
      .select('id,subject,recipient_name,approved_at,status').eq('status','approved')
      .order('approved_at', { ascending: false }),
    supabase.from('client_letters')
      .select('id,authorization_id,subject,recipient_name,recipient_address,body_snapshot,content_hash,created_at')
      .order('created_at',{ascending:false}),
    supabase.from('letter_mail_requests')
      .select('id,letter_id,mail_class,status,requested_at,tracking_reference,provider_job_id')
      .order('requested_at',{ascending:false})
  ]);
  for (const result of results) if (result.error) throw result.error;
  [grants,letters,mailingRequests] = results.map(r => r.data || []);
  render();
}

function render() {
  authBox.replaceChildren();
  if (!grants.length) authBox.textContent = 'No letters have been authorized for your account.';
  for (const grant of grants) {
    const card = section(authBox, grant.subject, `To: ${grant.recipient_name} · Approved ${fmtDate(grant.approved_at)}`);
    card.append(button('Generate my letter', async () => {
      const {data,error} = await supabase.rpc('generate_authorized_letter', {p_authorization_id: grant.id});
      if (error) throw error;
      statusBox.textContent = 'Letter generated. Review and download the exact copy below.';
      await load();
      const target = document.getElementById('letter-'+data);
      target?.scrollIntoView({ behavior:'smooth', block:'center' });
    }));
  }
  lettersBox.replaceChildren();
  if (!letters.length) lettersBox.textContent = 'No generated letters yet.';
  for (const letter of letters) {
    const card = section(lettersBox, letter.subject,
      `To: ${letter.recipient_name} · Generated ${fmtDate(letter.created_at)} · Version ${letter.content_hash.slice(0,12)}`);
    card.id = 'letter-'+letter.id;
    const preview = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Review exact letter';
    const pre = document.createElement('pre');
    pre.textContent = letter.body_snapshot;
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.overflowWrap = 'anywhere';
    preview.append(summary,pre);
    card.append(preview);
    card.append(button('Download PDF', () => downloadPDF(letter)));
    const existing = mailingRequests.find(r => r.letter_id === letter.id);
    if (existing) {
      const p = document.createElement('p');
      p.textContent = `LetterStream request: ${existing.status.replaceAll('_',' ')} · ${fmtDate(existing.requested_at)}` +
        (existing.tracking_reference ? ` · Tracking: ${existing.tracking_reference}` : '');
      card.appendChild(p);
    } else {
      const select = document.createElement('select');
      select.setAttribute('aria-label','Mail service');
      for (const [value,name] of [['first_class','USPS First-Class'],['certified','USPS Certified Mail']]) {
        const o = document.createElement('option');o.value=value;o.textContent=name;select.appendChild(o);
      }
      card.append(select,button('Request LetterStream mailing', async () => {
        if (!window.confirm('Request printing and mailing of this exact letter? This is a request for administrator review, not a confirmed mailing or payment.')) return;
        const {error} = await supabase.rpc('request_letterstream_mailing',{
          p_letter_id:letter.id, p_mail_class:select.value
        });
        if (error) throw error;
        statusBox.textContent = 'Mailing request received for review; nothing has been mailed yet.';
        await load();
      }));
    }
  }
}

async function downloadPDF(letter) {
  if (!window.pdfMake) throw new Error('PDF generator is unavailable. Reload the page.');
  // Rendering is entirely within the authenticated client browser.
  // No client text is transmitted to a third-party PDF service.
  const pdf = {
    pageSize: 'LETTER',
    pageMargins: [54,54,54,54],
    content: [
      { text: letter.body_snapshot, fontSize: 11, lineHeight: 1.23, preserveLeadingSpaces: true }
    ],
    defaultStyle: { font: 'Roboto' },
    info: { title: letter.subject, subject:'Client generated letter' }
  };
  const shortHash = letter.content_hash.slice(0,12);
  const filename = `Johnson-Strategic-Letter-${shortHash}.pdf`;
  window.pdfMake.createPdf(pdf).download(filename);
  statusBox.textContent = 'PDF download initiated. This action does not request mailing.';
}

ready.then(async context => {
  supabase = context.supabase;
  if (context.profile.role !== 'client') throw new Error('Only approved client accounts may use this page.');
  await load();
}).catch(error => {
  console.error('Letters page load failed',error);
  authBox.textContent = 'Letters are unavailable. Please contact your administrator.';
  lettersBox.textContent = '';
});
