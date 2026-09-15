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
const safeHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

async function loadPayments({ supabase }) {
  const { data: client, error: clientError } = await supabase.from('clients').select('id').maybeSingle();
  if (clientError || !client) {
    container.textContent = 'No client billing profile is linked to this account.';
    return;
  }

  const { data, error } = await supabase
    .from('payments')
    .select('id,description,amount,currency,status,due_date,paid_at,payment_url,created_at')
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

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Description</th><th>Amount</th><th>Status</th><th>Due</th><th>Paid</th><th>Action</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const payment of data) {
    const tr = document.createElement('tr');
    const cells = [
      payment.description || 'Service payment',
      fmtMoney(payment.amount, payment.currency),
      payment.status || 'pending',
      fmtDate(payment.due_date),
      fmtDate(payment.paid_at),
    ];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }

    const action = document.createElement('td');
    const paymentUrl = safeHttpsUrl(payment.payment_url);
    if (paymentUrl && String(payment.status || '').toLowerCase() !== 'paid') {
      const pay = document.createElement('a');
      pay.href = paymentUrl;
      pay.target = '_blank';
      pay.rel = 'noopener noreferrer';
      pay.className = 'button';
      pay.textContent = 'Pay securely';
      action.appendChild(pay);
    } else if (String(payment.status || '').toLowerCase() === 'paid') {
      action.textContent = 'Paid';
    } else {
      action.textContent = 'Awaiting secure payment link';
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
