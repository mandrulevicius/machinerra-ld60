/**
 * Dev command `classes [on|off]` (group `world`): the class overlay (`classview.ts`) in whichever scene is running, a
 * mission (`Play`, `Dungeon`) or the place bench (`Place`). Registered at boot, since the bench has no mission commands.
 */
import { command } from '../../../harness/dev/commands';
import type { ClassOverlay } from './classview';

interface Bridge {
  scene(key: string): { classes?: ClassOverlay; scene: { isActive(): boolean } } | undefined;
}
const bridge = () => (window as unknown as { __game: Bridge }).__game;

/** The overlay of the running scene, if it has one. */
export function activeOverlay() {
  for (const key of ['Play', 'Dungeon', 'Place']) {
    const s = bridge().scene(key);
    if (s?.classes && s.scene.isActive()) return s.classes;
  }
  return null;
}

export function registerClassCommand() {
  command('classes', ([arg]) => {
    const c = activeOverlay();
    if (!c) return 'error: no mission or place bench is running';
    if (arg !== undefined && arg !== 'on' && arg !== 'off') return 'error: classes [on|off]';
    c.set(arg === undefined ? !c.on : arg === 'on');
    const d = c.debug().classes;
    return c.on ? `classes on: ${Object.entries(d.counts).map(([k, n]) => `${k} ${n}`).join(', ')} in view (scenery grey, loot gold, interact cyan, centre red)` : 'classes off';
  }, 'classes [on|off]: tint every classified thing a flat colour by class (scenery grey, loot gold, interact cyan, centre red) over a dimmed land; mission and place bench', { group: 'world', args: () => ['on', 'off'] });
}
