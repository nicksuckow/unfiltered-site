import { HtmlValidate, StaticConfigLoader } from 'html-validate';

import { SITE_HOST } from './site.mjs';

/** @typedef {{ file: string, check: 'html' | 'privacy' | 'files' | 'links', message: string }} Problem */

export const HTML_VALIDATE_CONFIG = {
  extends: ['html-validate:recommended'],
  rules: { 'missing-doctype': 'error', 'heading-level': 'error' },
};

// A static loader, so a stray .htmlvalidate.json cannot change the results.
const validator = new HtmlValidate(new StaticConfigLoader(HTML_VALIDATE_CONFIG));

// html-validate does not check these, so they are plain substring checks.
const HEAD_REQUIREMENTS = [
  ['<html lang="en">', 'head: missing <html lang="en">'],
  ['<meta charset="utf-8">', 'head: missing <meta charset="utf-8">'],
  [
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    'head: missing <meta name="viewport" content="width=device-width, initial-scale=1">',
  ],
];

/**
 * @param {string} html
 * @param {string} file
 * @returns {Promise<Problem[]>}
 */
export async function validatePage(html, file) {
  const report = await validator.validateString(html, file);
  /** @type {Problem[]} */
  const problems = [];
  for (const result of report.results) {
    for (const m of result.messages) {
      problems.push({
        file,
        check: 'html',
        message: `${m.ruleId}: ${m.message} (line ${m.line})`,
      });
    }
  }
  for (const [needle, message] of HEAD_REQUIREMENTS) {
    if (!html.includes(needle)) problems.push({ file, check: 'html', message });
  }
  return problems;
}

// Elements that load something, or run something. Matched on the tag name, so
// <section> is not <source> and <footer> is not <form>.
const BANNED_TAGS = [
  'script', 'img', 'picture', 'source', 'iframe', 'frame', 'embed', 'object',
  'video', 'audio', 'track', 'link', 'svg', 'form', 'base',
];

const CSS_LOADERS = [/@font-face/i, /@import/i, /\burl\s*\(/i];
// "//host" with or without a scheme; the host needs a dot, so prose slashes don't match.
const URL_HOST = /(?:(https?:)|(?<![:\w]))\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const MAILTO = /mailto:([^"'\s<>?]+)/gi;

/**
 * check 'privacy'. A regex scan of the raw file, so even a <script> inside a comment fails.
 * @param {string} html
 * @param {string} file
 * @returns {Problem[]}
 */
export function findPrivacyProblems(html, file) {
  /** @type {Problem[]} */
  const problems = [];
  const add = (message) => problems.push({ file, check: 'privacy', message });

  for (const tag of BANNED_TAGS) {
    if (new RegExp(`<\\s*${tag}(?![\\w-])`, 'i').test(html)) {
      add(`<${tag}> is not allowed: it runs or loads something`);
    }
  }
  if (/\son[a-z]+\s*=/i.test(html)) add('event handler attribute (onclick and the like) is not allowed');
  if (/javascript\s*:/i.test(html)) add('javascript: URL is not allowed');
  if (/http-equiv/i.test(html)) add('<meta http-equiv> is not allowed');
  if (CSS_LOADERS.some((re) => re.test(html))) {
    add('CSS that loads a font or file (@font-face, @import, url()) is not allowed');
  }

  const hosts = new Set();
  let sawHttp = false;
  for (const m of html.matchAll(URL_HOST)) {
    if (m[1]?.toLowerCase() === 'http:') sawHttp = true;
    hosts.add(m[2].toLowerCase());
  }
  if (sawHttp) add('http: URL is not allowed, use https://');
  for (const host of hosts) {
    if (host !== SITE_HOST) add(`third-party or non-canonical host: ${host}`);
  }
  for (const m of html.matchAll(MAILTO)) {
    const domain = m[1].slice(m[1].lastIndexOf('@') + 1).toLowerCase();
    if (domain !== SITE_HOST) add(`mailto: address at another domain: ${domain}`);
  }
  return problems;
}

/**
 * check 'files'. files: site-root-relative, '/'-separated.
 * @param {string[]} files
 * @returns {Problem[]}
 */
export function findStrayFiles(files) {
  return files
    .filter((f) => !(f.endsWith('.html') || ['CNAME', '.nojekyll'].includes(f)))
    .map((file) => ({
      file,
      check: /** @type {const} */ ('files'),
      message: 'only .html pages, CNAME and .nojekyll belong on the site',
    }));
}
