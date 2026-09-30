import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './clinical.js';
import './disorder.js';

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}brain-atlas/models/brain.glb`;
const MANIFEST_URL = `${BASE}brain-atlas/models/manifest.json`;
const FUNCTIONS_URL = `${BASE}brain-atlas/functions.json`;
const CIRCUITS_URL = `${BASE}brain-atlas/circuits3d.json`;
const FUNCSYS_URL = `${BASE}brain-atlas/function-systems.json`;
const DRACO_PATH = `${BASE}brain-atlas/vendor/draco/`;

// Entries that are scene-graph/collection bookkeeping, not anatomy.
const TA2_JUNK = new Set([
  'Bonus collection',
  'Scene Collection',
  'Head',
  'Regions of human body',
  'Main divisions',
]);

// Muted, tissue-like PBR palette per subsystem.
const CATEGORY_STYLE = {
  cortex: { color: 0xc79a90, roughness: 0.42, label: 'Cortex' },
  cerebellum: { color: 0xbd9489, roughness: 0.46, label: 'Cerebellum' },
  brainstem: { color: 0xb3937a, roughness: 0.5, label: 'Brainstem' },
  deep_grey: { color: 0x9c6a5c, roughness: 0.48, label: 'Deep grey' },
  diencephalon: { color: 0xa67e6b, roughness: 0.48, label: 'Diencephalon' },
  white_matter: { color: 0xe2d6c2, roughness: 0.55, label: 'White matter' },
  tracts: { color: 0xd6c5a2, roughness: 0.5, label: 'Tracts' },
  ventricles: { color: 0xafcadd, roughness: 0.25, opacity: 0.55, label: 'Ventricles' },
  arteries: { color: 0xa83a32, roughness: 0.35, label: 'Arteries' },
  veins_sinuses: { color: 0x416b99, roughness: 0.35, label: 'Veins & sinuses' },
  cranial_nerves: { color: 0xd3b268, roughness: 0.45, label: 'Cranial nerves' },
  meninges_dura: { color: 0xc9ced1, roughness: 0.6, opacity: 0.35, label: 'Meninges' },
};

const $ = (id) => document.getElementById(id);
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Forgiving text match used by structure search (and anything else that needs
// it): lowercase, accent-folded, Greek letters readable by name, dashes as
// spaces. Defined once at module scope so the index build and the query path
// fold identically.
const GREEK_FOLD = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', κ: 'kappa', μ: 'mu', σ: 'sigma', τ: 'tau', ω: 'omega' };
const foldText = (s) => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[αβγδεκμστω]/g, (c) => ` ${GREEK_FOLD[c]} `)
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const loaderEl = $('loader');
const loadfill = $('loadfill');
const loadmsg = $('loadmsg');

// ---------- renderer / scene ----------
const container = $('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
const baseDPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(baseDPR);
// Adaptive quality: the render loop below steps the pixel ratio down when
// sustained animation runs slowly and back up when it recovers, with
// hysteresis so it never flaps. Content-preserving — geometry, colours and
// camera are untouched; only shaded-pixel count changes.
let renderQuality = 1;
let qEMA = 60;
let qDownSince = 0;
let qUpSince = 0;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true; // slice-plane incisions
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.01,
  100,
);
camera.position.set(0.35, 0.22, 0.62);

// Neutral studio environment (image-based lighting) for a specimen look.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Three-point rig + soft fill so form reads even where the HDRI is flat.
scene.add(new THREE.HemisphereLight(0xfff1e6, 0x232b34, 0.55));
const key = new THREE.DirectionalLight(0xfff4ea, 1.6);
key.position.set(0.6, 0.9, 0.7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.01;
key.shadow.camera.far = 5;
key.shadow.bias = -0.0002;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45);
fill.position.set(-0.7, 0.1, 0.5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffe2d2, 0.9);
rim.position.set(-0.2, 0.4, -0.8);
scene.add(rim);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;
controls.minDistance = 0.08;
controls.maxDistance = 3;

let spinWanted = true;
let idleTimer = null;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  camTween = null; // manual input always cancels a scripted camera move
  if (idleTimer) clearTimeout(idleTimer);
});
controls.addEventListener('end', () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (spinWanted) controls.autoRotate = true;
  }, 5000);
});

// ---------- materials ----------
function tissueMaterial(cat) {
  const style = CATEGORY_STYLE[cat] || { color: 0xb9a89c, roughness: 0.5 };
  const color = new THREE.Color(style.color);
  let mat;
  if (cat === 'cortex' || cat === 'cerebellum') {
    // Cortical surface: soft pink-grey tissue with a gentle translucent
    // sheen at grazing angles (subsurface-scattering style), satin
    // clearcoat for wet organic tissue instead of flat plastic.
    mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: style.roughness,
      metalness: 0.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.55,
      sheen: 1.0,
      sheenColor: new THREE.Color(0xffd9cd),
      sheenRoughness: 0.55,
      envMapIntensity: 0.65,
      // Double-sided so slice-plane cuts read as solid tissue, not hollow shells.
      side: THREE.DoubleSide,
      clippingPlanes: [slicePlane],
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: style.roughness,
      metalness: 0.0,
      envMapIntensity: 0.7,
      side: THREE.DoubleSide,
      clippingPlanes: [slicePlane],
    });
  }
  if (style.opacity !== undefined && style.opacity < 1) {
    mat.transparent = true;
    mat.opacity = style.opacity;
    mat.depthWrite = false;
  }
  mat.userData.category = cat;
  return mat;
}

const baseMats = {}; // cat -> shared material
const hoverMats = {}; // cat -> shared hover variant
const selectMats = {}; // cat -> shared selection variant

// Lobe tints for cortex color-by-lobe mode, keyed by manifest region.
const LOBE_COLORS = {
  'Frontal lobe': 0xd97941,
  'Parietal lobe': 0x4a90c9,
  'Temporal lobe': 0x4ac978,
  'Occipital lobe': 0x9a6ac9,
  'Limbic lobe': 0xc9a44a,
  Insula: 0x4ac9c2,
};
let lobeMode = false;
const lobeMats = {}; // region -> shared physical material

// ---------- colour-by-function mode ----------
// A teaching classification loaded from public/brain-atlas/function-systems.json
// and derived by rule from each structure's own name plus the atlas function
// note. It is NOT an official parcellation. Categories the spec lists as
// uncoloured (vessels, cranial nerves, meninges) keep their category colour, and
// anything no rule matches stays in the 'other' bucket rather than being guessed.
// scripts/check-functions.mjs re-implements the same order and fails if the
// rules stop matching, so a stale rule cannot go unnoticed.
let funcSys = null;
let funcMode = false;
let funcIsolate = null; // system id soloed from the legend, or null
const funcMats = {}; // system id -> shared material
let funcSystemOf = null; // (anat) -> system id | null

function funcMaterial(sysId) {
  if (!funcMats[sysId]) {
    const sys = (funcSys.systems || []).find((s) => s.id === sysId);
    const hex = sys ? sys.color : '#6E6E6E';
    const m = baseMats.cortex.clone();
    m.color = new THREE.Color(hex);
    // Small emissive lift so flat teaching colours stay legible under the
    // studio rig instead of going muddy in shadow.
    m.emissive = new THREE.Color(hex).multiplyScalar(0.18);
    m.emissiveIntensity = 1;
    m.roughness = 0.55;
    m.clippingPlanes = [slicePlane];
    funcMats[sysId] = m;
  }
  return funcMats[sysId];
}

function variantMat(cat, emissiveScale, opacity) {
  const src = baseMats[cat];
  const m = src.clone();
  m.emissive = new THREE.Color(src.color).multiplyScalar(emissiveScale);
  m.emissiveIntensity = 1;
  // NOTE: clone() deep-copies planes (frozen snapshot) — rebind the live
  // shared plane so toggles keep working on hover/selection materials.
  m.clippingPlanes = [slicePlane];
  if (opacity !== undefined) {
    m.transparent = true;
    m.opacity = opacity;
  }
  return m;
}

function ensureVariants(cat) {
  if (!hoverMats[cat]) hoverMats[cat] = variantMat(cat, 0.28);
  if (!selectMats[cat]) selectMats[cat] = variantMat(cat, 0.5);
}

function lobeMaterial(region) {
  if (!lobeMats[region]) {
    const m = baseMats.cortex.clone();
    m.color = new THREE.Color(LOBE_COLORS[region]);
    // Rebind live plane (clone() would freeze a snapshot).
    m.clippingPlanes = [slicePlane];
    lobeMats[region] = m;
  }
  return lobeMats[region];
}

// Base material honoring the lobe-colour and function-colour modes.
// Lobe mode applies to cortex only; function mode applies to every category
// the spec covers, and leaves the rest on their category colour.
function baseMaterialFor(mesh) {
  const anat = mesh.userData.anat;
  const cat = anat.cat;
  if (funcMode) {
    const sys = funcSystemOf ? funcSystemOf(anat) : null;
    if (sys) return funcMaterial(sys);
    return baseMats[cat];
  }
  if (lobeMode && cat === 'cortex' && LOBE_COLORS[anat.region]) {
    return lobeMaterial(anat.region);
  }
  return baseMats[cat];
}

// Disorder-lens tint overrides (Mesh -> material). Selection and hover win.
const hlTint = new Map();
const hlMats = {}; // colorHex -> shared highlight material
const markerGroup = new THREE.Group();
scene.add(markerGroup);

function highlightMaterial(colorHex) {
  if (!hlMats[colorHex]) {
    hlMats[colorHex] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.55,
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
      clippingPlanes: [slicePlane],
    });
  }
  return hlMats[colorHex];
}

// Single place that decides what every mesh looks like. All highlight,
// selection, hover, lobe and animated-circuit state flows through here —
// no disorder-specific code paths in the viewer.
function materialFor(mesh) {
  const cat = mesh.userData.anat.cat;
  if (mesh === selected) {
    ensureVariants(cat);
    return selectMats[cat];
  }
  if (mesh === hovered) {
    ensureVariants(cat);
    return hoverMats[cat];
  }
  // Animated circuit mode wins over plain highlight tints while active:
  // members get the pulsing node material, everything else a faint ghost of
  // its own tissue material (never fully hidden, so spatial orientation
  // survives). animBlend drives ghost *opacity* in the render loop, not
  // material selection — materials are assigned once per circuit change.
  if (circuitAnim) {
    if (circuitAnim.members.has(mesh)) return circuitAnim.nodeMat;
    return ghostMatFor(mesh);
  }
  if (hlTint.has(mesh)) return hlTint.get(mesh);
  return baseMaterialFor(mesh);
}

function refreshMeshMaterials() {
  for (const m of anatomyMeshes) m.material = materialFor(m);
}

// ---------- state ----------
const manifestById = new Map();
let functions = {}; // manifest id -> plain-language function summary
let circuits3d = []; // psychiatry circuits with label-match node rules
let activeCircuit = null; // active circuit object or null
let circuitMembers = new Set(); // Set<Mesh> in the active circuit
const circuitGroup = new THREE.Group();
scene.add(circuitGroup);
let circuitPulses = []; // { mesh, curve, t }
const animClock = new THREE.Clock();
const anatomyMeshes = []; // pickable meshes
const meshesByCat = new Map(); // cat -> Mesh[]
const searchIndex = []; // { mesh, hay }
const catState = {}; // cat -> visible (default true)
const labelMats = new Set();
let matchSet = null; // Set<Mesh> when searching/isolating, else null
let hemi = 'both'; // 'both' | 'left' | 'right'; median structures always visible
let labelsOn = false;
let labelWorld = 0.01;
let selected = null;
let hovered = null;
let homePos = camera.position.clone();
let homeTarget = new THREE.Vector3(0, 0, 0);
let modelBBox = null;
let modelSize = 1;
let cortexOpacity = 1;
// Slice plane: assigned to EVERY material at creation so the clipping
// shader path compiles once up front. Toggling only changes the plane
// constant/normal (pure uniform updates, no recompiles). three.js keeps the
// POSITIVE side (normal.dot(p) + constant > 0), so the neutral state uses a
// hugely positive constant to keep everything.
const slicePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e10);
let sliceMode = 'off';
let sliceT = 0.5;
let sliceBounds = null;

function setMeshMaterial(mesh, mat) {
  mesh.material = mat;
}

function clearSelection() {
  if (selected) selected = null;
  refreshMeshMaterials();
  $('card').hidden = true;
  $('sr-status').textContent = '';
  if (window.location.hash.startsWith('#s=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function cleanTa2(ta2, region, parent, label) {
  const parts = (Array.isArray(ta2) ? ta2 : [])
    .filter((p) => p && !TA2_JUNK.has(p))
    .reverse();
  for (const extra of [region, parent]) {
    if (extra && !parts.includes(extra)) parts.push(extra);
  }
  if (label && !parts.includes(label)) parts.push(label);
  return parts;
}

function showCard(anat) {
  $('cardSide').textContent = anat.side || '—';
  $('cardName').textContent = anat.label + (anat.side === 'left' || anat.side === 'right' ? ` (${anat.side})` : '');
  const catLabel = (CATEGORY_STYLE[anat.cat] || {}).label || anat.cat;
  const sys = anat.funcSystem ? (funcSys.systems || []).find((s) => s.id === anat.funcSystem) : null;
  $('cardMeta').textContent = `${catLabel}${anat.region ? ` · ${anat.region}` : ''}`;
  $('cardFuncSys').textContent = sys ? `Function group: ${sys.label}` : '';
  $('cardFuncSys').hidden = !sys;
  $('cardTa2').textContent = cleanTa2(anat.ta2, anat.region, anat.parent, anat.label).join(' › ') || '—';
  const func = functions[String(anat.id)];
  $('cardFunc').textContent = func || '';
  $('cardFunc').hidden = !func;
  $('funcLabel').hidden = !func;
  $('cardDec').textContent = anat.decussation || '';
  $('cardDec').hidden = !anat.decussation;
  $('decLabel').hidden = !anat.decussation;
  $('cardSrc').textContent = `Source: ${anat.source || 'Z-Anatomy / BodyParts3D'}`;
  $('card').hidden = false;
  // Screen-reader announcement: canvas sprites expose no semantics.
  $('sr-status').textContent = `${$('cardName').textContent}. ${$('cardMeta').textContent}`;
}

function select(mesh, pushHash = true) {
  if (!mesh) {
    clearSelection();
    return;
  }
  clearSelectionHashOnly();
  if (!mesh) return;
  selected = mesh;
  refreshMeshMaterials();
  showCard(mesh.userData.anat);
  if (pushHash) {
    history.replaceState(null, '', `#s=${mesh.userData.anat.id}`);
  }
}

