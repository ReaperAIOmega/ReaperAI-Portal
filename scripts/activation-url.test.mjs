import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../initialize-password.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../initialize-password.html', import.meta.url), 'utf8');

function evaluate(search) {
  const calls = [];
  const document = {
    title: 'Portal activation',
    getElementById: () => ({ addEventListener: () => {}, disabled: false, textContent: '' }),
  };
  const window = {
    location: { search, pathname: '/initialize-password.html', hash: '' },
    history: { replaceState: (_state, _title, path) => calls.push(path) },
  };
  const execute = new Function('document', 'window', 'URLSearchParams', source);
  execute(document, window, URLSearchParams);
  return calls;
}

test('activation URL suppresses token referrers before loading page assets', () => {
  const referrer = html.indexOf('<meta name="referrer" content="no-referrer">');
  const firstStylesheet = html.indexOf('<link rel="stylesheet"');
  assert.ok(referrer > 0);
  assert.ok(firstStylesheet > referrer, 'Referrer policy must precede CSS requests');
});

test('one-time token is stripped from browser URL immediately when page code loads', () => {
  assert.deepEqual(evaluate('?token=one-time-test-secret&state=pending'), ['/initialize-password.html']);
});

test('missing token does not fabricate activation context or rewrite history', () => {
  assert.deepEqual(evaluate(''), []);
});

test('token consumption still comes from the original URL before it is replaced', () => {
  const readAt = source.indexOf("new URLSearchParams(window.location.search).get('token')");
  const stripAt = source.indexOf('window.history.replaceState');
  const submitAt = source.indexOf("form?.addEventListener('submit'");
  assert.ok(readAt > 0 && stripAt > readAt && submitAt > stripAt);
});
