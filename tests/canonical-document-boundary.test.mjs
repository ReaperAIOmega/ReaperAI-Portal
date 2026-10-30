import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const src = readFileSync(new URL('../documents.js', import.meta.url), 'utf8');
test('portal module syntax and canonical funding artifact boundary', () => {
  new Function(src);
  assert.match(src, /function isCanonicalFundingArtifact\(row\)/);
  assert.match(src, /row\?\.category === 'funding-document'/);
  assert.match(src, /startsWith\('funding-artifacts\/'\)/);
  assert.match(src, /!isCanonicalFundingArtifact\(row\)/);
  assert.match(src, /canonicalDeliverable \? null/);
  assert.match(src, /button\.disabled = canonicalDeliverable/);
  assert.match(src, /if \(isCanonicalFundingArtifact\(documentRow\)\)/);
  assert.match(src, /access\.appendChild\(held\)/);
  assert.match(src, /else access\.appendChild\(open\)/);
  assert.match(src, /Private funding delivery requires exact-version authorization/);
});
