const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));

const ALLOWED_TYPES = new Set(['application/pdf','image/jpeg','image/png','image/heic','image/heif']);
const MAX_BYTES = 20 * 1024 * 1024;
const form = document.getElementById('document-upload-form');
const fileInput = document.getElementById('document-file');
const categoryInput = document.getElementById('document-category');
const submitButton = document.getElementById('document-submit');
const status = document.getElementById('document-status');
const list = document.getElementById('document-list');

const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';
const safeName = (value) => String(value || 'document').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);

async function getClient(supabase) {
  const { data, error } = await supabase.from('clients').select('id,status').maybeSingle();
  if (error) throw error;
  return data;
}

async function loadDocuments(context) {
  const { supabase } = context;
  const client = await getClient(supabase);
  if (!client) {
    list.textContent = 'No client record is linked to this account.';
    form?.setAttribute('hidden', '');
    return;
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id,file_name,category,review_status,storage_path,uploaded_at')
    .eq('client_id', client.id)
    .order('uploaded_at', { ascending: false });

  list.replaceChildren();
  if (error) {
    console.error('Document list error', error);
    list.textContent = 'Documents could not be loaded.';
    return;
  }
  if (!data?.length) {
    list.textContent = 'No documents uploaded yet.';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>File</th><th>Category</th><th>Review</th><th>Uploaded</th><th>Access</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const documentRow of data) {
    const tr = document.createElement('tr');
    for (const value of [documentRow.file_name, documentRow.category, documentRow.review_status, fmtDate(documentRow.uploaded_at)]) {
      const td = document.createElement('td');
      td.textContent = value || '—';
      tr.appendChild(td);
    }
    const access = document.createElement('td');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn-secondary';
    open.textContent = 'Open';
    open.addEventListener('click', async () => {
      open.disabled = true;
      const { data: signed, error: signedError } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(documentRow.storage_path, 60);
      open.disabled = false;
      if (signedError || !signed?.signedUrl) {
        status.textContent = 'Secure document link could not be created.';
        return;
      }
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
    });
    access.appendChild(open);
    tr.appendChild(access);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  list.appendChild(table);
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const context = await ready;
  const { supabase, profile } = context;
  const file = fileInput?.files?.[0];
  const category = categoryInput?.value || 'other';
  status.textContent = '';

  if (!file) {
    status.textContent = 'Choose a document to upload.';
    return;
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    status.textContent = 'Upload a PDF, JPEG, PNG, HEIC, or HEIF file.';
    return;
  }
  if (file.size > MAX_BYTES) {
    status.textContent = 'Document must be 20 MB or smaller.';
    return;
  }

  const client = await getClient(supabase);
  if (!client) {
    status.textContent = 'No client record is linked to this account.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Uploading...';
  const path = `${profile.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from('client-documents')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('Storage upload error', uploadError);
    status.textContent = 'Secure upload failed. Try again.';
    submitButton.disabled = false;
    submitButton.textContent = 'Upload document';
    return;
  }

  const { error: metadataError } = await supabase.from('documents').insert({
    client_id: client.id,
    category,
    file_name: file.name,
    storage_bucket: 'client-documents',
    storage_path: path,
    mime_type: file.type,
    file_size_bytes: file.size,
    uploaded_by: profile.id,
    review_status: 'pending',
  });

  if (metadataError) {
    console.error('Document metadata error', metadataError);
    status.textContent = 'The file uploaded but its record could not be finalized. Contact support before uploading it again.';
    submitButton.disabled = false;
    submitButton.textContent = 'Upload document';
    return;
  }

  status.textContent = 'Document uploaded securely and queued for review.';
  form.reset();
  submitButton.disabled = false;
  submitButton.textContent = 'Upload document';
  await loadDocuments(context);
});

ready.then(loadDocuments).catch((error) => {
  console.error('Document workspace error', error);
  if (list) list.textContent = 'Document workspace is unavailable.';
});
