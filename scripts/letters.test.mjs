import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Portal letters: authorized RPC; local PDF; no direct mail send',()=>{
  const html=read('letters.html'),js=read('letters.js'),nav=read('navbar-client.html');
  assert(html.includes('letter-authorizations')&&html.includes('generated-letters'));
  assert(nav.includes('href="letters.html"'));
  assert(js.includes("rpc('generate_authorized_letter'"));
  assert(js.includes("rpc('request_letterstream_mailing'"));
  assert(js.includes('window.pdfMake.createPdf(pdf).download(filename)'));
  assert(js.includes('letter.body_snapshot'));
  assert(!js.includes('fetch(\'https://www.letterstream.com'));
  assert(js.includes("context.profile.role !== 'client'"));
});