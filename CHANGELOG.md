# Changelog

All notable changes to NeuroMap Brain + Clinic.

## Unreleased — 2026-09-30 (3)

### Added

- **Forgiving structure search.** Queries now fold accents, read Greek letters
  by name ("beta" finds "β", "5ht" finds "5-HT") and treat dashes as spaces,
  computed identically for the query and the index with no dependency. Results
  rank label-prefix first, then word-prefix, substring, other fields, and a
  spaceless fallback; ArrowUp/Down + Enter walks the list, which is exposed as
  a listbox with `aria-selected`. Viewer controls join the same index through
  `data-search` attributes and a pick clicks the real control.
- **Evidence-coverage report** (`scripts/coverage.mjs`, `npm run coverage`):
  counts every claim object across disorders and registries by evidence level
  and reports the share at moderate-or-better. Informational only (always
  exits 0); strict mode remains the gate. Current reading: 668 claims, 97.6%
  at moderate-or-better, zero unsourced.
- **Adaptive render quality.** The render loop steps the pixel ratio down
  (floor 0.5×) below 30fps sustained 2s while animating and back up above
  55fps sustained 6s, with hysteresis. Content-preserving: geometry, colours
  and camera are untouched. Visible via `viewer.renderQuality()`.
- **Keyboard-shortcut help** (`?` or the `?` button): a dialog listing only
  the shortcuts that actually exist (`/`, `Esc`, tour arrows, opacity/search
  arrows, `Enter`, `?`), closable by button, backdrop or `Esc`.

### Licence position

- Unchanged. The ideas above were informed by reading neurarium
  (github.com/olicorne/neurarium, AGPL-3.0); **no neurarium code, data, text
  or asset was copied** — all implementation here is original and clean-room,
  so no AGPL terms attach. See `THIRD-PARTY-NOTICES.md`.

## Unreleased — 2026-09-30 (2)

### Added

- **Colour-by-function mode.** A third teaching colour scheme alongside
  category colour and lobe colour, driven by a new data file
  `public/brain-atlas/function-systems.json`. Structures are grouped into 14
  functional systems — motor, somatosensation, vision, hearing, language,
  memory, emotion/interoception, executive/association, reward/habit,
  arousal-sleep-autonomic, balance/coordination, white-matter tracts, CSF
  spaces, and an explicit "not classified" bucket — each with a swatch, a
  count, and a one-line description.
- **Interactive legend** with per-group structure counts, percentage on hover,
  and click-to-solo. A solo is an extra condition inside the existing
  `updateVisibility()`, so hemisphere, search and category toggles continue to
  behave exactly as they do in every other mode. Clicking the active row
  clears the solo. Solo changes are announced to screen readers.
- **Functional group named in the structure card**, so the grouping is
  available as text and not by colour alone.
- `scripts/check-functions.mjs` (`npm run check:functions`), wired into
  `npm test`, `npm run build` and CI. It re-implements the same resolution
  order the viewer uses and fails if a rule silently stops matching, if a
  declared system is never assigned, or if the unclassified share grows beyond
  15%.

### Honesty and correctness decisions

- The functional grouping is a **teaching classification derived by rule from
  each structure's own name and the function note already in
  `public/brain-atlas/functions.json`**. It is **not an official parcellation**
  and makes no claim about connectivity or measured function. The legend and
  the file header both say so.
- Vessels, cranial nerves and meninges **keep their category colour**: calling
  the superior sagittal sinus a functional system would be meaningless.
