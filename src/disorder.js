/* Disorder-centric learning platform (Phase 1: schizophrenia).
   Data-driven: every disorder is a data file under /content; the viewer
   API (highlight/clear/flyTo/markers/tubes) is generic. No disorder-specific
   code paths here beyond reading the JSON. UI strings live in STRINGS so
   Hindi/Gujarati can be added later; English ships first. */
import './clinical.js';

const BASE = import.meta.env.BASE_URL;

const STRINGS = {
  pickDisorder: 'Pick a disorder',
  searchDisorders: 'Search disorders…',
  close: 'Close',
  back: '← Back',
  lenses: { pathology: 'Pathology', circuit: 'Circuit', chemistry: 'Chemistry', receptor: 'Receptor', drug: 'Drug', symptom: 'Symptom', neuromod: 'Neuromod', gene: 'Gene' },
  tabs: { overview: 'Overview', psychopathology: 'Psychopathology', brain: 'Brain pathology', neurochemistry: 'Neurochemistry', genetics: 'Genetics', biomarkers: 'Biomarkers', treatments: 'Treatments', pathway: 'Pathway', evidence: 'Evidence', quiz: 'Quiz' },
  furtherReading: 'Sources',
  notesPlaceholder: 'Personal study notes (stored only in this browser)…',
  printSummary: 'Print summary',
  startTour: 'Start guided tour',
  exitTour: 'Exit tour',
  next: 'Next',
  showOnBrain: 'Show on 3D brain',
  disclaimer: 'Educational content — not clinical decision support, not for prescribing. Verify against current guidelines.',
};

const $ = (id) => document.getElementById(id);
const V = () => window.__neuroMap || {};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FINDING_COLORS = {
  'volume-reduction': '#60A5FA', 'volume-increase': '#34D399', 'thickness-reduction': '#60A5FA',
  hyperactivity: '#F87171', hypoactivity: '#94A3B8', dysconnectivity: '#A78BFA',
  'altered-receptor': '#FBBF24', 'altered-metabolism': '#FBBF24', other: '#9CA3AF',
};
const ACTION_COLORS = { antagonist: '#F87171', 'partial-agonist': '#FBBF24', 'inverse-agonist': '#FB923C', agonist: '#34D399', PAM: '#2DD4BF', 'reuptake-inhibitor': '#60A5FA', other: '#9CA3AF' };
const RELEVANCE_COLORS = { therapeutic: '#34D399', adverse: '#F87171', both: '#FBBF24', unknown: '#9CA3AF' };

const S = { disorder: null, reg: null, markers: [], index: [], tab: 'overview', lens: null, lensTarget: null, tourIdx: -1, backTo: null };
let stageFilter = '';

