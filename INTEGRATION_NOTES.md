# Integration and compliance pass — 2026-09-29

## Premise finding: there is no upstream to integrate

The request was to integrate NeuroMap Brain + Clinic *from* the upstream
(`Raghavsuthar/neuromap-brain-3d`) *into* "the website repository currently
open in this workspace".

The target chosen was `neuromap-brain-3d` — which **is** the upstream project.
The viewer, the 11 disorders, the 7/6/14/22-record clinical layer, the animated
circuit mode and the learning features are all already in this repository at
`879e1ab`. There is therefore nothing to port, and no integration was performed.

Importing upstream content into itself would have produced a second forked copy
of data that is already canonical here. That is explicitly the wrong outcome, so
the pass was redirected to the work the request also calls out as mandatory:
**resolving the licence discrepancy, verifying the stated figures against source
data, and confirming the safety and attribution notices are actually visible.**

## Figures verified against source (all correct, no changes needed)

| Claim | Stated | Source of truth | Result |
|---|---|---|---|
| 3D structures | 437 | `manifest.json` → 437 nodes / 237 unique labels | OK (see note below) |
| Systems | 12 | `manifest.json` categories | OK |
| Circuits | 7 | `public/brain-atlas/circuits3d.json` | OK |
| Circuits (clinical) | 7 | `public/clinical/circuits.json` | OK |
| Neurotransmitters | 6 | `public/clinical/transmitters.json` | OK |
| Syndromes | 14 | `public/clinical/syndromes.json` | OK |
| Psychotropics | 22 | `public/clinical/drugs.json` | OK |
| Disorders | 11 | `content/disorders/*.json` (excl. TEMPLATE) | OK |
| Sources | 81 | `content/registries/sources.json` | OK |

Note on "437 structures": `manifest.json` contains **437 mesh nodes** resolving to
**237 distinct labels** (bilateral pairs such as left/right hippocampus are
separate nodes sharing a label). 437 is the correct node count and is what the
UI reports; the figure is not wrong, but it is worth knowing that there are 237
distinct named structures, since several split meshes map to one name.

No empty sections were presented as evidence: `symptomDomains` (the
Psychopathology tab) and the other array keys were checked against
`content/schema/disorder.schema.json`, and `evidence` is derived from
`content/registries/sources.json` via claim-level source IDs rather than being a
top-level array. All 11 disorders populate every required schema key.

## Defects found and fixed

### 1. The disorder panel never rendered its disclaimer — content-safety defect

`src/disorder.js` defined `STRINGS.disclaimer`
("Educational content - not clinical decision support, not for prescribing…")
at line 24 and **never referenced it anywhere**. The disorder layer is the app's
largest medical surface (11 conditions, treatment claims, drug records) and it
displayed no disclaimer at all. `src/clinical.js` does render one
(`disclaimerHtml()`), and the footer said only "educational only".

Fixed by rendering the disclaimer in the disorder panel and strengthening the
global footer, so the notice is present on every view rather than only on two.

### 2. Two of the four clinical layers had no disclaimer

`src/clinical.js` builds a separate detail sheet per layer. `syndromes` and
`drugs` appended `disclaimerHtml()`; `circuits` and `transmitters` did not.
The transmitters sheet is the most pharmacologically loaded of the four
(receptor subtypes, mechanism, primary function, brain locations) and it
rendered with no "not primary diagnostic advice" notice, so a reader moving
from a disclaimed drug sheet into a transmitter sheet lost the caveat.

Both branches now append the disclaimer, and a browser test asserts the notice
is present on all four layers' record details.

### 3. Unsourced receptor affinities were printed as "Ki N/A nM"

**27 of 78** receptor targets in `public/clinical/drugs.json` have `kiNm: null`
(lithium, lamotrigine, divalproex, esketamine among them). Those rows rendered
as "Ki N/A nM", which reads like a malformed value and can be misread as zero
next to the real numbers beside it. They now read "affinity not sourced",
matching how the disorder layer already handled the same field. No value was
estimated or filled in.

### 4. Code licence was genuinely contradictory and undocumented

- Root `LICENSE`: viewer source code is **Apache-2.0**.
- `DATA_LICENSES.md` ("Licensing of This Project"): "Code (src/, scripts/,
  .github/, package.json, etc.): **MIT** License", and its compliance checklist
  asserted "All source code under MIT".

**Resolution: Apache-2.0 governs the code.** The root `LICENSE` is the only
licence grant in the repository, it names the covered paths explicitly, and it
is corroborated by the absence of any competing grant: there is no `LICENSE-MIT`,
no `LICENSE-MIT.txt`, and no SPDX or licence header in any file under `src/` or
`scripts/`. The MIT claim in `DATA_LICENSES.md` is unsupported by any licence
file in the repository and is treated as stale documentation. `DATA_LICENSES.md`
has been corrected to match, and the discrepancy is now recorded in the file
rather than silently overwritten.

`DATA_LICENSES.md` also claimed a **"MIT**" licence for `README.md` and for
`DATA_LICENSES.md` itself; the root `LICENSE` says nothing about documentation,
so that claim was unverified and has been re-stated as what the repository
actually asserts.

### 5. A dependency that does not exist was listed

`DATA_LICENSES.md` listed "Zod (validator dependency) — MIT". `zod` is not in
`package.json` (dependencies are exactly `three@0.170.0`; devDependency
`vite@^6.0.0`) and is not referenced in any source or script. The content
validator is hand-written in `scripts/validate-disorders.mjs`. The phantom entry
has been removed, so the notices file is a truthful dependency record.

### 6. The Apache-2.0 text itself was missing

The root `LICENSE` was a short notice, not the licence. Apache-2.0 §4(a)
requires giving recipients a copy of the Licence. `LICENSE-APACHE-2.0.txt` now
holds the canonical text, retrieved from
<https://www.apache.org/licenses/LICENSE-2.0.txt> rather than reproduced from
memory, and the notice points to it.

### 7. No third-party notices file existed

Added `THIRD-PARTY-NOTICES.md` consolidating the third-party attributions
(Three.js, Draco, Vite, Z-Anatomy/BodyParts3D/DBCLS) with direct source links
and licence names.

The footer now links to it, so `scripts/copy-content.mjs` also copies the four
licence documents to `dist/`. Vite only copies `public/`, so without this step
the credits link would have 404'd in production. The copy step **fails the
build** if a declared document is missing, and CI step 7 asserts that the
documents shipped, that the footer still links them, that the model attribution
and the educational-use notice are present in the built HTML, and that the
Apache-2.0 text is the real thing rather than a stub.

## Model and content licensing — unchanged, deliberately

The 3D model (`brain.glb`, 4.4 MB), `manifest.json` and all content under
`content/` are **CC BY-SA 4.0**, which is share-alike. No model asset was copied,
moved or relicensed. The footer attribution to Z-Anatomy contributors and
BodyParts3D / DBCLS is retained adjacent to the viewer. DrugBank material remains
cited-only: no raw DrugBank records, Ki tables or affinity values were added, and
the existing registry already omits any `kiNm` it cannot source.

## Explicitly not done

- No framework migration, no port of upstream content into itself.
- The feature-flagged scaffolds (compare mode, clinical vignettes, speech
  narration, PWA, translations) remain flagged-off behind `FEATURES` in
  `src/disorder.js` and are labelled as planned in the README. None of them is
  wired to a visible control, so no nonfunctional stub is presented as working.
- No backend, analytics, auth, telemetry or external API was added.
