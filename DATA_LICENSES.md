# Data Licenses

This file documents all external datasets and sources used in NeuroMap 3D Brain, their licenses, and redistribution terms.

## 3D Brain Atlas (Brain Project / Z-Anatomy / BodyParts3D / DBCLS)

**Files:** `public/brain-atlas/models/brain.glb`, `public/brain-atlas/models/manifest.json`, `public/brain-atlas/vendor/draco/*`

**License:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)

**Attribution:** Z-Anatomy contributors and BodyParts3D / Database Center for Life Science (DBCLS)

**Notes:** The 3D model is derived from open anatomical and imaging data. Deep nuclei (thalamic nuclei, substantia nigra, etc.) are registered from open MNI-space imaging atlases and remain approximate (~7 mm resolution). Educational use only — not for clinical decision-making.

**Source:** https://github.com/itayinbarr/brainproject

## Source Registries (content/registries/*.json)

### Sources Registry (content/registries/sources.json)
**License:** Each source has its own license as noted in the individual source entries. Most are open-access academic publications or official guideline documents.

### Receptors Registry (content/registries/receptors.json)
**Data source:** IUPHAR/BPS Guide to Pharmacology (CC BY 4.0), Hansen et al. 2022 PET atlas (CC BY 4.0), FDA drug labels (public domain)

### Genes Registry (content/registries/genes.json)
**Data source:** SCHEMA exome study (Nature 2022, CC BY 4.0), PGC3 GWAS (Nature 2022, CC BY 4.0), C4A (Sekar et al. 2016, CC BY 4.0). Loss-of-function constraint metrics (pLI, observed/expected LoF) per gene retrieved live from the gnomAD browser GraphQL API (`https://gnomad.broadinstitute.org/api`, reference genome GRCh38) on 2026-09-30 via `scripts/fetch_gnomad.py`; raw responses logged in `content/generated/gnomad-constraints.json`. Method: Karczewski et al., Nature 2020 (PMID 32461654, PMCID PMC7334197). Only minimal per-gene facts are stored (no dataset redistribution). License note: gnomAD browser code is MIT; the data-use terms page is JavaScript-rendered and its full text could not be verified from here — Azure Open Datasets describes gnomAD data as "available without restrictions" and primary genome data as CC0, but if the project reuses these values commercially, re-check https://gnomad.broadinstitute.org/terms first. PARK2 is queried as its approved symbol PRKN (recorded in the data). Gene cards also link out to the Open Targets target page and the gnomAD gene page via the stored Ensembl ID; link-outs copy no data and need no license.

### Drugs Registry (content/registries/drugs.json)
**Data source:** DrugBank (requires license for redistribution — this project only includes summary pharmacology with citations to DrugBank, not raw data), IUPHAR/BPS Guide to Pharmacology (CC BY 4.0), FDA labels (public domain), IPS CPG 2025 (open access), NICE guidelines (open access)

### Treatments Registry (content/registries/treatments.json)
**Data source:** NICE CG178 (open access), IPS CPG 2025 (open access), TRRIP 2017 (open access), FDA labels (public domain), WFSBP guidelines (open access), CANMAT guidelines (open access), Lefaucheur 2020 rTMS guidelines, Fregni 2021 tDCS guidelines

### Clinical Disorder Content (content/disorders/*.json)
**Data source:** Synthesized from the above guideline and primary literature sources. All claims are cited with source IDs referencing the above registries.

**Note on 2026-09-29 content additions.** Three genetics claims and one enriched neurochemistry claim were added to `schizophrenia.json`, citing two new bibliographic-only sources: `pgc2-2014` (PGC Nature 2014, doi:10.1038/nature13595) and `howes-2015` (J Psychopharmacol 2015, doi:10.1177/0269881114563634). Both were verified by retrieving their PubMed records and abstracts and by confirming the DOIs against Crossref. No data file, model or dataset was added or redistributed, so the CC BY-SA 4.0 chain and the Apache-2.0 code grant are unchanged. Claims are original summaries; no abstract or article text was copied.

### Derived annotation: `public/brain-atlas/function-systems.json`
**License:** part of this project; no third-party asset.

The colour-by-function grouping is generated *inside* this repository by rule from
structure names in `manifest.json` and the function notes in `functions.json`. It
adds no external data, model or dataset, so the CC BY-SA 4.0 attribution for the
atlas is unchanged. It is a teaching aid, not an official parcellation. Audited by
`npm run check:functions`.

## 3D Assets

### Three.js (r170)
**License:** MIT License
**Source:** https://github.com/mrdoob/three.js

### RoomEnvironment (Three.js examples)
**License:** MIT License (part of three.js examples)

### Draco Decoder (draco3d)
**License:** Apache 2.0
**Source:** https://github.com/google/draco

### Vite
**License:** MIT License

*Note: the content validator is hand-written (`scripts/validate-disorders.mjs`).
An earlier revision of this file listed "Zod (validator dependency)". Zod is not
a dependency of this project and is not referenced in any source or script;
`package.json` declares exactly `three` (dependency) and `vite` (devDependency).
That entry has been removed so this file is a truthful dependency record.*

