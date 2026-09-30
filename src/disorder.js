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
  // Dual-depth explanations: quick (first sentence, recall-level) and
  // detailed (full text with citation). Standing preference in localStorage.
  const depth = localStorage.getItem('nmdepth') || 'detailed';
  const first = String(c.text).split(/(?<=[.!?])\s+/)[0] || String(c.text);
  const needs = first.trim().length < String(c.text).trim().length;
  return `<div class="claim" data-depth="${depth}"><p class="q">${esc(first)}${needs ? '…' : ''}</p>`
    + `<p class="d">${esc(c.text)}</p>`
    + `<p class="cred">${evBadge(c.evidence)}${showDate ? ` <span>reviewed ${esc(c.lastReviewed)}</span>` : ''}`
    + `${needs ? ` <button type="button" class="depthBtn" title="Toggle quick/detailed explanation">${depth === 'quick' ? 'Detailed' : 'Quick'}</button>` : ''}</p></div>`;
}

// One delegated listener per render covers every claim on the page.
function wireDepthToggle(root) {
  root.querySelectorAll('.depthBtn').forEach((b) => {
    if (b.dataset.wired) return;
    b.dataset.wired = '1';
    b.addEventListener('click', () => {
      const box = b.closest('.claim');
      const next = (box ? box.dataset.depth : 'detailed') === 'quick' ? 'detailed' : 'quick';
      localStorage.setItem('nmdepth', next);
      document.querySelectorAll('#dpBody .claim').forEach((el) => {
        el.dataset.depth = next;
        const btn = el.querySelector('.depthBtn');
        if (btn) btn.textContent = next === 'quick' ? 'Detailed' : 'Quick';
      });
    });
  });
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
  V().clearCircuitAnimation && V().clearCircuitAnimation({ instant: true });
  S.lens = null;
  S.lensTarget = null;
  S._hl = { labels: [], markers: [] };
  renderLensBar();
  renderHlList();
}

