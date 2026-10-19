import type { Plugin } from 'vite';

/**
 * Dev server only. With `cacheDir` set (OPTIMIZER_MIRROR) the server runs without a file watcher and without an HMR socket,
 * and keeps its dependency cache in `cacheDir`. Unset: does nothing.
 * Mutates in a post hook because capturePlugin returns `server.watch.ignored`, and a returned `null` never overrides in Vite's config merge.
 */
export function mirrorPlugin(cacheDir?: string): Plugin {
  return {
    name: 'mirror',
    apply: 'serve',
    enforce: 'post',
    config(c) {
      if (!cacheDir) return;
      c.server ??= {};
      c.server.watch = null;
      c.server.ws = false;
      c.cacheDir = cacheDir;
    },
  };
}