## Schizophrenia Disorder Content (content/disorders/schizophrenia.json)

All claims are cited to the sources in `content/registries/sources.json`. The content is synthesized from open-access guidelines (IPS CPG, NICE CG178, WFSBP, CANMAT), primary literature (ENIGMA consortium, PGC3 GWAS, SCHEMA exome study, Sekar et al. C4, Howes & Kapur 2009, etc.), and drug reference databases (IUPHAR, DrugBank via citations, FDA labels). All claims are original summaries — no text copied verbatim from copyrighted sources.

## Licensing of This Project

**Code (src/, scripts/, .github/, package.json, vite config, index.html):**
Apache License 2.0 — full text in `LICENSE-APACHE-2.0.txt`.

**Content (content/registries/*, content/disorders/*, content/markers.json, content/schema/*):**
CC BY-SA 4.0 — same as the source atlas, to honor the share-alike requirement of the Brain Project data.

**3D Model Assets:** CC BY-SA 4.0 (inherited from Brain Project / Z-Anatomy / BodyParts3D / DBCLS)

**Documentation (README.md, DATA_LICENSES.md, INTEGRATION_NOTES.md, THIRD-PARTY-NOTICES.md):**
covered by the same Apache License 2.0 grant as the code. The root `LICENSE`
does not name documentation separately, so this statement restates the code
grant rather than asserting a separate licence that no file establishes.

### Resolved discrepancy: MIT vs Apache-2.0 for code

An earlier revision of this section stated "**MIT License**" for `src/`,
`scripts/` and `.github/`, and the compliance checklist below asserted "All
source code under MIT". That claim conflicted with the root `LICENSE`, which
has always granted **Apache License 2.0** to the viewer source code.

**Resolution: Apache License 2.0 governs the code.** The basis:

1. The root `LICENSE` is the only licence *grant* in the repository and it
   names the covered paths explicitly.
2. No competing grant exists anywhere: there is no `LICENSE-MIT`, no
   `LICENSE-MIT.txt`, and no SPDX or licence header in any file under `src/`
   or `scripts/`.
3. A bare claim in a data-attribution document is not a licence grant.

The MIT line was stale documentation and has been corrected here. This is
recorded rather than silently overwritten so the change is auditable. Note
that neither licence was ever applied to the CC BY-SA assets, and the
Apache 2.0 patent grant does not extend to them.

## Redistribution Notes

- The 3D model (`public/brain-atlas/models/brain.glb`) is CC BY-SA 4.0. If you redistribute the model or derivatives, you must:
  1. Attribute Z-Anatomy contributors and BodyParts3D / DBCLS
  2. Share derivatives under the same CC BY-SA 4.0 license
  3. Include this license notice

- The DrugBank-derived data in `content/registries/drugs.json` is summary pharmacology with citations only — raw Ki values or full DrugBank records are NOT included. Full DrugBank access requires a separate license from DrugBank.

- The 3D model was preprocessed offline using Blender + glTF-Transform + draco3dgltf. The preprocessing scripts are in `/scripts` (not included in the shipped app).

## Attribution Summary (for end-user display)

```
3D Brain Anatomy: © Z-Anatomy contributors and BodyParts3D / DBCLS (CC BY-SA 4.0)
Clinical Content: Synthesized from IPS CPG, NICE CG178, WFSBP, CANMAT, PGC3, SCHEMA, ENIGMA, Sekar et al. 2016, Howes & Kapur 2009, FDA labels, IUPHAR
Drug Data: IUPHAR/BPS Guide to Pharmacology (CC BY 4.0), DrugBank (cited only), FDA labels
Genetics: PGC3 (Nature 2022), SCHEMA (Nature 2022), Sekar et al. 2016
Imaging: ENIGMA Consortium (van Erp 2016, 2018; Kelly 2018), Hansen et al. 2022 PET Atlas
3D Engine: Three.js (MIT), RoomEnvironment (MIT), Draco (Apache 2.0)
```

## License Compliance Checklist

- [x] CC BY-SA 4.0 attribution for the 3D model included in app footer and README
- [x] DrugBank data not redistributed (only cited)
- [x] DrugBank license acknowledged; no raw data redistributed
- [x] IUPHAR data used under CC BY 4.0
- [x] Three.js / RoomEnvironment / Draco / Vite used under their respective permissive licenses
- [x] Viewer code under Apache License 2.0, with the full licence text in `LICENSE-APACHE-2.0.txt` (Apache-2.0 §4(a))
- [x] Code-licence discrepancy (MIT vs Apache-2.0) resolved and documented above
- [x] Content under CC BY-SA 4.0 (compatible with Brain Project CC BY-SA 4.0)
- [x] Third-party dependencies enumerated in THIRD-PARTY-NOTICES.md
- [x] DATA_LICENSES.md included in repository
- [x] No proprietary data redistributed without permission
- [x] Educational-use disclaimer visible on the disorder, clinical and 3D views

---

*Last updated: 2026-09-28*
*For questions about licensing, see the source registry files in `content/registries/` or open an issue.*