// Clear the card without touching the URL hash (used internally by select).
function clearSelectionHashOnly() {
  if (selected) selected = null;
  refreshMeshMaterials();
  $('card').hidden = true;
}

function setHovered(mesh) {
  if (hovered === mesh) return;
  hovered = mesh;
  refreshMeshMaterials();
  renderer.domElement.style.cursor = hovered ? 'pointer' : '';
}

// ---------- picking (tap, not drag) ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downX = 0;
let downY = 0;

function pickTargets() {
  // During animated circuit mode the ghost is context, not content: only
  // participating members (and edge tubes, handled at the call site) are
  // pickable, so faint background tissue never steals clicks from them.
  return circuitAnim ? [...circuitAnim.members] : anatomyMeshes;
}

function pickAt(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickTargets(), false);
  return hits.length ? hits[0].object : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // was a drag
  // In animated circuit mode, edge tubes are pickable too: nearest hit wins,
  // so clicking a connection shows the pathway while nodes still select.
  // Ghosted non-members are excluded from picking (see pickTargets).
  if (circuitAnim && circuitAnim.edgeObjs.length) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const tubes = [];
    for (const eo of circuitAnim.edgeObjs) tubes.push(...eo.group.children);
    const edgeHits = raycaster.intersectObjects(tubes, false);
    const anatHits = raycaster.intersectObjects(pickTargets(), false);
    const edgeD = edgeHits.length ? edgeHits[0].distance : Infinity;
    const anatD = anatHits.length ? anatHits[0].distance : Infinity;
    if (edgeD <= anatD && edgeHits.length && edgeHits[0].object.userData.edge) {
      const ed = edgeHits[0].object.userData.edge;
      const label = `${ed.from} → ${ed.to} · ${ed.type || 'modulatory'}${ed.transmitter ? ` · ${ed.transmitter}` : ''}`;
      $('circuitInfo').textContent = label;
      $('sr-status').textContent = `${circuitAnim.name}: ${label}. ${circuitAnim.fn}`;
      return;
    }
  }
  const hit = pickAt(e.clientX, e.clientY);
  select(hit);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || e.buttons !== 0) return;
  setHovered(pickAt(e.clientX, e.clientY));
});

// ---------- UI wiring ----------
function focusOn(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  controls.target.copy(box.getCenter(new THREE.Vector3()));
}

