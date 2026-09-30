/* Clinical reference: the four NeuroMap layers (circuits, transmitters,
   syndromes, drugs) on the same single page as the 3D brain. Data is
   parsed verbatim from the Android app's evidence-based repository;
   summaries and sources were written/cited there. No fetching beyond
   local JSON. */

const BASE = import.meta.env.BASE_URL;
const ICD11_URL = 'https://icd.who.int/browse11/l-m/en';
const DSM_URL = 'https://www.psychiatry.org/psychiatrists/practice/dsm';
const DISCLAIMER = 'Reference only — not primary diagnostic advice. Verify local dosing guidelines.';

const LAYERS = {
  circuits: { file: 'circuits.json', title: 'Circuits', nameOf: (e) => e.name },
  transmitters: { file: 'transmitters.json', title: 'Transmitters', nameOf: (e) => e.name },
  syndromes: { file: 'syndromes.json', title: 'Syndromes', nameOf: (e) => e.name },
  drugs: { file: 'drugs.json', title: 'Drugs', nameOf: (e) => e.genericName },
};

const $ = (id) => document.getElementById(id);
const store = { circuits: [], transmitters: [], syndromes: [], drugs: [] };
const byId = { circuits: new Map(), transmitters: new Map(), syndromes: new Map(), drugs: new Map() };
let currentLayer = 'circuits';
let dataReady = false;
let circuits3d = [];

// Universal explore model (shared pure resolvers; DOM-free, unit-tested).
import {
  resolveSubtype, resolveDrugTargets, resolvePathway,
  collectReceptorSpatial, conceptSVG, STATUS,
} from './explore.js';

// Spatial data loaded alongside the clinical catalogue. Registry + markers
// reuse the same files as the disorder engine so the two sides cannot drift.
let spaceMap = null;
let regReceptors = [];
let regDrugById = new Map();
let markerById = new Map();
// Current 3D state for the status line + breadcrumb ({kind, id, label}).
let hlState = null;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chipLabel(layer, id) {
  const e = byId[layer]?.get(id);
  if (!e) return id;
  return LAYERS[layer].nameOf(e);
}

function chips(ids, layer) {
  if (!ids || !ids.length) return '';
  return `<div class="chips">${ids
    .map((id) => `<button type="button" data-go="${layer}:${esc(id)}">${esc(chipLabel(layer, id))}</button>`)
    .join('')}</div>`;
}

function sourcesHtml(sources) {
  if (!sources || !sources.length) return '';
  return `<h3>Further reading</h3><div class="src-list">${sources
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} <span>↗</span></a>`)
    .join('')}</div>`;
}

function disclaimerHtml() {
  return `<div class="disclaimer">${DISCLAIMER}</div>`;
}

// ---------- universal 3D sync (generic; no per-item code paths) ----------
// Every entity funnels through setHl(): viewer highlight + camera + status
// line + breadcrumb + URL stay synchronized from one place.
const V = () => window.__neuroMap || {};
const HL_COLORS = { exact: '#38BDF8', proxy: '#A78BFA', schematic: '#F59E0B', offatlas: '#9CA3AF', none: '#6B7280' };

function hlStatusHtml() {
  if (!hlState) return '';
  const names = hlState.names.length
    ? hlState.names.slice(0, 14).join(', ') + (hlState.names.length > 14 ? ` and ${hlState.names.length - 14} more` : '')
    : 'no atlas structures';
  return `<div class="hl-line" role="status"><b>Showing:</b> ${esc(names)}`
    + ` <span class="badge">${esc(hlState.status)}</span>`
    + (hlState.note ? ` <small>${esc(hlState.note)}</small>` : '')
    + ` <button type="button" data-clear3d>Clear 3D</button></div>`;
}

function scaleHtml(scale) {
  const steps = ['Whole brain', 'Region', 'Concept'];
  const idx = scale === 'concept' ? 2 : scale === 'region' ? 1 : 0;
  return `<p class="scale-crumb" aria-label="Scale">Scale: ${steps.map((s, i) =>
    i === idx ? `<b>${s}</b>` : s).join(' › ')}</p>`;
}

function setScale(scale) {
  const el = $('clinicScale');
  if (el) el.innerHTML = scaleHtml(scale);
  hlState = hlState ? { ...hlState, scale } : hlState;
}

// Focus camera on real mesh bounds, then announce for SR users.
function focusSpatial(labels, markers) {
  const v = V();
  const meshes = v.meshesForLabels ? v.meshesForLabels(labels) : [];
  // flyToMeshes is a no-op on an empty list, so marker-only highlights
  // simply skip camera motion (markers have no mesh bounds to frame).
  if (v.flyToMeshes) v.flyToMeshes(meshes);
  const names = [...labels, ...markers.map((m) => (markerById.get(m) || {}).label || m)];
  $('sr-status') && ($('sr-status').textContent = `Showing ${names.length} highlighted structures: ${names.slice(0, 10).join(', ')}`);
  return names;
}

function clear3D() {
  const v = V();
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.clearCircuitAnimation && v.clearCircuitAnimation({ instant: true });
  v.isolateMeshes && v.isolateMeshes(null);
  hlState = null;
  renderHl();
  setScale('whole');
  history.replaceState(null, '', `#c=${currentLayer}:${currentId || ''}`.replace(/:$/, ''));
}

