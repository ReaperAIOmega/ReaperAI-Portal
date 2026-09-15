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
let activeUploadCaseId = null;

const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';
const labelForCategory = (value) => String(value || 'document').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function getClient(supabase) {
  const { data, error } = await supabase.from('clients').select('id,status').maybeSingle();
  if (error) throw error;
  return data;
}

function bestDocumentForCategory(documents, category, caseId) {
  const matches = documents.filter((row) => row.category === category && (!caseId || !row.case_id || row.case_id === caseId));
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
      const documentRow = bestDocumentForCategory(documents, requirement.document_category, caseRow.id);
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
      if (!button.disabled) button.addEventListener('click', () => {
        activeUploadCaseId = caseRow.id;
        categoryInput.value = requirement.document_category;
        uploadCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        fileInput?.focus();
      });
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
  table.innerHTML = '<thead><tr><th>File</th><th>Category</th><th>Review</th><th>Validation</th><th>Uploaded</th><th>Access</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const documentRow of documents) {
    const tr = document.createElement('tr');
    for (const value of [documentRow.file_name, labelForCategory(documentRow.category), documentRow.review_status, documentRow.upload_validation_status || 'legacy', fmtDate(documentRow.uploaded_at)]) {
      const td = document.createElement('td');
      td.textContent = value || '—';
      tr.appendChild(td);
    }
    const access = document.createElement('td');
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'btn-secondary'; open.textContent = 'Open';
    open.addEventListener('click', async () => {
      open.disabled = true;
      const { data: signed, error: signedError } = await supabase.storage.from('client-documents').createSignedUrl(documentRow.storage_path, 60);
      open.disabled = false;
      if (signedError || !signed?.signedUrl) { status.textContent = 'Secure document link could not be created.'; return; }
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
    supabase.from('documents').select('id,case_id,file_name,category,review_status,upload_validation_status,storage_path,uploaded_at').eq('client_id', client.id).order('uploaded_at', { ascending: false }),
    supabase.from('cases').select('id,case_type,title,status,stage').eq('client_id', client.id).order('created_at', { ascending: false }),
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
    const { data, error } = await supabase.from('document_requirements').select('case_type,document_category,required,description').in('case_type', caseTypes).order('required', { ascending: false });
    if (error) requirementsBox.textContent = 'Document checklist could not be loaded.';
    else requirements = data || [];
  }
  renderRequirements(cases || [], requirements, documents || []);
  renderDocumentTable(supabase, documents || []);
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const context = await ready;
  const { supabase } = context;
  const file = fileInput?.files?.[0];
  const category = categoryInput?.value || 'other';
  status.textContent = '';
  if (!file) { status.textContent = 'Choose a document to upload.'; return; }
  if (!ALLOWED_TYPES.has(file.type)) { status.textContent = 'Upload a PDF, JPEG, PNG, HEIC, or HEIF file.'; return; }
  if (file.size > MAX_BYTES) { status.textContent = 'Document must be 20 MB or smaller.'; return; }

  submitButton.disabled = true;
  submitButton.textContent = 'Preparing secure upload…';
  try {
    const { data: begin, error: beginError } = await supabase.functions.invoke('begin-document-upload', { body: {
      file_name: file.name, mime_type: file.type, file_size_bytes: file.size, category, case_id: activeUploadCaseId,
    }});
    if (beginError || !begin?.ok || !begin?.path || !begin?.token || !begin?.session_id) throw new Error(begin?.error || beginError?.message || 'upload_session_failed');

    submitButton.textContent = 'Uploading…';
    const { error: uploadError } = await supabase.storage.from('client-documents').uploadToSignedUrl(begin.path, begin.token, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    submitButton.textContent = 'Validating…';
    const { data: finalized, error: finalizeError } = await supabase.functions.invoke('finalize-document-upload', { body: { session_id: begin.session_id } });
    if (finalizeError || !finalized?.ok) throw new Error(finalized?.error || finalizeError?.message || 'upload_finalization_failed');

    status.textContent = 'Document uploaded securely, validated, and queued for review.';
    form.reset();
    activeUploadCaseId = null;
    await loadDocuments(context);
  } catch (error) {
    console.error('Secure document upload failed', error);
    status.textContent = 'The document could not be securely finalized. No incomplete document record was retained. Please try again.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Upload document';
  }
});

categoryInput?.addEventListener('change', () => { activeUploadCaseId = null; });
ready.then(loadDocuments).catch((error) => {
  console.error('Document workspace error', error);
  if (list) list.textContent = 'Document workspace is unavailable.';
  if (requirementsBox) requirementsBox.textContent = 'Document checklist is unavailable.';
});
