import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validatePage } from '../scripts/site-checks.mjs';
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