// Re-render the status line wherever the inspector currently is.
function renderHl() {
  const host = $('clinicHl');
  if (host) host.innerHTML = hlStatusHtml();
  const body = $('clinicBody');
  if (body) {
    body.querySelectorAll('[data-clear3d]').forEach((b) => {
      if (!b.dataset.wired) { b.dataset.wired = '1'; b.addEventListener('click', clear3D); }
    });
  }
}

let currentId = null;

// Selection part of the URL (#c=layer:id&sel=kind:ref). Refresh-safe: the
// boot handler replays it after data loads. Existing #c=layer:id links keep
// working; a missing/unknown sel is ignored, never an error.
function pushSel(sel) {
  history.replaceState(null, '', `#c=${currentLayer}:${currentId || ''}${sel ? `&sel=${sel}` : ''}`);
}

function detailHtml(layer, e) {
  if (layer === 'circuits') {
    return `
      <div class="code">${esc(e.tierCode)}</div>
      <h2>${esc(e.name)}</h2>
      <div class="btn-row"><button type="button" data-show3d="${esc(e.id)}">Show on 3D brain</button></div>
      <h3>Function</h3><p>${esc(e.function)}</p>
      <h3>Description</h3><p>${esc(e.description)}</p>
      <h3>Key structures</h3><p>${esc((e.brainStructures || []).join(' → '))}</p>
      <h3>Transmitters</h3>${chips(e.linkedTransmitters, 'transmitters')}
      <h3>Syndromes</h3>${chips(e.linkedSyndromes, 'syndromes')}
      <h3>Drugs</h3>${chips(e.linkedDrugs, 'drugs')}
      ${disclaimerHtml()}`;
  }
  if (layer === 'transmitters') {
    const rows = (e.receptorSubtypes || [])
      .map((r) => {
        const res = resolveSubtype(spaceMap, regReceptors, e.id, r.name);
        const badge = res.status === STATUS.mapped ? 'mapped'
          : res.status === STATUS.family ? 'family-level' : 'not mapped';
        return `<tr><td><button type="button" class="linklike" data-subtype="${esc(e.id)}:${esc(r.name)}" title="Show receptor sites in 3D (or why none can be shown)"><b>${esc(r.name)}</b></button><br>${esc(r.mechanism)} <span class="badge">${badge}</span>${res.receptors.map((rec) => ` <button type="button" class="linklike" data-concept="${esc(rec.id)}" title="Open conceptual mechanism view (schematic, not scan-derived)">concept</button>`).join('')}</td><td>${esc(r.primaryFunction)}<br><small>${esc(r.brainLocations)}</small>${res.note ? `<br><small class="dim">Map note: ${esc(res.note)}</small>` : ''}</td></tr>`;
      })
      .join('');
    const pw = (spaceMap?.pathways?.[e.id] || []).map((p) =>
      `<li><button type="button" class="linklike" data-pathway="${esc(e.id)}:${esc(p.id)}">${esc(p.label)}</button> — ${esc(p.caption)}</li>`,
    ).join('');
    return `
      <div class="code">${esc(e.symbol)} · ${e.receptorSubtypes?.length ?? 0} receptors</div>
      <h2>${esc(e.name)}</h2>
      <p>${esc(e.description)}</p>
      <h3>Receptor subtypes</h3>
      <p class="dim">Select a subtype to show its registry site map in 3D, or why none exists. Site maps show where a receptor may be present — not that it is altered in any disorder.</p>
      <table><tr><th>Receptor</th><th>Role</th></tr>${rows}</table>
      <h3>Major pathways</h3>
      ${pw ? `<ul>${pw}</ul>` : `<ul>${(e.majorPathways || []).map((p) => `<li>${esc(p)} <small class="dim">(pathway map not yet curated)</small></li>`).join('')}</ul>`}
      <h3>Circuits</h3>${chips(e.linkedCircuits, 'circuits')}
      <h3>Syndromes</h3>${chips(e.linkedSyndromes, 'syndromes')}
      <h3>Drugs</h3>${chips(e.linkedDrugs, 'drugs')}
      ${disclaimerHtml()}`;
  }
  if (layer === 'syndromes') {
    return `
      <div class="code">${esc(e.category)} · <a href="${ICD11_URL}" target="_blank" rel="noopener">ICD-11: ${esc(e.icd11Code)} ↗</a></div>
      <h2>${esc(e.name)}</h2>
      <p><a href="${DSM_URL}" target="_blank" rel="noopener">DSM-5 code: ${esc(e.dsm5Code)} ↗</a></p>
      ${e.summary ? `<h3>Clinical summary</h3><p>${esc(e.summary)}</p>` : ''}
      <h3>Clinical definition</h3><p>${esc(e.clinicalDefinition)}</p>
      <h3>Neurobiological hallmark</h3><p>${esc(e.primaryPathophysiologicalHallmark)}</p>
      <h3>Circuits</h3>${chips(e.linkedCircuits, 'circuits')}
      ${(e.linkedCircuits || []).length ? `<div class="btn-row">${(e.linkedCircuits || []).map((id) => `<button type="button" data-syncircuit="${esc(id)}" title="Show this circuit's nodes in 3D">Show ${esc(chipLabel('circuits', id))} in 3D</button>`).join('')}</div>
      <p class="dim">Each button lights one circuit only; circuits are never merged into a composite overlay.</p>` : ''}
      <h3>Transmitters</h3>${chips(e.linkedTransmitters, 'transmitters')}
      <h3>Drugs</h3>${chips(e.linkedDrugs, 'drugs')}
      ${sourcesHtml(e.sources)}
      ${disclaimerHtml()}`;
  }
  // drugs
  // 27 of 78 receptor targets have no sourced Ki. Those are labelled as
  // unsourced rather than printed as "Ki N/A nM", which reads like a broken
  // value and can be misread as zero. Nothing is estimated.
  const kiCell = (v) => (v === null || v === undefined
    ? '<small>affinity not sourced</small>'
    : `<small>Ki ${esc(String(v))} nM</small>`);
  const trows = (e.receptorTargets || [])
    .map(
      (r) =>
        `<tr><td><b>${esc(r.target)}</b> — ${esc(r.action)}<br><small>${esc(r.clinicalRelevance)}</small></td><td>${esc(r.affinityRating)}<br>${kiCell(r.kiNm)}</td></tr>`,
    )
    .join('');
  const se = (e.sideEffectMechanisms || [])
    .map((m) => `<li><b>${esc(m.symptom)}</b> (${esc(m.receptorMediation)}) — ${esc(m.clinicalManagement)}</li>`)
    .join('');
  const bb = (e.blackBoxWarnings || [])
    .map((w) => `<div class="warnbox">⚠ ${esc(w)}</div>`)
    .join('');
  const pk = e.pharmacokinetics || {};
  const dose = e.dosingRange || {};
  return `
    <div class="code">${esc(e.drugClass)} · ATC ${esc(e.atcCode)}</div>
    <h2>${esc(e.genericName)}</h2>
    <p>Brand: ${esc(e.brandName)}</p>
    ${bb}
    ${e.summary ? `<h3>Clinical summary</h3><p>${esc(e.summary)}</p>` : ''}
    <h3>Clinical pearl</h3><p>${esc(e.clinicalPearls)}</p>
    <div class="btn-row"><button type="button" data-drugsites="${esc(e.id)}" title="Show this drug's receptor target sites in 3D">Show target sites in 3D</button></div>
    <p class="dim">Target-site overlay shows receptor binding locations only. It is not a map of efficacy, side effects, or dosing — those are separate evidence below.</p>
    <h3>Receptor profile</h3>
    <table><tr><th>Target</th><th>Affinity</th></tr>${trows}</table>
    <h3>Dosing</h3>
    <p>Start: ${esc(dose.startingDose)} · Target: ${esc(dose.targetDose)} · Max: ${esc(dose.maxDose)}</p>
    <p>${esc(dose.titrationSchedule)}</p>
    <h3>Pharmacokinetics</h3>
    <p>t½ ${esc(pk.halfLife)} · Bioavailability ${esc(pk.bioavailability)} · ${esc(pk.cypMetabolism)} · Tmax ${esc(pk.timeToPeak)}</p>
    <h3>Common side effects</h3>
    <ul>${(e.commonSideEffects || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    ${se ? `<h3>Side-effect mechanisms</h3><ul>${se}</ul>` : ''}
    <h3>Syndromes</h3>${chips(e.linkedSyndromes, 'syndromes')}
    <h3>Circuits</h3>${chips(e.linkedCircuits, 'circuits')}
    <h3>Transmitters</h3>${chips(e.linkedTransmitters, 'transmitters')}
    ${sourcesHtml(e.sources)}
    ${disclaimerHtml()}`;
}

