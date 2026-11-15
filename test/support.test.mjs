import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDocs, sectionIds, sectionText, PROMISE, NOTES_LINE } from './page-text.mjs';

const pages = await readDocs();
const html = pages.get('roll-call/support/index.html');

const SUPPORT_SECTIONS = {
  'what-it-does': [/5, 10, 20 or 30/, /\bKeep\b/, /Set aside/, /\bMerge\b/, /Not the same/, /\bUndo\b/, /30 days/],
  'daily-deck': [/once a day/, /\bround\b/, /\bhalf\b/, /Do 5 more/, /tomorrow/],
  duplicates: [/Same mobile number/, /Same email/, /Nickname: Mike ↔ Michael/, /First initial/, /Last initial/,
    /Small spelling difference/, /Same name only/, /Becomes one card/, /\bChange\b/, /This one's different/,
    /Exchange/, /Contact Posters/],
  review: [PROMISE, /Keep all/, /\bLater\b/, /free space/, /Changed since you saw it/],
  'recently-removed': [/30 days/, /\bRestore\b/, /\.vcf/, /Delete these copies now/, /iCloud Backup/],
  'limited-access': [/iOS 18/, /Share more/, /Open Settings/, /Recently removed/],
  'read-only': [/Couldn't change: this account doesn't allow it/],
  notes: [NOTES_LINE],
  accessibility: [/VoiceOver/, /Voice Control/, /200%/, /Reduce Motion/, /\bdark\b/, /\bLater\b/],
  contact: [/support@unfilteredinvestmentsllc\.com/],
};

test('support page sections come in order', () => {
  assert.deepEqual(sectionIds(html), Object.keys(SUPPORT_SECTIONS));
});

for (const [id, patterns] of Object.entries(SUPPORT_SECTIONS)) {
  test(`support #${id} states its facts`, () => {
    const text = sectionText(html, id);
    for (const p of patterns) assert.match(text, p);
  });
}

test('support page has the Accessibility anchor', () => {
  assert.match(html, /<section id="accessibility">\s*<h2>Accessibility<\/h2>/);
});

test('support page links to the privacy policy', () => {
  assert.ok(html.includes('href="/roll-call/privacy/"'));
});
