const form = document.getElementById('initialize-client-form');
const passwordInput = document.getElementById('new-password');
const confirmInput = document.getElementById('confirm-password');
const submitButton = document.getElementById('initialize-client-submit');
const status = document.getElementById('initialize-client-status');
const token = new URLSearchParams(window.location.search).get('token') || '';

const validPassword = (value) => value.length >= 14 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

if (!token) {
  status.textContent = 'This onboarding link is incomplete. Request a new secure setup link.';
  submitButton.disabled = true;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = passwordInput?.value ?? '';
  const confirmPassword = confirmInput?.value ?? '';
  if (!validPassword(password)) {
    status.textContent = 'Password does not meet the required security policy.';
    return;
  }
  if (password !== confirmPassword) {
    status.textContent = 'Passwords do not match.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Activating...';
  status.textContent = '';

  try {
    const response = await fetch('https://itswbmjvuxumfjqkkqgx.supabase.co/functions/v1/initialize-client-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      status.textContent = response.status === 410
        ? 'This setup link is invalid, expired, or already used. Request a new onboarding link.'
        : 'Portal activation could not be completed. Contact Johnson Strategic Solutions.';
      submitButton.disabled = false;
      submitButton.textContent = 'Activate secure portal';
      return;
    }

    status.textContent = 'Portal activated. Redirecting to secure sign in...';
    window.history.replaceState({}, document.title, window.location.pathname);
    setTimeout(() => {
      window.location.replace(`/login.html?email=${encodeURIComponent(body.email || '')}`);
    }, 900);
  } catch {
    status.textContent = 'Portal activation service is temporarily unavailable. Try again.';
    submitButton.disabled = false;
    submitButton.textContent = 'Activate secure portal';
  }
});