function applyLens(lens, target) {
  S.lens = lens;
  S.lensTarget = target || null;
  const v = V();
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.clearCircuitAnimation && v.clearCircuitAnimation({ instant: true });
  v.isolateMeshes && v.isolateMeshes(null);
  const d = S.disorder;
  // Highlighted-set bookkeeping for the screen-reader list ({labels, markers}).
  S._hl = { labels: [], markers: [] };
  if (!lens) { renderLensBar(); renderHlList(); return; }

  const showRefsMarkers = (refs) => {
    const defs = collectMarkers(refs);
    if (defs.length && v.showMarkers) v.showMarkers(defs);
    return defs.map((m) => m.label || m.id);
  };
  // Data-driven circuit animation: nodes light up and animate, everything
  // else fades to a ghost. No disorder-specific code — just JSON in/out.
  const animate = (input) => v.animateCircuit && v.animateCircuit(input);

  if (lens === 'pathology') {
    const pal = cbPalette();
    const list = target && target !== 'all'
      ? d.brainFindings.filter((f) => f.id === target)
      : d.brainFindings.filter((f) => !stageFilter || f.stage === stageFilter || f.stage === 'any' || !f.stage);
    v.highlight && v.highlight(list.map((f) => ({
      labels: f.where.atlasLabels || [],
      color: pal[f.finding] || '#9CA3AF',
    })));
    const markerNames = showRefsMarkers(list.flatMap((f) => [f.where]));
    S._hl = {
      labels: [...new Set(list.flatMap((f) => f.where.atlasLabels || []))],
      markers: markerNames,
    };
  } else if (lens === 'circuit') {
    const c = d.circuits.find((x) => x.id === (target || d.circuits[0]?.id));
    if (c) {
      showRefsMarkers(c.nodes);
      animate({ name: c.name, function: c.function.text, color: '#F59E0B', nodes: c.nodes, edges: c.edges });
      S._hl = {
        labels: [...new Set(c.nodes.flatMap((n) => n.atlasLabels || []))],
        markers: (c.nodes || []).filter((n) => n.markerId).map((n) => n.markerId),
      };
    }
  } else if (lens === 'chemistry') {
    const n = d.neurochemistry.find((x) => x.transmitter === (target || d.neurochemistry[0]?.transmitter)) || d.neurochemistry[0];
    if (n) {
      showRefsMarkers(n.where);
      animate({ name: `${n.transmitter} pathway`, function: n.alteration, color: '#2DD4BF', nodes: n.where, edges: [] });
      S._hl = {
        labels: [...new Set(n.where.flatMap((w) => w.atlasLabels || []))],
        markers: (n.where || []).filter((w) => w.markerId).map((w) => w.markerId),
      };
    }
  } else if (lens === 'receptor') {
    const r = S.reg.receptors[target] || Object.values(S.reg.receptors)[0];
    if (r) {
      animate({ name: r.name, function: r.signalling.text, color: '#A855F7', nodes: (r.principalSites || []).map((p) => p.where), edges: [] });
      S._hl = {
        labels: [...new Set((r.principalSites || []).flatMap((p) => p.where.atlasLabels || []))],
        markers: [],
      };
    }
  } else if (lens === 'drug') {
    const t = Object.values(S.reg.treatments).find((x) => x.drugId === target && x.indication?.disorderId === d.id)
      || d.treatments.map((id) => S.reg.treatments[id]).find((x) => x && x.drugId);
    const drug = t && t.drugId ? S.reg.drugs[t.drugId] : null;
    if (drug) {
      const recIds = drug.receptorProfile.map((r) => r.receptorId);
      const nodes = recIds.flatMap((id) => (S.reg.receptors[id]?.principalSites || []).map((p) => p.where));
      animate({ name: `${drug.generic} receptor sites`, function: (drug.mechanism[0] || {}).text || '', color: '#34D399', nodes, edges: [] });
      S._hl = {
        labels: [...new Set(nodes.flatMap((w) => w.atlasLabels || []))],
        markers: [],
      };
    }
  } else if (lens === 'symptom') {
    const s = d.symptomDomains.find((x) => x.id === (target || d.symptomDomains[0]?.id)) || d.symptomDomains[0];
    if (s) {
      const circs = (s.circuitIds || []).map((id) => d.circuits.find((c) => c.id === id)).filter(Boolean);
      const first = circs[0];
      const finds = (s.brainFindingIds || []).map((id) => d.brainFindings.find((f) => f.id === id)).filter(Boolean);
      const flabels = finds.flatMap((f) => f.where.atlasLabels || []);
      if (first) {
        showRefsMarkers(first.nodes);
        animate({
          name: `${s.name}: ${first.name}`, function: first.function.text, color: '#F472B6',
          nodes: first.nodes, edges: first.edges, extraLabels: flabels,
        });
        S._hl = {
          labels: [...new Set([...first.nodes.flatMap((n) => n.atlasLabels || []), ...flabels])],
          markers: (first.nodes || []).filter((n) => n.markerId).map((n) => n.markerId),
        };
      } else {
        v.highlight && v.highlight([{ labels: flabels, color: '#F472B6' }]);
        S._hl = { labels: [...new Set(flabels)], markers: [] };
      }
    }
  } else if (lens === 'neuromod' || lens === 'neuromodulation') {
    const t = S.reg.treatments[target] || Object.values(S.reg.treatments).find((x) => x.kind === 'neuromodulation' && x.indication?.disorderId === d.id);
    if (t?.neuromodulation?.target) {
      const tg = t.neuromodulation.target;
      animate({
        name: `${t.neuromodulation.modality} target`, function: t.neuromodulation.montageOrCoil || '',
        color: '#FBBF24', nodes: [tg], edges: [],
      });
      S._hl = { labels: [...(tg.atlasLabels || [])], markers: [] };
    }
  } else if (lens === 'gene') {
    const g = S.reg.genes[target] || S.reg.genes[pickGene(d)];
    if (g) {
      const siteWheres = (g.linkedReceptorIds || []).flatMap((id) => (S.reg.receptors[id]?.principalSites || []).map((p) => p.where));
      const exprWheres = (g.brainExpression || []).map((b) => b.where);
      animate({ name: g.symbol, function: g.function.text, color: '#38BDF8', nodes: [...siteWheres, ...exprWheres], edges: [] });
      S._hl = {
        labels: [...new Set([...siteWheres, ...exprWheres].flatMap((w) => w.atlasLabels || []))],
        markers: [],
      };
    }
  }
  renderLensBar();
  renderHlList();
}

function collectMarkers(refs) {
  const ids = new Set();
  for (const r of refs || []) if (r && r.markerId) ids.add(r.markerId);
  return S.markers.filter((m) => ids.has(m.id));
}