function showDetail(layer, id) {
  const e = byId[layer]?.get(id);
  if (!e) return;
  currentId = id;
  $('clinicHome').hidden = true;
  $('clinicDetail').hidden = false;
  $('clinicBody').innerHTML = detailHtml(layer, e);
  pushSel(null);
  renderHl();
  setScale(hlState?.scale || 'whole');
  $('clinicBody').scrollTop = 0;
}

function showHome(pushHash = true) {
  $('clinicDetail').hidden = true;
  $('clinicHome').hidden = false;
  if (pushHash) history.replaceState(null, '', window.location.pathname + window.location.search);
}

function haystack(layer, e) {
  return JSON.stringify(e).toLowerCase();
}

function renderList() {
  const q = $('clinicSearch').value.trim().toLowerCase();
  const list = $('clinicList');
  list.innerHTML = '';
  const ents = store[currentLayer].filter((e) => !q || haystack(currentLayer, e).includes(q));
  if (!ents.length) {
    list.innerHTML = '<p style="color:var(--dim);font-size:12px">No matches.</p>';
    return;
  }
  for (const e of ents.slice(0, 200)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'clinic-item';
    const sub =
      currentLayer === 'drugs'
        ? `${e.drugClass} · ${e.atcCode}`
        : currentLayer === 'syndromes'
          ? `${e.category} · ICD-11 ${e.icd11Code}`
          : currentLayer === 'circuits'
            ? e.tierCode
            : e.symbol;
    b.innerHTML = `<b></b><small></small>`;
    b.querySelector('b').textContent = LAYERS[currentLayer].nameOf(e);
    b.querySelector('small').textContent = sub;
    b.addEventListener('click', () => showDetail(currentLayer, e.id));
    list.appendChild(b);
  }
}

