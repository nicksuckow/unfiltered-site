import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  checkSite,
  findBrokenLinks,
  findPrivacyProblems,
  findStrayFiles,
  listFiles,
  validatePage,
} from '../scripts/site-checks.mjs';
import { page } from './fixtures.mjs';

const BAD_HEADINGS = '<main><h1>A</h1><h3>B</h3></main>';

test('validatePage passes a well-formed page', async () => {
  assert.deepEqual(await validatePage(page(), 'x.html'), []);
});

test('validatePage tags each problem with its file and check', async () => {
  const problems = await validatePage(page({ body: BAD_HEADINGS }), 'x.html');
  assert.notEqual(problems.length, 0);
  for (const p of problems) assert.deepEqual([p.file, p.check], ['x.html', 'html']);
});

const cases = [
  ['missing doctype', page().replace('<!DOCTYPE html>\n', ''), 'missing-doctype'],
  ['lang other than en', page().replace('lang="en"', 'lang="fr"'), 'lang="en"'],
  ['missing title', page().replace('<title>Title</title>\n', ''), 'title'],
  ['missing charset', page().replace('<meta charset="utf-8">\n', ''), 'charset'],
  [
    'missing viewport',
    page().replace('<meta name="viewport" content="width=device-width, initial-scale=1">\n', ''),
    'viewport',
  ],
  ['unclosed element', page({ body: '<main><h1>A</h1><p>x</main>' }), 'no-implicit-close'],
  [
    'duplicate id',
    page({ body: '<main><h1 id="a">A</h1><p id="a">x</p></main>' }),
    'no-dup-id',
  ],
  [
    'style attribute',
    page({ body: '<main><h1 style="color: red">A</h1></main>' }),
    'no-inline-style',
  ],
  ['skipped heading level', page({ body: BAD_HEADINGS }), 'heading-level'],
  ['second h1', page({ body: '<main><h1>A</h1><h1>B</h1></main>' }), 'heading-level'],
];

for (const [name, html, expected] of cases) {
  test(`validatePage reports a ${name}`, async () => {
    const problems = await validatePage(html, 'x.html');
    assert.ok(
      problems.some((p) => p.message.includes(expected)),
      `expected a message including "${expected}", got ${JSON.stringify(problems)}`,
    );
  });
}

function assertFlags(html, expected) {
  const problems = findPrivacyProblems(html, 'x.html');
  for (const p of problems) assert.deepEqual([p.file, p.check], ['x.html', 'privacy']);
  assert.ok(
    problems.some((p) => p.message.includes(expected)),
    `expected a message including "${expected}", got ${JSON.stringify(problems)}`,
  );
}

test('findPrivacyProblems passes a clean page', () => {
  const body = `<main><h1>Title</h1>
<section id="a"><h2>A</h2>
<p>No scripts, cookies, analytics or web fonts. Settings &gt; Privacy &amp; Security &gt; Contacts.</p>
<a href="/roll-call/privacy/">Privacy</a>
<a href="https://unfilteredinvestmentsllc.com/">Home</a>
<a href="#top">Top</a></section></main>
<footer><a href="mailto:support@unfilteredinvestmentsllc.com">Email</a></footer>`;
  const head = '<style>:root { color-scheme: light dark; }</style>';
  assert.deepEqual(findPrivacyProblems(page({ head, body }), 'x.html'), []);
});

test('findPrivacyProblems flags a script element', () => {
  assertFlags(page({ head: '<script>1</script>' }), '<script>');
  assertFlags(page({ head: '<script src="/a.js"></script>' }), '<script>');
});

test('findPrivacyProblems flags an event-handler attribute', () => {
  assertFlags(page({ body: '<p onclick="x()">x</p>' }), 'event handler');
});

test('findPrivacyProblems flags a javascript: URL', () => {
  assertFlags(page({ body: '<a href="javascript:void(0)">x</a>' }), 'javascript:');
});

for (const tag of 'img picture source iframe frame embed object video audio track link svg form base'.split(' ')) {
  test(`findPrivacyProblems flags <${tag}>, which loads something`, () => {
    assertFlags(page({ body: `<${tag}></${tag}>` }), `<${tag}>`);
  });
}

test('findPrivacyProblems flags CSS that loads a font or file', () => {
  assertFlags(page({ head: '<style>@font-face {}</style>' }), 'CSS');
  assertFlags(page({ head: '<style>@import "/a.css";</style>' }), 'CSS');
  assertFlags(page({ head: '<style>p { background: url(/p.gif); }</style>' }), 'CSS');
});

test('findPrivacyProblems flags a third-party URL, even in a plain link', () => {
  assertFlags(page({ body: '<a href="https://github.com/">x</a>' }), 'github.com');
  assertFlags(page({ body: '<p>//cdn.example.com/x</p>' }), 'cdn.example.com');
});

