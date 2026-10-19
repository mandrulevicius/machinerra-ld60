// Usage: npm run build -- <game>   → games/<game>/dist/ and games/<game>/<game>.zip (itch.io HTML upload)
import { build } from 'vite';
import { zipSync } from 'fflate';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const name = process.argv[2];
if (!name) throw new Error('Usage: npm run build -- <game>');
const root = resolve('games', name);
const outDir = join(root, 'dist');

// Relative base: itch.io serves the game from a subpath.
await build({ root, base: './', build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 2000 } });

// The loader (harness/kit/audio.ts `load`) tries ogg first and mp3 only when there is no ogg, so a song's mp3 is never fetched when its ogg is there: leave it out of the zip (about half of it). Sound effects keep their mp3.
const walkDirs = (dir, fn) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkDirs(p, fn);
    else fn(p);
  }
};
const music = join(outDir, 'audio', 'music');
if (existsSync(music)) walkDirs(music, (p) => p.endsWith('.mp3') && existsSync(p.replace(/\.mp3$/, '.ogg')) && rmSync(p));

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
