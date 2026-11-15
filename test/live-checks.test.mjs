import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { LIVE_CHECKS, checkLive } from '../scripts/live-checks.mjs';
import { ROLL_CALL_URLS, SITE_ORIGIN } from '../scripts/site.mjs';

const HTML = 'text/html; charset=utf-8';

/** Answers every check correctly; `overrides` maps a URL to a function or Response. */
function fakeFetch(overrides = {}, seen = []) {
  return async (url, init) => {
    seen.push({ url, init });
    const o = overrides[url];
    if (typeof o === 'function') return o();
    if (o) return o;
    const check = LIVE_CHECKS.find((c) => c.url === url);
    if (check.expect === 'redirect') {
      return new Response(null, { status: 301, headers: { location: check.to } });
    }
    return new Response(check.contains, {
      status: check.expect,
      headers: { 'content-type': HTML },
    });
  };
}

const PRIVACY = `${SITE_ORIGIN}/roll-call/privacy/`;
const SUPPORT = `${SITE_ORIGIN}/roll-call/support/`;
const WWW = 'https://www.unfilteredinvestmentsllc.com/roll-call/privacy/';

test('LIVE_CHECKS covers the final URLs', () => {
  for (const url of [`${SITE_ORIGIN}/`, ROLL_CALL_URLS.privacyPolicy, ROLL_CALL_URLS.support]) {
    assert.equal(LIVE_CHECKS.find((c) => c.url === url)?.expect, 200, url);
  }
});

test('LIVE_CHECKS covers http, www and no-trailing-slash variants', () => {
  const urls = [
    `${SITE_ORIGIN}/roll-call/privacy`,
    'http://unfilteredinvestmentsllc.com/roll-call/privacy/',
    'https://www.unfilteredinvestmentsllc.com/roll-call/privacy/',
  ];
  for (const url of urls) {
    const c = LIVE_CHECKS.find((x) => x.url === url);
    assert.equal(c?.expect, 'redirect', url);
    assert.equal(c.to, ROLL_CALL_URLS.privacyPolicy);
  }
});

test('checkLive passes when every URL answers as expected', async () => {
  assert.deepEqual(await checkLive(fakeFetch()), []);
});

test('checkLive asks fetch not to follow redirects', async () => {
  const seen = [];
  await checkLive(fakeFetch({}, seen));
  assert.equal(seen.length, LIVE_CHECKS.length);
  for (const s of seen) assert.equal(s.init.redirect, 'manual');
});

test('checkLive reports a wrong status', async () => {
  const msgs = await checkLive(
    fakeFetch({ [PRIVACY]: new Response('x', { status: 404, headers: { 'content-type': HTML } }) }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /roll-call\/privacy\//);
  assert.match(msgs[0], /404/);
});

test('checkLive reports a redirect to the wrong place', async () => {
  const msgs = await checkLive(
    fakeFetch({
      [WWW]: new Response(null, { status: 301, headers: { location: 'https://nicksuckow.github.io/' } }),
    }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /nicksuckow\.github\.io/);
});

test("checkLive reports a page that isn't ours", async () => {
  const msgs = await checkLive(
    fakeFetch({ [PRIVACY]: new Response('Parked domain', { status: 200, headers: { 'content-type': HTML } }) }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Roll Call privacy policy/);
});

test('checkLive reports a cookie', async () => {
  const msgs = await checkLive(
    fakeFetch({
      [`${SITE_ORIGIN}/`]: new Response('Roll Call', {
        status: 200,
        headers: { 'content-type': HTML, 'set-cookie': 'a=1' },
      }),
    }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /cookie/);
});

test('checkLive reports a network or certificate error instead of throwing', async () => {
  const msgs = await checkLive(
    fakeFetch({
      [SUPPORT]: () => {
        throw new TypeError('fetch failed');
      },
    }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /roll-call\/support\//);
  assert.match(msgs[0], /fetch failed/);
});

test('checkLive reports every fault on one URL', async () => {
  const msgs = await checkLive(
    fakeFetch({
      [SUPPORT]: new Response('x', { status: 404, headers: { 'content-type': HTML, 'set-cookie': 'a=1' } }),
    }),
  );
  assert.equal(msgs.length, 2);
  assert.equal(msgs.filter((m) => m.includes('404')).length, 1);
  assert.equal(msgs.filter((m) => m.includes('cookie')).length, 1);
});

const MISSING = `${SITE_ORIGIN}/no-such-page/`;

test("checkLive reports GitHub's stock 404 page, which isn't ours", async () => {
  const stock = '<title>Page not found &middot; GitHub Pages</title><h1>404</h1><p>File not found</p>';
  const msgs = await checkLive(
    fakeFetch({ [MISSING]: new Response(stock, { status: 404, headers: { 'content-type': HTML } }) }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /no-such-page/);
});

test("the 404 row looks for a sentence only our 404 page has", () => {
  const row = LIVE_CHECKS.find((c) => c.expect === 404);
  assert.ok(readFileSync('docs/404.html', 'utf8').includes(row.contains), row.contains);
});

test('checkLive reports a page served as something other than HTML', async () => {
  const msgs = await checkLive(
    fakeFetch({
      [PRIVACY]: new Response('Roll Call privacy policy', { status: 200, headers: { 'content-type': 'text/plain' } }),
    }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /content-type/);
});

test('checkLive reports a redirect with no Location header', async () => {
  const msgs = await checkLive(fakeFetch({ [WWW]: new Response(null, { status: 301 }) }));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /no Location/);
});

test('checkLive reports a page served where a redirect should be', async () => {
  const msgs = await checkLive(
    fakeFetch({ [WWW]: new Response('Roll Call privacy policy', { status: 200, headers: { 'content-type': HTML } }) }),
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /expected a redirect/);
});
