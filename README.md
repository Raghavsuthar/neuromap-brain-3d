# NeuroMap 3D Brain

**Live demo: https://Raghavsuthar.github.io/neuromap-brain-3d/**

A realistic, browser-based, interactive 3D brain. It renders real,
sourced, scan-derived anatomy — 437 individually named structures across
12 systems (cortical gyri/sulci, deep grey nuclei, diencephalon,
white-matter tracts, ventricles, brainstem, cerebellum, Circle of Willis,
dural sinuses, meninges, cranial nerves) — with PBR tissue materials,
studio lighting, orbit/zoom/pan with preset Front/Side/Top views,
click-to-inspect with TA2 anatomical paths and decussation notes,
live search, toggleable labels, hemisphere isolation, color-by-lobe
mode, sagittal/coronal/axial slice planes with solid-tissue cuts,
a cortex-opacity slider that fades the surface to reveal the
deep brain, per-structure Isolate mode, and one-click PNG screenshots
for teaching.

The 3D view also renders the 7 psychiatric circuits as glowing pathways:
pick a circuit to isolate its member structures and trace the loop with
traveling signal pulses (mapping table in
`brain-atlas/circuits3d.json`; brainstem nuclei absent from the source
model, e.g. VTA, are declared omitted rather than invented). Circuit
detail pages link back with "Show on 3D brain".

Each selection also shows a plain-language function summary for major
structures (402 of 437; minor sulci and small branches intentionally
left blank rather than described loosely), and every view is shareable
via `#s=<id>` deep links.

Nothing here is fabricated: every mesh is a real, TA2-named anatomical
structure derived from open anatomical and imaging data. If a structure
isn't in the sourced model, it is left out rather than approximated with
invented geometry.

## Single page: brain + clinical reference

The same page carries the full NeuroMap clinical database, parsed
verbatim from the app's evidence-based repository — **7 circuits, 6
neurotransmitters, 14 syndromes, 22 psychotropics** — behind the
Circuits / Transmitters / Syndromes / Drugs tabs. Each entry shows its
clinical summary, key pharmacology or circuit data, cross-linked chips
that navigate between layers, and a Further-reading list of guidelines
and references. Clinical deep links look like `#c=drugs:sertraline`.
All clinical content is reference-only, not diagnostic advice.

Run locally with no install beyond npm:

```bash
npm install
npm run dev
# open http://localhost:5173/neuromap-brain-3d/
```

## Attribution & licence

This project is **dual-licensed**:

- **Viewer source code** (HTML/CSS/JS, Vite config, deploy workflow): **Apache License 2.0**. Use it, fork it, embed it, do what you like.

- **3D anatomy assets** (the `brain.glb` model and the metadata derived from it): **Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)**, © Z-Anatomy contributors and BodyParts3D / DBCLS.

**CC BY-SA is share-alike:** if you distribute a modified version of the *model*, it must stay under CC BY-SA and keep this attribution. The Apache 2.0 code licence does **not** relicense the model; keep this notice with the `.glb`.

- Z-Anatomy, built on BodyParts3D, © The Database Center for Life Science (DBCLS).

**Imaging-registered structures.** The globus pallidus internal/external split, the thalamic nuclei groups, the subthalamic nucleus, substantia nigra, nucleus accumbens, the amygdala functional groups, the hypothalamus zones and the white-matter tracts are not in the source model; they were registered from open MNI-space imaging atlases and remain **CC BY-SA 4.0**. They are **approximate** (about 7 mm, educational, not for clinical use).

- CIT168 subcortical atlas - Pauli, Nili & Tyszka 2018, *Scientific Data* (**CC BY 4.0**) - https://osf.io/jkzwp/

- CIT168 amygdala atlas - Tyszka & Pauli 2016 (**CC BY-SA 4.0**) - https://osf.io/hksa6/

- Najdenovska et al. 2018, in-vivo probabilistic thalamic atlas, *Scientific Data* (**CC BY-SA 4.0**) - https://doi.org/10.5281/zenodo.1405484

- Neudorfer et al. 2020, hypothalamic region atlas, *Scientific Data* (**CC BY 4.0**) - https://doi.org/10.5281/zenodo.3942115

- HCP1065 white-matter tract templates (population-averaged, from the Human Connectome Project) used to build the tract centerlines.

