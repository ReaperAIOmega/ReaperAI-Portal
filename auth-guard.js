import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

import { resolveRuntime } from './runtime-config.mjs';
const runtime = resolveRuntime(window.location, 'portal');
const SUPABASE_URL = runtime.url;
const SUPABASE_PUBLISHABLE_KEY = runtime.key;
const LOGIN_URL = runtime.page('/login.html');

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const redirectToLogin = () => window.location.replace(LOGIN_URL);

try {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session || !runtime.emailAllowed(session.user?.email)) {
    if (session) await supabase.auth.signOut({ scope: 'local' });
    redirectToLogin();
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,role,full_name,status')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile || !['client', 'admin'].includes(profile.role) || profile.status !== 'active') {
      await supabase.auth.signOut();
      redirectToLogin();
    } else {
      if (profile.role === 'client') {
        const { data: security, error: securityError } = await supabase
          .from('account_security')
          .select('password_initialized')
          .eq('profile_id', session.user.id)
          .single();
        if (securityError || !security?.password_initialized) {
          await supabase.auth.signOut();
          redirectToLogin();
          throw new Error('Account security validation failed');
        }
      }

      if (window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }

      window.reaperAuth = Object.freeze({ supabase, session, profile });
      document.documentElement.style.visibility = 'visible';
      document.dispatchEvent(new CustomEvent('reaper:auth-ready', { detail: window.reaperAuth }));

      document.addEventListener('click', async (event) => {
        const target = event.target.closest?.('[data-signout]');
        if (!target) return;
        event.preventDefault();
        await supabase.auth.signOut();
        redirectToLogin();
      });
    }
  }
} catch (error) {
  console.error('Portal authentication error:', error);
  redirectToLogin();
}
