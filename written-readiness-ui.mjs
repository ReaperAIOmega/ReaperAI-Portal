import { acceptAgreement, acceptOffer, loadOffer, offerExpired } from './written-readiness-client.mjs';

const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));
const el = (tag, text, attrs = {}) => { const n = document.createElement(tag); if (text != null) n.textContent = text; Object.assign(n, attrs); return n; };
const money = (amount, currency) => `${currency} ${Number(amount).toFixed(2)}`;
const status = document.getElementById('status');

async function render({ supabase }) {
  const offersEl = document.getElementById('offers');
  const agreementsEl = document.getElementById('agreements');
  offersEl.replaceChildren(); agreementsEl.replaceChildren();
  const { data: quotes, error } = await supabase.from('quotes').select('id,status,case_id').in('status', ['sent', 'accepted']).order('created_at', { ascending: false });
  if (error) { status.textContent = 'Offers could not be loaded.'; return; }
  const offers = [];
  const offerCases = new Set();
  for (const q of quotes ?? []) { const o = await loadOffer(supabase, q.id); if (o) { offers.push(o); offerCases.add(q.case_id); } }
  status.textContent = offers.length ? '' : 'No written readiness offer has been issued to your account.';
  for (const offer of offers) {
    const box = el('article', null, { className: 'card' });
    box.append(el('h2', offer.title), el('p', offer.scope), el('p', `Price: ${money(offer.amount, offer.currency)}`),
      el('p', `Offer valid until ${new Date(offer.expires_at).toLocaleString()}`), el('p', `Offer reference ${offer.offer_sha256.slice(0, 12)}…`));
    if (offer.status === 'accepted') box.append(el('p', 'Accepted. Next: review and sign the service agreement below.'));
    else if (offerExpired(offer)) box.append(el('p', 'This offer has expired. Message us if you would like it reissued.'));
    else {
      const consent = el('input', null, { type: 'checkbox', id: `consent-${offer.quote_id}` });
      const label = el('label', ' I accept this exact written scope and price. I understand no payment is taken at this step.');
      label.prepend(consent);
      const button = el('button', 'Accept offer', { type: 'button' });
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await acceptOffer(supabase, offer, consent.checked); await render({ supabase }); }
        catch (e) { window.alert(e.outcome === 'UNKNOWN' ? 'We could not confirm the result. Reload before trying again.' : e.message); button.disabled = false; }
      });
      box.append(label, button);
    }
    offersEl.append(box);
  }
  const { data: agreements, error: agreementsError } = await supabase.from('service_agreements')
    .select('id,case_id,title,body_snapshot,content_hash,status,sent_at,accepted_at').in('status', ['sent', 'accepted']).order('sent_at', { ascending: false });
  if (agreementsError) { status.textContent = 'Service agreements could not be loaded. Reload to check their status.'; return; }
  // Only agreements for a written-readiness case; generic agreements stay on agreements.html.
  for (const a of (agreements ?? []).filter((row) => offerCases.has(row.case_id))) {
    const box = el('article', null, { className: 'card' });
    box.append(el('h2', a.title), el('pre', a.body_snapshot, { className: 'agreement-text' }));
    if (a.status === 'accepted') box.append(el('p', `Signed ${new Date(a.accepted_at).toLocaleString()}.`));
    else {
      const name = el('input', null, { type: 'text', placeholder: 'Full legal name', autocomplete: 'name' });
      const consent = el('input', null, { type: 'checkbox' });
      const label = el('label', ' I have read this agreement and sign it electronically.'); label.prepend(consent);
      const button = el('button', 'Sign agreement', { type: 'button' });
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await acceptAgreement(supabase, a, name.value, consent.checked); await render({ supabase }); }
        catch (e) { window.alert(e.outcome === 'UNKNOWN' ? 'We could not confirm the result. Reload before trying again.' : e.message); button.disabled = false; }
      });
      box.append(name, label, button);
    }
    agreementsEl.append(box);
  }
}

ready.then(render).catch(() => { status.textContent = 'Offers could not be loaded.'; });