Anatomy model vendored from https://github.com/itayinbarr/brainproject
(`brain-atlas/models/brain.glb`, `brain-atlas/models/manifest.json`,
`brain-atlas/vendor/draco/`).

## Resolution note

The surface-mesh structures are gross-anatomy grade. The deep nuclei,
hypothalamic zones and white-matter tracts are **registered from open
MNI-space imaging atlases**, so they are **approximate** (about 7 mm,
**educational, not for clinical use**).

## Tech stack

- **Three.js** (`GLTFLoader` + `DRACOLoader`, ACES tone mapping, room-environment IBL plus a three-point rig) for the 3D scene and picking.
- **Vite** for the build; deployed to GitHub Pages on every push to `main`.
- No backend, no auth, no analytics.

## Architecture

The app is a **single-page data-driven platform**. The 3D viewer and UI are generic; each disorder is a data file under `content/disorders/`. Adding a new disorder never requires touching viewer code.

### Key modules

| Module | Responsibility |
|--------|----------------|
| `src/main.js` | 3D viewer core: scene, model loading, clipping, materials, picking, camera, animated circuit engine (`animateCircuit` / `clearCircuitAnimation`) |
| `src/clinical.js` | Clinical reference UI (search, detail sheets, cross-layer links) |
| `src/disorder.js` | Disorder engine: picker, tabs, lenses, entity cards, quiz, tour, deep links, learning features (synaptic zoom, dual-depth, focus mode, progress, share links, shortcuts) |
| `src/disorder.css` | Disorder panel styles (picker, tabs, cards, quiz, tour, overlays) |

### Data flow

```
content/disorders/schizophrenia.json  ──▶  src/disorder.js (loads, renders UI)
content/registries/*.json (drugs, receptors, genes, treatments, sources)
content/schema/disorder.schema.json  ──▶  scripts/validate-disorders.mjs (CI lint)
public/brain-atlas/... (.glb, manifest.json, functions.json, draco decoder)
```

### Data contracts

All content follows JSON Schema in `content/schema/disorder.schema.json`. The validator (`scripts/validate-disorders.mjs`) enforces:

- Every `atlasLabels` value exists in `public/brain-atlas/models/manifest.json`
- Every `sourceIds`, `receptorId`, `drugId`, `geneSymbol`, `treatmentId`, `disorderId` reference resolves
- Every `Claim` has an evidence level; no `unsourced` in release builds (`--strict`)
- `effectSize`, `kiNm`, `doseRange` must have a `sourceId`
- Claim text ≤ 4 sentences (forces original summarizing)
- All URLs well-formed

Run locally: `npm run lint:content` (dev) or `npm run lint:content:strict` (CI).

## Adding a new disorder (step-by-step)

1. **Create the data file**  
   Copy `content/disorders/TEMPLATE.json` → `content/disorders/<id>.json`  
   Fill every field with **original wording** (no copy-paste from guidelines/DrugBank).  
   Use `content/registries/*.json` IDs for cross-references.

2. **Add the disorder to the index**  
   Edit `content/index.json` and append `{ "id": "<id>", "name": "Name", "block": "ICD-11 block" }`.

3. **Run the validator**  
   ```bash
   npm run lint:content:strict
   ```
   Fix every error — `unsourced` claims, dangling refs, malformed URLs, quiz answer indexes, etc.

2. **Build and test locally**  
   ```bash
   npm run build
   npm run dev
   # open http://localhost:5173/neuromap-brain-3d/
   ```
   Verify: 3D brain loads, disorder picker appears, tabs render, quiz works, tour steps advance, 3D lenses switch.

3. **Commit and push**  
   ```bash
   git add -A
   git commit -m "Add <disorder> disorder: <one-line summary>"
   git push origin main
   ```

4. **Verify GitHub Actions**  
   - `Content lint` workflow passes (strict mode)
   - GitHub Pages deploy completes
   - Live site at `https://raghavsuthar.github.io/neuromap-brain-3d/` loads the new disorder

### Template

See `content/disorders/TEMPLATE.json` for the full field structure. Key rules:

