/* Universal explore model: pure, DOM-free resolvers shared by every UI module.
   Nothing here touches document, window or three.js, so the same file runs in
   the browser and under node unit tests. All spatial knowledge comes from the
   caller-supplied data (space-map.json + registries + manifest-derived sets);
   this module never hardcodes an entity, label or receptor. */

export const STATUS = {
  mapped: 'mapped',
  family: 'family-level',
  partial: 'partially mapped',
  schematic: 'schematic only',
  offatlas: 'off-atlas',
  none: 'not mapped',
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function receptorById(receptors, id) {
  return (receptors || []).find((r) => r.id === id) || null;
}

// Transmitter subtype row -> registry receptor records (or declared none).
// Returns { status, receptors, note }. Never fabricates: unknown subtype
// names and names without records resolve to status 'none'.
export function resolveSubtype(spaceMap, receptors, transmitterId, subtypeName) {
  const entry = spaceMap?.subtypeReceptors?.[transmitterId]?.[subtypeName];
  if (!entry) return { status: STATUS.none, receptors: [], note: 'No mapping record for this subtype.' };
  const found = (entry.receptors || []).map((id) => receptorById(receptors, id)).filter(Boolean);
  const missing = (entry.receptors || []).filter((id) => !receptorById(receptors, id));
  if (found.length === 0) {
    return { status: entry.status === 'family' ? STATUS.family : STATUS.none, receptors: [], note: entry.note || '' };
  }
  return {
    status: entry.status === 'mapped' ? STATUS.mapped : STATUS.family,
    receptors: found,
    note: (missing.length ? `Unresolved receptor IDs (validation failure, not shown): ${missing.join(', ')}. ` : '') + (entry.note || ''),
  };
}

// Clinical drug target strings -> registry receptor records (fallback map for
// drugs without a registry fingerprint; registry-linked drugs should prefer
// their validated receptorProfile instead).
export function resolveDrugTargets(spaceMap, receptors, targetStrings) {
  return (targetStrings || []).map((name) => {
    const entry = spaceMap?.drugTargets?.[name];
    if (!entry) return { name, status: STATUS.none, receptors: [], note: 'No mapping record for this target string.' };
    const found = (entry.receptors || []).map((id) => receptorById(receptors, id)).filter(Boolean);
    const missing = (entry.receptors || []).filter((id) => !receptorById(receptors, id));
    return {
      name,
      status: found.length ? (entry.status === 'mapped' ? STATUS.mapped : STATUS.family) : STATUS.none,
      receptors: found,
      note: (missing.length ? `Unresolved receptor IDs (validation failure, not shown): ${missing.join(', ')}. ` : '') + (entry.note || ''),
    };
  });
}

// Collect atlas labels + marker ids from receptor principalSites for viewer calls.
export function collectReceptorSpatial(receptors) {
  const labels = new Set();
  const markers = new Set();
  const precisions = new Set();
  for (const r of receptors || []) {
    for (const p of r.principalSites || []) {
      const w = p.where || {};
      for (const l of w.atlasLabels || []) labels.add(l);
      if (w.markerId) markers.add(w.markerId);
      if (w.precision) precisions.add(w.precision);
    }
  }
  return { labels: [...labels], markers: [...markers], precisions: [...precisions] };
}

// Structured pathway record lookup (dopamine ships first; other transmitters
// resolve to null and the UI must show a not-yet-curated state, not a guess).
export function resolvePathway(spaceMap, transmitterId, pathwayId) {
  const list = spaceMap?.pathways?.[transmitterId] || [];
  return list.find((p) => p.id === pathwayId) || null;
}

// Conceptual microstructure schematic: four mechanism lanes rendered as SVG.
// This is an educational diagram, never a render of mesh microanatomy — the
// banner says so persistently, and each lane carries its own evidence label.
export function conceptSVG({ title, lanes, sourcesNote }) {
  const rows = (lanes || []).map((lane, i) => {
    const y = 34 + i * 52;
    return `<text x="12" y="${y - 8}" fill="#9CA3AF" font-size="10">${esc(lane.kicker)}</text>`
      + `<rect x="8" y="${y}" width="324" height="34" rx="7" fill="none" stroke="${esc(lane.color || '#60A5FA')}" stroke-width="1.5"/>`
      + `<text x="18" y="${y + 21}" fill="#E5E7EB" font-size="12">${esc(lane.text)}</text>`
      + `<text x="322" y="${y + 21}" text-anchor="end" fill="#9CA3AF" font-size="10">${esc(lane.evidence || 'see citation')}</text>`;
  }).join('');
  const h = 34 + (lanes || []).length * 52 + 30;
  return `<svg viewBox="0 0 340 ${h}" role="img" aria-label="Conceptual schematic: ${esc(title)}. Not to anatomical scale.">`
    + `<rect x="4" y="4" width="332" height="20" rx="6" fill="rgba(245,158,11,0.12)" stroke="#F59E0B" stroke-width="1"/>`
    + `<text x="170" y="18" text-anchor="middle" fill="#F59E0B" font-size="10">SCHEMATIC — not to scale, not scan-derived</text>`
    + `<text x="12" y="${34 + (lanes || []).length * 52 + 18}" fill="#9CA3AF" font-size="10">${esc(sourcesNote || '')}</text>`
    + rows + `</svg>`;
}
