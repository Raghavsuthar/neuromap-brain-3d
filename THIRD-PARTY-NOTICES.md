# Third-party notices

NeuroMap 3D Brain redistributes and depends on the following third-party
works. Each remains under its own licence; none is relicensed by this
project. Direct source links are given so the terms can be checked.

## Redistributed data assets

### 3D Brain Atlas — `public/brain-atlas/models/brain.glb`, `manifest.json`
- **Licence:** Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0) — <https://creativecommons.org/licenses/by-sa/4.0/>
- **Attribution:** © Z-Anatomy contributors; BodyParts3D / DBCLS
  (The Database Center for Life Science)
- **Upstream:** <https://github.com/itayinbarr/brainproject>
- **Terms that bind you:** derivatives must remain CC BY-SA 4.0 and keep the
  attribution. The deep nuclei are registered from open MNI-space imaging
  atlases and are approximate (~7 mm resolution). Educational use only, not
  for clinical use. Per-structure mapping precision is recorded in the
  manifest as exact, proxy or schematic.

### BodyParts3D terminology and element mappings
Referenced by the upstream atlas for anatomical naming and hierarchy.
- **Licence:** CC BY 4.0 — <https://creativecommons.org/licenses/by/4.0/>
- **Archive:** <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>

## Bundled runtime components

### Draco decoder — `public/brain-atlas/vendor/draco/`
- **Licence:** Apache License 2.0
- **Source:** <https://github.com/google/draco>

### Three.js (loaded as an npm dependency, not vendored)
- **Licence:** MIT
- **Version in use:** 0.170.0
- **Source:** <https://github.com/mrdoob/three.js>
- Includes `RoomEnvironment` from the three.js examples, also MIT.

### Vite (build tool, dev dependency)
- **Licence:** MIT
- **Source:** <https://github.com/vitejs/vite>

## Clinical data sources (summarised and cited, not redistributed wholesale)

| Source | Licence / status | How it is used |
|---|---|---|
| IUPHAR/BPS Guide to Pharmacology | CC BY 4.0 | Receptor and transmitter pharmacology, cited |
| Hansen et al. 2022 PET atlas | CC BY 4.0 | Receptor density context, cited |
| FDA drug labels | Public domain | Dosing and indication wording, cited |
| IPS CPG 2025, NICE CG178, WFSBP, CANMAT | Open access | Guideline-derived claims, cited |
| Lefaucheur 2020 (rTMS), Fregni 2021 (tDCS) | Open access | Neuromodulation claims, cited |
| ENIGMA consortium, PGC, SCHEMA, Sekar et al. 2016 | Open access / CC BY 4.0 | Effect sizes and genetic findings, cited |
| **DrugBank** | **Licensed — not redistributable** | **Cited only.** No raw records, Ki tables or affinity values are included in this repository. |

Every claim in `content/` carries a source ID that resolves to
`content/registries/sources.json` (81 entries). Any field that could not be
sourced from a permitted source is omitted rather than estimated — for
example, a receptor affinity is shown only where `kiNm` is present in the
sourced registry entry.

## This project

- **Viewer code:** Apache License 2.0 (Apache-2.0) — see `LICENSE` and
  `LICENSE-APACHE-2.0.txt`.
- **Content and 3D assets:** CC BY-SA 4.0 as described above.

## Ideas studied but not copied

- **neurarium** (github.com/olicorne/neurarium, Olivier Cornelis) — a 3D brain
  encyclopedia with projection arrows, receptor/drug focus animations, a
  provenance-grading system, search, tours, themes and offline support.
  **Licence: GNU AGPL-3.0.** Studied for interaction ideas only. No neurarium
  code, data file, text, image, mesh or other asset was copied into this
  repository; the search, coverage, quality-governor and shortcut-help work
  added in 2026-09-30 (3) is original clean-room implementation against this
  project's own data model, so no AGPL terms attach to this project. Linked
  here as attribution for the ideas, as its author requests corrections and
  reuse inquiries through the repository above.

## Accuracy and currency

Figures quoted in the README were re-verified against the source data files on
2026-09-29 (437 mesh nodes / 237 distinct labels, 12 systems, 7 circuits, 6
neurotransmitters, 14 syndromes, 22 psychotropics, 11 disorders, 81 sources).
Clinical content is educational and reference-only. It is not diagnostic
advice, not clinical decision support, and not prescribing guidance; check
current guidelines and local formulary before any clinical use.