// Colorblind-safe diverging palette for the pathology lens (Okabe–Ito
// inspired). Toggled from the Brain pathology tab; remembered in localStorage.
const FINDING_COLORS_CB = {
  'volume-reduction': '#0072B2', 'volume-increase': '#E69F00', 'thickness-reduction': '#0072B2',
  hyperactivity: '#D55E00', hypoactivity: '#56B4E9', dysconnectivity: '#CC79A7',
  'altered-receptor': '#F0E442', 'altered-metabolism': '#F0E442', other: '#999999',
};
function cbPalette() {
  return localStorage.getItem('nmcb') === 'on' ? FINDING_COLORS_CB : FINDING_COLORS;
}

// A gene only lights up the brain if the registry can resolve it to structures,
// i.e. it has linkedReceptorIds whose receptors carry principalSites with atlas
// labels. Many genes are deliberately registry-only (C4A, SETD1A, GRIA3,
// DEL22Q11 have no linked receptor), so picking geneSymbols[0] blindly left the
// Gene lens doing nothing visible. Prefer the first gene that can actually be
// shown, and fall back to the first gene so behaviour is never worse than before.
function pickGene(d) {
  const symbols = (d.genetics && d.genetics.geneSymbols) || [];
  const resolvable = symbols.find((sym) => {
    const g = S.reg.genes && S.reg.genes[sym];
    if (!g) return false;
    const sites = (g.linkedReceptorIds || []).flatMap((id) => (S.reg.receptors[id] || {}).principalSites || []);
    return sites.some((p) => ((p.where || {}).atlasLabels || []).length);
  });
  return resolvable || symbols[0];
}

