import { checkSite, listFiles } from './site-checks.mjs';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/check-site.mjs <root>');
  process.exit(2);
}

const problems = await checkSite(root);
if (problems.length > 0) {
  for (const p of problems) console.log(`${p.file} [${p.check}] ${p.message}`);
  process.exit(1);
}
const files = await listFiles(root);
const pages = files.filter((f) => f.endsWith('.html')).length;
console.log(`Site checks passed: ${pages} pages, ${files.length} files.`);
