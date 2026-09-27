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
      <h3>Drugs</h3>${chips(e.linkedDrugs, 'drugs')}`;
  }
  if (layer === 'transmitters') {
    const rows = (e.receptorSubtypes || [])
      .map(
        (r) => `<tr><td><b>${esc(r.name)}</b><br>${esc(r.mechanism)}</td><td>${esc(r.primaryFunction)}<br><small>${esc(r.brainLocations)}</small></td></tr>`,
      )
      .join('');
    return `
      <div class="code">${esc(e.symbol)} · ${e.receptorSubtypes?.length ?? 0} receptors</div>
      <h2>${esc(e.name)}</h2>
      <p>${esc(e.description)}</p>
      <h3>Receptor subtypes</h3>
      <table><tr><th>Receptor</th><th>Role</th></tr>${rows}</table>
      <h3>Major pathways</h3>
      <ul>${(e.majorPathways || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <h3>Circuits</h3>${chips(e.linkedCircuits, 'circuits')}
      <h3>Syndromes</h3>${chips(e.linkedSyndromes, 'syndromes')}
      <h3>Drugs</h3>${chips(e.linkedDrugs, 'drugs')}`;
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
      <h3>Transmitters</h3>${chips(e.linkedTransmitters, 'transmitters')}
      <h3>Drugs</h3>${chips(e.linkedDrugs, 'drugs')}
      ${sourcesHtml(e.sources)}
      ${disclaimerHtml()}`;
  }
  // drugs
  const ki = (v) => (v === null || v === undefined ? 'N/A' : String(v));
  const trows = (e.receptorTargets || [])
    .map(
      (r) =>
        `<tr><td><b>${esc(r.target)}</b> — ${esc(r.action)}<br><small>${esc(r.clinicalRelevance)}</small></td><td>${esc(r.affinityRating)}<br><small>Ki ${esc(ki(r.kiNm))} nM</small></td></tr>`,
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
  $('clinicHome').hidden = true;
  $('clinicDetail').hidden = false;
  $('clinicBody').innerHTML = detailHtml(layer, e);
  history.replaceState(null, '', `#c=${layer}:${id}`);
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
    currentLayer = view;
    $('clinicSearchLabel').textContent = `Search ${LAYERS[view].title}`;
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
    dataReady = true;
  } catch (err) {
    console.error('clinical data failed:', err);
    $('clinicList').innerHTML =
      '<p style="color:var(--dim);font-size:12px">Clinical data failed to load.</p>';
  }
}

document.querySelectorAll('#viewtabs button').forEach((b) =>
  b.addEventListener('click', () => setView(b.dataset.view)),
);
$('clinicBack').addEventListener('click', () => showHome());
$('clinicSearch').addEventListener('input', renderList);
$('clinicBody').addEventListener('click', (e) => {
  const show = e.target.closest('[data-show3d]');
  if (show) {
    setView('brain');
    if (window.__neuroMap && window.__neuroMap.showCircuit) {
      window.__neuroMap.showCircuit(show.dataset.show3d);
    }
    return;
  }
  const btn = e.target.closest('[data-go]');
  if (!btn) return;
  const [layer, id] = btn.dataset.go.split(':');
  if (LAYERS[layer]) {
    currentLayer = layer;
    setView(layer);
    showDetail(layer, id);
  }
});

document.body.dataset.view = 'brain';
loadClinical().then(() => {
  // Clinical deep link: #c=<layer>:<id>
  const deep = /^#c=(circuits|transmitters|syndromes|drugs):([\w-]+)$/.exec(window.location.hash || '');
  if (deep && dataReady) {
    setView(deep[1]);
    showDetail(deep[1], deep[2]);
  }
});
