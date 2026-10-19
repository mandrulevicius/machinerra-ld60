import { relative } from 'node:path';
import type { ModuleNode, Plugin } from 'vite';
import { invalidate, plan } from './graph';

/**
 * Dev server only. Hot reload for games (README.md):
 *  - scene modules (a class `extends ...Scene` under games/) accept their own update, so an edit to a scene, or to a module
 *    only scenes import (rules, a level JSON), reaches `client.ts` instead of reloading the page; an edit that reaches
 *    anything else (main.ts, harness/kit) still reloads the page, as before;
 *  - changed asset files (atlas pages, images, audio) are announced to the page as `harness:asset`.
 */

/** A game source file that may hold a scene (not tests, not build output). */
export const isGameSource = (id: string) =>
  /\/games\/[^/]+\/(?!(?:.*\/)?(?:node_modules|dist)\/).+\.(?:ts|js)$/.test(id) && !/\.(?:test|d)\.ts$/.test(id);

/** The module declares a Phaser scene class (`extends Phaser.Scene`, `extends Scene`, `extends BaseScene`). */
export const declaresScene = (code: string) => /\bclass\b[^{]*\bextends\s+[\w$.]*Scene\b/.test(code);

/** Appended to a scene module: accept the update and hand the new module to the page's swap; if it declines, propagate (a full reload). */
export const ACCEPT = `
;if (import.meta.hot) import.meta.hot.accept((m) => { if (!m || !globalThis.__hotSwap?.(m)) import.meta.hot.invalidate(); });
`;

/** Files a running game may load, as a URL path under a game; capture output, previews (thumbnails written by capture), build output and levels (modules) are not. */
export const ASSET_URL =
  /^\/games\/[^/]+\/(?!(?:.*\/)?(?:capture|dist|node_modules|previews|levels)\/).+\.(?:png|webp|jpe?g|gif|svg|json|ogg|mp3|wav|m4a|txt|xml)$/;

export function hotPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'game-hot',
    apply: 'serve',
    enforce: 'post', // after TypeScript is stripped, before Vite's import analysis reads the accept call
    configResolved: (c) => void (root = c.root),
    transform(code, id) {
      const path = id.split('?')[0].replace(/\\/g, '/');
      if (!isGameSource(path) || !declaresScene(code)) return;
      return { code: code + ACCEPT, map: null };
    },
    handleHotUpdate({ file, modules, server, timestamp }) {
      const url = '/' + relative(root, file).replace(/\\/g, '/');
      if (ASSET_URL.test(url)) {
        server.ws.send('harness:asset', { url });
        server.config.logger.info(`[hot] asset ${url}`, { timestamp: true });
      }
      // Our own propagation (graph.ts) instead of Vite's, when every path from the change ends in a scene module.
      const blockers: [ModuleNode, ModuleNode][] = [];
      const p = plan(modules, blockers);
      if (!p) {
        // Vite decides: a full reload, or CSS and the like. Say which modules ended the path.
        if (blockers.length && !file.endsWith('.css'))
          server.config.logger.info(`[hot] ${url} reloads the page: ${blockers.map(([via, b]) => (via === b ? `${b.url} is not a scene` : `${via.url} is imported by ${b.url}, not a scene`)).join('; ')}`, { timestamp: true });
        return;
      }
      invalidate(server, p, timestamp);
      server.ws.send({
        type: 'update',
        updates: [...p.boundaries].map((b) => ({
          type: 'js-update' as const,
          path: b.url,
          acceptedPath: b.url,
          timestamp,
          explicitImportRequired: false,
          isWithinCircularImport: false,
        })),
      });
      return [];
    },
  };
}
