const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));

const container = document.getElementById('payment-list');
const fmtMoney = (value, currency = 'USD') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency || 'USD').toUpperCase() }).format(amount);
};
const fmtDate = (value) => value ? new Date(value).toLocaleDateString() : '—';
const allowedCheckoutUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'checkout.stripe.com' || url.hostname.endsWith('.stripe.com')) ? url.href : null;
  } catch { return null; }
};

async function beginCheckout(supabase, payment, button, message) {
  button.disabled = true;
  button.textContent = 'Preparing checkout…';
  message.textContent = '';
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { payment_id: payment.id },
  });
  if (error || !data?.ok) {
    console.error('Checkout creation failed', error, data);
    button.disabled = false;
    button.textContent = 'Pay securely';
    const code = data?.error || '';
    message.textContent = code === 'provider_not_configured'
      ? 'Secure card checkout is not active yet. No payment was taken.'
      : code === 'service_not_completed'
        ? 'Billing remains locked until the related service is completed.'
        : code === 'no_charge_case_cannot_checkout'
          ? 'This engagement is designated no-charge. No payment is due.'
          : 'Secure checkout could not be started. No payment was taken.';
    return;
  }
  const checkoutUrl = allowedCheckoutUrl(data.checkout_url);
  if (!checkoutUrl) {
    button.disabled = false;
    button.textContent = 'Pay securely';
    message.textContent = 'The payment provider returned an invalid checkout address. No payment was taken.';
    return;
  }
  window.location.assign(checkoutUrl);
}

async function loadPayments({ supabase }) {
  const { data: client, error: clientError } = await supabase.from('clients').select('id').maybeSingle();
  if (clientError || !client) {
    container.textContent = 'No client billing profile is linked to this account.';
    return;
  }

  const { data, error } = await supabase
    .from('payments')
    .select('id,description,amount,currency,status,due_date,paid_at,refunded_amount,dispute_status,created_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  container.replaceChildren();
  if (error) {
    console.error('Payment load error', error);
    container.textContent = 'Billing records could not be loaded.';
    return;
  }
  if (!data?.length) {
    container.textContent = 'No invoices or payment records yet.';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const checkoutResult = params.get('checkout');
  if (checkoutResult === 'success' || checkoutResult === 'cancelled') {
    const notice = document.createElement('p');
    notice.className = 'status-message';
    notice.textContent = checkoutResult === 'success'
      ? 'Checkout returned successfully. Payment status is confirmed separately by the payment provider and may take a moment to update.'
      : 'Checkout was cancelled. No successful payment has been recorded.';
    container.appendChild(notice);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Description</th><th>Amount</th><th>Status</th><th>Due</th><th>Paid</th><th>Action</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const payment of data) {
    const tr = document.createElement('tr');
    const state = String(payment.status || 'pending').toLowerCase();
    const cells = [
      payment.description || 'Service payment',
      fmtMoney(payment.amount, payment.currency),
      state.replaceAll('_', ' '),
      fmtDate(payment.due_date),
      fmtDate(payment.paid_at),
    ];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }

    const action = document.createElement('td');
    if (['pending','failed'].includes(state)) {
      const pay = document.createElement('button');
      pay.type = 'button';
      pay.className = 'button';
      pay.textContent = 'Pay securely';
      const message = document.createElement('div');
      message.className = 'status-message';
      pay.addEventListener('click', () => beginCheckout(supabase, payment, pay, message));
      action.append(pay, message);
    } else if (state === 'paid') {
      action.textContent = 'Paid';
    } else if (state === 'partially_refunded') {
      action.textContent = `Partial refund: ${fmtMoney(payment.refunded_amount, payment.currency)}`;
    } else if (state === 'refunded') {
      action.textContent = 'Refunded';
    } else if (state === 'disputed' || state === 'chargeback') {
      action.textContent = `Payment dispute${payment.dispute_status ? ` · ${payment.dispute_status}` : ''}`;
    } else {
      action.textContent = state.replaceAll('_', ' ');
    }
    tr.appendChild(action);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

ready.then(loadPayments).catch((error) => {
  console.error('Billing workspace error', error);
  if (container) container.textContent = 'Billing workspace is unavailable.';
});
