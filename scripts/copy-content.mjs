/* Copies the /content data tree into dist/ so the deployed app can lazily
   fetch disorder and registry JSON at runtime.
   content/ lives at the project root (not inside public/) so that the source
   data stays easy to review and lint; this step is what makes it ship.

   Also copies the licence/attribution documents to the dist root. These are
   referenced by the in-app footer ("Licences and credits"), so they must be
   reachable on the deployed site, and Vite only copies public/. Apache-2.0
   §4(a) requires that recipients of the redistributed viewer code are given a
   copy of the licence, so the full text ships alongside the app.

   No extra dependencies: run automatically by `npm run build`. */
import { cp, mkdir, readdir, stat, copyFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'content');
const OUT = join(ROOT, 'dist', 'content');
const DIST = join(ROOT, 'dist');

// Documentation that must be reachable from the deployed site.
const LEGAL_DOCS = [
  'LICENSE',
  'LICENSE-APACHE-2.0.txt',
  'DATA_LICENSES.md',
  'THIRD-PARTY-NOTICES.md',
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  let files = 0;
  let bytes = 0;
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await walk(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += (await stat(p)).size;
    }
  }
  return { files, bytes };
}

await mkdir(OUT, { recursive: true });
await cp(SRC, OUT, { recursive: true });
const { files, bytes } = await walk(OUT);
console.log(`content: copied ${files} file(s), ${(bytes / 1024).toFixed(1)} kB to dist/content`);

// Ship the licence documents, and fail the build if one is declared but
// missing, so a broken footer link can never ship silently.
const shipped = [];
const missing = [];
for (const name of LEGAL_DOCS) {
  const from = join(ROOT, name);
  try {
    await access(from);
    await copyFile(from, join(DIST, name));
    shipped.push(name);
  } catch {
    missing.push(name);
  }
}
if (missing.length) {
  console.error(`licences: MISSING declared document(s): ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`licences: copied ${shipped.length} document(s) to dist/ (${shipped.join(', ')})`);
