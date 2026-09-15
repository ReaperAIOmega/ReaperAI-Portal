const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));

const list = document.getElementById('quote-list');
const fmtMoney = (value, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';

async function respond(supabase, quote, decision, button) {
  const label = decision === 'accept' ? 'Accept' : 'Decline';
  if (!window.confirm(`${label} this quote for ${fmtMoney(quote.amount, quote.currency || 'USD')}?`)) return;
  button.disabled = true;
  button.textContent = decision === 'accept' ? 'Accepting…' : 'Declining…';
  const { data, error } = await supabase.functions.invoke('respond-to-quote', {
    body: { quote_id: quote.id, decision },
  });
  if (error || !data?.ok) {
    console.error('Quote response failed', error, data);
    window.alert('Your quote response could not be completed. Refresh the page and try again.');
    button.disabled = false;
    button.textContent = label;
    return;
  }
  if (decision === 'accept') {
    window.alert('Quote accepted. A pending payment record has been created in your billing workspace.');
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
    list.textContent = 'Quotes could not be loaded.';
    return;
  }
  if (!data?.length) {
    list.textContent = 'No quotes have been issued to your account yet.';
    return;
  }

  for (const quote of data) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '22px';

    const title = document.createElement('h3');
    title.textContent = quote.title;
    const amount = document.createElement('div');
    amount.className = 'stat-number';
    amount.textContent = fmtMoney(quote.amount, quote.currency || 'USD');
    const status = document.createElement('p');
    status.textContent = `Status: ${quote.status}`;
    const scope = document.createElement('p');
    scope.style.whiteSpace = 'pre-wrap';
    scope.textContent = quote.scope;
    const meta = document.createElement('p');
    meta.textContent = `Issued: ${fmtDate(quote.sent_at)}${quote.expires_at ? ` · Expires: ${fmtDate(quote.expires_at)}` : ''}`;

    card.append(title, amount, status, scope, meta);

    if (quote.status === 'sent') {
      const row = document.createElement('div');
      row.className = 'button-row';
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'button';
      accept.textContent = 'Accept quote';
      accept.addEventListener('click', () => respond(supabase, quote, 'accept', accept));
      const decline = document.createElement('button');
      decline.type = 'button';
      decline.className = 'btn-secondary';
      decline.textContent = 'Decline quote';
      decline.addEventListener('click', () => respond(supabase, quote, 'decline', decline));
      row.append(accept, decline);
      card.appendChild(row);
    } else if (quote.status === 'accepted') {
      const link = document.createElement('a');
      link.href = 'payments.html';
      link.className = 'button';
      link.textContent = 'Open billing';
      card.appendChild(link);
    }

    list.appendChild(card);
  }
}

ready.then(({ supabase }) => loadQuotes(supabase)).catch((error) => {
  console.error('Quote workspace error', error);
  if (list) list.textContent = 'Quote workspace is unavailable.';
});
