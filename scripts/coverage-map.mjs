/* Coverage + integrity audit for the universal explore model.
   Recomputes everything from repository data on each run (nothing hardcoded):
   validates public/clinical/space-map.json, unit-tests src/explore.js
   resolvers, and reports per-entity mapping status across all collections.
   Regenerates COVERAGE.md. Exit 1 on any validation failure.
   Run with: node scripts/coverage-map.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveSubtype, resolveDrugTargets, resolvePathway,
  collectReceptorSpatial, conceptSVG, STATUS,
} from '../src/explore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const manifest = load('public/brain-atlas/models/manifest.json');
const LABELS = new Set(manifest.nodes.map((n) => String(n.label)));
const markers = load('content/markers.json');
const MARKERS = new Map((markers.markers || []).map((m) => [m.id, m]));
const spaceMap = load('public/clinical/space-map.json');
const transmitters = load('public/clinical/transmitters.json');
const clinCircuits = load('public/clinical/circuits.json');
const syndromes = load('public/clinical/syndromes.json');
const clinDrugs = load('public/clinical/drugs.json');
const c3d = load('public/brain-atlas/circuits3d.json');
const C3D = new Map((c3d.circuits || []).map((c) => [c.id, c]));
const receptors = load('content/registries/receptors.json').receptors;
const REG_RECEPTORS = new Map(receptors.map((r) => [r.id, r]));
const regDrugs = load('content/registries/drugs.json').drugs;
const REG_DRUGS = new Map(regDrugs.map((d) => [d.id, d]));
const genes = load('content/registries/genes.json').genes;
const disorders = load('content/index.json').disorders;

let checks = 0;
const fails = [];
const assert = (cond, msg) => { checks += 1; if (!cond) fails.push(msg); };

// ---------- 1. space-map validation ----------
for (const tx of transmitters) {
  const entries = (spaceMap.subtypeReceptors || {})[tx.id] || {};
  for (const s of tx.receptorSubtypes || []) {
    assert(entries[s.name] !== undefined, `space-map: subtype without entry: ${tx.id}:${s.name}`);
  }
  for (const name of Object.keys(entries)) {
    assert((tx.receptorSubtypes || []).some((s) => s.name === name), `space-map: entry for unknown subtype: ${tx.id}:${name}`);
  }
}
const knownTargets = new Set();
for (const d of clinDrugs) for (const t of d.receptorTargets || []) knownTargets.add(t.target);
for (const name of Object.keys(spaceMap.drugTargets || {})) {
  assert(knownTargets.has(name), `space-map: drugTarget entry matches no clinical target string: ${name}`);
}
for (const [txId, list] of Object.entries(spaceMap.pathways || {})) {
  assert(transmitters.some((t) => t.id === txId), `space-map: pathways for unknown transmitter ${txId}`);
  for (const p of list) {
    const keys = new Set((p.nodes || []).map((n) => n.key));
    for (const n of p.nodes || []) {
      for (const l of n.atlasLabels || []) assert(LABELS.has(l), `space-map: pathway ${p.id} unknown label ${l}`);
      if (n.markerId) assert(MARKERS.has(n.markerId), `space-map: pathway ${p.id} unknown marker ${n.markerId}`);
      assert(['exact', 'proxy', 'schematic'].includes(n.precision), `space-map: pathway ${p.id} bad precision`);
    }
    for (const e of p.edges || []) {
      assert(keys.has(e.from) && keys.has(e.to), `space-map: pathway ${p.id} edge references unknown node`);
      assert(['excitatory', 'inhibitory', 'modulatory'].includes(e.type), `space-map: pathway ${p.id} bad edge type`);
    }
    if (p.circuitId) assert(C3D.has(p.circuitId), `space-map: pathway ${p.id} unknown circuit ${p.circuitId}`);
  }
}
for (const [cid, list] of Object.entries(spaceMap.circuitMarkers || {})) {
  assert(C3D.has(cid), `space-map: circuitMarkers for unknown circuit ${cid}`);
  for (const m of list) assert(MARKERS.has(m.id), `space-map: circuitMarkers ${cid} unknown marker ${m.id}`);
}
for (const tx of Object.values(spaceMap.subtypeReceptors || {})) {
  for (const [name, e] of Object.entries(tx)) {
    for (const id of e.receptors || []) assert(REG_RECEPTORS.has(id), `space-map: subtype ${name} unknown receptor ${id}`);
    assert(['mapped', 'family', 'none'].includes(e.status), `space-map: subtype ${name} bad status`);
  }
}
for (const [name, e] of Object.entries(spaceMap.drugTargets || {})) {
  for (const id of e.receptors || []) assert(REG_RECEPTORS.has(id), `space-map: drugTarget ${name} unknown receptor ${id}`);
}

// ---------- 2. resolver unit tests (same code the browser runs) ----------
{
  const r = resolveSubtype(spaceMap, receptors, 'dopamine', 'D2');
  assert(r.status === STATUS.mapped && r.receptors.length === 1 && r.receptors[0].id === 'DRD2', 'resolver: dopamine D2 -> DRD2');
  const r1 = resolveSubtype(spaceMap, receptors, 'dopamine', 'D1');
  assert(r1.status === STATUS.none && r1.receptors.length === 0, 'resolver: dopamine D1 -> none (no fabrication)');
  const r3 = resolveSubtype(spaceMap, receptors, 'dopamine', 'Nope');
  assert(r3.status === STATUS.none, 'resolver: unknown subtype -> none');
  const rows = resolveDrugTargets(spaceMap, receptors, ['D2', 'Bogus target']);
  assert(rows[0].receptors[0]?.id === 'DRD2' && rows[1].status === STATUS.none, 'resolver: drug targets incl. unknown');
  const p = resolvePathway(spaceMap, 'dopamine', 'da-tuberoinfundibular');
  assert(p && p.edges.length === 0 && p.omitted.length > 0, 'resolver: tuberoinfundibular has no edges + off-atlas note');
  assert(resolvePathway(spaceMap, 'gaba', 'x') === null, 'resolver: uncurated transmitter -> null');
  const sp = collectReceptorSpatial([REG_RECEPTORS.get('DRD2')]);
  assert(sp.labels.includes('Putamen') && sp.precisions.includes('exact'), 'resolver: DRD2 spatial collection');
  const svg = conceptSVG({ title: 'T', lanes: [{ kicker: 'k', text: 't', evidence: 'strong' }], sourcesNote: 's' });
  assert(svg.includes('SCHEMATIC') && svg.includes('role="img"'), 'resolver: concept SVG carries schematic banner');
}

// ---------- 3. coverage report ----------
const rows = [];
const push = (collection, id, name, spatial, evidence, links) => rows.push({ collection, id, name, spatial, evidence, links });

// transmitter subtypes + pathways
for (const tx of transmitters) {
  for (const s of tx.receptorSubtypes || []) {
    const r = resolveSubtype(spaceMap, receptors, tx.id, s.name);
    push('transmitter-subtype', `${tx.id}:${s.name}`, `${tx.name} ${s.name}`,
      r.status, r.receptors.length ? 'registry site claim' : 'no site claim',
      r.receptors.map((x) => `receptor:${x.id}`).join(', ') || '—');
  }
  const maps = spaceMap.pathways?.[tx.id] || [];
  push('transmitter-pathways', tx.id, `${tx.name} pathways`,
    maps.length ? 'mapped' : 'not mapped',
    maps.length ? 'pathway strings + circuit links' : 'pathway strings only',
    maps.map((p) => p.id).join(', ') || '—');
}
// clinical circuits
for (const c of clinCircuits) {
  const c3 = C3D.get(c.id);
  push('clinical-circuit', c.id, c.name,
    c3 ? (c3.omitted?.length ? 'partially mapped' : 'mapped') : 'not mapped',
    'circuit record', c3 ? `${c3.nodes.length} nodes, no directed edges in source` : 'no geometry');
}
// syndromes (via linked circuits)
for (const s of syndromes) {
  const ok = (s.linkedCircuits || []).filter((id) => C3D.has(id));
  push('syndrome', s.id, s.name,
    ok.length === (s.linkedCircuits || []).length && ok.length ? 'mapped' : ok.length ? 'partially mapped' : 'not mapped',
    'syndrome record + circuit links', ok.join(', ') || '—');
}
// clinical drugs
for (const d of clinDrugs) {
  const reg = REG_DRUGS.get(d.id);
  const rows2 = resolveDrugTargets(spaceMap, receptors, (d.receptorTargets || []).map((t) => t.target));
  const unmapped = rows2.filter((r) => !r.receptors.length).map((r) => r.name);
  push('clinical-drug', d.id, d.genericName,
    reg ? 'mapped' : unmapped.length === rows2.length ? 'not mapped' : 'partially mapped',
    reg ? 'validated registry fingerprint' : 'target-string fallback',
    reg ? `registry:${reg.id}` : (unmapped.length ? `unmapped: ${unmapped.join('; ')}` : 'fallback map'));
}
// receptors
for (const r of receptors) {
  const sp = collectReceptorSpatial([r]);
  push('receptor', r.id, r.name,
    sp.labels.length ? (sp.precisions.includes('exact') ? 'mapped' : 'partially mapped')
      : sp.markers.length ? 'schematic only' : 'not mapped',
    'principal-site claim', sp.labels.slice(0, 4).join(', ') + (sp.labels.length > 4 ? '…' : '') + (sp.markers.length ? ` [markers: ${sp.markers.join(', ')}]` : ''));
}
// genes
for (const g of genes) {
  const parts = [];
  if ((g.linkedReceptorIds || []).length) parts.push('receptors:' + g.linkedReceptorIds.join(','));
  if ((g.brainExpression || []).length) parts.push('expression:' + g.brainExpression.length);
  if (g.ensemblId) parts.push('external:opentargets/gnomad');
  push('gene', g.symbol, g.name,
    parts.some((p) => p.startsWith('receptors') || p.startsWith('expression')) ? 'partially mapped' : 'not mapped',
    'gene record + constraint', parts.join('; ') || 'non-spatial reference');
}
// disorders
for (const d of disorders) {
  push('disorder', d.id, d.name, 'mapped', 'disorder file (lenses)', 'lenses: pathology/circuit/symptom/chemistry/drug/gene/neuromod');
}
// atlas structures referenced anywhere?
const referenced = new Set();
for (const r of receptors) for (const p of r.principalSites || []) for (const l of (p.where || {}).atlasLabels || []) referenced.add(l);
const unreferenced = manifest.nodes.filter((n) => !referenced.has(String(n.label))).length;

const byStatus = {};
for (const r of rows) byStatus[r.spatial] = (byStatus[r.spatial] || 0) + 1;

const md = [];
md.push('# Explore coverage (generated — do not hand-edit)');
md.push('');
md.push(`Regenerated by \`node scripts/coverage-map.mjs\`. ${rows.length} entity rows audited.`);
md.push('');
md.push('Status meaning: **mapped** = exact registry/atlas join; **family-level** = same-family record (sites may differ, note in UI); **partially mapped** = some links resolve; **schematic only** = marker-anchored by declaration; **off-atlas** = real anatomy outside the model; **not mapped / none** = no spatial record (entity stays readable, explicitly labeled). Missing mapping is a content state, not a defect to fake away.');
md.push('');
md.push('## Totals by status');
for (const [k, v] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) md.push(`- ${k}: **${v}**`);
md.push(`- atlas structures never referenced by any receptor site map: **${unreferenced}** of ${manifest.nodes.length} meshes (anatomy is browsable regardless)`);
md.push('');
md.push('## Per-entity rows');
md.push('| Collection | ID | Name | Spatial | Evidence | Links |');
md.push('|---|---|---|---|---|---|');
for (const r of rows) {
  md.push(`| ${r.collection} | ${r.id} | ${r.name} | ${r.spatial} | ${r.evidence} | ${r.links} |`);
}
md.push('');
md.push('## Validation failures');
md.push(fails.length ? fails.map((f) => `- ${f}`).join('\n') : 'None — every ID, label, marker, subtype, target string, pathway node/edge and circuit reference resolves.');
writeFileSync(join(ROOT, 'COVERAGE.md'), md.join('\n') + '\n');

console.log(`coverage-map: ${checks} checks, ${fails.length} failure(s), ${rows.length} entity rows -> COVERAGE.md`);
for (const [k, v] of Object.entries(byStatus)) console.log(`  ${k}: ${v}`);
if (fails.length) {
  for (const f of fails.slice(0, 20)) console.error('  FAIL ' + f);
  process.exit(1);
}
