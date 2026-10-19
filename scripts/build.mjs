// Usage: npm run build -- <game>   → games/<game>/dist/ and games/<game>/<game>.zip (itch.io HTML upload)
import { build } from 'vite';
import { zipSync } from 'fflate';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const name = process.argv[2];
if (!name) throw new Error('Usage: npm run build -- <game>');
const root = resolve('games', name);
const outDir = join(root, 'dist');

// Relative base: itch.io serves the game from a subpath.
await build({ root, base: './', build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 2000 } });

const files = {};
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files[relative(outDir, p).split(sep).join('/')] = readFileSync(p);
  }
};
walk(outDir);
const zip = join(root, `${name}.zip`);
writeFileSync(zip, zipSync(files));
console.log(`${zip}: ${Object.keys(files).length} files, index.html at root: ${'index.html' in files}`);
