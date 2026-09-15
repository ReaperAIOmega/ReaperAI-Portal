const setText = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

const loadDashboard = async ({ supabase, profile }) => {
  setText('welcome-name', profile.full_name || profile.email || 'Client');

  const [{ data: client, error: clientError }, { data: cases, error: casesError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase.from('clients').select('id,status').maybeSingle(),
    supabase.from('cases').select('id,status,case_type,next_action_at').order('created_at', { ascending: false }),
    supabase.from('tasks').select('id,title,status,due_date').order('created_at', { ascending: false }),
  ]);

  if (clientError || casesError || tasksError) {
    console.error('Dashboard load error:', { clientError, casesError, tasksError });
    setText('account-status', 'Unavailable');
    setText('next-step', 'Contact support');
    return;
  }

  const activeCases = (cases || []).filter((item) => !['closed', 'complete', 'completed'].includes(String(item.status).toLowerCase()));
  const openTasks = (tasks || []).filter((item) => !['done', 'complete', 'completed', 'closed'].includes(String(item.status).toLowerCase()));

  setText('active-services', String(activeCases.length));
  setText('open-tasks', String(openTasks.length));
  setText('account-status', client?.status || 'Pending onboarding');
  setText('next-step', openTasks[0]?.title || activeCases[0]?.case_type || 'No action due');
};

if (window.reaperAuth) loadDashboard(window.reaperAuth);
document.addEventListener('reaper:auth-ready', (event) => loadDashboard(event.detail), { once: true });
