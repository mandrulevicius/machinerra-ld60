import type { ModuleNode, ViteDevServer } from 'vite';

/**
 * Which modules a change reaches. Like Vite's own propagation: walk importers from the changed modules until a module
 * accepts its own update (a scene module, see vite-plugin.ts). `null` when any path ends in a module that does not
 * (main.ts, harness/kit): a clean swap is impossible and the page has to reload. `blockers` then lists up to `limit` of
 * them as [the module imported by it, the module that cannot swap], for the server log.
 */
export function plan(changed: readonly ModuleNode[], blockers: [via: ModuleNode, blocker: ModuleNode][] = [], limit = 3): { chain: Set<ModuleNode>; boundaries: Set<ModuleNode> } | null {
  const chain = new Set<ModuleNode>();
  const boundaries = new Set<ModuleNode>();
  let ok = changed.length > 0;
  const visit = (m: ModuleNode, via?: ModuleNode) => {
    if (chain.has(m)) return;
    chain.add(m);
    if (m.isSelfAccepting) return void boundaries.add(m);
    if (!m.importers.size || m.acceptedHmrDeps.size || m.id?.endsWith('.css')) {
      ok = false;
      if (blockers.length < limit) blockers.push([via ?? m, m]);
      return;
    }
    m.importers.forEach((i) => visit(i, m));
  };
  changed.forEach((m) => visit(m));
  return ok ? { chain, boundaries } : null;
}

/**
 * Mark `p.chain` updated, so the next import of each gets a fresh URL (a `?t=` stamp) and is evaluated again.
 * Vite's own invalidation also stamps every importer above a boundary. With a cycle (a lab scene imports Menu, which
 * imports main, which imports the scene) that makes the browser evaluate main again from inside the scene, which fails.
 * So the importers of the boundaries are marked as already seen and keep their stale-but-valid state.
 */
export function invalidate(server: ViteDevServer, p: NonNullable<ReturnType<typeof plan>>, timestamp: number) {
  const seen = new Set<ModuleNode>();
  for (const b of p.boundaries) b.importers.forEach((i) => p.chain.has(i) || seen.add(i));
  for (const m of p.chain) server.moduleGraph.invalidateModule(m, seen, timestamp, true);
}
