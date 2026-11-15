import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { checkSite } from '../scripts/site-checks.mjs';
import { CONTACT_EMAIL, ROLL_CALL_URLS } from '../scripts/site.mjs';
import { readDocs, pageText, styleOf } from './page-text.mjs';

const pages = await readDocs();
const all = [...pages.values()];
const home = pages.get('index.html');
const count = (s, re) => (s.match(re) ?? []).length;

test('every page has the shared head', () => {
  assert.ok(all.length > 0);
  for (const html of all) {
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes('<meta charset="utf-8">'));
    assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
    assert.equal(count(html, /<style>/g), 1);
    assert.equal(count(html, /<main/g), 1);
    assert.equal(count(html, /<h1/g), 1);
  }
});

test('every page uses the same style block', () => {
  assert.equal(new Set(all.map(styleOf)).size, 1);
});

test('the style wraps long words and sizes nothing in px', () => {
  assert.match(styleOf(home), /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(styleOf(home), /\d(?:\.\d+)?px\b/);
});

test('the style follows light and dark and sets no colours', () => {
  assert.match(styleOf(home), /color-scheme:\s*light dark/);
  assert.doesNotMatch(
    styleOf(home),
    /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i,
  );
});

test('every footer names the publisher and the contact', () => {
  for (const html of all) {
    const footer = html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? '';
    assert.ok(footer.includes('© 2026 Nicholas Suckow'));
    assert.ok(footer.includes(`<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`));
  }
});

test('every page but home links home', () => {
  for (const [file, html] of pages) {
    if (file !== 'index.html') assert.ok(html.includes('href="/"'), file);
  }
});

test("home links each app's privacy and support page", () => {
  const dirs = readdirSync('docs', { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter(
      (d) =>
        existsSync(`docs/${d}/privacy/index.html`) && existsSync(`docs/${d}/support/index.html`),
    );
  assert.ok(dirs.length > 0);
  for (const d of dirs) {
    assert.ok(home.includes(`href="/${d}/privacy/"`), d);
    assert.ok(home.includes(`href="/${d}/support/"`), d);
  }
  assert.ok(pageText(home).includes('Roll Call'));
});

test('the 404 page says so and links home', () => {
  const html = pages.get('404.html');
  assert.ok(html.includes('<title>Page not found</title>'));
  assert.ok(html.includes('<a href="/">'));
});

test('CNAME names the apex domain', () => {
  assert.equal(readFileSync('docs/CNAME', 'utf8'), 'unfilteredinvestmentsllc.com\n');
});

test('.nojekyll is published', () => {
  assert.ok(existsSync('docs/.nojekyll'));
});

test('the URLs Roll Call ships with are final and resolve', () => {
  assert.deepEqual(
    { ...ROLL_CALL_URLS },
    {
      privacyPolicy: 'https://unfilteredinvestmentsllc.com/roll-call/privacy/',
      support: 'https://unfilteredinvestmentsllc.com/roll-call/support/',
      accessibility: 'https://unfilteredinvestmentsllc.com/roll-call/support/#accessibility',
    },
  );
  for (const key of ['privacyPolicy', 'support']) {
    const { pathname } = new URL(ROLL_CALL_URLS[key]);
    assert.ok(existsSync(`docs${pathname}index.html`), key);
  }
});

test('no page says she, her or Nick, or claims the app is free', () => {
  for (const html of all) {
    const text = pageText(html);
    assert.doesNotMatch(text, /\b(?:she|her|Nick)\b/i);
    assert.doesNotMatch(text, /\bfree\b(?!\s+(space|up)\b)/i);
  }
});

test('no page says "never leave"', () => {
  for (const html of all) assert.doesNotMatch(pageText(html), /never leave/i);
});

test('the published site passes every check', async () => {
  assert.deepEqual(await checkSite('docs'), []);
});
