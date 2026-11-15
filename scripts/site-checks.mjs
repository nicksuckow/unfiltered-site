import fs from 'node:fs/promises';
import path from 'node:path';

import { HtmlValidate, StaticConfigLoader } from 'html-validate';

import { SITE_HOST, SITE_ORIGIN } from './site.mjs';

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

const HREF = /\shref="([^"]*)"/gi;
const ID = /\sid="([^"]*)"/gi;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * check 'links'. pages: site-root-relative path ('roll-call/privacy/index.html') → HTML.
 * @param {Map<string, string>} pages
 * @returns {Problem[]}
 */
export function findBrokenLinks(pages) {
  /** @type {Map<string, Set<string>>} */
  const ids = new Map();
  for (const [file, html] of pages) {
    ids.set(file, new Set([...html.matchAll(ID)].map((m) => m[1])));
  }

  /** @type {Problem[]} */
  const problems = [];
  for (const [file, html] of pages) {
    const add = (message) => problems.push({ file, check: 'links', message });
    for (const m of html.matchAll(HREF)) {
      let href = m[1];
      if (href.startsWith(SITE_ORIGIN + '/') || href === SITE_ORIGIN) {
        href = href.slice(SITE_ORIGIN.length) || '/';
      } else if (SCHEME.test(href)) {
        continue; // mailto: and third-party URLs are the privacy check's job
      }

      if (href.startsWith('#')) {
        const id = href.slice(1);
        if (id && !ids.get(file).has(id)) add(`${href}: missing #${id} on this page`);
        continue;
      }
      if (!href.startsWith('/')) {
        add(`${href}: use a root-relative link (starting with /)`);
        continue;
      }

      const hash = href.indexOf('#');
      const target = hash === -1 ? href : href.slice(0, hash);
      const id = hash === -1 ? '' : href.slice(hash + 1);
      let key;
      if (target.endsWith('/')) key = target.slice(1) + 'index.html';
      else if (target.endsWith('.html')) key = target.slice(1);
      else {
        add(`${href}: directory links end in /`);
        continue;
      }
      if (!pages.has(key)) {
        add(`${href}: links to a missing page`);
      } else if (id && !ids.get(key).has(id)) {
        add(`${href}: missing #${id} in ${key}`);
      }
    }
  }
  return problems;
}

/**
 * Every file under root, relative, '/'-separated, sorted; dotfiles included; .DS_Store skipped.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function listFiles(root) {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name !== '.DS_Store')
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort();
}

/**
 * The .html files under root, UTF-8, keyed by site-root-relative path.
 * @param {string} root
 * @returns {Promise<Map<string, string>>}
 */
export async function readSite(root) {
  const pages = new Map();
  for (const file of await listFiles(root)) {
    if (file.endsWith('.html')) pages.set(file, await fs.readFile(path.join(root, file), 'utf8'));
  }
  return pages;
}

/**
 * findStrayFiles, then validatePage and findPrivacyProblems per page, then findBrokenLinks; sorted by file.
 * @param {string} root
 * @returns {Promise<Problem[]>}
 */
export async function checkSite(root) {
  const pages = await readSite(root);
  const problems = findStrayFiles(await listFiles(root));
  for (const [file, html] of pages) {
    problems.push(...(await validatePage(html, file)), ...findPrivacyProblems(html, file));
  }
  problems.push(...findBrokenLinks(pages));
  // Array.prototype.sort is stable, so each file keeps its check order.
  return problems.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}
