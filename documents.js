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
const requirementsBox = document.getElementById('document-requirements');
const uploadCard = document.getElementById('document-upload-card');

const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';
const safeName = (value) => String(value || 'document').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
const labelForCategory = (value) => String(value || 'document')
  .replace(/-/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

async function getClient(supabase) {
  const { data, error } = await supabase.from('clients').select('id,status').maybeSingle();
  if (error) throw error;
  return data;
}

function bestDocumentForCategory(documents, category) {
  const matches = documents.filter((row) => row.category === category);
  const rank = { approved: 4, pending: 3, changes_requested: 2, rejected: 1 };
  return matches.sort((a, b) => (rank[b.review_status] || 0) - (rank[a.review_status] || 0))[0] || null;
}

function renderRequirements(cases, requirements, documents) {
  requirementsBox.replaceChildren();
  const activeCases = cases.filter((row) => !['completed','closed','cancelled'].includes(String(row.status || '').toLowerCase()));
  if (!activeCases.length) {
    requirementsBox.textContent = 'No active service checklist is assigned yet.';
    return;
  }

  for (const caseRow of activeCases) {
    const caseRequirements = requirements.filter((row) => row.case_type === caseRow.case_type);
    const section = document.createElement('div');
    section.className = 'card';
    section.style.marginTop = '16px';

    const heading = document.createElement('h3');
    heading.textContent = caseRow.title || caseRow.case_type;
    section.appendChild(heading);

    if (!caseRequirements.length) {
      const none = document.createElement('p');
      none.textContent = 'No service-specific documents are currently required for this engagement.';
      section.appendChild(none);
      requirementsBox.appendChild(section);
      continue;
    }

    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Document</th><th>Requirement</th><th>Status</th><th>Action</th></tr></thead>';
    const tbody = document.createElement('tbody');

    for (const requirement of caseRequirements) {
      const documentRow = bestDocumentForCategory(documents, requirement.document_category);
      const tr = document.createElement('tr');

      const documentCell = document.createElement('td');
      const title = document.createElement('strong');
      title.textContent = labelForCategory(requirement.document_category);
      const description = document.createElement('div');
      description.textContent = requirement.description || '';
      documentCell.append(title, description);

      const requiredCell = document.createElement('td');
      requiredCell.textContent = requirement.required ? 'Required' : 'Optional';

      const stateCell = document.createElement('td');
      if (!documentRow) stateCell.textContent = 'Not uploaded';
      else if (documentRow.review_status === 'approved') stateCell.textContent = 'Approved';
      else if (documentRow.review_status === 'changes_requested') stateCell.textContent = 'Changes requested';
      else stateCell.textContent = 'Uploaded · pending review';

      const actionCell = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = documentRow?.review_status === 'approved' ? 'btn-secondary' : 'button';
      button.textContent = documentRow?.review_status === 'approved' ? 'Approved' : (documentRow ? 'Upload replacement' : 'Upload');
      button.disabled = documentRow?.review_status === 'approved';
      if (!button.disabled) {
        button.addEventListener('click', () => {
          categoryInput.value = requirement.document_category;
          uploadCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          fileInput?.focus();
        });
      }
      actionCell.appendChild(button);

      tr.append(documentCell, requiredCell, stateCell, actionCell);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    section.appendChild(table);
    requirementsBox.appendChild(section);
  }
}

function renderDocumentTable(supabase, documents) {
  list.replaceChildren();
  if (!documents.length) {
    list.textContent = 'No documents uploaded yet.';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>File</th><th>Category</th><th>Review</th><th>Uploaded</th><th>Access</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const documentRow of documents) {
    const tr = document.createElement('tr');
    for (const value of [documentRow.file_name, labelForCategory(documentRow.category), documentRow.review_status, fmtDate(documentRow.uploaded_at)]) {
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

async function loadDocuments(context) {
  const { supabase } = context;
  const client = await getClient(supabase);
  if (!client) {
    list.textContent = 'No client record is linked to this account.';
    requirementsBox.textContent = 'No service checklist is available.';
    form?.setAttribute('hidden', '');
    return;
  }

  const [{ data: documents, error: documentsError }, { data: cases, error: casesError }] = await Promise.all([
    supabase
      .from('documents')
      .select('id,file_name,category,review_status,storage_path,uploaded_at')
      .eq('client_id', client.id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('cases')
      .select('id,case_type,title,status,stage')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
  ]);

  if (documentsError || casesError) {
    console.error('Document workspace load error', documentsError || casesError);
    list.textContent = 'Documents could not be loaded.';
    requirementsBox.textContent = 'Document checklist could not be loaded.';
    return;
  }

  const caseTypes = [...new Set((cases || []).map((row) => row.case_type).filter(Boolean))];
  let requirements = [];
  if (caseTypes.length) {
    const { data, error } = await supabase
      .from('document_requirements')
      .select('case_type,document_category,required,description')
      .in('case_type', caseTypes)
      .order('required', { ascending: false });
    if (error) {
      console.error('Document requirements load error', error);
      requirementsBox.textContent = 'Document checklist could not be loaded.';
    } else {
      requirements = data || [];
    }
  }

  renderRequirements(cases || [], requirements, documents || []);
  renderDocumentTable(supabase, documents || []);
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
    await supabase.storage.from('client-documents').remove([path]).catch(() => undefined);
    status.textContent = 'The upload could not be finalized. The incomplete file was removed; please try again.';
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
  if (requirementsBox) requirementsBox.textContent = 'Document checklist is unavailable.';
});