function updateVisibility() {
  for (const m of anatomyMeshes) {
    const a = m.userData.anat;
    // Animated circuit mode keeps every mesh rendered — non-participants
    // fade to a ghost via materials, never via visibility, so the faint
    // silhouette of the whole brain stays on screen. Legacy circuit focus
    // (no animation object) still isolates members outright.
    const catOn = circuitAnim ? true : activeCircuit ? circuitMembers.has(m) : catState[a.cat] !== false;
    const sideOn = hemi === 'both' || a.side === 'median' || a.side === hemi;
    // A functional solo is an extra AND, so hemisphere, search and category
    // toggles keep behaving exactly as they do in every other mode.
    const funcOn = !funcIsolate || a.funcSystem === funcIsolate;
    m.visible = catOn && sideOn && funcOn && (!matchSet || matchSet.has(m));
    const sp = m.userData.sprite;
    if (sp) sp.visible = labelsOn && m.visible;
  }
}

// Resolve a circuit's label-match rules to meshes. Rules are auditable
// substrings; anything without a sourced mesh stays out (see omitted).
function resolveCircuitMembers(circuit) {
  const groups = [];
  for (const node of circuit.nodes || []) {
    const subs = (node.match || []).map((s) => s.toLowerCase());
    const meshes = anatomyMeshes.filter((m) =>
      subs.some((s) => m.userData.anat.label.toLowerCase().includes(s)),
    );
    groups.push({ key: node.key, meshes });
  }
  return groups;
}

function clearCircuitTubes() {
  circuitGroup.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (o.material && o.material._owned) o.material.dispose();
    }
  });
  circuitGroup.clear();
  circuitPulses = [];
}

function setActiveCircuit(id) {
  activeCircuit = circuits3d.find((c) => c.id === id) || null;
  clearCircuitTubes();
  circuitMembers = new Set();
  document.querySelectorAll('#circuitlist .circuit-btn').forEach((b) =>
    b.classList.toggle('on', !!activeCircuit && b.dataset.circuit === activeCircuit.id),
  );
  if (!activeCircuit) {
    clearCircuitAnimation({ instant: true });
    updateVisibility();
    return;
  }
  const groups = resolveCircuitMembers(activeCircuit);
  for (const g of groups) for (const m of g.meshes) circuitMembers.add(m);
  // Convert label-match groups to exact label lists, then run the same
  // animated-circuit engine as the disorder lenses: ghosted context, pulsing
  // nodes, directed edges chained in node order (closed loop, modulatory —
  // the same connectivity claim the old overlay tube already made).
  const nodes = [];
  const centers = [];
  for (const g of groups) {
    if (!g.meshes.length) continue;
    const labels = [...new Set(g.meshes.map((m) => m.userData.anat.label))];
    nodes.push({ atlasLabels: labels, precision: 'exact' });
    const box = new THREE.Box3();
    for (const m of g.meshes) box.expandByObject(m);
    centers.push(box.getCenter(new THREE.Vector3()).toArray());
  }
  const edges = centers.length >= 2
    ? centers.map((c, i) => ({
      a: c,
      b: centers[(i + 1) % centers.length],
      from: groups[i].key,
      to: groups[(i + 1) % groups.length].key,
      type: 'modulatory',
    }))
    : [];
  startCircuitAnimation(
    {
      name: activeCircuit.name,
      function: `${activeCircuit.tierCode || ''} · ${activeCircuit.function || ''}`.replace(/^ · /, ''),
      color: activeCircuit.color || '#38BDF8',
      nodes,
      edges,
    },
    { fly: true },
  );
  if (selected && circuitAnim && !circuitAnim.members.has(selected)) clearSelection();
}

// Called from the clinical tab ("Show on 3D brain") and the disorder module.
// Generic, tested viewer API: highlight(atlasRefs, style), setLens-equivalent
// orchestration lives in the caller, flyTo(atlasRef), clear(). No
// disorder-specific code paths in the viewer.
function meshesForLabels(labels) {
  const set = new Set((labels || []).map((s) => String(s).toLowerCase()));
  return anatomyMeshes.filter((m) => set.has(m.userData.anat.label.toLowerCase()));
}

function makeMarkerSprite(text, colorHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10, 13, 17, 0.85)';
  g.strokeStyle = colorHex;
  g.lineWidth = 3;
  if (g.roundRect) {
    g.beginPath();
    g.roundRect(3, 14, 250, 52, 12);
    g.fill();
    g.stroke();
  } else {
    g.fillRect(3, 14, 250, 52);
  }
  g.fillStyle = '#f2f5f7';
  g.font = '600 24px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const short = text.length > 24 ? text.slice(0, 23) + '…' : text;
  g.fillText(short, 128, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  );
  sp.scale.set(labelWorld * 2.6, labelWorld * 0.8, 1);
  return sp;
}

function disposeMarkerGroup() {
  while (markerGroup.children.length) {
    const s = markerGroup.children.pop();
    if (s.material) {
      if (s.material.map) s.material.map.dispose();
      s.material.dispose();
    }
    if (s.geometry) s.geometry.dispose();
  }
}

// ---------- animated circuit mode (generic; driven entirely by data) ----------
// Any caller — disorder lens, legacy circuit list, future compare mode —
// describes {nodes, edges} and the viewer turns the brain into that topic's
// circuit diagram: members at full opacity with a slow emissive pulse,
// everything else a faint ghost, edges as directed 3D paths with flow.
const EDGE_STYLE = {
  excitatory: { color: '#FB923C' }, // warm
  inhibitory: { color: '#38BDF8' }, // cool
  modulatory: { color: '#C084FC' },
};
let circuitAnim = null; // {members, nodeMat, ghostMats, edgeObjs, name, fn}
let animBlend = 0; // eased 0..1 isolation amount (wall-clock tween, not frame-counted)
let blendTween = null; // {from, to, t0, dur} — survives 1fps software rendering
let animTarget = 0;
let animGhostOp = 0.04; // ghost opacity at full isolation (faint but present)
let animPlaying = true;
let animLoopSec = 3; // seconds per full traversal; slider range 1.5–6
let animSimple = false; // static glow: tubes + markers, no moving particles
const REDUCED_MOTION =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let animOptIn = false; // explicit opt-in to motion when reduced-motion is set
let camTween = null;
let fpsEMA = 60;
let fpsLowSince = 0;

// Ghost material per category: the mesh's own tissue look (lobe mode
// honored at build time), transparent, opacity driven by animBlend.
function ghostMatFor(mesh) {
  const cat = mesh.userData.anat.cat;
  const g = circuitAnim.ghostMats;
  if (!g[cat]) {
    const m = baseMaterialFor(mesh).clone();
    m.transparent = true;
    m.depthWrite = false;
    m.clippingPlanes = [slicePlane];
    g[cat] = m;
  }
  return g[cat];
}

function motionAllowed() {
  return !REDUCED_MOTION || animOptIn;
}

// Resolve an edge endpoint name to a world position: schematic marker
// (by marker id or marker label) first, else the centroid of the named
// atlas label(s). Explicit [x,y,z] points bypass resolution (legacy loops).
function edgePoint(name) {
  if (Array.isArray(name)) return new THREE.Vector3(name[0], name[1], name[2]);
  const key = String(name || '');
  for (const s of markerGroup.children) {
    if (!s.userData.markerId) continue;
    if (s.userData.markerId === key || s.userData.markerLabel === key) {
      return s.position.clone();
    }
  }
  const meshes = meshesForLabels([key]);
  if (!meshes.length) return null;
  const box = new THREE.Box3();
  for (const m of meshes) box.expandByObject(m);
  return box.getCenter(new THREE.Vector3());
}

