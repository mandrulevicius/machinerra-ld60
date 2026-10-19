/**
 * Entry point of the dev UI: mounts the dev sidebar (harness/dev/sidebar.ts, with the Kit tab as its first tab).
 * Kept at this name and signature because `bootGame` calls it. The sidebar is loaded on demand, so a build only
 * fetches it when the URL has `?dev=1`. F10 opens it; `opts.open` starts it open.
 */
import type Phaser from 'phaser';

type DevTab = { el: HTMLElement; show?(): void; hide?(): void };
const queued: [string, () => DevTab][] = [];
let add: ((name: string, tab: DevTab) => void) | null = null;

/**
 * A tab of the game's own in the dev sidebar (F10), e.g. `addDevTab('Game', () => gameTab(game))`. `build` runs once the
 * sidebar is mounted, so a build without the dev tools never calls it. Tab shape: `{ el, show?, hide? }` (dev/sidebar.ts).
 */
export function addDevTab(name: string, build: () => DevTab) {
  if (add) add(name, build());
  else queued.push([name, build]);
}

export function mountSidebar(game: Phaser.Game, opts: { open?: boolean } = {}) {
  let destroy = () => {};
  let dead = false;
  import('../dev/sidebar').then((m) => {
    if (dead) return;
    const s = m.mountSidebar(game, opts);
    destroy = s.destroy;
    add = s.api.addTab;
    for (const [name, build] of queued.splice(0)) add(name, build());
  });
  return {
    destroy() {
      dead = true;
      destroy();
    },
  };
}
