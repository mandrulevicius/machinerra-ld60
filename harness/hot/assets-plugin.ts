import { spawn } from 'node:child_process';
import { relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Dev server only. Source art and audio build themselves: a change under `games/<game>/art/` (an image, or `sizes.json`)
 * runs `scripts/assets.mjs <game>`, one under `games/<game>/audio/` (a wav, flac or aiff) runs `scripts/audio.mjs <game>`
 * (the same as `npm run assets|audio -- <game>`; both are incremental, so a run with nothing new is a no-op), debounced,
 * one run per game and kind at a time. What they write under `public/` then reloads live (`client.ts`).
 * Runs are logged in the server output; the page shows a toast (`harness:toast`) when one starts and when one fails.
 */

/** The game whose art or `art/sizes.json` this URL path (`/games/<game>/art/...`) is, else null. */
export const artGame = (url: string) => /^\/games\/([^/]+)\/art\/(?:.+\.(?:png|webp|jpe?g)|sizes\.json)$/i.exec(url)?.[1] ?? null;
/** The game whose source audio this URL path (`/games/<game>/audio/...`) is, else null. */
export const audioGame = (url: string) => /^\/games\/([^/]+)\/audio\/.+\.(?:wav|flac|aiff?)$/i.exec(url)?.[1] ?? null;

const DEBOUNCE_MS = 500;
const KINDS = {
  art: { script: 'scripts/assets.mjs', doing: 'building atlas', failed: 'atlas failed', of: artGame },
  audio: { script: 'scripts/audio.mjs', doing: 'encoding audio', failed: 'audio failed', of: audioGame },
};
type Kind = keyof typeof KINDS;

export function assetsPlugin(): Plugin {
  return {
    name: 'game-assets',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      const log = server.config.logger;
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      const running = new Set<string>();
      const again = new Set<string>(); // changed while its run was going

      const run = (kind: Kind, game: string) => {
        const job = `${kind}:${game}`;
        const k = KINDS[kind];
        running.add(job);
        log.info(`[${kind}] ${game}: ${k.doing}`, { timestamp: true });
        server.ws.send('harness:toast', { text: `${k.doing}: ${game}` });
        let out = '';
        const p = spawn(process.execPath, [resolve(root, k.script), game], { cwd: root, windowsHide: true });
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', (d) => (out += d));
        p.on('error', (e) => (out += String(e)));
        p.on('close', (code) => {
          running.delete(job);
          const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (code === 0) log.info(`[${kind}] ${lines.find((l) => l.startsWith(`${game}:`)) ?? `${game}: done`}`, { timestamp: true });
          else {
            const why = lines.find((l) => /^Error:/.test(l))?.replace(/^Error:\s*/, '') ?? lines[lines.length - 1] ?? `exit ${code}`;
            log.warn(`[${kind}] ${game}: failed: ${why}`, { timestamp: true });
            server.ws.send('harness:toast', { text: `${k.failed}: ${game}: ${why}` });
          }
          if (again.delete(job)) schedule(kind, game);
        });
      };
      const schedule = (kind: Kind, game: string) => {
        const job = `${kind}:${game}`;
        if (running.has(job)) return void again.add(job);
        clearTimeout(timers.get(job));
        timers.set(job, setTimeout(() => (timers.delete(job), run(kind, game)), DEBOUNCE_MS));
      };
      const onFile = (file: string) => {
        const url = '/' + relative(root, file).replaceAll('\\', '/');
        for (const kind of Object.keys(KINDS) as Kind[]) {
          const game = KINDS[kind].of(url);
          if (game) schedule(kind, game);
        }
      };
      for (const ev of ['add', 'change', 'unlink'] as const) server.watcher.on(ev, onFile);
    },
  };
}