function disposeCircuitAnim() {
  if (!circuitAnim) return;
  for (const e of circuitAnim.edgeObjs) {
    scene.remove(e.group);
    e.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
  circuitAnim.nodeMat.dispose();
  for (const m of Object.values(circuitAnim.ghostMats)) m.dispose();
  circuitAnim = null;
}

function finishClearCircuit() {
  disposeCircuitAnim();
  animBlend = 0;
  animTarget = 0;
  blendTween = null;
  camTween = null;
  refreshMeshMaterials();
  updateVisibility();
  $('circuitBar').hidden = true;
  $('sr-status').textContent = '';
}

function tweenBlendTo(to, durSec = 0.45) {
  blendTween = { from: animBlend, to, t0: performance.now(), dur: durSec * 1000 };
}

function clearCircuitAnimation(opts = {}) {
  if (!circuitAnim) return;
  animTarget = 0;
  if (opts.instant) finishClearCircuit();
  else tweenBlendTo(0);
  // Otherwise the render loop eases animBlend down and calls
  // finishClearCircuit() when the tween completes.
}

// Build one directed 3D path per edge. Reciprocal pairs (A->B plus B->A)
// become two parallel arcs offset in opposite directions, each animating
// its own way — never a single bidirectional line.
function buildEdgeObjects(edges, color) {
  const objs = [];
  const pairCount = {};
  for (const e of edges || []) {
    const k = [String(e.from), String(e.to)].sort().join('||');
    pairCount[k] = (pairCount[k] || 0) + 1;
  }
  const pairSeen = {};
  const toVec = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  for (const e of edges || []) {
    // Explicit world-space endpoints (legacy loops) bypass name resolution.
    const a = e.a ? toVec(e.a) : edgePoint(e.from);
    const b = e.b ? toVec(e.b) : edgePoint(e.to);
    if (!a || !b || a.distanceToSquared(b) < 1e-10) continue;
    const style = EDGE_STYLE[e.type] || EDGE_STYLE.modulatory;
    const k = [String(e.from), String(e.to)].sort().join('||');
    const idx = pairSeen[k] || 0;
    pairSeen[k] = idx + 1;
    const dir = b.clone().sub(a);
    const len = Math.max(dir.length(), 1e-6);
    dir.normalize();
    // Perpendicular in the horizontal plane (fall back to X when vertical).
    let perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
    perp.normalize();
    const off = pairCount[k] > 1
      ? (idx === 0 ? 1 : -1) * modelSize * 0.009
      : modelSize * 0.004;
    const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(perp, off);
    mid.y += modelSize * 0.004;
    const curve = new THREE.CatmullRomCurve3([a, mid, b], false, 'centripetal', 0.5);
    const group = new THREE.Group();
    const tubeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(style.color),
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, modelSize * 0.0032, 8, false), tubeMat);
    tube.userData.edge = e;
    group.add(tube);
    // Invisible fat hit-proxy: thin tubes are nearly unclickable, so
    // raycasts test this instead. colorWrite off = renders nothing.
    const proxy = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 12, modelSize * 0.011, 6, false),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }),
    );
    proxy.userData.edge = e;
    proxy.renderOrder = -1;
    group.add(proxy);
    // Direction + type encoding at the target end: arrowhead for
    // excitatory, blunt disc for inhibitory, diamond for modulatory.
    const end = curve.getPointAt(1);
    const tan = curve.getTangentAt(1).normalize();
    let tip;
    if (e.type === 'inhibitory') {
      tip = new THREE.Mesh(
        new THREE.CylinderGeometry(modelSize * 0.006, modelSize * 0.006, modelSize * 0.0025, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(style.color) }),
      );
      tip.position.copy(end);
      tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    } else if (e.type === 'excitatory') {
      tip = new THREE.Mesh(
        new THREE.ConeGeometry(modelSize * 0.005, modelSize * 0.013, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(style.color) }),
      );
      tip.position.copy(end).addScaledVector(tan, modelSize * 0.004);
      tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    } else {
      tip = new THREE.Mesh(
        new THREE.OctahedronGeometry(modelSize * 0.005),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(style.color) }),
      );
      tip.position.copy(end);
    }
    tip.userData.edge = e;
    group.add(tip);
    const pulses = [];
    if (motionAllowed() && !animSimple) {
      for (let i = 0; i < 2; i++) {
        const p = new THREE.Mesh(
          new THREE.SphereGeometry(modelSize * 0.0045, 10, 8),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(style.color) }),
        );
        p.userData.edge = e;
        group.add(p);
        pulses.push({ mesh: p, t: i / 2 });
      }
    }
    scene.add(group);
    objs.push({ curve, group, pulses, edge: e });
  }
  return objs;
}

function describeAnimForSR() {
  if (!circuitAnim) return '';
  const names = circuitAnim.memberNames.slice(0, 12).join(', ');
  const more = circuitAnim.memberNames.length > 12 ? ` and ${circuitAnim.memberNames.length - 12} more` : '';
  return `${circuitAnim.name || 'Circuit'}: ${circuitAnim.edgeObjs.length} connection${circuitAnim.edgeObjs.length === 1 ? '' : 's'} across ${circuitAnim.memberNames.length} structures (${names}${more}).`;
}

function startCircuitAnimation(input, opts = {}) {
  clearCircuitAnimation({ instant: true });
  const members = new Set();
  const memberNames = [];
  for (const n of input.nodes || []) {
    for (const m of meshesForLabels(n.atlasLabels || [])) {
      if (!members.has(m)) {
        members.add(m);
        memberNames.push(m.userData.anat.label);
      }
    }
  }
  for (const m of meshesForLabels(input.extraLabels || [])) {
    if (!members.has(m)) {
      members.add(m);
      memberNames.push(m.userData.anat.label);
    }
  }
  if (!members.size) return false;
  const color = new THREE.Color(input.color || '#F59E0B');
  const nodeMat = new THREE.MeshStandardMaterial({
    color: color.clone(),
    emissive: color.clone(),
    emissiveIntensity: 0.5,
    roughness: 0.45,
    metalness: 0.0,
    side: THREE.DoubleSide,
    clippingPlanes: [slicePlane],
  });
  circuitAnim = {
    members,
    memberNames: [...new Set(memberNames)].sort(),
    nodeMat,
    ghostMats: {},
    edgeObjs: [],
    name: input.name || 'Circuit',
    fn: input.function || '',
    _input: input,
  };
  circuitAnim.edgeObjs = buildEdgeObjects(input.edges || [], color);
  animTarget = 1;
  // Reduced-motion users get the static highlighted state immediately;
  // motion only runs after explicit opt-in.
  if (motionAllowed() && !animSimple) {
    animBlend = 0;
    tweenBlendTo(1);
  } else {
    animBlend = 1;
    blendTween = null;
  }
  animPlaying = motionAllowed() && !animSimple;
  fpsEMA = 60;
  fpsLowSince = 0;
  updateAnimControls();
  $('circuitName').textContent = circuitAnim.name;
  $('circuitInfo').textContent = circuitAnim.fn || `${circuitAnim.edgeObjs.length} connections`;
  $('circuitBar').hidden = false;
  if (selected && !members.has(selected)) clearSelection();
  updateVisibility();
  refreshMeshMaterials();
  $('sr-status').textContent = describeAnimForSR();
  if (opts.fly !== false) {
    const v = window.__neuroMap;
    if (v && v.flyToMeshes) v.flyToMeshes([...members]);
  }
  return true;
}

// Rebuild edge objects in place (tubes + tips + pulses) when the motion
// regime changes — simple-mode toggle or reduced-motion opt-in — without
// touching members, ghost materials, or camera. The ghost is already fully
// blended in, so no fade is replayed.
function rebuildAnimEdges() {
  if (!circuitAnim) return;
  for (const e of circuitAnim.edgeObjs) {
    scene.remove(e.group);
    e.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
  const color = `#${circuitAnim.nodeMat.color.getHexString()}`;
  circuitAnim.edgeObjs = buildEdgeObjects(circuitAnim._input.edges || [], color);
  animBlend = 1;
  blendTween = null;
}

function updateAnimControls() {
  const play = $('animPlay');
  if (play) {
    play.textContent = animPlaying ? '⏸ Pause' : '▶ Play';
    play.disabled = !motionAllowed() || animSimple;
  }
  const speed = $('animSpeed');
  if (speed) {
    speed.value = String(animLoopSec);
    speed.disabled = !motionAllowed() || animSimple;
  }
  const simple = $('animSimple');
  if (simple) simple.textContent = `Simple: ${animSimple ? 'on' : 'off'}`;
  const ghost = $('animGhost');
  if (ghost) {
    ghost.value = String(Math.round(animGhostOp * 100));
    $('animGhostVal').textContent = `${Math.round(animGhostOp * 100)}%`;
  }
  const opt = $('animOptIn');
  if (opt) opt.hidden = !REDUCED_MOTION;
  if (opt) opt.textContent = animOptIn ? 'Motion: on' : 'Motion: off';
}

// Smooth recenter that never locks the user out: any manual orbit/zoom
// input cancels the tween via the controls 'start' listener below.
function smoothRecenter() {
  if (!circuitAnim || !circuitAnim.members.size) return;
  const box = new THREE.Box3();
  for (const m of circuitAnim.members) box.expandByObject(m);
  const center = box.getCenter(new THREE.Vector3());
  const size = Math.max(box.getSize(new THREE.Vector3()).length(), 0.02);
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-6) dir.set(0.55, 0.32, 1);
  dir.normalize();
  camTween = {
    p0: camera.position.clone(),
    t0: controls.target.clone(),
    p1: center.clone().addScaledVector(dir, Math.max(size * 2.4, 0.12)),
    t1: center,
    s: 0,
    dur: 0.6,
  };
}

