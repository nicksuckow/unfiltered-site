import { HtmlValidate, StaticConfigLoader } from 'html-validate';

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