function setView(view) {
  document.querySelectorAll('#viewtabs button').forEach((b) =>
    b.classList.toggle('on', b.dataset.view === view),
  );
  document.body.dataset.view = view;
  const clinical = view !== 'brain';
  document.querySelector('.panel').hidden = clinical;
  $('clinic').hidden = !clinical;
  if (clinical) {
    const layer = LAYERS[view];
    // 'disorders' is a sibling tab owned by disorder.js and is never a clinical layer.
    if (!layer) return;
    currentLayer = view;
    // A clinical layer takes over the right-hand side from the disorder panel.
    const dp = $('disorderPanel');
    if (dp) dp.hidden = true;
    $('clinicSearchLabel').textContent = `Search ${layer.title}`;
    $('clinicSearch').placeholder = `e.g. ${view === 'drugs' ? 'sertraline, SSRI, N06AB' : view === 'syndromes' ? 'depression, 6A70, mood' : view === 'circuits' ? 'CSTC, reward, DMN' : 'serotonin, 5-HT, dopamine'}…`;
    showHome(false);
    renderList();
  }
}

async function loadClinical() {
  try {
    const entries = await Promise.all(
      Object.entries(LAYERS).map(async ([layer, meta]) => {
        const res = await fetch(`${BASE}clinical/${meta.file}`);
        if (!res.ok) throw new Error(`${meta.file} HTTP ${res.status}`);
        return [layer, await res.json()];
      }),
    );
    for (const [layer, ents] of entries) {
      store[layer] = ents;
      for (const e of ents) byId[layer].set(e.id, e);
    }
    // Spatial joins + registries (same files as the disorder engine).
    const [sm, receptors, drugs, markers, c3d] = await Promise.all([
      fetch(`${BASE}clinical/space-map.json`).then((r) => { if (!r.ok) throw new Error(`space-map.json HTTP ${r.status}`); return r.json(); }),
      fetch(`${BASE}content/registries/receptors.json`).then((r) => r.json()),
      fetch(`${BASE}content/registries/drugs.json`).then((r) => r.json()),
      fetch(`${BASE}content/markers.json`).then((r) => r.json()).catch(() => ({ markers: [] })),
      fetch(`${BASE}brain-atlas/circuits3d.json`).then((r) => r.json()).catch(() => ({ circuits: [] })),
    ]);
    spaceMap = sm;
    regReceptors = receptors.receptors || [];
    for (const d of drugs.drugs || []) regDrugById.set(d.id, d);
    for (const m of markers.markers || []) markerById.set(m.id, m);
    circuits3d = (c3d.circuits || c3d);
    dataReady = true;
  } catch (err) {
    console.error('clinical data failed:', err);
    $('clinicList').innerHTML =
      '<p style="color:var(--dim);font-size:12px">Clinical data failed to load.</p>';
  }
}