- **All text original** — no copy-paste from DSM/ICD/guidelines/DrugBank. Summarize in your own words.
- **Every claim sourced** — at least 2 sources for syndromes/drugs; evidence level mandatory.
- **Atlas labels** must match `public/brain-atlas/models/manifest.json` exactly (`exact`/`proxy`/`schematic`).
- **No invented numbers** — effect sizes, Ki, occupancy, doses only from cited sources.
- **Quiz ≥15 items**, tour 6–10 steps (strict mode enforces this).

### Checklist before merge

- [ ] `npm run lint:content:strict` passes (zero errors, zero warnings)
- [ ] `npm run build` succeeds
- [ ] Local `npm run dev` loads the new disorder end-to-end
- [ ] Deep links work: `#d=<id>&lens=<lens>&id=<target>`
- [ ] Accessibility: visible focus states, screen-reader announcements
- [ ] Mobile layout works at 375px

## Content lint rules (summary)

| Rule | Severity |
|------|----------|
| Every `atlasLabels` value exists in `manifest.json` | Error |
| Every `sourceIds`/`receptorId`/`drugId`/`geneSymbol`/`treatmentId`/`disorderId` resolves | Error |
| Every `Claim` has `evidence` ∈ {established,strong,moderate,emerging,hypothesis,unsourced} | Error |
| `effectSize`/`kiNm`/`doseRange` require `sourceId` | Error |
| Claim text ≤ 4 sentences | Error |
| All URLs well-formed | Error |
| Quiz answer index in range, `sourceIds` ≥1 | Error |
| `unsourced` claims forbidden in release (`--strict`) | Error |
| Quiz ≥15 items, tour 6–10 steps | Error (`--strict`) |

## Source & License Notes

- **3D model:** CC BY-SA 4.0 (Z-Anatomy / BodyParts3D / DBCLS) — see `DATA_LICENSES.md`
- **DrugBank data:** Only cited, not redistributed (requires separate license)
- **IUPHAR/Guide to Pharmacology:** CC BY 4.0
- **ENIGMA / PGC3 / SCHEMA / Sekar 2016 / Howes & Kapur 2009 / IUPHAR / DrugBank (cited) / FDA labels:** Open access or cited-only
- **3D model vendor:** itayinbarr/brainproject (CC BY-SA 4.0)
- **Code:** MIT License
- **Content (registries, disorders):** CC BY-SA 4.0 (share-alike per model license)
- **See `DATA_LICENSES.md` for full breakdown**

## Disorders available

Eleven disorders are built end to end, each with all ten tabs populated, a guided
tour, and 16 sourced quiz items:

| Disorder | ICD-11 | DSM-5-TR | Highlights |
|---|---|---|---|
| Schizophrenia | 6A20 | 295.90 | ENIGMA cortical/subcortical/DTI, dopamine hypothesis v.III, TRRIP clozapine pathway, failed TAAR1 trials |
| Major depressive disorder | 6A70 / 6A71 | 296.14-296.32 | ENIGMA hippocampal d = -0.14, adolescent vs adult divergence, 102 GWAS loci, mixed VNS trial result |
| Bipolar type I | 6A60 | 296.44-296.64 | 6503-individual cortical study, mania count predicts prefrontal thinning, AKAP11 odds ratio ~7 |
| Bipolar type II | 6A61 | 296.89 | Depression-dominant course, antidepressant switching risk, shared-subtype findings labelled as such |
| Generalized anxiety disorder | 6B00 | 300.22 | Guideline first-line set, plus an explicit statement that no coordinated structural study exists |
| Panic disorder | 6B01 | 300.01 | Interoceptive misreading model, polygenic discrimination ceiling of ~0.60 |
| Social anxiety disorder | 6B04 | 300.23 | Meta-analytic fear-circuit hyperactivation, self-referential attention, disconnected medial parietal hub |
| Post-traumatic stress disorder | 6B40 | 309.81 | ENIGMA-PGC hippocampal d = -0.17, psychotherapy ahead of medication, benzodiazepines and cannabis recommended against |
| Obsessive-compulsive disorder | 6B20 | 300.3 | Cortico-striato-thalamo-cortical loop, neurocircuit taxonomy, neuroablation vs DBS meta-analysis |
| Attention deficit hyperactivity disorder | 6A05 | 314.00 | ENIGMA subcortical d = -0.11 to -0.19, surface area d = -0.21 in children only, sibling endophenotype |
| Autism spectrum disorder | 6A02 | 318.00 | 1571 vs 1651 lifespan morphometry, 72 exome-associated genes, sex-difference null finding |

