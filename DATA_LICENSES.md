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
**Data source:** SCHEMA exome study (Nature 2022, CC BY 4.0), PGC3 GWAS (Nature 2022, CC BY 4.0), C4A (Sekar et al. 2016, CC BY 4.0)

### Drugs Registry (content/registries/drugs.json)
**Data source:** DrugBank (requires license for redistribution — this project only includes summary pharmacology with citations to DrugBank, not raw data), IUPHAR/BPS Guide to Pharmacology (CC BY 4.0), FDA labels (public domain), IPS CPG 2025 (open access), NICE guidelines (open access)

### Treatments Registry (content/registries/treatments.json)
**Data source:** NICE CG178 (open access), IPS CPG 2025 (open access), TRRIP 2017 (open access), FDA labels (public domain), WFSBP guidelines (open access), CANMAT guidelines (open access), Lefaucheur 2020 rTMS guidelines, Fregni 2021 tDCS guidelines

### Clinical Disorder Content (content/disorders/*.json)
**Data source:** Synthesized from the above guideline and primary literature sources. All claims are cited with source IDs referencing the above registries.

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

### Zod (validator dependency)
**License:** MIT License

## Schizophrenia Disorder Content (content/disorders/schizophrenia.json)

All claims are cited to the sources in `content/registries/sources.json`. The content is synthesized from open-access guidelines (IPS CPG, NICE CG178, WFSBP, CANMAT), primary literature (ENIGMA consortium, PGC3 GWAS, SCHEMA exome study, Sekar et al. C4, Howes & Kapur 2009, etc.), and drug reference databases (IUPHAR, DrugBank via citations, FDA labels). All claims are original summaries — no text copied verbatim from copyrighted sources.

## Licensing of This Project

**Code (src/, scripts/, .github/, package.json, etc.):** MIT License

**Content (content/registries/*, content/disorders/*, content/schema/*):** CC BY-SA 4.0 — same as the source atlas, to honor the share-alike requirement of the Brain Project data.

**3D Model Assets:** CC BY-SA 4.0 (inherited from Brain Project / Z-Anatomy / BodyParts3D / DBCLS)

**Documentation (README.md, DATA_LICENSES.md):** MIT License

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

- [x] CC BY-SA 4.0 attribution for 3D model included in app footer and README
- [x] DrugBank data not redistributed (only cited)
- [x] DrugBank license acknowledged; no raw data redistributed
- [x] IUPHAR data used under CC BY 4.0
- [x] Three.js / RoomEnvironment / Draco used under their respective permissive licenses
- [x] All source code under MIT
- [x] Content under CC BY-SA 4.0 (compatible with Brain Project CC BY-SA 4.0)
- [x] DATA_LICENSES.md included in repository
- [x] No proprietary data redistributed without permission

---

*Last updated: 2026-09-28*
*For questions about licensing, see the source registry files in `content/registries/` or open an issue.*