window.__neuroMap = Object.assign(window.__neuroMap || {}, {
  showCircuit(id) {
    setActiveCircuit(id);
  },
  // Items: [{ labels: [...exact manifest labels...], color: '#hex' }]
  highlight(items) {
    hlTint.clear();
    for (const it of items || []) {
      const mat = highlightMaterial(it.color || '#F59E0B');
      for (const m of meshesForLabels(it.labels)) hlTint.set(m, mat);
    }
    refreshMeshMaterials();
  },
  clearHighlight() {
    hlTint.clear();
    refreshMeshMaterials();
  },
  // Isolation filter through the tested visibility path (null restores).
  isolateMeshes(meshes) {
    matchSet = meshes ? new Set(meshes) : null;
    updateVisibility();
  },
  meshesForLabels,
  flyToMeshes(meshes) {
    const list = (meshes || []).filter(Boolean);
    if (!list.length) return;
    const box = new THREE.Box3();
    for (const m of list) box.expandByObject(m);
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(box.getSize(new THREE.Vector3()).length(), 0.02);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0.55, 0.32, 1);
    dir.normalize();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, Math.max(size * 2.2, 0.12));
  },
  centroidOfLabels(labels) {
    const meshes = meshesForLabels(labels);
    if (!meshes.length) return null;
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    const c = box.getCenter(new THREE.Vector3());
    return [c.x, c.y, c.z];
  },
  // Generic schematic tubes (e.g. disorder circuit edges). Points are
  // world-space [x,y,z] triples from centroidOfLabels/markerPositions.
  drawTube({ centers, color, closed, radius }) {
    if (!centers || centers.length < 2) return null;
    const pts = centers.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, !!closed, 'centripetal', 0.6);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color || '#F59E0B'),
      transparent: true,
      opacity: 0.85,
    });
    mat._owned = true;
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, radius || modelSize * 0.004, 8, !!closed),
      mat,
    );
    markerGroup.add(mesh);
    return mesh;
  },
  markerPositions() {
    const out = {};
    for (const s of markerGroup.children) {
      if (s.userData.markerId) out[s.userData.markerId] = [s.position.x, s.position.y, s.position.z];
    }
    return out;
  },
  // Schematic markers for nuclei the atlas cannot resolve (VTA, raphe, LC).
  // defs: [{ id, label, anchorAtlasLabel, offset:[x,y,z], color }]
  showMarkers(defs) {
    for (const d of defs || []) {
      const anchors = meshesForLabels([d.anchorAtlasLabel]);
      if (!anchors.length) continue;
      const box = new THREE.Box3();
      for (const m of anchors) box.expandByObject(m);
      const c = box.getCenter(new THREE.Vector3());
      const o = d.offset || [0, 0, 0];
      const sp = makeMarkerSprite(d.label || d.id, d.color || '#F59E0B');
      sp.position.set(c.x + o[0], c.y + o[1], c.z + o[2]);
      sp.userData.markerId = d.id;
      sp.userData.markerLabel = d.label || d.id;
      markerGroup.add(sp);
    }
  },
  clearMarkers() {
    disposeMarkerGroup();
  },
  // Animated circuit mode. circuit: {name?, function?, color?,
  // nodes:[{atlasLabels?, markerId?, precision?}], edges:[{from,to,
  // type?:'excitatory'|'inhibitory'|'modulatory', transmitter?} or
  // {a:[x,y,z], b:[x,y,z], type?}], extraLabels?[]}.
  // opts: {speed? (loop seconds, default 3), fly? (default true)}.
  animateCircuit(circuit, opts) {
    return startCircuitAnimation(circuit || {}, opts || {});
  },
  clearCircuitAnimation(opts) {
    clearCircuitAnimation(opts || {});
  },
  circuitPlaying() {
    return animPlaying;
  },
  setCircuitPlaying(on) {
    animPlaying = !!on && motionAllowed() && !animSimple;
    updateAnimControls();
  },
  setCircuitSpeed(sec) {
    animLoopSec = Math.min(6, Math.max(1.5, Number(sec) || 3));
    updateAnimControls();
  },
  // Ghost/context opacity while a circuit is active: 0 = context hidden
  // entirely, 0.35 = heavy context. Applied on the next frame, so it is live.
  setCircuitGhost(op) {
    const n = Number(op);
    animGhostOp = Math.min(0.35, Math.max(0, Number.isFinite(n) ? n : 0.04));
    updateAnimControls();
  },
  circuitGhostOpacity() {
    return animGhostOp;
  },
  setCircuitSimple(on) {
    animSimple = !!on;
    if (animSimple) animPlaying = false;
    else animPlaying = motionAllowed();
    rebuildAnimEdges();
    updateAnimControls();
  },
  recenterCircuit() {
    smoothRecenter();
  },
  highlightedNames() {
    return circuitAnim ? circuitAnim.memberNames.slice() : [];
  },
  // Introspection for automated checks and future compare mode: counts and
  // state only, no scene internals leak.
  circuitDebug() {
    if (!circuitAnim) return null;
    return {
      members: circuitAnim.members.size,
      edges: circuitAnim.edgeObjs.length,
      pulses: circuitAnim.edgeObjs.reduce((n, e) => n + e.pulses.length, 0),
      blend: Math.round(animBlend * 100) / 100,
      playing: animPlaying,
      simple: animSimple,
      loopSec: animLoopSec,
      ghostOp: animGhostOp,
      reducedMotion: REDUCED_MOTION,
    };
  },
  renderQuality() {
    return { quality: Math.round(renderQuality * 100) / 100, fps: Math.round(qEMA) };
  },
  cameraState() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      pos: [r(camera.position.x), r(camera.position.y), r(camera.position.z)],
      tgt: [r(controls.target.x), r(controls.target.y), r(controls.target.z)],
    };
  },
  restoreCamera(pos, tgt) {
    camTween = {
      p0: camera.position.clone(),
      t0: controls.target.clone(),
      p1: new THREE.Vector3(pos[0], pos[1], pos[2]),
      t1: new THREE.Vector3(tgt[0], tgt[1], tgt[2]),
      s: 0,
      dur: 0.6,
    };
  },
  clear() {
    hlTint.clear();
    matchSet = null;
    clearCircuitAnimation({ instant: true });
    disposeMarkerGroup();
    refreshMeshMaterials();
    updateVisibility();
  },
});

function allMats() {
  return [
    ...Object.values(baseMats),
    ...Object.values(hoverMats),
    ...Object.values(selectMats),
    ...Object.values(lobeMats),
    ...Object.values(funcMats),
    ...Object.values(hlMats),
    ...labelMats,
  ];
}

function makeLabelSprite(mesh) {
  const anat = mesh.userData.anat;
  const side = anat.side === 'left' ? 'L' : anat.side === 'right' ? 'R' : '';
  const text = side ? `${anat.label} ${side}` : anat.label;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10, 13, 17, 0.78)';
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(3, 6, 250, 52, 10);
  g.fill();
  g.stroke();
  g.fillStyle = '#f2f5f7';
  g.font = '600 25px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const short = text.length > 26 ? text.slice(0, 25) + '…' : text;
  g.fillText(short, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    clippingPlanes: [slicePlane],
  });
  labelMats.add(mat);
  const sp = new THREE.Sprite(mat);
  sp.scale.set(labelWorld * 2.4, labelWorld * 0.6, 1);
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  center.y += box.getSize(new THREE.Vector3()).y * 0.5 + labelWorld * 0.5;
  sp.position.copy(center);
  sp.visible = false;
  mesh.userData.sprite = sp;
  scene.add(sp);
  return sp;
}

function applySlice() {
  // Slice state lives entirely in slicePlane's normal/constant (shared live
  // by every material), so toggling never recompiles shaders.
  if (sliceMode === 'off' || !sliceBounds) {
    slicePlane.normal.set(0, 1, 0);
    slicePlane.constant = 1e10;
    return;
  }
  const normals = {
    x: new THREE.Vector3(1, 0, 0), // sagittal
    z: new THREE.Vector3(0, 0, 1), // coronal
    y: new THREE.Vector3(0, 1, 0), // axial / horizontal
  };
  const [lo, hi] = sliceBounds[sliceMode];
  const pad = (hi - lo) * 0.02;
  const c = hi + pad - sliceT * (hi - lo + pad * 2);
  slicePlane.normal.copy(normals[sliceMode]);
  slicePlane.constant = -c;
}

