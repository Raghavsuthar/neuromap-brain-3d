/* Unit tests for the data -> 3D-highlight mapping.
   No browser needed: this mirrors what the viewer's meshesForLabels() does
   (case-insensitive exact match on manifest labels) and asserts that every
   region, circuit node, neuromodulation target and lens target referenced by
   the content actually resolves to renderable geometry.
   Run with: node scripts/test-mapping.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const manifest = load('public/brain-atlas/models/manifest.json');
const LABEL_TO_NODES = new Map();
for (const n of manifest.nodes) {
  const k = String(n.label).toLowerCase();
  if (!LABEL_TO_NODES.has(k)) LABEL_TO_NODES.set(k, []);
  LABEL_TO_NODES.get(k).push(n);
}

const sources = load('content/registries/sources.json');
const receptors = load('content/registries/receptors.json');
const drugs = load('content/registries/drugs.json');
const treatments = load('content/registries/treatments.json');
const markers = load('content/markers.json');
const index = load('content/index.json');

const SOURCE_IDS = new Set(sources.sources.map((s) => s.id));
const RECEPTOR_IDS = new Set(receptors.receptors.map((r) => r.id));
const DRUG_IDS = new Set(drugs.drugs.map((d) => d.id));
const TREAT_IDS = new Set(treatments.treatments.map((t) => t.id));
const MARKER_IDS = new Set(markers.markers.map((m) => m.id));
const DISORDER_IDS = new Set(index.disorders.map((d) => d.id));

let checks = 0;
const fails = [];
function assert(cond, msg) {
  checks += 1;
  if (!cond) fails.push(msg);
}
// Mirrors viewer.meshesForLabels() in src/main.js
const meshesFor = (labels) => {
  let n = 0;
  for (const l of labels || []) n += (LABEL_TO_NODES.get(String(l).toLowerCase()) || []).length;
  return n;
};

function checkAtlasRef(ref, where) {
  assert(ref && typeof ref === 'object', `${where}: atlasRef missing`);
  if (!ref) return;
  assert(['exact', 'proxy', 'schematic'].includes(ref.precision), `${where}: bad precision "${ref.precision}"`);
  const labels = ref.atlasLabels || [];
  if (labels.length) {
    assert(meshesFor(labels) > 0, `${where}: labels resolve to no mesh: ${JSON.stringify(labels)}`);
  } else {
    assert(!!ref.markerId, `${where}: no labels and no markerId`);
  }
  if (ref.markerId) assert(MARKER_IDS.has(ref.markerId), `${where}: unknown markerId ${ref.markerId}`);
  // Honesty rule: a marker may not be labelled "exact", and atlas labels that
  // need a marker must be flagged schematic.
  if (ref.markerId && !labels.length) {
    assert(ref.precision === 'schematic', `${where}: marker-only ref must be precision=schematic`);
  }
}

const files = readdirSync(join(ROOT, 'content/disorders')).filter((f) => f.endsWith('.json') && f !== 'TEMPLATE.json');
assert(files.length > 0, 'at least one disorder file present');
assert(files.length === index.disorders.length, `index.json lists ${index.disorders.length} disorders but ${files.length} files exist`);

for (const f of files) {
  const d = load(`content/disorders/${f}`);
  const W = d.id;
  assert(DISORDER_IDS.has(W), `${W}: not listed in content/index.json`);

  for (const b of d.brainFindings || []) checkAtlasRef(b.where, `${W}.findings/${b.id}`);
  for (const c of d.circuits || []) {
    for (const [i, n] of (c.nodes || []).entries()) checkAtlasRef(n, `${W}.circuits/${c.id}.nodes[${i}]`);
    for (const e of c.edges || []) {
      assert(!!e.from && !!e.to, `${W}.circuits/${c.id}: edge missing from/to`);
    }
  }
  for (const [i, n] of (d.neurochemistry || []).entries()) {
    for (const [j, w] of (n.where || []).entries()) checkAtlasRef(w, `${W}.neurochem[${i}].where[${j}]`);
  }

  // Every tour step must name a lens and target that actually exist.
  const lensTargets = {
    pathology: (t) => t === 'all' || (d.brainFindings || []).some((f) => f.id === t),
    circuit: (t) => (d.circuits || []).some((c) => c.id === t),
    chemistry: (t) => (d.neurochemistry || []).some((n) => n.transmitter === t),
    gene: (t) => (d.genetics.geneSymbols || []).includes(t),
    symptom: (t) => (d.symptomDomains || []).some((s) => s.id === t),
    drug: (t) => Object.values(treatments.treatments).some((tr) => tr.drugId === t && tr.indication && tr.indication.disorderId === W),
    neuromod: (t) => treatments.treatments.some((tr) => tr.id === t),
  };
  for (const [i, st] of (d.tour || []).entries()) {
    if (st.lensTarget != null) {
      const fn = lensTargets[st.lens];
      assert(!!fn, `${W}.tour[${i}]: unknown lens "${st.lens}"`);
      if (fn) assert(fn(st.lensTarget), `${W}.tour[${i}]: lens ${st.lens} has no target "${st.lensTarget}"`);
    }
    for (const l of st.focusAtlasLabels || []) {
      assert(meshesFor([l]) > 0, `${W}.tour[${i}]: focus label resolves to no mesh: ${l}`);
    }
    if (st.camera) assert(['front', 'side', 'top', 'home'].includes(st.camera), `${W}.tour[${i}]: bad camera ${st.camera}`);
  }

  // Treatment chain: every listed treatment exists and targets this disorder.
  for (const t of d.treatments || []) {
    assert(TREAT_IDS.has(t), `${W}: unknown treatment ${t}`);
    const tr = treatments.treatments.find((x) => x.id === t);
    if (tr && tr.indication) assert(tr.indication.disorderId === W, `${W}: treatment ${t} is indicated for ${tr.indication.disorderId}`);
  }
  for (const p of d.pathway || []) {
    for (const o of p.options || []) assert(TREAT_IDS.has(o), `${W}.pathway: unknown treatment option ${o}`);
  }
  for (const r of d.related || []) assert(DISORDER_IDS.has(r), `${W}.related: unknown disorder ${r}`);

  // Every treatment belonging to this disorder must appear in its list, so
  // the Treatments tab can never silently omit a guideline option.
  for (const tr of treatments.treatments) {
    if (tr.indication && tr.indication.disorderId === W) {
      assert((d.treatments || []).includes(tr.id), `${W}: registry treatment ${tr.id} is missing from the disorder file`);
    }
  }
}

// Registry-wide: every receptor used by a drug exists, and every treatment's
// neuromodulation target resolves to geometry or an explicit non-focal note.
for (const dr of drugs.drugs) {
  for (const r of dr.receptorProfile || []) {
    assert(RECEPTOR_IDS.has(r.receptorId), `drugs/${dr.id}: unknown receptor ${r.receptorId}`);
  }
}
for (const tr of treatments.treatments) {
  if (tr.drugId) assert(DRUG_IDS.has(tr.drugId), `treatments/${tr.id}: unknown drug ${tr.drugId}`);
  const nm = tr.neuromodulation;
  if (nm) {
    if (nm.target) checkAtlasRef(nm.target, `treatments/${tr.id}.neuromodulation.target`);
    else assert(!!nm.targetNote, `treatments/${tr.id}: neuromodulation has neither target nor targetNote`);
  }
  if (tr.indication) {
    assert(DISORDER_IDS.has(tr.indication.disorderId), `treatments/${tr.id}: unknown disorder ${tr.indication.disorderId}`);
    for (const g of tr.indication.guidelineSourceIds || []) {
      assert(SOURCE_IDS.has(g), `treatments/${tr.id}: unknown guideline source ${g}`);
    }
  }
}

// Every claim in the content tree must cite at least one real source.
let claimCount = 0;
function walkClaims(o, where) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach((x, i) => walkClaims(x, `${where}[${i}]`)); return; }
  if (typeof o.text === 'string' && o.evidence) {
    claimCount += 1;
    assert(!!o.sourceIds && o.sourceIds.length > 0, `${where}: claim with no sourceIds`);
    for (const s of o.sourceIds || []) assert(SOURCE_IDS.has(s), `${where}: claim cites unknown source ${s}`);
    assert(o.evidence !== 'unsourced', `${where}: unsourced claim in release content`);
  }
  for (const k of Object.keys(o)) walkClaims(o[k], `${where}.${k}`);
}
for (const f of files) walkClaims(load(`content/disorders/${f}`), f);
for (const reg of ['receptors', 'drugs']) walkClaims(load(`content/registries/${reg}.json`), reg);

console.log(`mapping tests: ${checks} assertions, ${fails.length} failure(s), ${claimCount} claims checked`);
for (const m of fails) console.log('FAIL:', m);
process.exit(fails.length ? 1 : 0);
