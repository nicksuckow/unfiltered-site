import { readSite } from '../scripts/site-checks.mjs';

export function readDocs() {
  return readSite('docs');
}

export function pageText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sectionIds(html) {
  return [...html.matchAll(/<section\s+id="([^"]+)"/g)].map((m) => m[1]);
}

export function sectionText(html, id) {
  const start = html.search(new RegExp(`<section\\s+id="${id}"`));
  if (start === -1) throw new Error(`No section with id "${id}"`);
  const end = html.indexOf('</section>', start);
  if (end === -1) throw new Error(`Section "${id}" is not closed`);
  return pageText(html.slice(start, end));
}

export function styleOf(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('No <style> block');
  return m[1];
}

export const PROMISE = /Nothing in your address book changes until you confirm it in Review\./;
export const NOTES_LINE = /Roll Call can't read contact notes yet, so notes on removed or merged-away cards won't be in Recently removed\./;
