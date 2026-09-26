# NeuroMap 3D Brain

**Live demo: https://Raghavsuthar.github.io/neuromap-brain-3d/**

A realistic, browser-based, interactive 3D brain. It renders real,
sourced, scan-derived anatomy — 437 individually named structures across
12 systems (cortical gyri/sulci, deep grey nuclei, diencephalon,
white-matter tracts, ventricles, brainstem, cerebellum, Circle of Willis,
dural sinuses, meninges, cranial nerves) — with PBR tissue materials,
studio lighting, orbit/zoom/pan, click-to-inspect with TA2 anatomical
paths, live search, toggleable labels, sagittal/coronal/axial slice
planes, a cortex-opacity slider that fades the surface to reveal the
deep brain, and one-click PNG screenshots for teaching.

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
neurotransmitters, 12 syndromes, 18 psychotropics** — behind the
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
