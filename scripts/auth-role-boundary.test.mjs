// Role/status/security matrix for the client Portal guard. Executes the real auth-guard.js
// source against a mocked Supabase client; not a signed browser session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveRuntime } from '../runtime-config.mjs';

const root = new URL('../', import.meta.url);
const source = (await readFile(new URL('auth-guard.js', root), 'utf8')).replace(/^import [^\r\n]*\r?\n/gm, '');

async function boot({ role, status, initialized, aal = 'aal1', email = 'reaper-synthetic-client-a-20261028@example.invalid' }) {
  const calls = [];
  const signOuts = [];
  const session = { user: { id: 'fixture-id', email } };
  const document = {
    title: 'Synthetic',
    documentElement: { style: { visibility: 'hidden' } },
    dispatchEvent(event) { calls.push(event.type); },
    addEventListener() {},
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      signOut: async (options) => { signOuts.push(options?.scope ?? 'global'); },
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: aal } }) },
    },
    from(table) {
      calls.push('from:' + table);
      return {
        select() { return this; },
        eq() { return this; },
        single: async () => (table === 'profiles'
          ? { data: { id: 'fixture-id', email, role, status } }
          : { data: initialized === null ? null : { password_initialized: initialized } }),
      };
    },
  };
  const window = {
    location: { href: 'http://127.0.0.1:4173/dashboard.html', pathname: '/dashboard.html', search: '', hash: '', replace() { calls.push('redirect'); } },
    history: { replaceState() {} },
    reaperAuth: null,
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  await vm.runInNewContext('(async()=>{' + source + '})()', {
    window, document, resolveRuntime, createClient: () => client, CustomEvent, console: { error() {} },
  });
  return { calls, signOuts, window, document };
}

test('only an active client with an initialized password reaches the Portal', async () => {
  let ready = 0;
  for (const role of ['client', 'admin', 'staff', null])
    for (const status of ['active', 'suspended', 'pending'])
      for (const initialized of [true, false, null])
        for (const aal of ['aal1', 'aal2']) {
          const r = await boot({ role, status, initialized, aal });
          const label = JSON.stringify({ role, status, initialized, aal });
          const allowed = role === 'client' && status === 'active' && initialized === true;
          assert.equal(r.calls.includes('reaper:auth-ready'), allowed, label);
          assert.equal(Boolean(r.window.reaperAuth), allowed, label);
          assert.equal(r.document.documentElement.style.visibility, allowed ? 'visible' : 'hidden', label);
          if (!allowed) assert.ok(r.calls.includes('redirect'), label);
          if (allowed) ready++;
        }
  assert.equal(ready, 2);
});

test('administrators are refused at any assurance level, with a local-only sign-out', async () => {
  for (const aal of ['aal1', 'aal2']) {
    const r = await boot({ role: 'admin', status: 'active', initialized: true, aal });
    assert.deepEqual(r.signOuts, ['local']);
    assert.ok(!r.calls.includes('from:account_security'));
    assert.ok(!r.calls.includes('reaper:auth-ready'));
  }
});

test('login page refuses administrators before redirecting into the Portal', async () => {
  const text = await readFile(new URL('auth-login.js', root), 'utf8');
  assert.ok(!/\['client',\s*'admin'\]/.test(text));
  assert.match(text, /profile\?\.role === 'admin'[\s\S]{0,80}signOut\(\{ scope: 'local' \}\)/);
});

test('auth modules load the SHA-256-recorded vendored SDK, not a CDN', async () => {
  const { createHash } = await import('node:crypto');
  const bundle = await readFile(new URL('vendor/supabase-2.117.2.js', root));
  assert.equal(createHash('sha256').update(bundle).digest('hex'), '7b989e32185b43f0720bb4549e8fc58c078f3f561bd3b69d5c1b622961b27b8d');
  for (const file of ['auth-guard.js', 'auth-login.js']) {
    const text = await readFile(new URL(file, root), 'utf8');
    assert.ok(text.startsWith("import { createClient } from './vendor/supabase-2.117.2.js';"), file);
    assert.ok(!text.includes('cdn.jsdelivr.net'), file);
  }
});
