// Client side of the written-readiness offer: exact published quote, then exact agreement text.
// Pure functions with an injected Supabase client; the database enforces every rule again.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[a-f0-9]{64}$/;

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function outcome(error, fallback) {
  const rejected = /^(?:22|23|42|55)[A-Z0-9]{3}$/.test(error?.code ?? '');
  return Object.assign(new Error(rejected ? (error.message || fallback) : 'Outcome unknown. Reload and check before retrying.'),
    { outcome: rejected ? 'REJECTED' : 'UNKNOWN', code: error?.code });
}

// Returns the canonical offer for a quote, or null when the quote is not a written-readiness offer.
export async function loadOffer(supabase, quoteId) {
  if (!UUID.test(quoteId ?? '')) throw new Error('Quote identifier required');
  const { data, error } = await supabase.rpc('preview_written_readiness_quote_offer', { p_quote_id: quoteId });
  if (error) { if (error.code === '42501') return null; throw outcome(error, 'Offer unavailable'); }
  if (!data || data.quote_id !== quoteId || !HEX64.test(data.offer_sha256 ?? '') || !['sent', 'accepted'].includes(data.status)
      || data.currency !== 'USD' || !(Number(data.amount) > 0) || !Number.isFinite(Date.parse(data.sent_at)) || !Number.isFinite(Date.parse(data.expires_at))) {
    throw Object.assign(new Error('Offer response invalid'), { outcome: 'UNKNOWN' });
  }
  return data;
}

export function offerExpired(offer, now = Date.now()) {
  const expires = Date.parse(offer?.expires_at);
  return !Number.isFinite(expires) || !Number.isFinite(now) || expires <= now;
}

export async function acceptOffer(supabase, offer, consent) {
  if (consent !== true) throw new Error('Explicit consent is required');
  if (!offer || !UUID.test(offer.quote_id ?? '') || !HEX64.test(offer.offer_sha256 ?? '')) throw new Error('Exact offer required');
  if (offer.status !== 'sent') throw new Error('Offer is not open for acceptance');
  if (offerExpired(offer)) throw new Error('Offer expired');
  const { data, error } = await supabase.rpc('accept_written_readiness_quote',
    { p_quote_id: offer.quote_id, p_offer_sha256: offer.offer_sha256, p_consent: true });
  if (error) throw outcome(error, 'Offer could not be accepted');
  if (!data || data.quote_id !== offer.quote_id || data.offer_sha256 !== offer.offer_sha256
      || data.payment_initiated !== false || !UUID.test(data.payment_id ?? '') || !data.accepted_at) {
    throw Object.assign(new Error('Acceptance receipt invalid'), { outcome: 'UNKNOWN' });
  }
  return data;
}

// The text shown must be the text signed: the digest is computed from the displayed body, and the server
// accepts only if it equals the issued agreement's stored digest.
export async function acceptAgreement(supabase, agreement, acceptedName, consent) {
  if (consent !== true) throw new Error('Explicit consent is required');
  const name = String(acceptedName ?? '').trim();
  if (name.length < 2 || name.length > 200) throw new Error('Type your full name to sign');
  if (!agreement || !UUID.test(agreement.id ?? '') || typeof agreement.body_snapshot !== 'string') throw new Error('Agreement required');
  const digest = await sha256Hex(agreement.body_snapshot);
  if (digest !== agreement.content_hash) throw new Error('Displayed agreement does not match the issued version; reload');
  const { data, error } = await supabase.rpc('accept_written_readiness_agreement',
    { p_agreement_id: agreement.id, p_content_sha256: digest, p_accepted_name: name, p_consent: true });
  if (error) throw outcome(error, 'Agreement could not be accepted');
  if (!data) throw Object.assign(new Error('Acceptance receipt invalid'), { outcome: 'UNKNOWN' });
  return data;
}
