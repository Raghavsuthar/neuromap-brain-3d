/* Audits the colour-by-function classification in
   public/brain-atlas/function-systems.json against the real atlas.

   It re-implements the same resolution order the viewer uses (category
   override, then ordered rules, then fallback) so a rule that silently stops
   matching is caught here rather than showing up as a wrong colour in the 3D
   view. Reports coverage, the per-system breakdown, and every structure that
   fell through to the 'other' fallback.

   Exits non-zero if any declared system ends up unused, or if the fallback
   share grows past the threshold, so the classification cannot rot unnoticed. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const spec = read('public/brain-atlas/function-systems.json');
const man = read('public/brain-atlas/models/manifest.json');
const fn = read('public/brain-atlas/functions.json');

const MAX_FALLBACK = Number(process.env.MAX_FALLBACK || 0.15);

function classify(node) {
  const override = spec.categoryOverrides[node.category];
  if (override) return override;
  const hay = `${node.label} ${node.name || ''} ${fn[String(node.id)] || ''}`.toLowerCase();
  for (const rule of spec.rules) {
    if (rule.any.some((p) => hay.includes(p.toLowerCase()))) return rule.system;
  }
  return 'other';
}

const scoped = man.nodes.filter((n) => spec.appliesToCategories.includes(n.category));
const outside = man.nodes.filter((n) => !spec.appliesToCategories.includes(n.category));
const counts = new Map();
const fallback = [];
for (const n of scoped) {
  const s = classify(n);
  counts.set(s, (counts.get(s) || 0) + 1);
  if (s === 'other') fallback.push(n);
}

const declared = spec.systems.map((s) => s.id);
const unused = declared.filter((id) => !counts.has(id));
const unknown = [...counts.keys()].filter((id) => !declared.includes(id));

console.log(`functional classification: ${scoped.length} manifest structures in scope, ${outside.length} left in category colour`);
console.log('  scope: this audit covers the 437 manifest nodes. The GLB carries more meshes');
console.log('  than the manifest describes; those carry no manifest record, and the viewer');
console.log('  reports them in the "other" bucket rather than classifying them.');
const width = Math.max(...declared.map((d) => d.length));
for (const sys of spec.systems) {
  const n = counts.get(sys.id) || 0;
  const pct = scoped.length ? ((n / scoped.length) * 100).toFixed(1) : '0.0';
  const bar = '#'.repeat(Math.round((n / scoped.length) * 40));
  console.log(`  ${sys.id.padEnd(width)}  ${String(n).padStart(4)}  ${pct.padStart(5)}%  ${bar}`);
}

const fbPct = scoped.length ? (fallback.length / scoped.length) * 100 : 0;
console.log(`\nfallback: ${fallback.length}/${scoped.length} (${fbPct.toFixed(1)}%), threshold ${(MAX_FALLBACK * 100).toFixed(0)}%`);
if (fallback.length) {
  const shown = fallback.slice(0, 30);
  for (const n of shown) {
    const why = fn[String(n.id)] ? fn[String(n.id)].slice(0, 58) : 'no function text';
    console.log(`    ${n.label.slice(0, 44).padEnd(44)} [${n.category}] ${why}`);
  }
  if (fallback.length > shown.length) console.log(`    ... and ${fallback.length - shown.length} more`);
}

let bad = 0;
if (unknown.length) { console.error(`\nERROR: rules produced undeclared system(s): ${unknown.join(', ')}`); bad++; }
if (unused.length) { console.error(`ERROR: declared but never assigned: ${unused.join(', ')}`); bad++; }
if (fbPct > MAX_FALLBACK * 100) { console.error(`ERROR: fallback share ${fbPct.toFixed(1)}% exceeds ${MAX_FALLBACK * 100}%`); bad++; }

if (bad) process.exit(1);
console.log('\nfunctional classification OK');