function applyCortexOpacity(v) {
  cortexOpacity = v;
  const mats = [baseMats.cortex, ...Object.values(lobeMats)].filter(Boolean);
  if (!mats.length) return;
  $('opval').textContent = `${Math.round(v * 100)}%`;
  for (const mat of mats) {
    if (v >= 0.999) {
      mat.opacity = 1;
      mat.transparent = false;
      mat.depthWrite = true;
    } else {
      mat.opacity = v;
      mat.transparent = true;
      mat.depthWrite = v >= 0.35;
    }
    mat.needsUpdate = true;
  }
}

$('cortexOpacity').addEventListener('input', (e) => {
  applyCortexOpacity(e.target.value / 100);
});
$('isolateBtn').addEventListener('click', () => {
  $('cortexOpacity').value = 8;
  applyCortexOpacity(0.08);
});
$('resetBtn').addEventListener('click', () => {
  camera.position.copy(homePos);
  controls.target.copy(homeTarget);
});
$('spinToggle').addEventListener('change', (e) => {
  spinWanted = e.target.checked;
  controls.autoRotate = spinWanted;
});

// ---------- load ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  loadfill.style.width = `${Math.round((loaded / total) * 100)}%`;
};

function buildCircuitList() {
  const list = $('circuitlist');
  list.innerHTML = '';
  for (const c of circuits3d) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'circuit-btn';
    b.dataset.circuit = c.id;
    const hex = c.color || '#38BDF8';
    b.innerHTML = `<span class="dot" style="background:${hex}"></span><span></span>`;
    b.querySelector('span:last-child').textContent = c.name;
    b.title = c.function || c.name;
    b.addEventListener('click', () => {
      setActiveCircuit(activeCircuit && activeCircuit.id === c.id ? null : c.id);
    });
    list.appendChild(b);
  }
}

// Unified clear for the circuit bar: works for legacy circuits and for
// disorder-lens animations alike.
function wireCircuitBar() {
  $('circuitClear').addEventListener('click', () => {
    activeCircuit = null;
    document.querySelectorAll('#circuitlist .circuit-btn').forEach((b) => b.classList.remove('on'));
    clearCircuitAnimation();
  });
  $('animPlay').addEventListener('click', () => {
    const v = window.__neuroMap;
    if (v && v.circuitPlaying) v.setCircuitPlaying(!v.circuitPlaying());
  });
  $('animSpeed').addEventListener('input', (e) => {
    const v = window.__neuroMap;
    if (v && v.setCircuitSpeed) v.setCircuitSpeed(e.target.value);
  });
  $('animRecenter').addEventListener('click', () => {
    const v = window.__neuroMap;
    if (v && v.recenterCircuit) v.recenterCircuit();
  });
  // Live ghost opacity: 0 = no context at all, 35% = full context weight.
  $('animGhost').addEventListener('input', (e) => {
    const v = window.__neuroMap;
    if (v && v.setCircuitGhost) v.setCircuitGhost(Number(e.target.value) / 100);
  });
  $('animSimple').addEventListener('click', () => {
    animSimple = !animSimple;
    if (animSimple) animPlaying = false;
    else animPlaying = motionAllowed();
    const v = window.__neuroMap;
    if (v && v.setCircuitSimple && circuitAnim) {
      // Rebuild through the public setter so edge pulses appear/disappear.
      v.setCircuitSimple(animSimple);
    } else {
      updateAnimControls();
    }
  });
  $('animOptIn').addEventListener('click', () => {
    animOptIn = !animOptIn;
    if (animOptIn && !animSimple) animPlaying = true;
    rebuildAnimEdges();
    updateAnimControls();
    $('sr-status').textContent = animOptIn
      ? 'Motion enabled for circuit animation.'
      : 'Motion off. Static highlighted circuit.';
  });
}