Every effect size, odds ratio and trial result is taken from a cited source
record; nothing is estimated or illustrative. Two deliberate honesty choices:

- Where a study pooled bipolar subtypes, the page says so instead of implying a
  subtype-specific effect.
- Generalized anxiety disorder and panic disorder have **no** large structural
  imaging study, so no effect size is claimed for them. Their pathology tab
  shows the shared circuit model, labelled as a model, graded `emerging`.

## Animated circuit mode + learning features

Every topic tab drives the 3D brain as that topic's circuit diagram
(`viewer.animateCircuit`, generic — new disorders/drugs never touch it):

- **Isolation with ghost context** — members at full opacity with a slow ~2s
  emissive pulse; everything else fades to a faint 4% opacity (eased ~450ms
  wall-clock tween, never a hard cut), so the whole-brain silhouette remains.
  A live **Context** slider in the circuit bar sets that ghost opacity from 0%
  (no context at all) to 35% (heavy context) — transparency is a user decision,
  not a hard-coded constant, and it applies while the animation runs.
- **Directed edges** — one 3D path per circuit edge with flow pulses at a
  ~3s cadence (adjustable 1.5–6s); excitatory = warm + arrowhead, inhibitory =
  cool + blunt disc, modulatory = diamond. Reciprocal pairs render as two
  offset arcs. Drug/gene lenses animate receptor sites with no edges rather
  than inventing connectivity.
- **Controls** — pause/play, speed, context (ghost) opacity, smooth recenter
  (manual orbit cancels it), simple mode, and a reduced-motion path (static
  highlight + explicit opt-in). Sustained low fps degrades to static glow
  automatically. Edge tubes have fat invisible hit-proxies; clicking a
  connection shows the pathway, clicking a node still opens structure detail
  (ghost tissue never steals clicks).
- **Learning layer** — synaptic zoom-in schematics from drug fingerprints;
  quick/detailed claim toggle (remembered); auto-playing story-mode tour;
  colorblind-safe pathology palette; a "Showing:" structure list as the
  screen-reader alternative to every highlight; focus/presentation mode;
  `localStorage` progress with Anki-style due-for-review list; shareable
  exact-state links (`#d=&tab=&lens=&id=&ent=&cam=&tgt=`); keyboard shortcuts
  (arrows = tour, `/` = search, `Esc` = unwind).
- **Scaffolded, not shipped** — compare mode, vignettes, speech narration,
  PWA, translations live behind `FEATURES` flags in `src/disorder.js`; UI
  strings already sit in one `STRINGS` object for a future Hindi/Gujarati pass.

## Verification

| Gate | Command | Result |
|---|---|---|
| Content lint (release) | `npm run lint:content:strict` | 0 errors, 0 warnings |
| Data to 3D mapping | `npm run test:mapping` | 3767 assertions, 552 claims |
| Build | `npm run build` | lints, bundles, copies `content/` to `dist/` |
| CI | GitHub Actions `Content lint and tests` | syntax, JSON, lint, mapping tests, build, shipped-content check |
| Browser: animation + learning | `pwtest/verify_anim.cjs` | 32 checks, 0 page errors |
| Browser: edge cases | `pwtest/verify_edge_cases.cjs` | 11 checks incl. reduced-motion, 0 page errors |
| Browser: disorders | `pwtest/verify_disorder.cjs` | 33 checks, 0 page errors |
| Browser: clinical regression | `pwtest/verify_clinical.cjs` | 15 checks, 0 page errors |

`scripts/test-mapping.mjs` is the important one: it mirrors the viewer's
`meshesForLabels()` and fails if any atlas label, circuit node,
neuromodulation target, guided-tour lens target, pathway option or treatment
reference does not resolve to real renderable geometry or a declared marker.
It also fails if a registry treatment indicated for a disorder is missing from
that disorder's file, so the Treatments tab cannot silently omit a guideline
option.

---

*Phases 1-3 complete (11 disorders: psychotic, mood, anxiety and fear-related,
stress-related, obsessive-compulsive, and neurodevelopmental). Next: Phase 4 —
substance use disorders, neurocognitive disorders, eating disorders, personality
disorders.*
