#!/usr/bin/env node
/* Content lint for disorder data files. Fails the build on violations.
   Usage: node scripts/validate-disorders.mjs [--strict]
   --strict: also fails on `unsourced` evidence, quiz < 15, tour outside 6-10.
   Base rules (always fail): dangling atlasLabels/markerIds, unresolvable
   source/receptor/drug/gene/disorder ids, missing evidence levels,
   effectSize/kiNm/doseRange without sourceId, claim text > 4 sentences,
   malformed URLs, bad quiz answer indexes. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const load = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf-8'));
const manifest = load('public/brain-atlas/models/manifest.json');
const LABELS = new Set(manifest.nodes.map((n) => n.label));
const markers = existsSync(join(ROOT, 'content/markers.json'))
  ? load('content/markers.json') : { markers: [] };
const MARKERS = new Set(markers.markers.map((m) => m.id));
const sources = load('content/registries/sources.json');
const receptors = load('content/registries/receptors.json');
const genes = load('content/registries/genes.json');
const drugs = load('content/registries/drugs.json');
const treatments = load('content/registries/treatments.json');

const SOURCE_IDS = new Set((sources.sources || []).map((s) => s.id));
const RECEPTOR_IDS = new Set((receptors.receptors || []).map((r) => r.id));
const GENE_SYMS = new Set((genes.genes || []).map((g) => g.symbol));
const DRUG_IDS = new Set((drugs.drugs || []).map((d) => d.id));
const TREAT_IDS = new Set((treatments.treatments || []).map((t) => t.id));
const LEVELS = new Set(['established', 'strong', 'moderate', 'emerging', 'hypothesis', 'unsourced']);
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

const sentences = (t) => String(t).split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;

function checkClaim(c, where) {
  if (!c || typeof c !== 'object') return err(`${where}: claim missing/not an object`);
  if (!c.id) err(`${where}: claim without id`);
  if (typeof c.text !== 'string' || !c.text.trim()) return err(`${where}: claim text empty`);
  if (!LEVELS.has(c.evidence)) err(`${where}: bad evidence level ${JSON.stringify(c.evidence)}`);
  if (c.evidence === 'unsourced') {
    (strict ? err : warn)(`${where}: unsourced claim ${c.id}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.lastReviewed || '')) err(`${where}: bad lastReviewed ${c.lastReviewed}`);
  if (!Array.isArray(c.sourceIds)) err(`${where}: sourceIds not an array`);
  else for (const s of c.sourceIds) if (!SOURCE_IDS.has(s)) err(`${where}: unknown sourceId ${s}`);
  if (c.evidence !== 'unsourced' && (!c.sourceIds || !c.sourceIds.length)) err(`${where}: non-unsourced claim without sources`);
  if (sentences(c.text) > 4) err(`${where}: claim text > 4 sentences (${sentences(c.text)})`);
}

function checkAtlasRef(ref, where) {
  if (!ref || typeof ref !== 'object') return err(`${where}: atlasRef missing`);
  if (!['exact', 'proxy', 'schematic'].includes(ref.precision)) err(`${where}: bad precision`);
  for (const l of ref.atlasLabels || []) if (!LABELS.has(l)) err(`${where}: atlasLabels not in manifest: ${JSON.stringify(l)}`);
  if (ref.markerId && !MARKERS.has(ref.markerId)) err(`${where}: unknown markerId ${ref.markerId}`);
  if (!ref.atlasLabels?.length && !ref.markerId) err(`${where}: atlasRef has neither labels nor marker`);
}

function checkSourcesRegistry() {
  for (const s of sources.sources || []) {
    if (!s.id || !s.title || !s.url) err(`sources: incomplete entry ${JSON.stringify(s.id)}`);
    if (s.url && !URL_RE.test(s.url)) err(`sources: malformed url ${s.id}: ${s.url}`);
  }
}

function checkReceptors() {
  for (const r of receptors.receptors || []) {
    if (!r.id || !r.name || !r.family) err(`receptors: incomplete ${r.id}`);
    checkClaim(r.signalling, `receptors/${r.id}.signalling`);
    for (const [i, p] of (r.principalSites || []).entries()) {
      checkAtlasRef(p.where, `receptors/${r.id}.principalSites[${i}]`);
      checkClaim(p.claim, `receptors/${r.id}.principalSites[${i}].claim`);
    }
  }
}

function checkGenes() {
  for (const g of genes.genes || []) {
    if (!g.symbol || !g.name) err(`genes: incomplete ${g.symbol}`);
    checkClaim(g.function, `genes/${g.symbol}.function`);
    if (g.cellTypes) checkClaim(g.cellTypes, `genes/${g.symbol}.cellTypes`);
    for (const [i, b] of (g.brainExpression || []).entries()) {
      checkAtlasRef(b.where, `genes/${g.symbol}.brainExpression[${i}]`);
      checkClaim(b.claim, `genes/${g.symbol}.brainExpression[${i}].claim`);
    }
    for (const r of g.linkedReceptorIds || []) if (!RECEPTOR_IDS.has(r)) err(`genes/${g.symbol}: unknown receptor ${r}`);
    if (g.effect && !g.effect.sourceId) err(`genes/${g.symbol}: effect without sourceId`);
    if (g.effect?.sourceId && !SOURCE_IDS.has(g.effect.sourceId)) err(`genes/${g.symbol}: unknown effect source`);
    if (g.constraint && !g.constraint.sourceId) err(`genes/${g.symbol}: constraint without sourceId`);
    if (g.constraint?.sourceId && !SOURCE_IDS.has(g.constraint.sourceId)) err(`genes/${g.symbol}: unknown constraint source`);
    if (g.constraint && (typeof g.constraint.pLI !== 'number' || typeof g.constraint.oeLoF !== 'number')) err(`genes/${g.symbol}: constraint without numeric pLI/oeLoF`);
    if (g.ensemblId && !/^ENSG\d+$/.test(g.ensemblId)) err(`genes/${g.symbol}: malformed ensemblId`);
  }
}

function checkDrugs() {
  for (const d of drugs.drugs || []) {
    if (!d.id || !d.generic) err(`drugs: incomplete ${d.id}`);
    for (const [i, m] of (d.mechanism || []).entries()) checkClaim(m, `drugs/${d.id}.mechanism[${i}]`);
    for (const [i, r] of (d.receptorProfile || []).entries()) {
      if (!RECEPTOR_IDS.has(r.receptorId)) err(`drugs/${d.id}.receptorProfile[${i}]: unknown receptor ${r.receptorId}`);
      if (r.kiNm !== undefined && r.kiNm !== null && !r.kiSourceId) err(`drugs/${d.id}.receptorProfile[${i}]: kiNm without kiSourceId`);
      if (r.kiSourceId && !SOURCE_IDS.has(r.kiSourceId)) err(`drugs/${d.id}: unknown kiSource ${r.kiSourceId}`);
      checkClaim(r.effect, `drugs/${d.id}.receptorProfile[${i}].effect`);
    }
    for (const [i, a] of (d.adverseEffects || []).entries()) {
      for (const r of a.receptorIds || []) if (!RECEPTOR_IDS.has(r)) err(`drugs/${d.id}.adverseEffects[${i}]: unknown receptor ${r}`);
      checkClaim(a.mechanism, `drugs/${d.id}.adverseEffects[${i}].mechanism`);
    }
    if (d.occupancy) {
      if (!RECEPTOR_IDS.has(d.occupancy.receptorId)) err(`drugs/${d.id}: unknown occupancy receptor`);
      checkClaim(d.occupancy.claim, `drugs/${d.id}.occupancy.claim`);
    }
    if (d.doseRange && !d.doseRange.sourceId) err(`drugs/${d.id}: doseRange without sourceId`);
    if (d.doseRange?.sourceId && !SOURCE_IDS.has(d.doseRange.sourceId)) err(`drugs/${d.id}: unknown dose source`);
  }
}

function checkTreatments(knownDisorders) {
  for (const t of treatments.treatments || []) {
    if (!t.id || !t.kind) err(`treatments: incomplete ${t.id}`);
    if (t.drugId && !DRUG_IDS.has(t.drugId)) err(`treatments/${t.id}: unknown drug ${t.drugId}`);
    if (t.neuromodulation?.target) checkAtlasRef(t.neuromodulation.target, `treatments/${t.id}.target`);
    if (t.neuromodulation && !t.neuromodulation.target && !t.neuromodulation.targetNote) err(`treatments/${t.id}: needs target or targetNote`);
    for (const k of ['molecular', 'cellular', 'circuit']) {
      if (t.mechanismLevels?.[k]) checkClaim(t.mechanismLevels[k], `treatments/${t.id}.${k}`);
    }
    const ind = t.indication;
    if (ind) {
      if (!knownDisorders.has(ind.disorderId)) err(`treatments/${t.id}: unknown disorder ${ind.disorderId}`);
      if (!LEVELS.has(ind.evidence)) err(`treatments/${t.id}: bad indication evidence`);
      for (const s of ind.guidelineSourceIds || []) if (!SOURCE_IDS.has(s)) err(`treatments/${t.id}: unknown guideline ${s}`);
    }
  }
}

const disorderFiles = readdirSync(join(ROOT, 'content/disorders')).filter((f) => f.endsWith('.json') && f !== 'TEMPLATE.json');
if (!disorderFiles.length) err('no disorder files in content/disorders');
const knownDisorders = new Set(disorderFiles.map((f) => f.replace(/\.json$/, '')));

checkSourcesRegistry();
checkReceptors();
checkGenes();
checkDrugs();

for (const f of disorderFiles) {
  const d = load(`content/disorders/${f}`);
  const W = `disorders/${d.id || f}`;
  if (d.id !== f.replace(/\.json$/, '')) err(`${W}: id must match filename`);
  for (const [i, c] of (d.overview || []).entries()) checkClaim(c, `${W}.overview[${i}]`);
  for (const s of d.symptomDomains || []) {
    if (!s.id || !s.name) err(`${W}: symptom domain incomplete`);
    checkClaim(s.description, `${W}.symptoms/${s.id}`);
    for (const c of s.circuitIds || []) {
      if (!(d.circuits || []).some((x) => x.id === c)) err(`${W}: symptom ${s.id} unknown circuit ${c}`);
    }
    for (const b of s.brainFindingIds || []) {
      if (!(d.brainFindings || []).some((x) => x.id === b)) err(`${W}: symptom ${s.id} unknown finding ${b}`);
    }
  }
  for (const b of d.brainFindings || []) {
    checkAtlasRef(b.where, `${W}.findings/${b.id}`);
    if (b.effectSize && !SOURCE_IDS.has(b.effectSize.sourceId)) err(`${W}.findings/${b.id}: unknown effect source`);
    // Guards a real bug class: an effectSize object written into "stage",
    // which renders as "[object Object]" in the UI instead of failing here.
    if (typeof b.stage !== 'string') err(`${W}.findings/${b.id}: stage must be a string, got ${typeof b.stage}`);
    if (b.effectSize && typeof b.effectSize !== 'object') err(`${W}.findings/${b.id}: effectSize must be an object`);
    if (b.effectSize && typeof b.effectSize.value !== 'number') err(`${W}.findings/${b.id}: effectSize.value must be a number`);
    checkClaim(b.claim, `${W}.findings/${b.id}.claim`);
  }
  for (const c of d.circuits || []) {
    for (const [i, n] of (c.nodes || []).entries()) checkAtlasRef(n, `${W}.circuits/${c.id}.nodes[${i}]`);
    checkClaim(c.function, `${W}.circuits/${c.id}.function`);
  }
  for (const [i, n] of (d.neurochemistry || []).entries()) {
    for (const [j, w] of (n.where || []).entries()) checkAtlasRef(w, `${W}.neurochem[${i}].where[${j}]`);
    checkClaim(n.claim, `${W}.neurochem[${i}].claim`);
  }
  if (!d.genetics?.geneSymbols?.length) err(`${W}: genetics.geneSymbols empty`);
  for (const g of d.genetics?.geneSymbols || []) if (!GENE_SYMS.has(g)) err(`${W}: unknown gene ${g}`);
  for (const [i, a] of (d.genetics?.architecture || []).entries()) checkClaim(a, `${W}.genetics.arch[${i}]`);
  for (const [i, b] of (d.biomarkers || []).entries()) checkClaim(b.finding, `${W}.biomarkers[${i}]`);
  for (const t of d.treatments || []) if (!TREAT_IDS.has(t)) err(`${W}: unknown treatment ${t}`);
  for (const [i, p] of (d.pathway || []).entries()) checkClaim(p.claim, `${W}.pathway[${i}]`);
  for (const [i, q] of (d.quiz || []).entries()) {
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.choices || []).length) err(`${W}.quiz[${i}]: bad answer index`);
    if (!q.question || !q.explanation) err(`${W}.quiz[${i}]: missing question/explanation`);
    for (const s of q.sourceIds || []) if (!SOURCE_IDS.has(s)) err(`${W}.quiz[${i}]: unknown source ${s}`);
    if (!(q.sourceIds || []).length) err(`${W}.quiz[${i}]: no sources`);
  }
  if (strict) {
    if ((d.quiz || []).length < 15) err(`${W}: quiz has ${(d.quiz || []).length} items, need >= 15`);
    if ((d.tour || []).length < 6 || (d.tour || []).length > 10) err(`${W}: tour has ${(d.tour || []).length} steps, need 6-10`);
  }
  for (const r of d.related || []) if (!knownDisorders.has(r)) warn(`${W}: related disorder not yet implemented: ${r}`);
}
checkTreatments(knownDisorders);

console.log(`lint: ${errors.length} error(s), ${warnings.length} warning(s)${strict ? ' [strict]' : ''}`);
for (const w of warnings) console.log('WARN:', w);
for (const e of errors) console.log('ERROR:', e);
process.exit(errors.length ? 1 : 0);