function wireViewerUI() {
  $('cardClose').addEventListener('click', clearSelection);
  $('focusBtn').addEventListener('click', () => {
    if (selected) focusOn(selected);
  });
  $('shareBtn').addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      $('shareBtn').textContent = 'Copied!';
    } catch {
      $('shareBtn').textContent = url;
    }
    setTimeout(() => {
      $('shareBtn').textContent = 'Share link';
    }, 2000);
  });

  // ----- search: isolate matches, click result to inspect -----
  // Results rank label-prefix first, then word-prefix, then substring, then
  // other indexed fields; ArrowUp/Down + Enter walks the list without a mouse.
  // (foldText lives at module scope so the index build folds identically.)
  const searchInput = $('search');
  const resultsBox = $('results');
  resultsBox.setAttribute('role', 'listbox');
  resultsBox.setAttribute('aria-label', 'Matching structures');
  let searchActive = 0;
  // Viewer controls join the same index by carrying data-search in index.html,
  // named by their own visible label (aliases optional). A pick clicks the
  // real control, so search owns no second definition of what it does.
  const controlIndex = () => [...document.querySelectorAll('[data-search]')].map((el) => ({
    el,
    label: (el.textContent || '').trim(),
    aliases: (el.getAttribute('data-search') || '').trim(),
  })).filter((c) => c.label && !c.el.disabled && c.el.offsetParent !== null);
  function renderSearch(matches, controls, qFold) {
    resultsBox.hidden = false;
    resultsBox.innerHTML = '';
    const count = document.createElement('div');
    count.className = 'count';
    const n = matches.length + controls.length;
    count.textContent = n === 0 ? 'No structures found' : `${n} match${n === 1 ? '' : 'es'}`;
    resultsBox.appendChild(count);
    const addBtn = (text, tag, onPick, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', idx === searchActive ? 'true' : 'false');
      if (idx === searchActive) b.classList.add('active');
      b.innerHTML = '';
      b.append(document.createTextNode(text));
      if (tag) {
        const t = document.createElement('small');
        t.textContent = ` · ${tag}`;
        b.append(t);
      }
      b.addEventListener('click', onPick);
      b.dataset.searchIdx = String(idx);
      resultsBox.appendChild(b);
      return b;
    };
    let idx = 0;
    for (const c of controls.slice(0, 5)) {
      const b = addBtn(c.label, 'control', () => c.el.click(), idx);
      if (idx === searchActive) b.scrollIntoView({ block: 'nearest' });
      idx += 1;
    }
    for (const e of matches.slice(0, 40)) {
      const a = e.mesh.userData.anat;
      const b = addBtn(`${a.label}${a.side === 'left' || a.side === 'right' ? ` (${a.side})` : ''}`, '', () => {
        select(e.mesh);
        focusOn(e.mesh);
      }, idx);
      if (idx === searchActive) b.scrollIntoView({ block: 'nearest' });
      idx += 1;
    }
    return idx;
  }
  let searchTotal = 0;
  searchInput.addEventListener('input', () => {
    const qFold = foldText(searchInput.value);
    searchActive = 0;
    if (!qFold) {
      matchSet = null;
      resultsBox.hidden = true;
      resultsBox.innerHTML = '';
      updateVisibility();
      return;
    }
    const qFlat = qFold.replace(/ /g, '');
    const ranked = [];
    for (const e of searchIndex) {
      const labelFold = e.labelFold;
      let rank = -1;
      if (labelFold.startsWith(qFold)) rank = 0;
      else if (labelFold.split(' ').some((w) => w.startsWith(qFold))) rank = 1;
      else if (labelFold.includes(qFold)) rank = 2;
      else if (e.hayFold.includes(qFold)) rank = 3;
      else if (qFlat && (labelFold.replace(/ /g, '').includes(qFlat) || e.hayFold.replace(/ /g, '').includes(qFlat))) rank = 4;
      if (rank >= 0) ranked.push({ e, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank);
    const matches = ranked.map((r) => r.e);
    const controls = controlIndex().filter((c) => {
      const hay = foldText(`${c.label} ${c.aliases}`);
      return hay.includes(qFold) || (qFlat && hay.replace(/ /g, '').includes(qFlat));
    });
    matchSet = matches.length ? new Set(matches.map((e) => e.mesh)) : null;
    updateVisibility();
    searchTotal = renderSearch(matches, controls, qFold);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    if (resultsBox.hidden || searchTotal === 0) return;
    e.preventDefault();
    if (e.key === 'Enter') {
      const b = resultsBox.querySelector(`[data-search-idx="${searchActive}"]`);
      if (b) b.click();
      return;
    }
    searchActive = (searchActive + (e.key === 'ArrowDown' ? 1 : -1) + searchTotal) % searchTotal;
    resultsBox.querySelectorAll('[role="option"]').forEach((b) => {
      const on = Number(b.dataset.searchIdx) === searchActive;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) b.scrollIntoView({ block: 'nearest' });
    });
  });

  // ----- labels -----
  $('labelToggle').addEventListener('change', (e) => {    labelsOn = e.target.checked;
    if (labelsOn) {
      for (const m of anatomyMeshes) {
        if (!m.userData.sprite) makeLabelSprite(m);
      }
    }
    updateVisibility();
  });

  // ----- slice plane: sagittal / coronal / axial incisions -----
  // NOTE: scoped to [data-slice] only — hemisphere and camera buttons share
  // the .seg style but must not trigger slice logic (their dataset.slice is
  // undefined, which previously threw and mangled toggle highlights).
  const segBtns = [...document.querySelectorAll('[data-slice]')];
  const sliceSlider = $('slicePos');
  segBtns.forEach((b) => {
    b.addEventListener('click', () => {
      segBtns.forEach((x) => x.classList.toggle('on', x === b));
      sliceMode = b.dataset.slice;
      sliceSlider.disabled = sliceMode === 'off';
      applySlice();
    });
  });
  sliceSlider.addEventListener('input', () => {
    sliceT = sliceSlider.value / 100;
    applySlice();
  });

  // ----- hemisphere filter -----
  const hemiBtns = [...document.querySelectorAll('[data-hemi]')];
  hemiBtns.forEach((b) => {
    b.addEventListener('click', () => {
      hemiBtns.forEach((x) => x.classList.toggle('on', x === b));
      hemi = b.dataset.hemi;
      updateVisibility();
    });
  });

  // ----- lobe colors -----
  $('lobeBtn').addEventListener('click', () => {
    lobeMode = !lobeMode;
    // Symmetric with the function mode: turning one on turns the other off, so
    // the two teaching colour schemes can never both be telling a story.
    if (lobeMode && funcMode) {
      funcMode = false;
      funcIsolate = null;
      $('funcBtn').textContent = 'Function colors: off';
      $('funcLegendWrap').hidden = true;
    }
    $('lobeBtn').textContent = `Lobe colors: ${lobeMode ? 'on' : 'off'}`;
    refreshMeshMaterials();
  });

  // ----- function colors -----
  // The legend is the authoritative key. With fourteen groups, hue alone is not
  // a reliable cue for a colour-blind reader, so every group is named in text
  // here and repeated in the structure card. The "other" row is labelled
  // "not classified" rather than being hidden, so the reader knows the
  // grouping is a teaching aid and not an exhaustive claim.
  function funcCounts() {
    const counts = new Map();
    for (const m of anatomyMeshes) {
      const s = m.userData.anat.funcSystem;
      if (s) counts.set(s, (counts.get(s) || 0) + 1);
    }
    return counts;
  }

  function renderFuncLegend() {
    const host = $('funcLegend');
    const wrap = $('funcLegendWrap');
    if (!host || !funcSys) { if (wrap) wrap.hidden = true; return; }
    if (wrap) {
      // A collapsed <details> renders its children but does not let them take
      // keyboard focus, so expand it whenever the legend is shown.
      wrap.hidden = false;
      wrap.open = true;
    }
    const counts = funcCounts();
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    host.hidden = false;
    host.innerHTML = (funcSys.systems || [])
      .filter((s) => counts.has(s.id))
      .map((s) => {
        const n = counts.get(s.id);
        const pct = total ? Math.round((n / total) * 100) : 0;
        const on = funcIsolate === s.id ? ' on' : '';
        const dim = funcIsolate && funcIsolate !== s.id ? ' dim' : '';
        return `<button type="button" class="frow${on}${dim}" data-func="${escHtml(s.id)}"`
          + ` title="${escHtml(s.blurb)} - ${n} structures (${pct}%)">`
          + `<span class="fswatch" style="background:${escHtml(s.color)}"></span>`
          + `<span class="flabel">${escHtml(s.label)}</span>`
          + `<span class="fcount">${n}</span></button>`;
      })
      .join('')
      + `<p class="fnote">Teaching grouping derived from structure names and the atlas`
      + ` function notes. Not an official parcellation. Vessels, cranial nerves and`
      + ` meninges keep their category colour.</p>`;
    host.querySelectorAll('[data-func]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.func;
        // Clicking the active row clears the solo, so the legend is a toggle.
        funcIsolate = funcIsolate === id ? null : id;
        if (funcIsolate && selected && selected.userData.anat.funcSystem !== funcIsolate) clearSelection();
        updateVisibility();
        renderFuncLegend();
        const sys = (funcSys.systems || []).find((x) => x.id === funcIsolate);
        $('sr-status').textContent = funcIsolate
          ? `Isolated ${sys ? sys.label : funcIsolate}, ${counts.get(funcIsolate) || 0} structures.`
          : 'Showing all structures.';
      });
    });
  }

  $('funcBtn').addEventListener('click', () => {
    funcMode = !funcMode;
    // The two teaching colour modes are mutually exclusive, so the brain is
    // never telling two different stories at once.
    if (funcMode) {
      lobeMode = false;
      $('lobeBtn').textContent = 'Lobe colors: off';
    }
    $('funcBtn').textContent = `Function colors: ${funcMode ? 'on' : 'off'}`;
    refreshMeshMaterials();
    if (funcMode) {
      renderFuncLegend();
      $('funcLegendWrap').open = true;
    } else {
      funcIsolate = null;
      updateVisibility();
      $('funcLegendWrap').hidden = true;
    }
  });
  $('funcBtn').disabled = !funcSys;
  $('funcLegendWrap').hidden = true;

  // ----- preset camera views -----
  document.querySelectorAll('[data-view3d]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!modelBBox) return;
      const c = modelBBox.getCenter(new THREE.Vector3());
      const dirs = {
        front: [0.05, 0.12, 1],
        side: [1, 0.12, 0.08],
        top: [0, 1, 0.08],
        home: [0.55, 0.32, 1],
      };
      const v = new THREE.Vector3(...(dirs[b.dataset.view3d] || dirs.home)).normalize();
      camera.position.copy(c).addScaledVector(v, modelSize * 1.35);
      controls.target.copy(c);
    });
  });

  // ----- isolate selected structure -----
  let isolated = null;
  const isoBtn = $('isolateBtn2');
  isoBtn.addEventListener('click', () => {
    if (!selected) return;
    if (isolated === selected) {
      isolated = null;
      matchSet = null;
      isoBtn.textContent = 'Isolate';
    } else {
      isolated = selected;
      matchSet = new Set([selected]);
      isoBtn.textContent = 'Show all';
    }
    updateVisibility();
  });
  const resetIsolate = () => {
    isolated = null;
    matchSet = null;
    isoBtn.textContent = 'Isolate';
  };
  $('cardClose').addEventListener('click', resetIsolate);

  // ----- screenshot for teaching / presentations -----
  $('shotBtn').addEventListener('click', () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'neuromap-brain-3d.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });

  // ----- arrow keys drive cortex opacity (outside form fields) -----
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const slider = $('cortexOpacity');
    const next = Math.min(
      100,
      Math.max(0, Number(slider.value) + (e.key === 'ArrowUp' ? 5 : -5)),
    );
    slider.value = String(next);
    applyCortexOpacity(next / 100);
  });
}