// The view tabs also contain the 'brain' and 'disorders' tabs; 'disorders' is
// owned by disorder.js and must not be routed through the clinical layers.
document.querySelectorAll('#viewtabs button').forEach((b) => {
  if (b.dataset.view !== 'brain' && !LAYERS[b.dataset.view]) return;
  b.addEventListener('click', () => setView(b.dataset.view));
});
$('clinicBack').addEventListener('click', () => showHome());
$('clinicSearch').addEventListener('input', renderList);
$('clinicBody').addEventListener('click', (e) => {
  const show = e.target.closest('[data-show3d]');
  if (show) {
    setView('brain');
    syncCircuit(show.dataset.show3d);
    return;
  }
  const btn = e.target.closest('[data-go]');
  if (btn) {
    const [layer, id] = btn.dataset.go.split(':');
    if (LAYERS[layer]) {
      currentLayer = layer;
      setView(layer);
      showDetail(layer, id);
    }
    return;
  }
  // Universal explore actions (all routed through setHl-style sync below).
  const act = e.target.closest('[data-subtype],[data-pathway],[data-syncircuit],[data-drugsites],[data-concept],[data-clear3d]');
  if (!act) return;
  if (act.hasAttribute('data-clear3d')) { clear3D(); return; }
  if (act.hasAttribute('data-subtype')) {
    const [tx, name] = act.dataset.subtype.split(':');
    exploreSubtype(tx, name);
  } else if (act.hasAttribute('data-pathway')) {
    const [tx, pid] = act.dataset.pathway.split(':');
    explorePathway(tx, pid);
  } else if (act.hasAttribute('data-syncircuit')) {
    syncCircuit(act.dataset.syncircuit);
  } else if (act.hasAttribute('data-drugsites')) {
    exploreDrugSites(act.dataset.drugsites);
  } else if (act.hasAttribute('data-concept')) {
    openConcept(act.dataset.concept);
  }
});

