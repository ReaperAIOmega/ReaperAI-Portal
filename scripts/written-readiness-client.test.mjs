// Unit tests with an injected client. Not a signed browser session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { acceptAgreement, acceptOffer, loadOffer, sha256Hex } from '../written-readiness-client.mjs';

const Q = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222', A = '33333333-3333-4333-8333-333333333333';
const EXPIRES = new Date(Date.now() + 86400000).toISOString();
const offer = (o = {}) => ({ quote_id: Q, status: 'sent', title: 'Written Business Funding Readiness Blueprint', scope: 'Written readiness only.',
  amount: 250, currency: 'USD', sent_at: '2026-11-10T00:00:00Z', expires_at: EXPIRES, offer_sha256: 'a'.repeat(64), ...o });
function client(responses) {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push([name, args]); const r = responses[name]; return typeof r === 'function' ? r(args) : r; } };
}

test('loadOffer returns only canonical offers and treats a refused quote as not-an-offer', async () => {
  assert.deepEqual(await loadOffer(client({ preview_written_readiness_quote_offer: { data: offer() } }), Q), offer());
  assert.equal(await loadOffer(client({ preview_written_readiness_quote_offer: { error: { code: '42501' } } }), Q), null);
  await assert.rejects(loadOffer(client({ preview_written_readiness_quote_offer: { data: offer({ quote_id: A }) } }), Q), /invalid/);
  await assert.rejects(loadOffer(client({ preview_written_readiness_quote_offer: { data: offer({ offer_sha256: 'x' }) } }), Q), /invalid/);
  await assert.rejects(loadOffer(client({}), 'not-a-uuid'), /identifier/);
});

test('acceptOffer sends the exact offer digest with consent and validates the receipt', async () => {
  const receipt = { quote_id: Q, offer_sha256: 'a'.repeat(64), payment_initiated: false, payment_id: P, accepted_at: '2026-11-10T01:00:00Z' };
  const c = client({ accept_written_readiness_quote: { data: receipt } });
  assert.deepEqual(await acceptOffer(c, offer(), true), receipt);
  assert.deepEqual(c.calls[0], ['accept_written_readiness_quote', { p_quote_id: Q, p_offer_sha256: 'a'.repeat(64), p_consent: true }]);
  for (const bad of [{ payment_initiated: true }, { quote_id: A }, { offer_sha256: 'b'.repeat(64) }]) {
    await assert.rejects(acceptOffer(client({ accept_written_readiness_quote: { data: { ...receipt, ...bad } } }), offer(), true), /receipt invalid/);
  }
});

test('acceptOffer refuses without consent, expired, already accepted; classifies server outcomes', async () => {
  const c = client({});
  await assert.rejects(acceptOffer(c, offer(), false), /consent/);
  await assert.rejects(acceptOffer(c, offer({ expires_at: new Date(Date.now() - 1000).toISOString() }), true), /expired/);
  await assert.rejects(acceptOffer(c, offer({ status: 'accepted' }), true), /not open/);
  assert.equal(c.calls.length, 0);
  await assert.rejects(acceptOffer(client({ accept_written_readiness_quote: { error: { code: '22023', message: 'Offer differs from the published version' } } }), offer(), true),
    (e) => e.outcome === 'REJECTED' && /differs/.test(e.message));
  await assert.rejects(acceptOffer(client({ accept_written_readiness_quote: { error: { code: '08006' } } }), offer(), true), (e) => e.outcome === 'UNKNOWN');
});

test('acceptAgreement signs only the exact displayed text', async () => {
  const body = 'Written readiness agreement. No consultation. No financing guarantee.';
  const agreement = { id: A, body_snapshot: body, content_hash: await sha256Hex(body) };
  const c = client({ accept_written_readiness_agreement: { data: { agreement_id: A } } });
  await acceptAgreement(c, agreement, 'Fictional Signer', true);
  assert.deepEqual(c.calls[0][1], { p_agreement_id: A, p_content_sha256: agreement.content_hash, p_accepted_name: 'Fictional Signer', p_consent: true });
  const tampered = client({});
  await assert.rejects(acceptAgreement(tampered, { ...agreement, body_snapshot: body + ' (edited)' }, 'Fictional Signer', true), /does not match/);
  await assert.rejects(acceptAgreement(tampered, agreement, 'X', true), /full name/);
  await assert.rejects(acceptAgreement(tampered, agreement, 'Fictional Signer', false), /consent/);
  assert.equal(tampered.calls.length, 0);
});

test('page renders database text with textContent only and lists only written-readiness agreements', async () => {
  const ui = await readFile(new URL('../written-readiness-ui.mjs', import.meta.url), 'utf8');
  assert.ok(!/innerHTML/.test(ui));
  assert.match(ui, /offerCases\.has\(row\.case_id\)/);
  const html = await readFile(new URL('../written-readiness.html', import.meta.url), 'utf8');
  assert.match(html, /auth-guard\.js/);
  assert.match(html, /No consultation is required/);
  assert.match(html, /not a loan, a lender recommendation, a financing approval or a guarantee/);
});
