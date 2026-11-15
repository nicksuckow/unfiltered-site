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

// Characters are literal UTF-8; only &, < and > are escaped. Any other reference
// (&rsquo;, &nbsp;, &#105;) can also hide a word from the copy tests. A bare "&" is
// html-validate's no-raw-characters.
const OTHER_REFERENCE = /&(?!(?:amp|lt|gt);)[a-z0-9#]+;?/gi;

/** The 1-based line of an index into the raw file. */
function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

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
  for (const m of html.matchAll(OTHER_REFERENCE)) {
    problems.push({
      file,
      check: 'html',
      message: `character reference "${m[0]}" is not allowed: write the character itself, and escape only &amp;, &lt; and &gt; (line ${lineOf(html, m.index)})`,
    });
  }
  return problems;
}

// Elements that load something, or run something. Matched on the tag name, so
// <section> is not <source> and <footer> is not <form>.
const BANNED_TAGS = [
  'script', 'img', 'picture', 'source', 'iframe', 'frame', 'embed', 'object',
  'video', 'audio', 'track', 'link', 'svg', 'form', 'base',
];

// Raw-file patterns. They can match prose too ("JavaScript: none"), so each message
// names the line and the text, and the author can see what tripped it.
const BANNED_PATTERNS = [
  [/\son[a-z]+\s*=/i, 'event handler attribute (onclick and the like) is not allowed'],
  [/javascript\s*:/i, 'javascript: URL is not allowed'],
  [/http-equiv/i, '<meta http-equiv> is not allowed'],
  [/@font-face|@import|\burl\s*\(/i, 'CSS that loads a font or file (@font-face, @import, url()) is not allowed'],
];

// A URL with a scheme. Only https://SITE_HOST passes, so this also catches ftp:,
// itms-apps:, localhost, a port and user@host.
const SCHEME_URL = /\b([a-z][a-z0-9+.-]*):\/\/([^\s"'<>\/?#]*)/gi;
// "//host" with no scheme; the host needs a dot, so prose slashes don't match.
const SCHEMELESS_HOST = /(?<![:\w])\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
// Everything after mailto: up to a quote, space or tag, query included.
const MAILTO = /mailto:([^"'\s<>]*)/gi;

/** ` (line 12: "JavaScript:")` for a match, without its leading whitespace. */
function where(html, m) {
  const text = m[0].trimStart();
  return ` (line ${lineOf(html, m.index + m[0].length - text.length)}: "${text.trimEnd()}")`;
}

function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Every address a mailto: target names: the comma list before "?", and any to=, cc= or bcc= value. */
function mailtoAddresses(target) {
  const t = target.replace(/&amp;/gi, '&');
  const q = t.indexOf('?');
  const lists = [q === -1 ? t : t.slice(0, q)];
  if (q !== -1) {
    for (const pair of t.slice(q + 1).split('&')) {
      const eq = pair.indexOf('=');
      if (eq !== -1 && /^(?:to|cc|bcc)$/i.test(pair.slice(0, eq))) lists.push(pair.slice(eq + 1));
    }
  }
  return lists
    .flatMap((list) => decode(list).split(','))
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

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
    const m = new RegExp(`<\\s*${tag}(?![\\w-])`, 'i').exec(html);
    if (m) add(`<${tag}> is not allowed: it runs or loads something${where(html, m)}`);
  }
  for (const [re, message] of BANNED_PATTERNS) {
    const m = re.exec(html);
    if (m) add(message + where(html, m));
  }

  const schemes = new Set();
  const hosts = new Set();
  for (const m of html.matchAll(SCHEME_URL)) {
    schemes.add(m[1].toLowerCase());
    hosts.add(m[2].toLowerCase().replace(/\.$/, ''));
  }
  for (const m of html.matchAll(SCHEMELESS_HOST)) hosts.add(m[1].toLowerCase());
  for (const scheme of schemes) {
    if (scheme !== 'https') add(`${scheme}: URL is not allowed, use https://`);
  }
  for (const host of hosts) {
    if (host !== SITE_HOST) add(`third-party or non-canonical host: ${host || '(none)'}`);
  }

  const domains = new Set();
  for (const m of html.matchAll(MAILTO)) {
    for (const address of mailtoAddresses(m[1])) domains.add(address.slice(address.lastIndexOf('@') + 1));
  }
  for (const domain of domains) {
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