// ---------- explore actions (generic over the space map) ----------
function spatialNote(status) {
  return status === STATUS.mapped ? 'exact registry site map'
    : status === STATUS.family ? 'family-level map (see note)'
    : 'no site map in this atlas';
}

function exploreSubtype(txId, name) {
  const v = V();
  const res = resolveSubtype(spaceMap, regReceptors, txId, name);
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.clearCircuitAnimation && v.clearCircuitAnimation({ instant: true });
  if (!res.receptors.length) {
    hlState = { kind: 'receptor-subtype', id: `${txId}:${name}`, label: name, names: [], status: res.status, note: res.note, scale: 'whole' };
    renderHl();
    setScale('whole');
    return;
  }
  pushSel(`subtype:${txId}:${name}`);
  const sp = collectReceptorSpatial(res.receptors);
  const color = res.status === STATUS.mapped ? HL_COLORS.exact : HL_COLORS.proxy;
  v.highlight && v.highlight([{ labels: sp.labels, color }]);
  const defs = [...sp.markers].map((id) => markerById.get(id)).filter(Boolean);
  if (defs.length && v.showMarkers) v.showMarkers(defs);
  const names = focusSpatial(sp.labels, [...sp.markers]);
  hlState = {
    kind: 'receptor-subtype', id: `${txId}:${name}`,
    label: `${name} sites (${spatialNote(res.status)})`,
    names, markers: [...sp.markers], status: res.status,
    note: `${res.receptors.map((r) => r.name).join(', ')}. ${res.note} Site presence is not disorder alteration.`,
    scale: 'region',
  };
  renderHl();
  setScale('region');
}

function explorePathway(txId, pid) {
  const v = V();
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.clearCircuitAnimation && v.clearCircuitAnimation({ instant: true });
  const p = resolvePathway(spaceMap, txId, pid);
  if (!p) {
    hlState = { kind: 'pathway', id: `${txId}:${pid}`, label: pid, names: [], status: STATUS.none, note: 'Pathway map not yet curated for this transmitter.', scale: 'whole' };
    renderHl();
    setScale('whole');
    return;
  }
  const defs = [];
  for (const n of p.nodes) {
    if (n.markerId && markerById.get(n.markerId)) defs.push(markerById.get(n.markerId));
  }
  if (defs.length && v.showMarkers) v.showMarkers(defs);
  const edgeObjs = (p.edges || []).map((e) => ({
    from: e.from, to: e.to, type: e.type, transmitter: txId,
  }));
  v.animateCircuit && v.animateCircuit({
    name: p.label, function: p.caption, color: '#F472B6',
    nodes: p.nodes.map((n) => ({ atlasLabels: n.atlasLabels || [], markerId: n.markerId, precision: n.precision })),
    edges: edgeObjs,
  });
  pushSel(`pathway:${txId}:${pid}`);
  const names = [...new Set([...p.nodes.flatMap((n) => n.atlasLabels || []), ...defs.map((d) => d.label)])];
  hlState = {
    kind: 'pathway', id: `${txId}:${pid}`, label: p.label, names,
    markers: defs.map((d) => d.id), status: p.edges.length ? STATUS.mapped : STATUS.partial,
    note: [...(p.omitted || []), ...p.nodes.filter((n) => n.note).map((n) => n.note)].join(' '),
    scale: 'region',
  };
  renderHl();
  setScale('region');
}