// Screen-reader (and sighted) text alternative for every visual highlight:
// the exact structures currently lit, kept in sync by applyLens.
function renderHlList() {
  const el = $('hlList');
  if (!el) return;
  const hl = S._hl || { labels: [], markers: [] };
  const labels = hl.labels || [];
  const markers = hl.markers || [];
  if (!S.lens || (!labels.length && !markers.length)) {
    el.innerHTML = '';
    return;
  }
  const shown = labels.slice(0, 14);
  const more = labels.length > shown.length ? ` and ${labels.length - shown.length} more` : '';
  el.innerHTML = `<b>Showing:</b> ${shown.map(esc).join(', ')}${more}`
    + (markers.length ? ` <span class="badge prec-schematic">markers: ${markers.map(esc).join(', ')}</span>` : '');
  if (!V().highlightedNames) {
    $('sr-status').textContent = `Showing ${labels.length} structures${markers.length ? ` plus schematic markers ${markers.join(', ')}` : ''}.`;
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
    gene: () => applyLens('gene', pickGene(d)),
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
      return `<div class="fp-row"><b><button type="button" class="synBtn" data-syn="${esc(r.receptorId)}" title="Zoom to this receptor's principal site with a synaptic schematic">${esc(rec ? rec.name : r.receptorId)} 🔬</button></b>
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

// ---------- synaptic zoom-in ----------
// Clicking a receptor in a drug fingerprint flies the camera to its principal
// site and overlays a simple 2D schematic (receptor + drug + action type).
// Schematic only: no molecular geometry is implied.
function synapseSVG(recName, drugName, action) {
  const act = {
    antagonist: 'blocks the receptor',
    'partial-agonist': 'partly activates the receptor',
    'inverse-agonist': 'drives the receptor below baseline',
    agonist: 'activates the receptor',
    PAM: 'boosts the natural signal',
    'reuptake-inhibitor': 'blocks reuptake at the transporter',
    other: 'modulates the target',
  }[action] || 'acts at the target';
  return `<svg viewBox="0 0 340 190" role="img" aria-label="Schematic of ${esc(drugName)} ${act} at the ${esc(recName)}">
    <rect x="8" y="30" width="120" height="130" rx="10" fill="none" stroke="#60A5FA" stroke-width="2"/>
    <text x="68" y="20" text-anchor="middle" fill="#9CA3AF" font-size="11">presynaptic terminal</text>
    <circle cx="45" cy="80" r="7" fill="#60A5FA"/><circle cx="75" cy="105" r="7" fill="#60A5FA"/><circle cx="55" cy="130" r="7" fill="#60A5FA"/>
    <text x="68" y="178" text-anchor="middle" fill="#9CA3AF" font-size="11">signalling molecule</text>
    <rect x="212" y="30" width="120" height="130" rx="10" fill="none" stroke="#34D399" stroke-width="2"/>
    <text x="272" y="20" text-anchor="middle" fill="#9CA3AF" font-size="11">postsynaptic membrane</text>
    <path d="M232 95 L244 70 L256 95 L268 70 L280 95 L292 70 L304 95" fill="none" stroke="#34D399" stroke-width="3"/>
    <text x="272" y="120" text-anchor="middle" fill="#E5E7EB" font-size="11">${esc(recName.length > 18 ? recName.slice(0, 17) + '…' : recName)}</text>
    <polygon points="170,78 182,86 182,102 170,110 158,102 158,86" fill="none" stroke="#F59E0B" stroke-width="2.5"/>
    <text x="170" y="130" text-anchor="middle" fill="#F59E0B" font-size="11">${esc(drugName.length > 16 ? drugName.slice(0, 15) + '…' : drugName)}</text>
    <text x="170" y="145" text-anchor="middle" fill="#9CA3AF" font-size="10">${esc(action)}</text>
    <text x="170" y="55" text-anchor="middle" fill="#9CA3AF" font-size="11">synaptic cleft</text>
  </svg>`;
}

function openSynapse(receptorId) {
  const rec = S.reg.receptors[receptorId];
  if (!rec) return;
  // Find the drug context: prefer the entity card already open, else the
  // disorder's first drug using this receptor.
  let drug = null;
  if (entityView && entityView.kind === 'drug') drug = S.reg.drugs[entityView.id];
  if (!drug) {
    const t = (S.disorder.treatments || []).map((id) => S.reg.treatments[id])
      .find((x) => x && x.drugId && ((S.reg.drugs[x.drugId] || {}).receptorProfile || []).some((r) => r.receptorId === receptorId));
    if (t) drug = S.reg.drugs[t.drugId];
  }
  const prof = drug ? (drug.receptorProfile || []).find((r) => r.receptorId === receptorId) : null;
  applyLens('receptor', receptorId);
  $('synapseTitle').textContent = `${drug ? drug.generic : 'Drug'} × ${rec.name}`;
  $('synapseSvg').innerHTML = synapseSVG(rec.name, drug ? drug.generic : 'drug', prof ? prof.action : 'other');
  $('synapseCap').textContent = `Schematic — not to scale, not a molecular model. Action: ${prof ? prof.action : 'see fingerprint'}. Principal sites: ${((rec.principalSites || []).flatMap((p) => p.where.atlasLabels || []).join(', ') || 'see card')}.`;
  $('synapseCard').hidden = false;
}

function wireSynapse(root) {
  root.querySelectorAll('[data-syn]').forEach((b) => {
    if (b.dataset.wired) return;
    b.dataset.wired = '1';
    b.addEventListener('click', () => openSynapse(b.dataset.syn));
  });
}

// ---------- tabs and body ----------
function renderTabs() {
  $('dpTabs').innerHTML = TAB_ORDER.map((t) =>
    `<button type="button" role="tab" data-tab="${t}" class="${t === activeTab ? 'on' : ''}">${esc(STRINGS.tabs[t])}</button>`,
  ).join('');
  $('dpTabs').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { activeTab = b.dataset.tab; entityView = null; renderBody(); applyTabLens(); recordReview(b.dataset.tab); }),
  );
}

function applyTabLens() {
  const d = S.disorder;
  const defaults = {
    psychopathology: () => applyLens('symptom', d.symptomDomains[0] && d.symptomDomains[0].id),
    brain: () => applyLens('pathology', 'all'),
    neurochemistry: () => applyLens('chemistry', d.neurochemistry[0] && d.neurochemistry[0].transmitter),
    genetics: () => applyLens('gene', pickGene(d)),
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
    wireDepthToggle(body);
    wireSynapse(body);
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
      <button id="cbToggle" type="button" title="Colorblind-safe diverging palette">${localStorage.getItem('nmcb') === 'on' ? 'Standard palette' : 'Colorblind-safe palette'}</button>
      ${visible.map((f) => `
      <details class="acc" open><summary><b>${esc(f.id)}</b> <span class="code">${esc(f.finding)}${f.stage ? ` &middot; ${esc(f.stage)}` : ''}</span></summary>
      <p>${atlasChips(f.where)}</p>${claimHtml(f.claim)}
      ${f.effectSize ? `<p class="code">effect ${esc(f.effectSize.metric)} = ${esc(f.effectSize.value)}${f.effectSize.ci ? ` (CI ${esc(f.effectSize.ci.join('&ndash;'))})` : ''}</p>` : ''}
      <div class="btn-row"><button type="button" data-lensgo="pathology:${esc(f.id)}">${esc(STRINGS.showOnBrain)}</button></div>
      </details>`).join('') || '<p>No findings at this stage.</p>'}`;
    $('stageSel').addEventListener('change', (e) => { stageFilter = e.target.value; applyLens('pathology', 'all'); renderBody(); });
    $('cbToggle').addEventListener('click', () => {
      localStorage.setItem('nmcb', localStorage.getItem('nmcb') === 'on' ? 'off' : 'on');
      applyLens('pathology', 'all');
      renderBody();
    });
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
  wireDepthToggle(body);
  wireSynapse(body);
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
      const d = S.disorder;
      const score = Object.keys(s.answers).filter((id) => {
        const q = d.quiz.find((x) => x.id === id);
        return q && q.answer === s.answers[id];
      }).length;
      recordQuizScore(score, d.quiz.length);
      renderBody();
    }),
  );
}

