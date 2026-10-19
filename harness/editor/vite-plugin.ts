import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { formatLevel } from './format';
import { invalidate, plan } from '../hot/graph';

/** The only files the editor may write: a level, or one in a folder of levels (`levels/places/`). Checked on the string, then again on the resolved path. */
export const LEVEL_PATH = /^games\/[A-Za-z0-9_-]+\/levels\/(?:[A-Za-z0-9_-]+\/)?[A-Za-z0-9_-]+\.json$/;

/** Absolute file for a repo-relative level path, or null if it is not `games/<game>/levels/<name>.json` (or one folder down: `levels/<folder>/<name>.json`). */
export function levelFile(root: string, rel: unknown): string | null {
  if (typeof rel !== 'string' || !LEVEL_PATH.test(rel)) return null;
  const file = resolve(root, rel);
  return file.startsWith(resolve(root, 'games') + sep) ? file : null;
}

const validEntity = (e: any) =>
  e && typeof e.id === 'string' && typeof e.type === 'string' && Number.isFinite(e.x) && Number.isFinite(e.y);

/**
 * Dev server only. POST /__editor/save {path, data} writes a level file; nothing else is writable.
 * A level file the editor just wrote is not announced to the page (the editor already holds that state), but its modules
 * are marked updated so a later scene swap imports the saved file. Any other change to a level file is an ordinary HMR
 * update: the scene that imports it is swapped and restarted (harness/hot/README.md).
 */
export function editorPlugin(): Plugin {
  let root = process.cwd();
  let server: ViteDevServer | undefined;
  const saved = new Map<string, string>(); // file -> text the editor last wrote
  return {
    name: 'level-editor',
    apply: 'serve',
    configResolved: (c) => void (root = c.root),
    handleHotUpdate({ file, modules, timestamp }) {
      const abs = levelFile(root, file.slice(root.length + 1).split(sep).join('/'));
      if (!abs || !server) return;
      let text: string | undefined;
      try {
        text = readFileSync(abs, 'utf8');
      } catch {}
      if (text === undefined || text !== saved.get(abs)) return; // an outside edit: let it through
      const p = plan(modules);
      if (p) invalidate(server, p, timestamp);
      else for (const m of modules) server.moduleGraph.invalidateModule(m, new Set(), timestamp, true);
      return [];
    },
    configureServer(s) {
      server = s;
      s.middlewares.use('/__editor/save', (req, res) => {
        const reply = (code: number, body: object) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST only' });
        // A page on another origin must not be able to write files through the dev server.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return reply(403, { error: 'cross-origin' });
        if (!String(req.headers['content-type']).startsWith('application/json')) return reply(415, { error: 'JSON only' });
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 2_000_000) req.destroy();
        });
        req.on('end', () => {
          try {
            const { path, data } = JSON.parse(body);
            const file = levelFile(root, path);
            if (!file) return reply(400, { error: `path must match games/<game>/levels/[<folder>/]<name>.json: ${path}` });
            if (!Array.isArray(data?.entities) || !data.entities.every(validEntity)) return reply(400, { error: 'bad level data' });
            if (!existsSync(resolve(root, path.split('/').slice(0, 2).join('/')))) return reply(400, { error: 'no such game' });
            mkdirSync(dirname(file), { recursive: true });
            const text = formatLevel(data);
            saved.set(file, text);
            writeFileSync(file, text);
            reply(200, { ok: true, path });
          } catch (err) {
            reply(400, { error: String(err) });
          }
        });
      });
    },
  };
}