function syncCircuit(id) {
  const v = V();
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.clearCircuitAnimation && v.clearCircuitAnimation({ instant: true });
  const c3 = circuits3d.find((c) => c.id === id);
  const clin = byId.circuits.get(id);
  const name = c3?.name || clin?.name || id;
  if (!c3) {
    hlState = { kind: 'circuit', id, label: name, names: [], status: STATUS.none, note: 'No node geometry listed for this circuit.', scale: 'whole' };
    renderHl();
    setScale('whole');
    return;
  }
  const nodes = (c3.nodes || []).map((n) => ({ atlasLabels: n.match || [], precision: 'exact' }));
  const defs = ((spaceMap?.circuitMarkers?.[id]) || []).map((m) => markerById.get(m.id)).filter(Boolean);
  if (defs.length && v.showMarkers) v.showMarkers(defs);
  v.animateCircuit && v.animateCircuit({
    name, function: c3.function || '', color: c3.color || '#F59E0B', nodes, edges: [],
  });
  pushSel(`circuit:${id}`);
  const names = [...new Set([...nodes.flatMap((n) => n.atlasLabels), ...defs.map((d) => d.label)])];
  const omitted = [...(c3.omitted || []), ...((spaceMap?.circuitMarkers?.[id]) || []).map((m) => m.note)].filter(Boolean);
  hlState = {
    kind: 'circuit', id, label: name, names, markers: defs.map((d) => d.id),
    status: omitted.length ? STATUS.partial : STATUS.mapped,
    note: (omitted.length ? `Not drawn: ${omitted.join(' ')} ` : '')
      + 'Node co-highlight is not connectivity: the source lists nodes only, no directed edges.',
    scale: 'region',
  };
  renderHl();
  setScale('region');
}

function exploreDrugSites(clinDrugId) {
  const v = V();
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.clearCircuitAnimation && v.clearCircuitAnimation({ instant: true });
  const clin = byId.drugs.get(clinDrugId);
  const reg = regDrugById.get(clinDrugId);
  let receptors = [];
  let how = '';
  if (reg && (reg.receptorProfile || []).length) {
    receptors = reg.receptorProfile
      .map((p) => regReceptors.find((r) => r.id === p.receptorId))
      .filter(Boolean);
    how = `Validated fingerprint (${reg.receptorProfile.length} targets; actions per target in the registry). Binding ≠ efficacy.`;
  } else {
    const rows = resolveDrugTargets(spaceMap, regReceptors, (clin?.receptorTargets || []).map((t) => t.target));
    receptors = [...new Map(rows.flatMap((r) => r.receptors).map((r) => [r.id, r])).values()];
    const unmapped = rows.filter((r) => !r.receptors.length).map((r) => r.name);
    how = `Target-string fallback (no registry fingerprint for this drug).`
      + (unmapped.length ? ` Not mapped: ${unmapped.join(', ')}.` : '')
      + ` Binding ≠ efficacy; side effects and dosing are separate evidence.`;
  }
  if (!receptors.length) {
    hlState = { kind: 'drug-sites', id: clinDrugId, label: clin?.genericName || clinDrugId, names: [], status: STATUS.none, note: how, scale: 'whole' };
    renderHl();
    setScale('whole');
    return;
  }
  pushSel(`drugsites:${clinDrugId}`);
  const sp = collectReceptorSpatial(receptors);
  v.highlight && v.highlight([{ labels: sp.labels, color: '#34D399' }]);
  const defs = [...sp.markers].map((m) => markerById.get(m)).filter(Boolean);
  if (defs.length && v.showMarkers) v.showMarkers(defs);
  const names = focusSpatial(sp.labels, [...sp.markers]);
  hlState = {
    kind: 'drug-sites', id: clinDrugId, label: `${clin?.genericName || clinDrugId} target sites`,
    names, markers: [...sp.markers], status: sp.precisions.includes('exact') ? STATUS.mapped : STATUS.partial,
    note: `${receptors.map((r) => r.name).join(', ')}. ${how}`,
    scale: 'region',
  };
  renderHl();
  setScale('region');
}