// ---------- guided tour (story mode: drives animateCircuit + camera) ----------
let tourTimer = null;
function stopTourAuto() {
  if (tourTimer) { clearInterval(tourTimer); tourTimer = null; }
  const b = $('tourPlay');
  if (b) b.textContent = '▶ Auto';
}
function startTour() {
  S.tourIdx = 0;
  renderTour();
}
function renderTour() {
  const steps = S.disorder.tour || [];
  if (S.tourIdx < 0 || S.tourIdx >= steps.length) {
    stopTourAuto();
    $('tourCard').hidden = true;
    S.tourIdx = -1;
    recordReview('overview');
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

// ---------- focus / presentation mode ----------
// Hides every panel except the 3D view plus a minimal caption, for showing
// a circuit during a case presentation without study-UI clutter.
function setFocusMode(on) {
  document.body.classList.toggle('focus-mode', on);
  $('focusCap').hidden = !on;
  if (on) {
    $('focusText').textContent = S.disorder
      ? `${S.disorder.name} · ${STRINGS.tabs[activeTab] || activeTab}${S.lens ? ` · ${STRINGS.lenses[S.lens] || S.lens}` : ''}`
      : 'NeuroMap 3D Brain';
    if (S.tourIdx >= 0) { stopTourAuto(); S.tourIdx = -1; $('tourCard').hidden = true; }
  }
}

// ---------- keyboard-shortcut help ----------
// The list itself lives in index.html (#shortcutModal) so it can be read
// without JS; these two functions only show/hide it and manage focus.
function openShortcuts() {
  $('shortcutModal').hidden = false;
  $('shortcutClose').focus();
}
function closeShortcuts() {
  $('shortcutModal').hidden = true;
}

// ---------- shareable exact-state links ----------
// Encodes topic + lens + selected id + entity + camera, so a specific circuit
// state reopens exactly as seen. Extends the existing #d= scheme.
function stateLink() {
  let cam = '';
  if (V().cameraState) {
    const s = V().cameraState();
    if (s) cam = `&cam=${s.pos.join(',')}&tgt=${s.tgt.join(',')}`;
  }
  const tab = activeTab && activeTab !== 'overview' ? `&tab=${activeTab}` : '';
  const lens = S.lens ? `&lens=${S.lens}` : '';
  const id = S.lensTarget ? `&id=${encodeURIComponent(S.lensTarget)}` : '';
  const ent = entityView ? `&ent=${entityView.kind}:${encodeURIComponent(entityView.id)}` : '';
  return `${window.location.origin}${window.location.pathname}#d=${S.disorder.id}${tab}${lens}${id}${ent}${cam}`;
}

async function copyStateLink(btn) {
  const url = stateLink();
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Copied!';
  } catch {
    btn.textContent = url;
  }
  setTimeout(() => { btn.textContent = 'Copy view link'; }, 2000);
}

// ---------- progress tracking + spaced review (localStorage, no backend) ----------
function loadProg(id) {
  try {
    return JSON.parse(localStorage.getItem(`nmprog-${id || (S.disorder && S.disorder.id)}`) || '{"topics":{}}');
  } catch {
    return { topics: {} };
  }
}
function saveProg(id, p) {
  localStorage.setItem(`nmprog-${id}`, JSON.stringify(p));
}
function recordReview(tab) {
  if (!S.disorder) return;
  const p = loadProg();
  const t = p.topics[tab] || {};
  t.last = Date.now();
  t.n = (t.n || 0) + 1;
  p.topics[tab] = t;
  saveProg(S.disorder.id, p);
}
function recordQuizScore(score, total) {
  if (!S.disorder || !total) return;
  const p = loadProg();
  const t = p.topics.quiz || {};
  t.last = Date.now();
  t.n = (t.n || 0) + 1;
  t.best = Math.max(t.best || 0, score / total);
  p.topics.quiz = t;
  saveProg(S.disorder.id, p);
}
// Due-for-review list, Anki-style spacing without a backend: interval comes
// from the best quiz score (>=80% → 14d, >=50% → 7d, else 3d), unreviewed
// topics are always due.
function dueFor(id) {
  let p;
  try {
    p = JSON.parse(localStorage.getItem(`nmprog-${id}`) || '{"topics":{}}');
  } catch {
    p = { topics: {} };
  }
  const due = [];
  for (const t of TAB_ORDER) {
    const e = (p.topics || {})[t];
    if (!e || !e.last) { due.push(t); continue; }
    const days = (Date.now() - e.last) / 864e5;
    const interval = e.best != null ? (e.best >= 0.8 ? 14 : e.best >= 0.5 ? 7 : 3) : 7;
    if (days >= interval) due.push(t);
  }
  return due.slice(0, 4);
}

// ---------- picker, mode and deep links ----------
async function openDisorder(id, opts = {}) {
  if (entityView) entityView = null;
  if (S.tourIdx >= 0) { stopTourAuto(); S.tourIdx = -1; $('tourCard').hidden = true; }
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
  // The panel is the app's largest medical surface, so the educational-use
  // notice is rendered in the panel chrome (not inside #dpBody) and therefore
  // persists across every tab, lens and entity view.
  $('dpDisclaimer').textContent = STRINGS.disclaimer;
  renderBody();
  applyTabLens();
  recordReview('overview');
  if (!opts.keepHash) history.replaceState(null, '', `#d=${id}`);
}

function exitDisorder() {
  S.disorder = null;
  stopTourAuto();
  S.tourIdx = -1;
  $('tourCard').hidden = true;
  $('disorderPanel').hidden = true;
  $('dpDisclaimer').textContent = '';
  if (window.__neuroMap && window.__neuroMap.clear) window.__neuroMap.clear();
  if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  const brainTab = document.querySelector('[data-view="brain"]');
  if (brainTab) brainTab.click();
}

// Deep link: #d=<id>[&tab=<tab>][&lens=<lens>][&id=<target>][&ent=<kind:id>]
// [&cam=x,y,z][&tgt=x,y,z]. Parsed manually so parameters can be extended
// without breaking existing #d=, #c= or #s= links.
function parseDisorderHash() {
  const h = window.location.hash || '';
  if (!h.startsWith('#d=')) return null;
  const out = {};
  for (const part of h.slice(1).split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  return out.d ? out : null;
}

async function handleDisorderHash() {
  const q = parseDisorderHash();
  if (!q) return;
  if (!S.disorder || S.disorder.id !== q.d) await openDisorder(q.d, { keepHash: true });
  if (q.tab && TAB_ORDER.includes(q.tab) && q.tab !== activeTab) {
    activeTab = q.tab;
    entityView = null;
    renderBody();
    recordReview(q.tab);
  }
  if (q.ent) {
    const parts = q.ent.split(':');
    entityView = { kind: parts[0], id: parts.slice(1).join(':') };
    renderBody();
  }
  if (q.lens) applyLens(q.lens, q.id || null);
  else if (!q.ent) clearLens();
  if ((q.cam || q.tgt) && V().restoreCamera) {
    const nums = (s) => (s || '').split(',').map(Number).filter((n) => Number.isFinite(n));
    const cam = nums(q.cam);
    const tgt = nums(q.tgt);
    if (cam.length === 3 && tgt.length === 3) V().restoreCamera(cam, tgt);
  }
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
      const due = dueFor(d.id);
      b.querySelector('small').textContent = (d.block || '')
        + (due.length ? ` · Due: ${due.map((t) => STRINGS.tabs[t] || t).join(', ')}` : '');
      b.addEventListener('click', () => openDisorder(d.id));
      list.appendChild(b);
    }
  };
  renderPicker('');
  $('disorderSearch').addEventListener('input', (e) => renderPicker(e.target.value.trim().toLowerCase()));  const disordersTab = document.querySelector('[data-view="disorders"]');
  if (disordersTab) disordersTab.addEventListener('click', () => { $('disorderPicker').hidden = false; });
  $('pickerClose').addEventListener('click', () => { $('disorderPicker').hidden = true; });
  $('dpClose').addEventListener('click', exitDisorder);
  $('dpFocus').addEventListener('click', () => setFocusMode(true));
  $('focusExit').addEventListener('click', () => setFocusMode(false));
  $('dpShare').addEventListener('click', (e) => copyStateLink(e.currentTarget));
  $('synapseClose').addEventListener('click', () => { $('synapseCard').hidden = true; });
  $('shortcutBtn').addEventListener('click', openShortcuts);
  $('shortcutClose').addEventListener('click', closeShortcuts);
  $('shortcutModal').addEventListener('click', (e) => {
    if (e.target === $('shortcutModal')) closeShortcuts();
  });
  $('tourBack').addEventListener('click', () => { stopTourAuto(); S.tourIdx -= 1; renderTour(); });
  $('tourNext').addEventListener('click', () => { stopTourAuto(); S.tourIdx += 1; renderTour(); });
  $('tourExit').addEventListener('click', () => { stopTourAuto(); S.tourIdx = -1; renderTour(); });
  $('tourPlay').addEventListener('click', () => {
    if (tourTimer) { stopTourAuto(); return; }
    if (S.tourIdx < 0) S.tourIdx = 0;
    $('tourPlay').textContent = '⏸ Auto';
    renderTour();
    tourTimer = setInterval(() => {
      S.tourIdx += 1;
      renderTour();
      if (S.tourIdx < 0) stopTourAuto();
    }, 6000);
  });
  // Back/forward and pasted #d= links must work without a page reload.
  window.addEventListener('hashchange', () => { handleDisorderHash(); });
  // Keyboard shortcuts: arrows step the tour, / focuses search, Esc unwinds
  // (focus mode → picker/synapse → circuit animation). Never fires in inputs.
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement
      || e.target instanceof HTMLTextAreaElement
      || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'Escape') {
      if (!$('shortcutModal').hidden) { closeShortcuts(); return; }
      if (document.body.classList.contains('focus-mode')) setFocusMode(false);
      else if (!$('synapseCard').hidden) $('synapseCard').hidden = true;
      else if (!$('disorderPicker').hidden) $('disorderPicker').hidden = true;
      else if (S.lens) { stopTourAuto(); clearLens(); }
      return;
    }
    if (e.key === '?') {
      openShortcuts();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      if (!$('clinic') || !$('clinic').hidden) $('clinicSearch').focus();
      else if (!$('disorderPicker').hidden) $('disorderSearch').focus();
      else $('search').focus();
      return;
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && S.tourIdx >= 0 && S.disorder) {
      e.preventDefault();
      stopTourAuto();
      S.tourIdx += e.key === 'ArrowRight' ? 1 : -1;
      renderTour();
    }
  });
  await handleDisorderHash();
}

bootDisorder();

// ---------- Section 3 scaffolds (behind flags; architecture only) ----------
// Compare mode (two animated circuits side by side), clinical vignettes,
// on-device narration, offline PWA and future translations are designed in
// but not shipped: enabling any flag must not break the current build.
const FEATURES = { compare: false, vignette: false, narration: false, pwa: false, i18n: false };
// UI text already lives in STRINGS above, so a future Hindi/Gujarati pass
// touches only that object (FEATURES.i18n), never component code.
function startCompareMode() { // eslint-disable-line no-unused-vars
  if (!FEATURES.compare) return;
  // Two viewer instances, one animateCircuit call each — same data contract.
}
function startVignette() { // eslint-disable-line no-unused-vars
  if (!FEATURES.vignette) return;
  // Case stem → mechanism choice → animateCircuit explains either way.
}
function speakQuick() {
  if (!FEATURES.narration || !('speechSynthesis' in window) || !S.disorder) return;
  const first = ((S.disorder.overview || [])[0] || {}).text || '';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(first.split(/(?<=[.!?])\s+/)[0]));
}