async function init() {
  loadmsg.textContent = 'Fetching metadata';
  const [manifest, funcs, circuitsFile, funcSpec] = await Promise.all([
    (await fetch(MANIFEST_URL)).json(),
    (await fetch(FUNCTIONS_URL)).json().catch(() => ({})),
    (await fetch(CIRCUITS_URL)).json().catch(() => ({ circuits: [] })),
    (await fetch(FUNCSYS_URL)).json().catch(() => null),
  ]);
  functions = funcs;
  if (funcSpec && Array.isArray(funcSpec.systems)) {
    funcSys = funcSpec;
    // Build the resolver before meshes are created, so anat.funcSystem is
    // populated in one pass rather than recomputed per hover.
    const inScope = new Set(funcSys.appliesToCategories || []);
    const override = funcSys.categoryOverrides || {};
    const rules = (funcSys.rules || []).map((r) => ({
      system: r.system,
      any: r.any.map((p) => p.toLowerCase()),
    }));
    funcSystemOf = (anat) => {
      if (!inScope.has(anat.cat)) return null;
      // No manifest record: the category above is a fallback, so the honest
      // answer is "not classified" rather than a rule match on a guessed name.
      if (anat.inManifest === false) return 'other';
      if (override[anat.cat]) return override[anat.cat];
      const hay = `${anat.label} ${functions[String(anat.id)] || ''}`.toLowerCase();
      for (const r of rules) {
        if (r.any.some((p) => hay.includes(p))) return r.system;
      }
      return 'other';
    };
  }
  circuits3d = circuitsFile.circuits || [];
  for (const n of manifest.nodes) manifestById.set(n.id, n);

  $('stats').textContent =
    `${manifest.nodes.length} structures · ${Object.keys(manifest.categories || {}).length} systems`;

  // Category toggles.
  const catlist = $('catlist');
  const cats = manifest.categories || {};
  for (const [catId, info] of Object.entries(cats)) {
    const style = CATEGORY_STYLE[catId] || {};
    const hex = `#${new THREE.Color(style.color ?? 0x999999).getHexString()}`;
    const label = document.createElement('label');
    label.innerHTML =
      `<input type="checkbox" checked data-cat="${catId}" />` +
      `<span class="dot" style="background:${hex}"></span>` +
      `<span>${info.label || catId} (${info.count ?? 0})</span>`;
    catlist.appendChild(label);
  }
  catlist.addEventListener('change', (e) => {
    const cat = e.target.dataset.cat;
    if (!cat) return;
    catState[cat] = e.target.checked;
    updateVisibility();
    if (selected && !selected.visible) clearSelection();
  });

  // Model.
  loadmsg.textContent = 'Fetching 3D model';
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(draco);

  const gltf = await loader.loadAsync(MODEL_URL);
  const model = gltf.scene;

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    // glTF extras land on Object3D.userData; meshes inherit via ancestors.
    let node = obj;
    let extra = null;
    while (node) {
      if (node.userData && node.userData.bx_id !== undefined) {
        extra = node.userData;
        break;
      }
      node = node.parent;
    }
    if (!extra) return;
    const rec = manifestById.get(extra.bx_id);
    const cat = extra.bx_cat || (rec && rec.category) || 'cortex';
    const anat = {
      id: extra.bx_id,
      label: extra.bx_label || (rec && rec.label) || obj.name,
      side: extra.bx_side || (rec && rec.side) || '',
      cat,
      region: extra.bx_region || (rec && rec.region) || '',
      parent: extra.bx_parent || (rec && rec.parent) || '',
      decussation: extra.bx_decussation || (rec && rec.decussation) || '',
      ta2: (rec && rec.ta2) || [],
      source: extra.bx_source || (rec && rec.source) || '',
    };
    // The GLB carries more meshes than the manifest describes. Anything with
    // no manifest record falls back to cat 'cortex' above, which is an assumption,
    // so it is flagged here and never given a functional system on that basis.
    anat.inManifest = !!rec;
    // Resolved once here so the card, the legend and the 3D colour all agree.
    anat.funcSystem = funcSystemOf ? funcSystemOf(anat) : null;
    if (!baseMats[cat]) baseMats[cat] = tissueMaterial(cat);
    obj.material = baseMats[cat];
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.userData.anat = anat;
    searchIndex.push({
      mesh: obj,
      labelFold: foldText(anat.label),
      hayFold: foldText(`${anat.label} ${anat.region} ${anat.parent} ${(CATEGORY_STYLE[cat] || {}).label || cat}`),
      hay: `${anat.label} ${anat.region} ${anat.parent} ${(CATEGORY_STYLE[cat] || {}).label || cat}`.toLowerCase(),
    });
    anatomyMeshes.push(obj);
    if (!meshesByCat.has(cat)) meshesByCat.set(cat, []);
    meshesByCat.get(cat).push(obj);
  });

  scene.add(model);

  // Frame the specimen.
  const bbox = new THREE.Box3().setFromObject(model);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3()).length();
  const dir = new THREE.Vector3(0.55, 0.32, 1).normalize();
  homeTarget.copy(center);
  homePos.copy(center).addScaledVector(dir, size * 1.35);
  camera.position.copy(homePos);
  controls.target.copy(homeTarget);
  camera.near = size / 1000;
  camera.far = size * 100;
  camera.updateProjectionMatrix();

  sliceBounds = {
    x: [bbox.min.x, bbox.max.x],
    y: [bbox.min.y, bbox.max.y],
    z: [bbox.min.z, bbox.max.z],
  };
  labelWorld = size * 0.028;
  modelBBox = bbox;
  modelSize = size;
  applySlice(); // sync plane in case slice was toggled while loading

  wireViewerUI();
  applyCortexOpacity(1);
  buildCircuitList();
  wireCircuitBar();

  // Deep link: #s=<manifest id> reopens an exact shared view.
  const deep = /^#s=(\d+)$/.exec(window.location.hash || '');
  if (deep) {
    const target = anatomyMeshes.find((m) => String(m.userData.anat.id) === deep[1]);
    if (target) {
      select(target, false);
      focusOn(target);
    }
  }

  loadmsg.textContent = 'Ready';
  loaderEl.classList.add('done');
}

init().catch((err) => {
  console.error(err);
  loadmsg.textContent = `Failed to load: ${err.message}`;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  const rawDt = animClock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  if (circuitAnim) {
    // Eased isolation in both directions (~450ms wall-clock, so even a
    // 1fps software renderer completes the transition instead of stalling
    // on frame-counted easing). Finishing a clear restores full-brain
    // materials only once the fade completes.
    if (blendTween) {
      const p = Math.min((performance.now() - blendTween.t0) / blendTween.dur, 1);
      const e = p * p * (3 - 2 * p);
      animBlend = blendTween.from + (blendTween.to - blendTween.from) * e;
      if (p >= 1) {
        blendTween = null;
        if (animTarget === 0) finishClearCircuit();
      }
    }
    if (circuitAnim) {
      const ease = animBlend * animBlend * (3 - 2 * animBlend);
      // Ghost target comes from the user-facing slider (default 0.04, range
      // 0 = fully hidden context, 0.35 = heavy context), never a hard-coded
      // 0.08, so "how transparent" is a live decision rather than a constant.
      const op = 1 + (animGhostOp - 1) * ease;
      for (const m of Object.values(circuitAnim.ghostMats)) {
        m.opacity = op;
        m.depthWrite = op > 0.5;
      }
      const moving = animPlaying && motionAllowed() && !animSimple;
      // Slow readable pulse (~2s period), never strobing.
      circuitAnim.nodeMat.emissiveIntensity = moving
        ? 0.5 + 0.28 * Math.sin((performance.now() / 1000) * Math.PI)
        : 0.5;
      for (const eo of circuitAnim.edgeObjs) {
        if (moving) {
          for (const p of eo.pulses) {
            p.t = (p.t + dt / animLoopSec) % 1;
            p.mesh.position.copy(eo.curve.getPointAt(p.t));
          }
        } else if (!animSimple && eo.pulses.length) {
          for (const p of eo.pulses) p.mesh.position.copy(eo.curve.getPointAt(p.t));
        }
      }
      // Automatic degradation: sustained low fps drops to static glow.
      // Wall-clock accounting (skipped after a hidden tab or hitch) so a
      // slow software renderer degrades honestly instead of flapping.
      if (rawDt < 1) {
        fpsEMA = fpsEMA * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;
        if (moving && fpsEMA < 15) {
          fpsLowSince += rawDt;
          if (fpsLowSince > 5 && !animSimple) {
            animSimple = true;
            animPlaying = false;
            updateAnimControls();
            $('circuitInfo').textContent += ' · simple mode (low fps)';
            $('sr-status').textContent = 'Simple mode enabled automatically: static glow, animation off.';
          }
        } else {
          fpsLowSince = 0;
        }
      }
    }
  }
  if (camTween) {
    camTween.s += dt / camTween.dur;
    const s = Math.min(camTween.s, 1);
    const e = s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
    camera.position.lerpVectors(camTween.p0, camTween.p1, e);
    controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (s >= 1) camTween = null;
  }
  // Adaptive quality only measures while something animates, so a static
  // scene never triggers a needless resize. Thresholds mirror the existing
  // simple-mode degradation (15fps) with headroom: step down below 30fps
  // sustained 2s, step back up above 55fps sustained 6s.
  const animating = (circuitAnim && animPlaying && motionAllowed() && !animSimple) || !!camTween;
  if (!document.hidden && rawDt > 0 && rawDt < 1) {
    qEMA = qEMA * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;
    if (animating) {
      if (qEMA < 30) {
        qDownSince += rawDt;
        qUpSince = 0;
        if (qDownSince > 2 && renderQuality > 0.5) {
          renderQuality = Math.max(0.5, renderQuality - 0.15);
          renderer.setPixelRatio(baseDPR * renderQuality);
          qDownSince = 0;
        }
      } else if (qEMA > 55) {
        qUpSince += rawDt;
        qDownSince = 0;
        if (qUpSince > 6 && renderQuality < 1) {
          renderQuality = Math.min(1, renderQuality + 0.15);
          renderer.setPixelRatio(baseDPR * renderQuality);
          qUpSince = 0;
        }
      } else {
        qDownSince = 0;
        qUpSince = 0;
      }
    }
  }
  controls.update();
  renderer.render(scene, camera);
});
