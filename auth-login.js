import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://itswbmjvuxumfjqkkqgx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgBKt5K8CQCPSC-MaC7s6g_M2iTdWEN';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const form = document.getElementById('client-login-form');
const emailInput = document.getElementById('client-email');
const passwordInput = document.getElementById('client-password');
const submitButton = document.getElementById('client-login-submit');
const status = document.getElementById('client-login-status');

const params = new URLSearchParams(window.location.search);
const emailParam = params.get('email');
if (emailParam && emailInput) emailInput.value = emailParam;

const existing = await supabase.auth.getSession();
if (existing.data?.session) window.location.replace('/');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = emailInput?.value.trim().toLowerCase();
  const password = passwordInput?.value ?? '';
  if (!email || !password) return;

  submitButton.disabled = true;
  submitButton.textContent = 'Signing in...';
  status.textContent = '';

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    status.textContent = 'Sign-in failed. Check your client email and password.';
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in securely';
    return;
  }

  const [{ data: profile, error: profileError }, { data: security, error: securityError }] = await Promise.all([
    supabase.from('profiles').select('role,status').eq('id', data.session.user.id).single(),
    supabase.from('account_security').select('password_initialized').eq('profile_id', data.session.user.id).single(),
  ]);

  if (profileError || !profile || !['client','admin'].includes(profile.role) || profile.status !== 'active') {
    await supabase.auth.signOut();
    status.textContent = 'This account is not authorized for client portal access.';
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in securely';
    return;
  }

  if (profile.role === 'client' && (securityError || !security?.password_initialized)) {
    await supabase.auth.signOut();
    status.textContent = 'Complete the secure onboarding link before signing in.';
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in securely';
    return;
  }

  window.location.replace('/');
});
