const BASE = import.meta.env.BASE_URL;
let notes = {};
let loaded = false;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function list(items) {
  return (items || []).map((item) => `<li>${esc(item)}</li>`).join('');
}

function renderLearning(anat) {
  const host = document.getElementById('learningCard');
  if (!host) return;
  const note = notes[anat.label];
  if (!note) {
    host.innerHTML = `
      <div class="learning-head">
        <span>Study mode</span>
        <span class="learning-badge">Atlas coverage</span>
      </div>
      <p class="learning-muted">This structure has a baseline atlas function summary. Detailed psychiatry/neuroscience notes are added only where they have been explicitly curated.</p>
      <p class="learning-muted">Use <b>Circuits</b>, <b>Transmitters</b> and <b>Disorders</b> to connect this structure to broader network-level concepts.</p>`;
    return;
  }

  host.innerHTML = `
    <div class="learning-head">
      <span>Evidence-aware study card</span>
      <span class="learning-badge">Curated</span>
    </div>
    <h3>${esc(note.definition)}</h3>
    <div class="learning-grid">
      <section><h4>Core functions</h4><ul>${list(note.functions)}</ul></section>
      <section><h4>Major connections</h4><div class="learning-chips">${(note.connections || []).map((x) => `<span>${esc(x)}</span>`).join('')}</div></section>
      <section><h4>Clinical relevance</h4><ul>${list(note.clinical)}</ul></section>
      <section><h4>Exam pearl</h4><p class="exam-pearl">${esc(note.exam)}</p></section>
    </div>
    <p class="learning-disclaimer">Educational synthesis, not a diagnostic rule. Network associations are not disorder-specific findings.</p>`;
}

function ensureHost() {
  const card = document.getElementById('card');
  if (!card || document.getElementById('learningCard')) return;
  const host = document.createElement('section');
  host.id = 'learningCard';
  host.className = 'learning-card';
  card.querySelector('.card-btns')?.before(host);
}

async function init() {
  try {
    const res = await fetch(`${BASE}brain-atlas/learning.json`);
    if (!res.ok) throw new Error(`learning.json HTTP ${res.status}`);
    notes = await res.json();
    loaded = true;
  } catch (err) {
    console.error('learning cards failed:', err);
  }
  ensureHost();
}

window.addEventListener('neuromap:structure-selected', (event) => {
  ensureHost();
  if (loaded) renderLearning(event.detail || {});
});

init();
