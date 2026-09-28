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

const S = { disorder: null, reg: null, markers: [], tab: 'overview', lens: null, lensTarget: null, tourIdx: -1, backTo: null };
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
  } else if (lens === 'neuromod') {
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

function linkedDisordersText(kind, id) {
  // Generic: scans loaded disorder files for references (only schizophrenia in Phase 1).
  const hits = [];
  const d = S.disorder;
  if (!d) return '';
  const txt = JSON.stringify({ t: d.treatments, g: d.genetics });
  if (kind === 'receptor' && (txt.includes(id) || JSON.stringify(d.neurochemistry).includes(id))) hits.push(d.name);
  if (kind === 'gene' && (d.genetics.geneSymbols || []).includes(id)) hits.push(d.name);
  if (kind === 'drug' && Object.values(S.reg.treatments).some((t) => t.drugId === id && t.indication?.disorderId === d.id)) hits.push(d.name);
  if (!hits.length) return '';
  return `<h3>Appears in</h3><p>${hits.map(esc).join(', ')}</p>`;
}

function entityCard(kind, id) {
  if (kind === 'receptor') {
    const r = S.reg.receptors[id];
    if (!r) return '<p>Unknown receptor.</p>';
    return `<h2>${esc(r.name)} <span class="code">${esc(r.id)}</span></h2>
      <h3>Signalling</h3>${claimHtml(r.signalling)}
      <h3>Principal sites</h3>${(r.principalSites || []).map((p) => `<p>${atlasChips(p.where)}</p>${claimHtml(p.claim)}`).join('') || '<p>No reliable regional data.</p>'}
      ${r.cortexDensity ? `<h3>Cortical density (PET atlas)</h3><p>${esc(r.cortexDensity.annotation)} — heatmap rendering is not yet implemented; see the linked atlas.</p>` : ''}
      ${linkedDisordersText('receptor', id)}`;
  }
  if (kind === 'gene') {
    const g = S.reg.genes[id];
    if (!g) return '<p>Unknown gene.</p>';
    return `<h2>${esc(g.symbol)} — ${esc(g.name)}</h2>
      <p><span class="code">${esc(g.variantClass)}</span></p>
      <h3>Function</h3>${claimHtml(g.function)}
      ${g.cellTypes ? `<h3>Cell types</h3>${claimHtml(g.cellTypes)}` : ''}
      ${(g.brainExpression || []).length ? `<h3>Brain expression</h3>` + g.brainExpression.map((b) => `<p>${atlasChips(b.where)}</p>${claimHtml(b.claim)}`).join('') : '<h3>Brain expression</h3><p>No reliable regional data.</p>'}
      ${g.effect ? `<h3>Effect size</h3><p>${esc(g.effect.text)}</p>` : ''}
      ${linkedDisordersText('gene', id)}`;
  }
  if (kind === 'drug') {
    const d = S.reg.drugs[id];
    if (!d) return '<p>Unknown drug.</p>';
    const bars = (d.receptorProfile || []).map((r) => {
      const rec = S.reg.receptors[r.receptorId];
      return `<div class="fp-row"><b>${esc(rec ? rec.name : r.receptorId)}</b>
        <span class="badge" style="border-color:${ACTION_COLORS[r.action] || '#9CA3AF'};color:${ACTION_COLORS[r.action] || '#9CA3AF'}">${esc(r.action)}</span>
        <span class="badge" style="border-color:${RELEVANCE_COLORS[r.relevance] || '#9CA3AF'};color:${RELEVANCE_COLORS[r.relevance] || '#9CA3AF'}">${esc(r.relevance)}</span>
        <small>${r.kiNm != null ? `Ki ${esc(r.kiNm)} nM (sourced)` : 'Ki not sourced — omitted'}</small>
        ${claimHtml(r.effect, false)}</div>`;
    }).join('');
    return `<h2>${esc(d.generic)}${d.brand?.length ? ` <small>(${d.brand.map(esc).join(', ')})</small>` : ''}</h2>
      <p><span class="code">${esc((d.classes || []).join(' · '))}${d.atc ? ` · ATC ${esc(d.atc)}` : ''}</span></p>
      <h3>Mechanism</h3>${(d.mechanism || []).map((m) => claimHtml(m)).join('')}
      <h3>Receptor fingerprint</h3>${bars || '<p>No profile data.</p>'}
      ${d.occupancy ? `<h3>Occupancy</h3>${claimHtml(d.occupancy.claim)}` : ''}
      <h3>Adverse effects → receptors</h3>${(d.adverseEffects || []).map((a) => `<p><b>${esc(a.effect)}</b> — ${(a.receptorIds || []).join(', ')}</p>${claimHtml(a.mechanism)}`).join('') || '<p>No mapped effects.</p>'}
      ${d.monitoring ? `<h3>Monitoring</h3>${claimHtml(d.monitoring)}` : ''}
      ${d.doseRange ? `<h3>Dose range</h3><p>${esc(d.doseRange.text)}</p>` : ''}
      ${linkedDisordersText('drug', id)}`;
  }
  if (kind === 'treatment') {
    const t = S.reg.treatments[id];
    if (!t) return '<p>Unknown treatment.</p>';
    const nm = t.neuromodulation;
    return `<h2>Treatment: ${esc(t.id)}</h2>
      <p><span class="code">${esc(t.kind)}${t.drugId ? ` · ${esc(S.reg.drugs[t.drugId]?.generic || t.drugId)}` : ''}</span></p>
      ${nm ? `<h3>Neuromodulation</h3><p>Modality: ${esc(nm.modality)}${nm.montageOrCoil ? ` — ${esc(nm.montageOrCoil)}` : ''}</p>${nm.target ? `<p>${atlasChips(nm.target)}</p>` : `<p>${esc(nm.targetNote || '')}</p>`}` : ''}
      <h3>Where it works</h3>
      ${['molecular', 'cellular', 'circuit'].map((k) => t.mechanismLevels?.[k] ? `<p><b>${k}:</b> ${esc(t.mechanismLevels[k].text)} ${evBadge(t.mechanismLevels[k].evidence)}</p>` : '').join('')}
      ${t.indication ? `<h3>Indication</h3><p>Line: ${esc(t.indication.line)} ${evBadge(t.indication.evidence)}</p>${srcLinks(t.indication.guidelineSourceIds)}` : ''}`;
  }
  return '<p>Unknown entity.</p>';
}

function renderTabs() {
  $('dpTabs').innerHTML = TAB_ORDER.map((t) =>
    `<button type="button" role="tab" data-tab="${t}" class="${t === activeTab ? 'on' : ''}">${esc(STRINGS.tabs[t])}</button>`,
  ).join('');
  $('dpTabs').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { activeTab = b.dataset.tab; entityView = null; renderBody(); applyTabLens(); }),
  );
}

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
      const t = Object.values(S.reg.treatments).find((x) => x.kind === 'neuromodulation' && x.indication?.disorderId === d.id);
      applyLens('neuromodulation', t?.id);
    },
    gene: () => applyLens('gene', d.genetics.geneSymbols[0]),
  }[lens];
  if (first) first();
}
