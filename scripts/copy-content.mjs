/* Copies the /content data tree into dist/ so the deployed app can lazily
   fetch disorder and registry JSON at runtime.
   content/ lives at the project root (not inside public/) so that the source
   data stays easy to review and lint; this step is what makes it ship.
   No extra dependencies: run automatically by `npm run build`. */
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'content');
const OUT = join(ROOT, 'dist', 'content');

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
