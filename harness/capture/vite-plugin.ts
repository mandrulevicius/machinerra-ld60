import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The only files capture may write: a still or a webm in `games/<game>/capture/`, numbered frames in
 * `games/<game>/capture/<name>.frames/` (render mode), a bug report in `games/<game>/capture/bugs/`, or a small webp in `games/<game>/public/previews/`
 * (thumb, committed with the game), or a matrix shot `capture/matrix/<scene>/<slot>=<value>__<slot>=<value>.png` (or `index.png`).
 * Checked on the string, then again on the resolved path.
 */
const NAME = '[A-Za-z0-9_-]+';
export const CAPTURE_PATH = new RegExp(
  `^games/${NAME}/(?:capture/(?:${NAME}\\.frames/\\d{1,6}\\.png|bugs/${NAME}\\.(?:json|png)|matrix/${NAME}/(?:index|${NAME}=${NAME}(?:__${NAME}=${NAME})*)\\.png|${NAME}\\.(?:png|webm))|GameDevDocs/\\.review/${NAME}/(?:\\d{2}\\.png|contact\\.png|manifest\\.json)|public/previews/${NAME}\\.webp)$`,
);

/** Absolute file for a repo-relative capture path, or null if it is not an allowed one. */
export function captureFile(root: string, rel: unknown): string | null {
  if (typeof rel !== 'string' || !CAPTURE_PATH.test(rel)) return null;
  const file = resolve(root, rel);
  return file.startsWith(resolve(root, 'games') + sep) ? file : null;
}

/**
 * Dev server only. POST /__capture/save?path=games/<game>/capture/<name>.png with the file as the raw body.
 * Captures are ignored by the file watcher so writing one never reloads the game.
 */
export function capturePlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'capture',
    apply: 'serve',
    config: () => ({ server: { watch: { ignored: ['**/games/*/capture/**', '**/games/*/GameDevDocs/.review/**'] } } }),
    configResolved: (c) => void (root = c.root),
    configureServer(server) {
      server.middlewares.use('/__capture/save', (req, res) => {
        const reply = (code: number, body: object) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST only' });
        // A page on another origin must not be able to write files through the dev server.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return reply(403, { error: 'cross-origin' });
        const path = new URL(req.url ?? '', 'http://x').searchParams.get('path');
        const file = captureFile(root, path);
        if (!file) return reply(400, { error: `path must match ${CAPTURE_PATH}: ${path}` });
        if (!existsSync(resolve(root, path!.split('/').slice(0, 2).join('/')))) return reply(400, { error: 'no such game' });
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 500_000_000) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          try {
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, Buffer.concat(chunks));
            reply(200, { ok: true, path, bytes: size });
          } catch (err) {
            reply(500, { error: String(err) });
          }
        });
      });
    },
  };
}
