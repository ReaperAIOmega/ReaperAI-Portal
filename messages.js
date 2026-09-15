const ready = window.reaperAuth
  ? Promise.resolve(window.reaperAuth)
  : new Promise((resolve) => document.addEventListener('reaper:auth-ready', (event) => resolve(event.detail), { once: true }));

const threadList = document.getElementById('thread-list');
const conversation = document.getElementById('conversation');
const conversationTitle = document.getElementById('conversation-title');
const newForm = document.getElementById('new-thread-form');
const newSubject = document.getElementById('thread-subject');
const newMessage = document.getElementById('thread-message');
const newSubmit = document.getElementById('thread-submit');
const newStatus = document.getElementById('thread-status');
const replyForm = document.getElementById('reply-form');
const replyMessage = document.getElementById('reply-message');
const replySubmit = document.getElementById('reply-submit');
const replyStatus = document.getElementById('reply-status');
let activeThreadId = null;
let clientId = null;
let context = null;
const fmt = (value) => value ? new Date(value).toLocaleString() : '—';

async function markRead(supabase, profileId, messages) {
  const unread = messages.filter((m) => m.sender_profile_id !== profileId).map((m) => ({ message_id: m.id, profile_id: profileId, read_at: new Date().toISOString() }));
  if (unread.length) await supabase.from('message_reads').upsert(unread, { onConflict: 'message_id,profile_id' });
}

async function openThread(thread) {
  activeThreadId = thread.id;
  conversationTitle.textContent = thread.subject;
  replyForm.hidden = thread.status === 'closed';
  conversation.textContent = 'Loading messages…';
  const { supabase, profile } = context;
  const { data, error } = await supabase.from('messages').select('id,sender_profile_id,body,created_at').eq('thread_id', thread.id).order('created_at');
  conversation.replaceChildren();
  if (error) { conversation.textContent = 'Messages could not be loaded.'; return; }
  for (const row of data || []) {
    const box = document.createElement('div');
    box.className = 'panel';
    box.style.marginBottom = '12px';
    const meta = document.createElement('strong');
    meta.textContent = `${row.sender_profile_id === profile.id ? 'You' : 'Johnson Strategic Solutions'} · ${fmt(row.created_at)}`;
    const body = document.createElement('p');
    body.style.whiteSpace = 'pre-wrap';
    body.textContent = row.body;
    box.append(meta, body);
    conversation.appendChild(box);
  }
  if (!(data || []).length) conversation.textContent = 'No messages yet.';
  await markRead(supabase, profile.id, data || []);
}

async function loadThreads() {
  const { supabase } = context;
  const { data, error } = await supabase.from('message_threads').select('id,subject,status,created_at,updated_at').order('updated_at', { ascending: false });
  threadList.replaceChildren();
  if (error) { threadList.textContent = 'Conversations could not be loaded.'; return; }
  if (!(data || []).length) { threadList.textContent = 'No conversations yet.'; return; }
  for (const row of data) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary';
    button.style.display = 'block';
    button.style.width = '100%';
    button.style.marginBottom = '8px';
    button.textContent = `${row.subject} · ${row.status} · ${fmt(row.updated_at)}`;
    button.addEventListener('click', () => openThread(row));
    threadList.appendChild(button);
  }
}

newForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const { supabase, profile } = context;
  newSubmit.disabled = true;
  newStatus.textContent = '';
  const { data: thread, error: threadError } = await supabase.from('message_threads').insert({ client_id: clientId, subject: newSubject.value.trim(), created_by: profile.id }).select('id,subject,status,created_at,updated_at').single();
  if (threadError || !thread) {
    newStatus.textContent = 'Conversation could not be created.';
    newSubmit.disabled = false;
    return;
  }
  const { error: messageError } = await supabase.from('messages').insert({ thread_id: thread.id, sender_profile_id: profile.id, body: newMessage.value.trim() });
  if (messageError) {
    newStatus.textContent = 'Conversation was created but the message could not be sent.';
    newSubmit.disabled = false;
    return;
  }
  newForm.reset();
  newStatus.textContent = 'Message sent securely.';
  newSubmit.disabled = false;
  await loadThreads();
  await openThread(thread);
});

replyForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeThreadId) return;
  const { supabase, profile } = context;
  replySubmit.disabled = true;
  replyStatus.textContent = '';
  const body = replyMessage.value.trim();
  const { error } = await supabase.from('messages').insert({ thread_id: activeThreadId, sender_profile_id: profile.id, body });
  if (error) {
    replyStatus.textContent = 'Reply could not be sent.';
    replySubmit.disabled = false;
    return;
  }
  replyForm.reset();
  replySubmit.disabled = false;
  const { data: thread } = await supabase.from('message_threads').select('id,subject,status,created_at,updated_at').eq('id',activeThreadId).single();
  if (thread) await openThread(thread);
  await loadThreads();
});

ready.then(async (value) => {
  context = value;
  const { data, error } = await value.supabase.from('clients').select('id').maybeSingle();
  if (error || !data) throw error || new Error('client_record_missing');
  clientId = data.id;
  await loadThreads();
}).catch((error) => {
  console.error('Messaging workspace error', error);
  threadList.textContent = 'Messaging is unavailable.';
});