test("findPrivacyProblems flags www, which isn't the canonical host", () => {
  assertFlags(
    page({ body: '<a href="https://www.unfilteredinvestmentsllc.com/">x</a>' }),
    'www.unfilteredinvestmentsllc.com',
  );
});

test("findPrivacyProblems flags http:// even to the site's own host", () => {
  assertFlags(page({ body: '<a href="http://unfilteredinvestmentsllc.com/">x</a>' }), 'http:');
});

test('findPrivacyProblems flags a mail address at another domain', () => {
  assertFlags(page({ body: '<a href="mailto:someone@example.com">x</a>' }), 'example.com');
});

test('findPrivacyProblems flags meta http-equiv', () => {
  assertFlags(page({ head: '<meta http-equiv="refresh" content="0; url=/">' }), 'http-equiv');
});

test('findStrayFiles allows pages, CNAME and .nojekyll', () => {
  const files = ['index.html', '404.html', 'CNAME', '.nojekyll', 'roll-call/privacy/index.html'];
  assert.deepEqual(findStrayFiles(files), []);
});

test('findStrayFiles flags fonts, scripts, images and stylesheets', () => {
  const files = ['font.woff2', 'app.js', 'pixel.gif', 'style.css'];
  const problems = findStrayFiles(files);
  assert.deepEqual(
    problems.map((p) => [p.file, p.check]),
    files.map((f) => [f, 'files']),
  );
});

const links = (...hrefs) => page({ body: `<main><h1>Title</h1>${hrefs.map((h) => `<a href="${h}">x</a>`).join('')}</main>` });
const withIds = (ids, ...hrefs) => page({
  body: `<main><h1>Title</h1>${ids.map((i) => `<p id="${i}">x</p>`).join('')}${hrefs.map((h) => `<a href="${h}">x</a>`).join('')}</main>`,
});
const linkProblems = (index) =>
  findBrokenLinks(
    new Map([
      ['index.html', index],
      ['roll-call/privacy/index.html', withIds(['a'], '/', '#a')],
    ]),
  );

test('findBrokenLinks passes links between existing pages and fragments', () => {
  assert.deepEqual(linkProblems(links('/roll-call/privacy/', '/roll-call/privacy/#a')), []);
});

for (const [row, href, expected] of [
  ['flags a link to a missing page', '/roll-call/nope/', 'missing page'],
  ['flags a directory link without a trailing slash', '/roll-call/privacy', 'end in /'],
  ['flags a relative link', 'roll-call/privacy/', 'root-relative'],
  ['flags a missing fragment on the same page', '#nope', '#nope'],
  ['flags a missing fragment on another page', '/roll-call/privacy/#nope', '#nope'],
  ["follows absolute links to the site's own origin", 'https://unfilteredinvestmentsllc.com/nope/', 'missing page'],
]) {
  test(`findBrokenLinks ${row}`, () => {
    const problems = linkProblems(links(href));
    assert.equal(problems.length, 1);
    assert.ok(problems[0].message.includes(expected), problems[0].message);
    assert.deepEqual([problems[0].file, problems[0].check], ['index.html', 'links']);
  });
}

test('findBrokenLinks ignores mailto links', () => {
  assert.deepEqual(linkProblems(links('mailto:support@unfilteredinvestmentsllc.com')), []);
});

async function makeSite(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-'));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
  return dir;
}
const cleanFiles = () => ({ 'index.html': page(), CNAME: 'unfilteredinvestmentsllc.com\n', '.nojekyll': '' });
const badFiles = () => ({
  'index.html': page({ body: '<main><h1>Title</h1><script></script><a href="/nope/">x</a></main>' }),
  'a.html': page().replace('<!DOCTYPE html>\n', ''),
  'x.js': '',
});

test('checkSite passes a clean site', async (t) => {
  const dir = await makeSite(cleanFiles());
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await checkSite(dir), []);
});

test('checkSite reports each kind of problem', async (t) => {
  const dir = await makeSite(badFiles());
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const problems = await checkSite(dir);
  assert.deepEqual(new Set(problems.map((p) => p.check)), new Set(['html', 'privacy', 'files', 'links']));
});

test('listFiles skips .DS_Store', async (t) => {
  const dir = await makeSite({ ...cleanFiles(), '.DS_Store': '' });
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await listFiles(dir), ['.nojekyll', 'CNAME', 'index.html']);
});

test('check-site exits 1 and names the file', async (t) => {
  const dir = await makeSite(badFiles());
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, ['scripts/check-site.mjs', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('index.html [privacy]'), r.stdout);
});

test('check-site exits 0 on a clean site', async (t) => {
  const dir = await makeSite(cleanFiles());
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, ['scripts/check-site.mjs', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('Site checks passed'), r.stdout);
});