- Anything no rule matches stays in the visible **"not classified"** bucket
  rather than being assigned by guess. After tuning, 10 of 325 classified
  manifest structures remain there, and they are all genuinely non-functional
  landmarks (the interpeduncular fossa, branches of the Sylvian fissure,
  Jensen's sulcus).
- The GLB carries **more meshes than the manifest describes**. Meshes with no
  manifest record fall back to category `cortex`, which is an assumption, so
  they are explicitly reported in the "not classified" bucket rather than
  being classified as if cortex were known.

### Fixed

- **Lobe and function colour modes were not mutually exclusive.** Only one
  direction was wired, so both could be switched on and the brain would show
  two competing colour schemes at once. Exclusion is now symmetric.

### Not done

- No new 3D model, mesh or external dataset was added. The existing
  `brain.glb` atlas already supplies 437 structures across 12 categories, and
  the depth requested here is functional and perceptual rather than geometric.
  Adding a second model set would introduce a second geometry provenance and a
  second attribution chain for no gain on this task.
- No surface/voxel overlays. See the 2026-09-29 entry in this file for why
  (no scientific Python toolchain available, map data not openly
  redistributable as files, and the atlas is not a standard MNI surface).

### Licence position

Unchanged. `function-systems.json` is a **derived annotation** produced inside
this repository from data already here. It introduces no third-party asset, so
the CC BY-SA 4.0 chain for `brain.glb`, `manifest.json` and `content/`, and the
Apache-2.0 grant for viewer code, are both untouched.

## Unreleased — 2026-09-29

### Added

- **Schizophrenia genetics: PGC2 2014 loci data.** Three new evidence-levelled
  claims in `content/disorders/schizophrenia.json` (`scz-gen-arch3/4/5`),
  sourced to `pgc2-2014`:
  - 108 conservatively defined loci from 128 independent associations, in up to
    36,989 cases and 113,075 controls, 83 loci previously unreported.
  - Loci enriched among brain-expressed genes and, independently of that
    signal, among genes expressed in immune-relevant tissues.
  - Associations at `DRD2` and at glutamatergic genes aligning genetic risk
    with the dopamine and glutamate hypotheses.
- **Two new source registry entries** in `content/registries/sources.json`
  (81 → 83), both verified against PubMed and Crossref before being added:
  - `pgc2-2014` — Schizophrenia Working Group of the PGC, "Biological insights
    from 108 schizophrenia-associated genetic loci", *Nature* 511:421-427,
    PMID 25056061, doi:10.1038/nature13595.
  - `howes-2015` — Howes O, McCutcheon R, Stone J, "Glutamate and dopamine in
    schizophrenia: an update for the 21st century", *J Psychopharmacol*
    29(2):97-115, PMID 25586400, doi:10.1177/0269881114563634.
- **Glutamate neurochemistry claim enriched** (`scz-nc-glu`) with the in vivo
  imaging refinement described by `howes-2015`, keeping its existing
  `moderate` evidence level.
- `CHANGELOG.md` (this file).

### Verification

- `npm run lint:content:strict` — 0 errors, 0 warnings.
- `npm run test:mapping` — 3778 assertions, 555 claims, 0 failures.
- `npm run build` — passes; 20 content files + 4 licence documents shipped.
- Each new source was confirmed by retrieving its PubMed record **and** its
  abstract, and its DOI was independently confirmed against the Crossref
  registry. No claim, number or gene symbol was written from memory.

### Considered and deliberately not done

These were requested but are **not** implemented, because doing them here would
have meant fabricating data or shipping assets whose licence could not be
confirmed. Recording the reasons so the decisions are auditable:

- **Volumetric / voxel overlays (ENIGMA maps, neuromaps, abagen, OpenNeuro,
  Allen Human Brain Atlas expression).** Not attempted. The environment has no
  scientific Python stack at all (no numpy, scipy, nibabel, nilearn, h5py,
  zarr), so no NIfTI can be read, resampled or sampled onto the mesh. Beyond
  the toolchain, the map sources are not straightforwardly redistributable as
  data files: ENIGMA results are published as summary statistics and
  supplementary material rather than as openly-licensed volume files, and
  neuromaps is a toolbox that computes maps from atlases the user must register
  and download. `brain.glb` is a set of individual gyral meshes rather than a
  standard MNI surface, so a volumetric statistic could not be painted onto it
  without a cortical-surface registration that does not exist in this repo.
  Generating a plausible-looking heat map anyway would have been the single
  easiest way to break this project's "no invented data" rule.
- **Additional 3D anatomy models** (Z-Anatomy full model set, further
  BodyParts3D derivatives). The current atlas already supplies 437 mesh nodes
  across 12 systems and the existing precision labelling is honest about which
  structures are exact, proxy or schematic. Adding a second model set would
  introduce a second geometry provenance and a second attribution chain for no
  gain on this page, and would risk the CC BY-SA 4.0 chain.
- **Forking or pattern-matching external viewers** (brainbrowser,
  NeuroMArVL, brain-explorer). The existing viewer already provides the
  requested interactions (orbit/zoom, preset views, search, click-to-inspect,
  labels, hemisphere selection, cortex opacity, three clipping planes, isolate,
  circuit animation). brainbrowser in particular is a volumetric viewer built
  around MNI template volumes, which is a different data model from this
  surface-mesh atlas; adopting it would mean replacing the viewer rather than
  extending it.
- **NICE NG178 as a guideline source.** Considered and rejected: verification
  showed NG178 is the "COVID-19 rapid guideline: renal transplantation". The
  schizophrenia guideline is CG178, which this project already cites as
  `nice-cg178`. Nothing was added on the strength of a misremembered reference.

### Licence position

Unchanged. No third-party asset was added in this release, so the CC BY-SA 4.0
chain for `brain.glb`, `manifest.json` and `content/` is untouched, as is the
Apache-2.0 grant for viewer code. The two new sources are bibliographic
citations only; both are open-access or freely readable scientific publications
and are cited by DOI rather than reproduced.