function evBadge(ev) {
  return `<span class="badge ev-${esc(ev)}">${esc(ev)}</span>`;
}
function precBadge(p) {
  return `<span class="badge prec-${esc(p)}">${esc(p)}</span>`;
}
function srcLinks(ids) {
  if (!ids || !ids.length) return '';
  const items = ids.map((id) => S.reg.sources[id]).filter(Boolean);
  if (!items.length) return '';
  return `<h3>${esc(STRINGS.furtherReading)}</h3><div class="src-list">${items
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} <span>↗</span></a>`)
    .join('')}</div>`;
}
function claimHtml(c, showDate = true) {
  return `<p>${esc(c.text)}</p><p class="cred">${evBadge(c.evidence)}${showDate ? ` <span>reviewed ${esc(c.lastReviewed)}</span>` : ''}</p>`;
}
function atlasChips(ref) {
  const labels = (ref && ref.atlasLabels) || [];
  const marker = ref && ref.markerId ? `<span class="badge prec-schematic">marker: ${esc(ref.markerId)}</span>` : '';
  return labels.map((l) => `<span class="lab">${esc(l)}</span>`).join('') + marker + (ref ? precBadge(ref.precision) : '');
}

// ---------- loading ----------
async function getJSON(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return r.json();
}
async function loadAll(id) {
  const [disorder, sources, receptors, genes, drugs, treatments, markers] = await Promise.all([
    getJSON(`content/disorders/${id}.json`),
    getJSON('content/registries/sources.json'),
    getJSON('content/registries/receptors.json'),
    getJSON('content/registries/genes.json'),
    getJSON('content/registries/drugs.json'),
    getJSON('content/registries/treatments.json'),
    getJSON('content/markers.json').catch(() => ({ markers: [] })),
  ]);
  S.reg = {
    sources: Object.fromEntries((sources.sources || []).map((s) => [s.id, s])),
    receptors: Object.fromEntries((receptors.receptors || []).map((r) => [r.id, r])),
    genes: Object.fromEntries((genes.genes || []).map((g) => [g.symbol, g])),
    drugs: Object.fromEntries((drugs.drugs || []).map((d) => [d.id, d])),
    treatments: Object.fromEntries((treatments.treatments || []).map((t) => [t.id, t])),
  };
  S.markers = markers.markers || [];
  S.disorder = disorder;
}

// ---------- lenses (data-driven orchestration; viewer stays generic) ----------
function clearLens() {
  V().clearHighlight && V().clearHighlight();
  V().clearMarkers && V().clearMarkers();
  S.lens = null;
  S.lensTarget = null;
  renderLensBar();
}

function findingMeshes(f) {
  return (V().meshesForLabels ? V().meshesForLabels(f.where.atlasLabels || []) : []) || [];
}

function applyLens(lens, target) {
  S.lens = lens;
  S.lensTarget = target || null;
  const v = V();
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.isolateMeshes && v.isolateMeshes(null);
  const d = S.disorder;
  if (!lens) { renderLensBar(); return; }

  if (lens === 'pathology') {
    const list = target && target !== 'all'
      ? d.brainFindings.filter((f) => f.id === target)
      : d.brainFindings.filter((f) => !stageFilter || f.stage === stageFilter || f.stage === 'any' || !f.stage);
    v.highlight && v.highlight(list.map((f) => ({
      labels: f.where.atlasLabels || [],
      color: FINDING_COLORS[f.finding] || '#9CA3AF',
    })));
    const markers = collectMarkers(list.flatMap((f) => [f.where]));
    if (markers.length) v.showMarkers && v.showMarkers(markers);
  } else if (lens === 'circuit') {
    const c = d.circuits.find((x) => x.id === (target || d.circuits[0]?.id));
    if (c) {
      v.highlight && v.highlight(c.nodes.map(() => ({ labels: c.nodes.flatMap((n) => n.atlasLabels || []), color: '#F59E0B' })));
      const markers = collectMarkers(c.nodes);
      if (markers.length) v.showMarkers && v.showMarkers(markers);
      drawCircuitEdges(c);
      const all = c.nodes.flatMap((n) => n.atlasLabels || []);
      v.flyToMeshes && v.flyToMeshes(v.meshesForLabels(all));
    }
  } else if (lens === 'chemistry') {
    const n = d.neurochemistry.find((x) => x.transmitter === (target || d.neurochemistry[0]?.transmitter)) || d.neurochemistry[0];
    if (n) {
      const labels = n.where.flatMap((w) => w.atlasLabels || []);
      v.highlight && v.highlight([{ labels, color: '#2DD4BF' }]);
      const markers = collectMarkers(n.where);
      if (markers.length) v.showMarkers && v.showMarkers(markers);
      v.flyToMeshes && v.flyToMeshes(v.meshesForLabels(labels));
    }
  } else if (lens === 'receptor') {
    const r = S.reg.receptors[target] || Object.values(S.reg.receptors)[0];
    if (r) {
      const labels = (r.principalSites || []).flatMap((p) => p.where.atlasLabels || []);
      v.highlight && v.highlight([{ labels, color: '#A855F7' }]);
      v.flyToMeshes && v.flyToMeshes(v.meshesForLabels(labels));
    }
  } else if (lens === 'drug') {
    const t = Object.values(S.reg.treatments).find((x) => x.drugId === target && x.indication?.disorderId === d.id)
      || d.treatments.map((id) => S.reg.treatments[id]).find((x) => x && x.drugId);
    const drug = t && t.drugId ? S.reg.drugs[t.drugId] : null;
    const recIds = drug ? drug.receptorProfile.map((r) => r.receptorId) : [];
    const labels = recIds.flatMap((id) => (S.reg.receptors[id]?.principalSites || []).flatMap((p) => p.where.atlasLabels || []));
    v.highlight && v.highlight([{ labels, color: '#34D399' }]);
    v.flyToMeshes && v.flyToMeshes(v.meshesForLabels(labels));
  } else if (lens === 'symptom') {
    const s = d.symptomDomains.find((x) => x.id === (target || d.symptomDomains[0]?.id)) || d.symptomDomains[0];
    if (s) {
      const circs = (s.circuitIds || []).map((id) => d.circuits.find((c) => c.id === id)).filter(Boolean);
      const labels = circs.flatMap((c) => c.nodes.flatMap((n) => n.atlasLabels || []));
      const finds = (s.brainFindingIds || []).map((id) => d.brainFindings.find((f) => f.id === id)).filter(Boolean);
      const flabels = finds.flatMap((f) => f.where.atlasLabels || []);
      v.highlight && v.highlight([{ labels: [...new Set([...labels, ...flabels])], color: '#F472B6' }]);
    }
  } else if (lens === 'neuromod' || lens === 'neuromodulation') {
    const t = S.reg.treatments[target] || Object.values(S.reg.treatments).find((x) => x.kind === 'neuromodulation' && x.indication?.disorderId === d.id);
    if (t?.neuromodulation?.target) {
      v.highlight && v.highlight([{ labels: t.neuromodulation.target.atlasLabels || [], color: '#FBBF24' }]);
      v.flyToMeshes && v.flyToMeshes(v.meshesForLabels(t.neuromodulation.target.atlasLabels || []));
    }
  } else if (lens === 'gene') {
    const g = S.reg.genes[target] || S.reg.genes[d.genetics.geneSymbols[0]];
    if (g) {
      const labels = (g.linkedReceptorIds || []).flatMap((id) => (S.reg.receptors[id]?.principalSites || []).flatMap((p) => p.where.atlasLabels || []));
      const expr = (g.brainExpression || []).flatMap((b) => b.where.atlasLabels || []);
      v.highlight && v.highlight([{ labels: [...new Set([...labels, ...expr])], color: '#38BDF8' }]);
    }
  }
  renderLensBar();
}

function collectMarkers(refs) {
  const ids = new Set();
  for (const r of refs || []) if (r && r.markerId) ids.add(r.markerId);
  return S.markers.filter((m) => ids.has(m.id));
}

function drawCircuitEdges(circuit) {
  const v = V();
  if (!v.drawTube) return;
  const pos = v.markerPositions ? v.markerPositions() : {};
  const pointFor = (s) => {
    for (const [id, p] of Object.entries(pos)) {
      const m = S.markers.find((x) => x.id === id);
      if (id === s || (m && m.label === s)) return p;
    }
    return v.centroidOfLabels ? v.centroidOfLabels([s]) : null;
  };
  for (const e of circuit.edges || []) {
    const a = pointFor(e.from);
    const b = pointFor(e.to);
    if (a && b) v.drawTube({ centers: [a, b], color: '#F59E0B', closed: false });
  }
}

// ---------- UI ----------
const TAB_ORDER = ['overview', 'psychopathology', 'brain', 'neurochemistry', 'genetics', 'biomarkers', 'treatments', 'pathway', 'evidence', 'quiz'];
let activeTab = 'overview';
let entityView = null; // {kind, id} or null

function renderLensBar() {
  const lenses = Object.keys(STRINGS.lenses);
  $('lensBar').innerHTML = `<span>Lens:</span>` + lenses.map((l) =>
    `<button type="button" data-lens="${l}" class="${S.lens === l ? 'on' : ''}">${esc(STRINGS.lenses[l])}</button>`,
  ).join('') + (S.lens ? `<button type="button" data-lens="">Clear</button>` : '');
  $('lensBar').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      const l = b.dataset.lens;
      if (!l) { clearLens(); return; }
      openLensTargetPicker(l);
    }),
  );
}

function openLensTargetPicker(lens) {
  // Minimal target picking per lens; full dropdowns render inside the tab body.
  const d = S.disorder;
  const first = {
    pathology: () => applyLens('pathology', 'all'),
    circuit: () => applyLens('circuit', d.circuits[0]?.id),
    chemistry: () => applyLens('chemistry', d.neurochemistry[0]?.transmitter),
    receptor: () => applyLens('receptor', Object.keys(S.reg.receptors)[0]),
    drug: () => applyLens('drug', d.treatments.map((id) => S.reg.treatments[id]).find((t) => t?.drugId)?.drugId),
    symptom: () => applyLens('symptom', d.symptomDomains[0]?.id),
    neuromod: () => {
      const t = Object.values(S.reg.treatments).find((x) => x.kind === 'neuromodulation' && x.indication && x.indication.disorderId === d.id);
      applyLens('neuromod', t && t.id);
    },
    gene: () => applyLens('gene', d.genetics.geneSymbols[0]),
  }[lens];
  if (first) first();
}

// ---------- entity detail cards ----------
function linkedDisordersText(kind, id) {
  // Generic: reports the loaded disorder when this entity is referenced by it.
  const d = S.disorder;
  if (!d) return '';
  let hit = false;
  if (kind === 'gene') hit = (d.genetics.geneSymbols || []).includes(id);
  if (kind === 'receptor') {
    hit = d.treatments.some((t) => (S.reg.treatments[t]?.drugId
      ? (S.reg.drugs[S.reg.treatments[t].drugId]?.receptorProfile || []).some((r) => r.receptorId === id)
      : false));
  }
  if (kind === 'drug') hit = d.treatments.some((t) => S.reg.treatments[t]?.drugId === id);
  if (!hit) return '';
  return `<h3>Appears in</h3><p>${esc(d.name)}</p>`;
}

function entityCard(kind, id) {
  if (kind === 'receptor') {
    const r = S.reg.receptors[id];
    if (!r) return '<p>Unknown receptor.</p>';
    return `<h2>${esc(r.name)} <span class="code">${esc(r.id)}</span></h2>
      <h3>Signalling</h3>${claimHtml(r.signalling)}
      <h3>Principal sites</h3>${(r.principalSites || []).map((p) => `<p>${atlasChips(p.where)}</p>${claimHtml(p.claim)}`).join('') || '<p>No reliable regional data.</p>'}
      ${r.cortexDensity ? `<h3>Cortical density (PET atlas)</h3><p>${esc(r.cortexDensity.annotation)} &mdash; heatmap rendering is not yet implemented; follow the atlas link in Evidence.</p>` : ''}
      ${linkedDisordersText('receptor', id)}`;
  }
  if (kind === 'gene') {
    const g = S.reg.genes[id];
    if (!g) return '<p>Unknown gene.</p>';
    return `<h2>${esc(g.symbol)} &mdash; ${esc(g.name)}</h2>
      <p><span class="code">${esc(g.variantClass)}</span></p>
      <h3>Function</h3>${claimHtml(g.function)}
      ${g.cellTypes ? `<h3>Cell types</h3>${claimHtml(g.cellTypes)}` : ''}
      ${(g.brainExpression || []).length
        ? `<h3>Brain expression</h3>` + g.brainExpression.map((b) => `<p>${atlasChips(b.where)}</p>${claimHtml(b.claim)}`).join('')
        : '<h3>Brain expression</h3><p>No reliable regional data.</p>'}
      ${g.effect ? `<h3>Effect size</h3><p>${esc(g.effect.text)}</p>` : ''}
      ${linkedDisordersText('gene', id)}`;
  }
  if (kind === 'drug') {
    const dr = S.reg.drugs[id];
    if (!dr) return '<p>Unknown drug.</p>';
    const rows = (dr.receptorProfile || []).map((r) => {
      const rec = S.reg.receptors[r.receptorId];
      const a = ACTION_COLORS[r.action] || '#9CA3AF';
      const rel = RELEVANCE_COLORS[r.relevance] || '#9CA3AF';
      return `<div class="fp-row"><b>${esc(rec ? rec.name : r.receptorId)}</b>
        <span class="badge" style="border-color:${a};color:${a}">${esc(r.action)}</span>
        <span class="badge" style="border-color:${rel};color:${rel}">${esc(r.relevance)}</span>
        <small>${r.kiNm != null ? `Ki ${esc(r.kiNm)} nM (sourced)` : 'Ki not sourced &mdash; omitted'}</small>
        ${claimHtml(r.effect, false)}</div>`;
    }).join('');
    return `<h2>${esc(dr.generic)}${dr.brand && dr.brand.length ? ` <small>(${dr.brand.map(esc).join(', ')})</small>` : ''}</h2>
      <p><span class="code">${esc((dr.classes || []).join(' &middot; '))}${dr.atc ? ` &middot; ATC ${esc(dr.atc)}` : ''}</span></p>
      <h3>Mechanism</h3>${(dr.mechanism || []).map((m) => claimHtml(m)).join('')}
      <h3>Receptor fingerprint</h3>${rows || '<p>No profile data.</p>'}
      ${dr.occupancy ? `<h3>Occupancy</h3>${claimHtml(dr.occupancy.claim)}` : ''}
      <h3>Adverse effects mapped to receptors</h3>${(dr.adverseEffects || []).map((a) => `<p><b>${esc(a.effect)}</b> &rarr; ${(a.receptorIds || []).map((rid) => esc(S.reg.receptors[rid] ? S.reg.receptors[rid].name : rid)).join(', ')}</p>${claimHtml(a.mechanism)}`).join('') || '<p>No mapped effects.</p>'}
      ${dr.monitoring ? `<h3>Monitoring</h3>${claimHtml(dr.monitoring)}` : ''}
      ${dr.doseRange ? `<h3>Dose range</h3><p>${esc(dr.doseRange.text)}</p>` : ''}
      ${linkedDisordersText('drug', id)}`;
  }
  if (kind === 'treatment') {
    const t = S.reg.treatments[id];
    if (!t) return '<p>Unknown treatment.</p>';
    const nm = t.neuromodulation;
    return `<h2>Treatment: ${esc(t.id)}</h2>
      <p><span class="code">${esc(t.kind)}${t.drugId ? ` &middot; ${esc(S.reg.drugs[t.drugId] ? S.reg.drugs[t.drugId].generic : t.drugId)}` : ''}</span></p>
      ${nm ? `<h3>Neuromodulation</h3><p>Modality: ${esc(nm.modality)}${nm.montageOrCoil ? ` &mdash; ${esc(nm.montageOrCoil)}` : ''}</p>${nm.target ? `<p>${atlasChips(nm.target)}</p>` : `<p>${esc(nm.targetNote || '')}</p>`}` : ''}
      <h3>Where it works</h3>
      ${['molecular', 'cellular', 'circuit'].map((k) => (t.mechanismLevels && t.mechanismLevels[k] ? `<p><b>${k}:</b> ${esc(t.mechanismLevels[k].text)} ${evBadge(t.mechanismLevels[k].evidence)}</p>` : '')).join('')}
      ${t.mechanismLevels && t.mechanismLevels.symptomDomains ? `<p><b>Symptom domains:</b> ${t.mechanismLevels.symptomDomains.map(esc).join(', ')}</p>` : ''}
      ${t.indication ? `<h3>Indication</h3><p>Line: ${esc(t.indication.line)} ${evBadge(t.indication.evidence)}</p>${srcLinks(t.indication.guidelineSourceIds)}` : ''}`;
  }
  if (kind === 'circuit') {
    const c = (S.disorder.circuits || []).find((x) => x.id === id);
    if (!c) return '<p>Unknown circuit.</p>';
    return `<h2>${esc(c.name)}</h2>
      <h3>Nodes</h3>${c.nodes.map((n) => `<p>${atlasChips(n)}</p>`).join('')}
      <h3>Connections</h3>${(c.edges || []).map((e) => `<p>${esc(e.from)} &rarr; ${esc(e.to)} (${esc(e.type)}${e.transmitter ? `, ${esc(e.transmitter)}` : ''})</p>`).join('')}
      <h3>Function</h3>${claimHtml(c.function)}
      <div class="btn-row"><button type="button" data-lensgo="circuit:${esc(c.id)}">${esc(STRINGS.showOnBrain)}</button></div>`;
  }
  return '<p>Unknown entity.</p>';
}

function chipBtn(kind, id, label) {
  return `<button type="button" data-ent="${kind}:${esc(id)}">${esc(label)}</button>`;
}

function wireEntityChips(root) {
  root.querySelectorAll('[data-ent]').forEach((b) =>
    b.addEventListener('click', () => {
      const parts = b.dataset.ent.split(':');
      entityView = { kind: parts[0], id: parts.slice(1).join(':') };
      renderBody();
      $('dpBody').scrollTop = 0;
    }),
  );
}

function wireLensGo(root) {
  root.querySelectorAll('[data-lensgo]').forEach((b) =>
    b.addEventListener('click', () => {
      const parts = b.dataset.lensgo.split(':');
      applyLens(parts[0], parts.slice(1).join(':'));
    }),
  );
}

// ---------- tabs and body ----------
function renderTabs() {
  $('dpTabs').innerHTML = TAB_ORDER.map((t) =>
    `<button type="button" role="tab" data-tab="${t}" class="${t === activeTab ? 'on' : ''}">${esc(STRINGS.tabs[t])}</button>`,
  ).join('');
  $('dpTabs').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { activeTab = b.dataset.tab; entityView = null; renderBody(); applyTabLens(); }),
  );
}

function applyTabLens() {
  const d = S.disorder;
  const defaults = {
    psychopathology: () => applyLens('symptom', d.symptomDomains[0] && d.symptomDomains[0].id),
    brain: () => applyLens('pathology', 'all'),
    neurochemistry: () => applyLens('chemistry', d.neurochemistry[0] && d.neurochemistry[0].transmitter),
    genetics: () => applyLens('gene', d.genetics.geneSymbols[0]),
    treatments: () => {
      const t = d.treatments.map((id) => S.reg.treatments[id]).find((x) => x && x.drugId);
      applyLens('drug', t && t.drugId);
    },
  };
  if (defaults[activeTab]) defaults[activeTab]();
  else clearLens();
}

function collectSources() {
  const ids = new Set();
  const grab = (c) => { if (c && Array.isArray(c.sourceIds)) c.sourceIds.forEach((s) => ids.add(s)); };
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.text && o.evidence) grab(o);
    Object.keys(o).forEach((k) => walk(o[k]));
  };
  walk(S.disorder);
  return Array.from(ids).map((id) => S.reg.sources[id]).filter(Boolean);
}

function renderBody() {
  renderTabs();
  renderLensBar();
  const d = S.disorder;
  const body = $('dpBody');
  if (entityView) {
    body.innerHTML = `<button id="entBack" type="button">${esc(STRINGS.back)}</button>` + entityCard(entityView.kind, entityView.id);
    $('entBack').addEventListener('click', () => { entityView = null; renderBody(); });
    wireEntityChips(body);
    wireLensGo(body);
    return;
  }
  if (activeTab === 'overview') {
    const notes = localStorage.getItem(`nmnotes-${d.id}`) || '';
    const related = (d.related || []).map((id) => (S.index || []).find((x) => x.id === id)).filter(Boolean);
    body.innerHTML = `
      <p>${esc(d.block)}</p>
      ${(d.overview || []).map((c) => claimHtml(c)).join('')}
      <div class="btn-row">
        <button id="tourStart" type="button">${esc(STRINGS.startTour)}</button>
        <button id="printBtn" type="button">${esc(STRINGS.printSummary)}</button>
      </div>
      ${related.length ? `<h3>Compare with</h3><div class="chips">${related.map((r) => `<button type="button" data-rel="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>` : ''}
      <h3>Study notes</h3>
      <textarea id="notesBox" placeholder="${esc(STRINGS.notesPlaceholder)}">${esc(notes)}</textarea>`;
    $('tourStart').addEventListener('click', startTour);
    $('printBtn').addEventListener('click', () => window.print());
    $('notesBox').addEventListener('input', (e) => localStorage.setItem(`nmnotes-${d.id}`, e.target.value));
    body.querySelectorAll('[data-rel]').forEach((b) => b.addEventListener('click', () => openDisorder(b.dataset.rel)));
  } else if (activeTab === 'psychopathology') {
    body.innerHTML = (d.symptomDomains || []).map((s) => `
      <details class="acc" open><summary><b>${esc(s.name)}</b></summary>
      ${claimHtml(s.description)}
      <div class="chips">
        ${(s.circuitIds || []).map((id) => chipBtn('circuit', id, (d.circuits.find((c) => c.id === id) || {}).name || id)).join('')}
        ${(s.brainFindingIds || []).map((id) => `<span class="lab">${esc(id)}</span>`).join('')}
      </div>
      <div class="btn-row"><button type="button" data-lensgo="symptom:${esc(s.id)}">${esc(STRINGS.showOnBrain)}</button></div>
      </details>`).join('');
    wireEntityChips(body);
    wireLensGo(body);
  } else if (activeTab === 'brain') {
    const stages = Array.from(new Set((d.brainFindings || []).map((f) => f.stage).filter(Boolean)));
    const visible = (d.brainFindings || []).filter((f) => !stageFilter || f.stage === stageFilter || f.stage === 'any' || !f.stage);
    body.innerHTML = `
      <label>Stage: <select id="stageSel">
        <option value="">all</option>
        ${stages.map((s) => `<option value="${esc(s)}" ${stageFilter === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select></label>
      ${visible.map((f) => `
      <details class="acc" open><summary><b>${esc(f.id)}</b> <span class="code">${esc(f.finding)}${f.stage ? ` &middot; ${esc(f.stage)}` : ''}</span></summary>
      <p>${atlasChips(f.where)}</p>${claimHtml(f.claim)}
      ${f.effectSize ? `<p class="code">effect ${esc(f.effectSize.metric)} = ${esc(f.effectSize.value)}${f.effectSize.ci ? ` (CI ${esc(f.effectSize.ci.join('&ndash;'))})` : ''}</p>` : ''}
      <div class="btn-row"><button type="button" data-lensgo="pathology:${esc(f.id)}">${esc(STRINGS.showOnBrain)}</button></div>
      </details>`).join('') || '<p>No findings at this stage.</p>'}`;
    $('stageSel').addEventListener('change', (e) => { stageFilter = e.target.value; applyLens('pathology', 'all'); renderBody(); });
    wireLensGo(body);
  } else if (activeTab === 'neurochemistry') {
    body.innerHTML = (d.neurochemistry || []).map((n, i) => `
      <details class="acc" ${i === 0 ? 'open' : ''}><summary><b>${esc(n.transmitter)}</b> &mdash; ${esc(n.alteration)}</summary>
      <p>${(n.where || []).map(atlasChips).join(' ')}</p>${claimHtml(n.claim)}
      <div class="btn-row"><button type="button" data-lensgo="chemistry:${esc(n.transmitter)}">${esc(STRINGS.showOnBrain)}</button></div>
      </details>`).join('');
    wireLensGo(body);
  } else if (activeTab === 'genetics') {
    body.innerHTML = `
      <h3>Architecture</h3>${(d.genetics.architecture || []).map((c) => claimHtml(c)).join('')}
      <h3>Genes</h3><div class="chips">${(d.genetics.geneSymbols || []).map((g) => chipBtn('gene', g, g)).join('')}</div>`;
    wireEntityChips(body);
  } else if (activeTab === 'biomarkers') {
    body.innerHTML = (d.biomarkers || []).map((b) => `<h3>${esc(b.name)}</h3>${claimHtml(b.finding)}`).join('') || '<p>No biomarker entries.</p>';
  } else if (activeTab === 'treatments') {
    const groups = {};
    for (const id of d.treatments || []) {
      const t = S.reg.treatments[id];
      if (!t) continue;
      (groups[t.kind] = groups[t.kind] || []).push(t);
    }
    body.innerHTML = Object.keys(groups).map((kind) => `
      <h3>${esc(kind)}</h3><div class="chips">${groups[kind].map((t) => chipBtn('treatment', t.id, t.drugId ? ((S.reg.drugs[t.drugId] || {}).generic || t.id) : t.id)).join('')}</div>`).join('')
      + `<h3>Drug fingerprint</h3><div class="chips">${Object.keys(S.reg.drugs).filter((id) => d.treatments.some((t) => S.reg.treatments[t] && S.reg.treatments[t].drugId === id)).map((id) => chipBtn('drug', id, (S.reg.drugs[id] || {}).generic || id)).join('')}</div>`;
    wireEntityChips(body);
  } else if (activeTab === 'pathway') {
    body.innerHTML = `<ol class="steps">${(d.pathway || []).map((p, i) => `
      <li><b>Step ${i + 1}: ${esc(p.step)}</b>
      <div class="chips">${(p.options || []).map((id) => {
        const t = S.reg.treatments[id];
        return t ? chipBtn('treatment', id, t.drugId ? ((S.reg.drugs[t.drugId] || {}).generic || id) : id) : '';
      }).join('')}</div>${claimHtml(p.claim)}</li>`).join('')}</ol>`;
    wireEntityChips(body);
  } else if (activeTab === 'evidence') {
    const all = collectSources();
    body.innerHTML = `<p>${all.length} distinct sources back the claims on this page. Every claim also shows an evidence badge and a last-reviewed date.</p>
      <div class="src-list">${all.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} <span>&nearr;</span></a>`).join('')}</div>`;
  } else if (activeTab === 'quiz') {
    renderQuiz(body);
  }
}

// ---------- quiz ----------
function quizState() {
  try {
    return JSON.parse(localStorage.getItem(`nmq-${S.disorder.id}`) || '{"answers":{}}');
  } catch (e) { return { answers: {} }; }
}
function saveQuizState(s) {
  localStorage.setItem(`nmq-${S.disorder.id}`, JSON.stringify(s));
}

function renderQuiz(body) {
  const d = S.disorder;
  const st = quizState();
  const total = d.quiz.length;
  const done = Object.keys(st.answers).length;
  const score = Object.keys(st.answers).filter((id) => {
    const q = d.quiz.find((x) => x.id === id);
    return q && q.answer === st.answers[id];
  }).length;
  let html = `<p>Score <b>${score}/${total}</b> &middot; answered ${done}/${total}</p>
    <div class="btn-row"><button id="quizRetake" type="button">Retake</button></div>`;
  d.quiz.forEach((q, qi) => {
    const answered = st.answers[q.id];
    const locked = answered !== undefined;
    html += `<div class="q"><p><b>Q${qi + 1} [${esc(q.topic)}]</b> ${esc(q.question)}</p>`;
    q.choices.forEach((c, ci) => {
      const cls = !locked ? '' : ci === q.answer ? 'q-right' : ci === answered ? 'q-wrong' : '';
      html += `<button type="button" class="qchoice ${cls}" data-q="${esc(q.id)}" data-c="${ci}"${locked ? ' disabled' : ''}>${esc(c)}</button>`;
    });
    if (locked) {
      const src = (q.sourceIds || []).map((id) => S.reg.sources[id]).filter(Boolean);
      html += `<p class="qexp">${answered === q.answer ? 'Correct. ' : 'Not quite. '}${esc(q.explanation)}</p>
        <p class="cred">${src.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} &nearr;</a>`).join(' &middot; ')}</p>`;
    }
    html += '</div>';
  });
  body.innerHTML = html;
  $('quizRetake').addEventListener('click', () => { saveQuizState({ answers: {} }); renderBody(); });
  body.querySelectorAll('.qchoice:not([disabled])').forEach((b) =>
    b.addEventListener('click', () => {
      const s = quizState();
      s.answers[b.dataset.q] = Number(b.dataset.c);
      saveQuizState(s);
      renderBody();
    }),
  );
}

