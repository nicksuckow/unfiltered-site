import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDocs, pageText, sectionIds, sectionText, PROMISE, NOTES_LINE } from './page-text.mjs';

const pages = await readDocs();
const html = pages.get('roll-call/privacy/index.html');

const PRIVACY_SECTIONS = {
  collected: [/Roll Call doesn't collect any data\./, /makes no network requests/, /analytics/, /Data Not Collected/,
    /[Nn]othing leaves your iPhone unless you export it/],
  'third-parties': [/no third-party/, /Share With App Developers/],
  'contacts-access': [/keep or set aside/, /duplicates/, /on your iPhone/],
  'limited-access': [/iOS 18/, /only the contacts you share/],
  'changes-and-copies': [PROMISE, /Recently removed/, /30 days/, /excluded from iCloud Backup/, /deleted when you delete the app/, /\.vcf/],
  'stored-data': [/settings/, /opaque record ids and one-way hashes/, /no names, phone numbers or email addresses/, /Recently removed/, /iCloud Backup/],
  notes: [NOTES_LINE],
  reminders: [/local notifications/, /\boff\b/],
  withdraw: [/Settings > Privacy & Security > Contacts/, /Delete these copies now/, /delete the app/],
  website: [/GitHub Pages/, /IP address/, /no scripts, cookies, analytics or web fonts/],
  contact: [/Nicholas Suckow/, /support@unfilteredinvestmentsllc\.com/],
};

test('privacy policy sections come in order', () => {
  assert.deepEqual(sectionIds(html), Object.keys(PRIVACY_SECTIONS));
});

for (const [id, patterns] of Object.entries(PRIVACY_SECTIONS)) {
  test(`privacy #${id} states its facts`, () => {
    const text = sectionText(html, id);
    for (const p of patterns) assert.match(text, p);
  });
}

test('privacy policy shows when it was last updated', () => {
  assert.match(pageText(html), /Last updated: [A-Z][a-z]+ \d{1,2}, \d{4}/);
});

test('privacy policy links to the support page', () => {
  assert.ok(html.includes('href="/roll-call/support/"'));
});
