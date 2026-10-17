import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Execute the ACTUAL portal auth guard with fake browser objects and Supabase
// responses. No network, real passwords, real customers, or database writes.
const source = await readFile(new URL('../auth-guard.js', import.meta.url), 'utf8');
const stripped = source.replace(
  /^import\s+\{\s*createClient\s*\}\s+from\s+['"][^'"]+['"];\s*/,
  '',
);
assert.notEqual(stripped, source, 'Expected the CDN import to be removed for isolated behavior testing.');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const executeGuard = new AsyncFunction('createClient', 'window', 'document', 'CustomEvent', stripped);

async function scenario({
  session = { user: { id: 'test-user-1' } },
  sessionError = null,
  profile = { id: 'test-user-1', role: 'client', status: 'active' },
  profileError = null,
  initialized = true,
  securityError = null,
  hash = '',
} = {}) {
  const calls = { redirects: [], signOut: 0, readyEvents: [], queried: [], listeners: [] };
  const document = {
    title: 'Test Portal',
    documentElement: { style: { visibility: 'hidden' } },
    dispatchEvent: (event) => calls.readyEvents.push(event),
    addEventListener: (name, callback) => calls.listeners.push({ name, callback }),
  };
  const window = {
    location: {
      pathname: '/dashboard.html', search: '', hash,
      replace: (path) => calls.redirects.push(path),
    },
    history: { replaceState: (_s, _t, path) => calls.replacedPath = path },
  };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session }, error: sessionError }),
      signOut: async () => { calls.signOut++; return { error: null }; },
    },
    from(table) {
      calls.queried.push(table);
      return {
        select() { return this; },
        eq() { return this; },
        async single() {
          if (table === 'profiles') return { data: profile, error: profileError };
          if (table === 'account_security') {
            return { data: { password_initialized: initialized }, error: securityError };
          }
          throw new Error('Unexpected data query: ' + table);
        },
      };
    },
  };
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  await executeGuard(() => supabase, window, document, CustomEvent);
  return { calls, window, document };
}

test('missing session redirects and does not reveal workspace', async () => {
  const { calls, window, document } = await scenario({ session: null });
  assert.equal(calls.redirects.length, 1);
  assert.equal(calls.readyEvents.length, 0);
  assert.equal(document.documentElement.style.visibility, 'hidden');
  assert.equal(window.reaperAuth, undefined);
});

test('inactive client cannot enter or receive auth-ready event', async () => {
  const { calls, window, document } = await scenario({
    profile: { id: 'test-user-1', role: 'client', status: 'paused' },
  });
  assert.equal(calls.signOut, 1);
  assert.equal(calls.redirects.length, 1);
  assert.equal(calls.readyEvents.length, 0);
  assert.equal(document.documentElement.style.visibility, 'hidden');
  assert.equal(window.reaperAuth, undefined);
});

test('client with incomplete password initialization fails closed', async () => {
  const { calls, window, document } = await scenario({ initialized: false });
  assert.equal(calls.signOut, 1);
  assert.equal(calls.redirects.length, 1);
  assert.equal(calls.readyEvents.length, 0);
  assert.equal(document.documentElement.style.visibility, 'hidden');
  assert.equal(window.reaperAuth, undefined);
});

test('client with security-state query error fails closed', async () => {
  const { calls, document } = await scenario({ securityError: new Error('RLS denied') });
  assert.equal(calls.signOut, 1);
  assert.equal(calls.readyEvents.length, 0);
  assert.equal(document.documentElement.style.visibility, 'hidden');
});

test('valid active client gets only its authorized portal context', async () => {
  const { calls, window, document } = await scenario();
  assert.equal(calls.redirects.length, 0);
  assert.equal(calls.readyEvents.length, 1);
  assert.equal(calls.readyEvents[0].type, 'reaper:auth-ready');
  assert.equal(document.documentElement.style.visibility, 'visible');
  assert.equal(window.reaperAuth.profile.role, 'client');
  assert.ok(Object.isFrozen(window.reaperAuth));
});

test('admin sessions cannot enter customer-only portal', async () => {
  const { calls, window, document } = await scenario({
    profile: { id: 'test-user-1', role: 'admin', status: 'active' },
  });
  assert.equal(calls.signOut, 1);
  assert.equal(calls.redirects.length, 1);
  assert.equal(calls.readyEvents.length, 0);
  assert.equal(document.documentElement.style.visibility, 'hidden');
  assert.equal(window.reaperAuth, undefined);
});

test('invalid profile or profile lookup error never reveals portal', async () => {
  for (const options of [{ profile: null }, { profileError: new Error('unavailable') }]) {
    const { calls, document } = await scenario(options);
    assert.equal(calls.readyEvents.length, 0);
    assert.equal(document.documentElement.style.visibility, 'hidden');
  }
});

test('successful login strips sensitive URL fragments', async () => {
  const { calls } = await scenario({ hash: '#access_token=not-a-real-token' });
  assert.equal(calls.replacedPath, '/dashboard.html');
});

test('signed-in user can sign out through data-signout handler', async () => {
  const { calls } = await scenario();
  const handler = calls.listeners.find((x) => x.name === 'click')?.callback;
  assert.equal(typeof handler, 'function');
  await handler({
    target: { closest: () => ({ dataset: { signout: '' } }) },
    preventDefault: () => {},
  });
  assert.equal(calls.signOut, 1);
  assert.equal(calls.redirects.length, 1);
});
