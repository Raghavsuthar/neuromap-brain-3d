/* Evidence-coverage report for the content tree.
   Walks every disorder file and registry, counts each claim object (any object
   with a string `text` and a known `evidence` level), and reports the share at
   each level plus the share at moderate-or-better. Informational only: always
   exits 0, so it never gates a build — strict mode (`validate-disorders.mjs
   --strict`) remains the gate that forbids `unsourced` in release.
   Run with: node scripts/coverage.mjs (or npm run coverage) */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const LEVELS = ['established', 'strong', 'moderate', 'emerging', 'hypothesis', 'unsourced'];
const AT_OR_ABOVE_MODERATE = new Set(['established', 'strong', 'moderate']);

function collectClaims(node, out) {
  if (Array.isArray(node)) {
    for (const v of node) collectClaims(v, out);
    return;
  }
  if (node && typeof node === 'object') {
    if (typeof node.text === 'string' && typeof node.evidence === 'string' && LEVELS.includes(node.evidence)) {
      out.push(node);
    }
    for (const v of Object.values(node)) collectClaims(v, out);
  }
}

const rows = [];
const totals = Object.fromEntries(LEVELS.map((l) => [l, 0]));
function scanFile(rel) {
  const data = load(rel);
  const claims = [];
  collectClaims(data, claims);
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const c of claims) {
    byLevel[c.evidence] += 1;
    totals[c.evidence] += 1;
  }
  rows.push({ file: rel, n: claims.length, byLevel });
}

for (const f of readdirSync(join(ROOT, 'content/disorders'))) {
  if (f.endsWith('.json') && f !== 'TEMPLATE.json') scanFile(`content/disorders/${f}`);
}
for (const f of ['drugs', 'receptors', 'genes', 'treatments', 'sources'].map((n) => `content/registries/${n}.json`)) {
  scanFile(f);
}

const total = LEVELS.reduce((a, l) => a + totals[l], 0);
const backed = AT_OR_ABOVE_MODERATE;
const backedN = [...backed].reduce((a, l) => a + totals[l], 0);
const pct = (n) => total ? `${((n / total) * 100).toFixed(1)}%` : 'n/a';

console.log('evidence coverage (claims with text + evidence level)');
console.log('file'.padEnd(38) + 'n'.padStart(5) + '  est str mod eme hyp uns');
for (const r of rows) {
  const b = r.byLevel;
  console.log(
    r.file.padEnd(38)
    + String(r.n).padStart(5) + '  '
    + LEVELS.map((l) => String(b[l]).padStart(3)).join(' '),
  );
}
console.log('-'.repeat(72));
console.log(
  'TOTAL'.padEnd(38) + String(total).padStart(5) + '  '
  + LEVELS.map((l) => String(totals[l]).padStart(3)).join(' '),
);
console.log(`\nat moderate-or-better: ${backedN}/${total} (${pct(backedN)})`);