// ---------- guided tour ----------
function startTour() {
  S.tourIdx = 0;
  renderTour();
}
function renderTour() {
  const steps = S.disorder.tour || [];
  if (S.tourIdx < 0 || S.tourIdx >= steps.length) {
    $('tourCard').hidden = true;
    S.tourIdx = -1;
    return;
  }
  const st = steps[S.tourIdx];
  $('tourCard').hidden = false;
  $('tourTitle').textContent = st.title;
  $('tourText').textContent = st.text;
  $('tourPos').textContent = `${S.tourIdx + 1}/${steps.length}`;
  if (st.lens) applyLens(st.lens, st.lensTarget);
  if (st.camera) {
    const btn = document.querySelector(`[data-view3d="${st.camera}"]`);
    if (btn) btn.click();
  }
  if (st.focusAtlasLabels && st.focusAtlasLabels.length && window.__neuroMap && window.__neuroMap.flyToMeshes) {
    window.__neuroMap.flyToMeshes(window.__neuroMap.meshesForLabels(st.focusAtlasLabels));
  }
}

// ---------- picker, mode and deep links ----------
async function openDisorder(id) {
  if (entityView) entityView = null;
  if (S.tourIdx >= 0) { S.tourIdx = -1; $('tourCard').hidden = true; }
  await loadAll(id);
  stageFilter = '';
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  const clinic = $('clinic');
  if (clinic) clinic.hidden = true;
  $('disorderPicker').hidden = true;
  $('disorderPanel').hidden = false;
  document.querySelectorAll('#viewtabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === 'disorders'));
  $('dpName').textContent = S.disorder.name;
  const codes = $('dpCodes');
  codes.innerHTML = `<a href="${S.disorder.icd11.url}" target="_blank" rel="noopener">ICD-11 ${esc(S.disorder.icd11.code)} &nearr;</a>`
    + (S.disorder.dsm5tr ? ` &middot; <a href="${S.disorder.dsm5tr.url}" target="_blank" rel="noopener">DSM-5-TR ${esc(S.disorder.dsm5tr.code)} &nearr;</a>` : '');
  activeTab = 'overview';
  renderBody();
  applyTabLens();
  history.replaceState(null, '', `#d=${id}`);
}

function exitDisorder() {
  S.disorder = null;
  S.tourIdx = -1;
  $('tourCard').hidden = true;
  $('disorderPanel').hidden = true;
  if (window.__neuroMap && window.__neuroMap.clear) window.__neuroMap.clear();
  if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  const brainTab = document.querySelector('[data-view="brain"]');
  if (brainTab) brainTab.click();
}

// Deep link: #d=<id>&lens=<lens>&id=<target> (existing #c= and #s= links untouched)
const DEEP_RE = /^#d=([\w-]+)(?:&lens=([\w-]+))?(?:&id=(.+))?$/;

async function handleDisorderHash() {
  const m = DEEP_RE.exec(window.location.hash || '');
  if (!m) return;
  if (!S.disorder || S.disorder.id !== m[1]) await openDisorder(m[1]);
  if (m[2]) applyLens(m[2], m[3] ? decodeURIComponent(m[3]) : null);
}

async function bootDisorder() {
  const index = await getJSON('content/index.json').catch(() => ({ disorders: [] }));
  S.index = index.disorders || [];
  const renderPicker = (q) => {
    const list = $('disorderList');
    list.innerHTML = '';
    const hits = S.index.filter((x) => !q || (x.name + ' ' + x.block).toLowerCase().indexOf(q) >= 0);
    if (!hits.length) {
      const p = document.createElement('p');
      p.className = 'meta';
      p.textContent = 'No match.';
      list.appendChild(p);
      return;
    }
    for (const d of hits) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'clinic-item';
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = d.name;
      b.querySelector('small').textContent = d.block || '';
      b.addEventListener('click', () => openDisorder(d.id));
      list.appendChild(b);
    }
  };
  renderPicker('');
  $('disorderSearch').addEventListener('input', (e) => renderPicker(e.target.value.trim().toLowerCase()));
  const disordersTab = document.querySelector('[data-view="disorders"]');
  if (disordersTab) disordersTab.addEventListener('click', () => { $('disorderPicker').hidden = false; });
  $('pickerClose').addEventListener('click', () => { $('disorderPicker').hidden = true; });
  $('dpClose').addEventListener('click', exitDisorder);
  $('tourBack').addEventListener('click', () => { S.tourIdx -= 1; renderTour(); });
  $('tourNext').addEventListener('click', () => { S.tourIdx += 1; renderTour(); });
  $('tourExit').addEventListener('click', () => { S.tourIdx = -1; renderTour(); });
  // Back/forward and pasted #d= links must work without a page reload.
  window.addEventListener('hashchange', () => { handleDisorderHash(); });
  await handleDisorderHash();
}

bootDisorder();
