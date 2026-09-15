const setText = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';

function renderSimpleTable(containerId, columns, rows, emptyMessage) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.replaceChildren();
  if (!rows.length) {
    container.textContent = emptyMessage;
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  for (const column of columns) {
    const th = document.createElement('th');
    th.textContent = column.label;
    head.appendChild(th);
  }
  thead.appendChild(head);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const column of columns) {
      const td = document.createElement('td');
      const value = column.render ? column.render(row) : row[column.key];
      td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

const loadDashboard = async ({ supabase, profile }) => {
  setText('welcome-name', profile.full_name || profile.email || 'Client');

  const [{ data: client, error: clientError }, { data: cases, error: casesError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase.from('clients').select('id,status').maybeSingle(),
    supabase.from('cases').select('id,title,case_type,status,stage,next_action_at,created_at').order('created_at', { ascending: false }),
    supabase.from('tasks').select('id,title,description,status,priority,due_date,created_at').order('created_at', { ascending: false }),
  ]);

  if (clientError || casesError || tasksError) {
    console.error('Dashboard load error:', { clientError, casesError, tasksError });
    setText('account-status', 'Unavailable');
    setText('next-step', 'Contact support');
    renderSimpleTable('case-list', [], [], 'Case details are unavailable.');
    renderSimpleTable('task-list', [], [], 'Task details are unavailable.');
    return;
  }

  const activeCases = (cases || []).filter((item) => !['closed', 'complete', 'completed'].includes(String(item.status).toLowerCase()));
  const openTasks = (tasks || []).filter((item) => !['done', 'complete', 'completed', 'closed'].includes(String(item.status).toLowerCase()));

  setText('active-services', String(activeCases.length));
  setText('open-tasks', String(openTasks.length));
  setText('account-status', client?.status || 'Pending onboarding');
  setText('next-step', openTasks[0]?.title || activeCases[0]?.case_type || 'No action due');

  renderSimpleTable('case-list', [
    { label: 'Engagement', render: (r) => r.title || r.case_type || 'Service' },
    { label: 'Stage', key: 'stage' },
    { label: 'Status', key: 'status' },
    { label: 'Next action', render: (r) => fmtDate(r.next_action_at) },
  ], activeCases, 'No active engagements.');

  renderSimpleTable('task-list', [
    { label: 'Task', key: 'title' },
    { label: 'Priority', key: 'priority' },
    { label: 'Status', key: 'status' },
    { label: 'Due', render: (r) => fmtDate(r.due_date) },
  ], openTasks, 'No open tasks.');
};

if (window.reaperAuth) loadDashboard(window.reaperAuth);
document.addEventListener('reaper:auth-ready', (event) => loadDashboard(event.detail), { once: true });