// Conceptual microstructure: receptor signalling lanes as an explicitly
// schematic SVG inside the shared synapse card. Never mesh geometry.
function openConcept(receptorId) {
  const rec = regReceptors.find((r) => r.id === receptorId);
  if (!rec) return;
  const sp = collectReceptorSpatial([rec]);
  const v = V();
  v.clearHighlight && v.clearHighlight();
  v.clearMarkers && v.clearMarkers();
  v.clearCircuitAnimation && v.clearCircuitAnimation({ instant: true });
  v.highlight && v.highlight([{ labels: sp.labels, color: HL_COLORS.proxy }]);
  const names = focusSpatial(sp.labels, []);
  const sig = rec.signalling || {};
  const lanes = [
    { kicker: '1 · transmitter release', text: 'Presynaptic release into the cleft', color: '#60A5FA', evidence: 'textbook context' },
    { kicker: '2 · receptor', text: `${rec.name} (${rec.family || 'family see card'})`, color: '#A855F7', evidence: (sig.evidence || 'see citation') },
    { kicker: '3 · signalling', text: (sig.text || 'Signalling summary see receptor card').slice(0, 90), color: '#34D399', evidence: (sig.evidence || 'see citation') },
    { kicker: '4 · circuit implication', text: `Sites: ${(sp.labels.slice(0, 3).join(', ') || 'see card')}${sp.labels.length > 3 ? '…' : ''}`, color: '#F59E0B', evidence: 'site map, not alteration' },
  ];
  $('synapseTitle').textContent = `${rec.name} — concept view`;
  $('synapseSvg').innerHTML = conceptSVG({
    title: rec.name,
    lanes,
    sourcesNote: `Sources: ${(sig.sourceIds || []).join(', ') || 'see receptor card'}. Camera magnification of a mesh adds no resolution.`,
  });
  $('synapseCap').textContent = 'Conceptual schematic — not to scale, not scan-derived, not cell-resolved. Return via Close or Esc; selection is preserved.';
  $('synapseCard').hidden = false;
  pushSel(`concept:${receptorId}`);
  hlState = {
    kind: 'receptor-concept', id: receptorId, label: `${rec.name} (concept)`, names,
    markers: [], status: STATUS.schematic,
    note: 'Schematic mechanism view; site presence is not disorder alteration.',
    scale: 'concept',
  };
  renderHl();
  setScale('concept');
}

// Replays a #c= deep link (detail + optional selection). Shared by initial
// load and back/forward navigation. Unknown values are ignored, never errors.
// Guarded against self-trigger: our own pushSel writes must not replay.
let lastClinicalHash = '';
function replayClinicalHash() {
  const h = window.location.hash || '';
  if (h === lastClinicalHash) return false;
  const deep = /^#c=(circuits|transmitters|syndromes|drugs):([\w-]+)(?:&sel=(.+))?$/.exec(h);
  if (!deep || !dataReady) return false;
  setView(deep[1]);
  showDetail(deep[1], deep[2]);
  const sel = (deep[3] || '').split(':');
  const kind = sel[0];
  try {
    if (kind === 'subtype' && sel.length >= 3) exploreSubtype(sel[1], sel.slice(2).join(':'));
    else if (kind === 'pathway' && sel.length === 3) explorePathway(sel[1], sel[2]);
    else if (kind === 'circuit' && sel.length === 2) { setView('brain'); syncCircuit(sel[1]); }
    else if (kind === 'drugsites' && sel.length === 2) exploreDrugSites(sel[1]);
    else if (kind === 'concept' && sel.length === 2) openConcept(sel[1]);
  } catch (err) {
    console.error('clinical sel replay failed:', err);
  }
  lastClinicalHash = window.location.hash || '';
  return true;
}

document.body.dataset.view = 'brain';
loadClinical().then(() => {
  replayClinicalHash();
});
window.addEventListener('hashchange', () => {
  // Only clinical hashes; #d= belongs to the disorder engine.
  if ((window.location.hash || '').startsWith('#c=')) replayClinicalHash();
});
