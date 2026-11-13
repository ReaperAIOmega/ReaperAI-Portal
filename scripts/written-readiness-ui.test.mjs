import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function renderWithAgreementResult(result) {
  const elements = Object.fromEntries(['status', 'offers', 'agreements'].map(id => [id, { textContent: '', replaceChildren() {} }]));
  const supabase = { from(table) { return { select() { return this; }, in() { return this; }, order() { return Promise.resolve(table === 'quotes' ? { data: [] } : result); } }; } };
  const source = (await readFile(new URL('../written-readiness-ui.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/, '');
  vm.runInNewContext(source, { window: { reaperAuth: { supabase } }, document: { getElementById: id => elements[id] }, console });
  await new Promise(resolve => setImmediate(resolve));
  return elements.status.textContent;
}

test('agreement read failure is visible instead of an empty successful view', async () => {
  assert.match(await renderWithAgreementResult({ data: null, error: { code: '08006' } }), /agreements could not be loaded/i);
});

test('successful empty agreement read preserves the no-offer message', async () => {
  assert.match(await renderWithAgreementResult({ data: [], error: null }), /No written readiness offer/);
});
