import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './clinical.js';

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}brain-atlas/models/brain.glb`;
const MANIFEST_URL = `${BASE}brain-atlas/models/manifest.json`;
const FUNCTIONS_URL = `${BASE}brain-atlas/functions.json`;
const CIRCUITS_URL = `${BASE}brain-atlas/circuits3d.json`;
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
const loaderEl = $('loader');
const loadfill = $('loadfill');
const loadmsg = $('loadmsg');

// ---------- renderer / scene ----------
const container = $('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

// Base material honoring lobe-color mode (cortex only; other layers unchanged).
function baseMaterialFor(mesh) {
  const cat = mesh.userData.anat.cat;
  if (lobeMode && cat === 'cortex' && LOBE_COLORS[mesh.userData.anat.region]) {
    return lobeMaterial(mesh.userData.anat.region);
  }
  return baseMats[cat];
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
  if (selected) {
    setMeshMaterial(selected, baseMaterialFor(selected));
    selected = null;
  }
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
  $('cardMeta').textContent = `${catLabel}${anat.region ? ` · ${anat.region}` : ''}`;
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
  ensureVariants(mesh.userData.anat.cat);
  setMeshMaterial(mesh, selectMats[mesh.userData.anat.cat]);
  showCard(mesh.userData.anat);
  if (pushHash) {
    history.replaceState(null, '', `#s=${mesh.userData.anat.id}`);
  }
}

// Clear the card without touching the URL hash (used internally by select).
function clearSelectionHashOnly() {
  if (selected) {
    setMeshMaterial(selected, baseMaterialFor(selected));
    selected = null;
  }
  $('card').hidden = true;
}

function setHovered(mesh) {
  if (hovered === mesh) return;
  if (hovered && hovered !== selected) {
    setMeshMaterial(hovered, baseMaterialFor(hovered));
  }
  hovered = mesh;
  if (hovered && hovered !== selected) {
    ensureVariants(hovered.userData.anat.cat);
    setMeshMaterial(hovered, hoverMats[hovered.userData.anat.cat]);
  }
  renderer.domElement.style.cursor = hovered ? 'pointer' : '';
}

// ---------- picking (tap, not drag) ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downX = 0;
let downY = 0;

function pickAt(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(anatomyMeshes, false);
  return hits.length ? hits[0].object : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // was a drag
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
    // Active circuit overrides category toggles for its members (focus mode).
    const catOn = activeCircuit ? circuitMembers.has(m) : catState[a.cat] !== false;
    const sideOn = hemi === 'both' || a.side === 'median' || a.side === hemi;
    m.visible = catOn && sideOn && (!matchSet || matchSet.has(m));
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
    $('circuitBar').hidden = true;
    updateVisibility();
    return;
  }
  const groups = resolveCircuitMembers(activeCircuit);
  for (const g of groups) for (const m of g.meshes) circuitMembers.add(m);
  // Tube path through group centroids (closed loop), in circuit color.
  const centers = [];
  for (const g of groups) {
    if (!g.meshes.length) continue;
    const box = new THREE.Box3();
    for (const m of g.meshes) box.expandByObject(m);
    centers.push(box.getCenter(new THREE.Vector3()));
  }
  if (centers.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(centers, true, 'centripetal', 0.6);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(activeCircuit.color || '#38BDF8'),
      transparent: true,
      opacity: 0.85,
    });
    mat._owned = true;
    circuitGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 72, modelSize * 0.004, 8, true), mat));
    for (let i = 0; i < 2; i++) {
      const pmat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      pmat._owned = true;
      const p = new THREE.Mesh(new THREE.SphereGeometry(modelSize * 0.007, 12, 10), pmat);
      circuitGroup.add(p);
      circuitPulses.push({ mesh: p, curve, t: i / 2 });
    }
  }
  $('circuitName').textContent = activeCircuit.name;
  $('circuitInfo').textContent = `${activeCircuit.tierCode || ''} · ${activeCircuit.function || ''}`;
  $('circuitBar').hidden = false;
  if (selected && !circuitMembers.has(selected)) clearSelection();
  updateVisibility();
}

// Called from the clinical tab ("Show on 3D brain").
window.__neuroMap = Object.assign(window.__neuroMap || {}, {
  showCircuit(id) {
    setActiveCircuit(id);
  },
});

function allMats() {
  return [
    ...Object.values(baseMats),
    ...Object.values(hoverMats),
    ...Object.values(selectMats),
    ...Object.values(lobeMats),
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
  $('circuitClear').addEventListener('click', () => setActiveCircuit(null));
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
  const searchInput = $('search');
  const resultsBox = $('results');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      matchSet = null;
      resultsBox.hidden = true;
      resultsBox.innerHTML = '';
      updateVisibility();
      return;
    }
    const matches = searchIndex.filter((e) => e.hay.includes(q));
    matchSet = new Set(matches.map((e) => e.mesh));
    updateVisibility();
    resultsBox.hidden = false;
    resultsBox.innerHTML = '';
    const count = document.createElement('div');
    count.className = 'count';
    count.textContent =
      matches.length === 0 ? 'No structures found' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`;
    resultsBox.appendChild(count);
    for (const e of matches.slice(0, 40)) {
      const b = document.createElement('button');
      b.type = 'button';
      const a = e.mesh.userData.anat;
      b.textContent = `${a.label}${a.side === 'left' || a.side === 'right' ? ` (${a.side})` : ''}`;
      b.addEventListener('click', () => {
        select(e.mesh);
        focusOn(e.mesh);
      });
      resultsBox.appendChild(b);
    }
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
    }
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
    $('lobeBtn').textContent = `Lobe colors: ${lobeMode ? 'on' : 'off'}`;
    for (const m of anatomyMeshes) {
      if (m === selected || m === hovered) continue;
      if (m.userData.anat.cat === 'cortex') m.material = baseMaterialFor(m);
    }
  });

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
  const [manifest, funcs, circuitsFile] = await Promise.all([
    (await fetch(MANIFEST_URL)).json(),
    (await fetch(FUNCTIONS_URL)).json().catch(() => ({})),
    (await fetch(CIRCUITS_URL)).json().catch(() => ({ circuits: [] })),
  ]);
  functions = funcs;
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
    if (!baseMats[cat]) baseMats[cat] = tissueMaterial(cat);
    obj.material = baseMats[cat];
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.userData.anat = anat;
    searchIndex.push({
      mesh: obj,
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
  const dt = Math.min(animClock.getDelta(), 0.05);
  for (const p of circuitPulses) {
    p.t = (p.t + dt * 0.15) % 1;
    p.mesh.position.copy(p.curve.getPointAt(p.t));
  }
  controls.update();
  renderer.render(scene, camera);
});
