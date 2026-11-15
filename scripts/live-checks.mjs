import { ROLL_CALL_URLS, SITE_ORIGIN } from './site.mjs';

/** @typedef {{ url: string, expect: 200 | 404 | 'redirect', to?: string, contains?: string }} LiveCheck */

/** @type {readonly LiveCheck[]} */
export const LIVE_CHECKS = Object.freeze([
  { url: `${SITE_ORIGIN}/`, expect: 200, contains: 'Roll Call' },
  { url: `${SITE_ORIGIN}/roll-call/privacy/`, expect: 200, contains: 'Roll Call privacy policy' },
  { url: `${SITE_ORIGIN}/roll-call/support/`, expect: 200, contains: 'id="accessibility"' },
  { url: `${SITE_ORIGIN}/roll-call/privacy`, expect: 'redirect', to: ROLL_CALL_URLS.privacyPolicy },
  {
    url: 'http://unfilteredinvestmentsllc.com/roll-call/privacy/',
    expect: 'redirect',
    to: ROLL_CALL_URLS.privacyPolicy,
  },
  {
    url: 'https://www.unfilteredinvestmentsllc.com/roll-call/privacy/',
    expect: 'redirect',
    to: ROLL_CALL_URLS.privacyPolicy,
  },
  // GitHub's own 404 also says "Page not found", so look for a sentence only ours has.
  { url: `${SITE_ORIGIN}/no-such-page/`, expect: 404, contains: 'There is no page at this address.' },
]);

async function checkOne(check, fetchImpl) {
  const { url, expect, to, contains } = check;
  const problems = [];
  const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (res.headers.get('set-cookie') !== null) problems.push(`${url}: sets a cookie`);
  if (expect === 'redirect') {
    if (res.status < 300 || res.status > 399) {
      problems.push(`${url}: expected a redirect to ${to}, got status ${res.status}`);
      return problems;
    }
    const location = res.headers.get('location');
    if (location === null) {
      problems.push(`${url}: redirect has no Location header`);
    } else {
      const target = new URL(location, url).href;
      if (target !== to) problems.push(`${url}: redirects to ${target}, expected ${to}`);
    }
    return problems;
  }
  if (res.status !== expect) {
    problems.push(`${url}: expected status ${expect}, got ${res.status}`);
    return problems;
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('text/html')) problems.push(`${url}: content-type is "${type}", expected text/html`);
  const body = await res.text();
  if (!body.includes(contains)) problems.push(`${url}: page does not contain "${contains}"`);
  return problems;
}

/** Never throws; one message per failure; [] means live and right. */
export async function checkLive(fetchImpl = fetch) {
  const messages = [];
  for (const check of LIVE_CHECKS) {
    try {
      messages.push(...(await checkOne(check, fetchImpl)));
    } catch (error) {
      messages.push(`${check.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return messages;
}
