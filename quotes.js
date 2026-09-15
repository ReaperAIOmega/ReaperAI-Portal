const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));

const list = document.getElementById('quote-list');
const fmtMoney = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';

async function respond(supabase, quote, decision, button) {
  const noCharge = Number(quote.amount) === 0;
  const label = decision === 'accept' ? 'Accept' : 'Decline';
  const prompt = noCharge
    ? `${label} this no-charge service authorization?`
    : `${label} this quote for ${fmtMoney(quote.amount, quote.currency || 'USD')}?`;
  if (!window.confirm(prompt)) return;

  button.disabled = true;
  button.textContent = decision === 'accept' ? 'Accepting…' : 'Declining…';
  const { data, error } = await supabase.functions.invoke('respond-to-quote', {
    body: { quote_id: quote.id, decision },
  });
  if (error || !data?.ok) {
    console.error('Quote response failed', error, data);
    window.alert('Your response could not be completed. Refresh the page and try again.');
    button.disabled = false;
    button.textContent = label;
    return;
  }

  if (decision === 'accept') {
    if (data.no_charge) {
      window.alert('Service authorization accepted. No payment is due for this engagement.');
    } else if (data.billing_deferred) {
      window.alert('Quote accepted. Billing remains deferred until the service is completed and released for payment.');
    } else {
      window.alert('Quote accepted. A pending payment record has been created in your billing workspace.');
    }
  }
  await loadQuotes(supabase);
}

async function loadQuotes(supabase) {
  const { data, error } = await supabase
    .from('quotes')
    .select('id,title,scope,amount,currency,status,sent_at,accepted_at,declined_at,expires_at,created_at')
    .order('created_at', { ascending: false });

  list.replaceChildren();
  if (error) {
    console.error('Quote load error', error);
    list.textContent = 'Quotes and service authorizations could not be loaded.';
    return;
  }
  if (!data?.length) {
    list.textContent = 'No quotes or service authorizations have been issued to your account yet.';
    return;
  }

  for (const quote of data) {
    const noCharge = Number(quote.amount) === 0;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '22px';

    const title = document.createElement('h3');
    title.textContent = quote.title;
    const amount = document.createElement('div');
    amount.className = 'stat-number';
    amount.textContent = noCharge ? 'No charge' : fmtMoney(quote.amount, quote.currency || 'USD');
    const status = document.createElement('p');
    status.textContent = `Status: ${quote.status}`;
    const scope = document.createElement('p');
    scope.style.whiteSpace = 'pre-wrap';
    scope.textContent = quote.scope;
    const meta = document.createElement('p');
    meta.textContent = `Issued: ${fmtDate(quote.sent_at)}${quote.expires_at ? ` · Expires: ${fmtDate(quote.expires_at)}` : ''}`;

    card.append(title, amount, status, scope, meta);

    if (noCharge) {
      const policy = document.createElement('p');
      policy.textContent = 'This is a no-charge service authorization. No payment record will be created for this engagement.';
      card.appendChild(policy);
    }

    if (quote.status === 'sent') {
      const row = document.createElement('div');
      row.className = 'button-row';
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'button';
      accept.textContent = noCharge ? 'Accept service authorization' : 'Accept quote';
      accept.addEventListener('click', () => respond(supabase, quote, 'accept', accept));
      const decline = document.createElement('button');
      decline.type = 'button';
      decline.className = 'btn-secondary';
      decline.textContent = 'Decline';
      decline.addEventListener('click', () => respond(supabase, quote, 'decline', decline));
      row.append(accept, decline);
      card.appendChild(row);
    } else if (quote.status === 'accepted') {
      const note = document.createElement('p');
      note.textContent = noCharge
        ? 'This no-charge service authorization is accepted. No payment is due for this engagement.'
        : 'This quote is accepted. If billing is eligible, the corresponding payment record will appear in Billing; deferred services remain on hold until completion.';
      card.appendChild(note);
      if (!noCharge) {
        const link = document.createElement('a');
        link.href = 'payments.html';
        link.className = 'button';
        link.textContent = 'Open billing';
        card.appendChild(link);
      }
    }

    list.appendChild(card);
  }
}

ready.then(({ supabase }) => loadQuotes(supabase)).catch((error) => {
  console.error('Quote workspace error', error);
  if (list) list.textContent = 'Quote workspace is unavailable.';
});
