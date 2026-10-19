/**
 * Dev commands, group `tips`: the mission's tooltips (`tipview.ts`). Add one: a `command(...)` in this file's function.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { hudTip, HUD_TIPS, worldTip } from '../tips';

export function tipsCommands(play: Play) {
  const g = { group: 'tips' };
  const view = () => play.tipView;
  command('tip', ([what, a, b, c]) => {
    const v = view(), sim = play.sim;
    if (what === undefined) return JSON.stringify(v.tip.state());
    if (what === 'alt') {
      v.tip.setAlt(a !== 'off');
      return `alt ${v.tip.alt ? 'held' : 'let go'}`;
    }
    if (what === 'off') {
      v.pin = null;
      return 'unpinned';
    }
    // `tip hud <id> [x y]`, `tip at <worldX> <worldY> [x y]`, `tip me [x y]`, `tip foe|bot|nest|ruin|place|seam [x y]`: hold that tip at a screen place (default 640 360), whose text comes back.
    const world = (pt: { x: number; y: number } | undefined, sx?: string, sy?: string) => {
      if (!pt) return 'error: nothing of that kind on the land';
      v.pin = { tip: () => worldTip(sim, pt.x, pt.y), x: Number(sx ?? 640), y: Number(sy ?? 360) };
      return `pinned ${worldTip(sim, pt.x, pt.y)?.more.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? 'nothing there'}`;
    };
    if (what === 'hud') {
      if (!(a in HUD_TIPS)) return `error: hud tip ids: ${Object.keys(HUD_TIPS).join(', ')}`;
      v.pin = { tip: () => hudTip(a, sim), x: Number(b ?? 640), y: Number(c ?? 360) };
      return `pinned ${a}`;
    }
    if (what === 'at') return world({ x: Number(a), y: Number(b) });
    const first = <T extends { x: number; y: number }>(l: T[]) => l[0];
    switch (what) {
      case 'me': return world(sim.controller, a, b);
      case 'foe': return world(first(sim.hornets.filter((h) => !h.dead)), a, b);
      case 'bot': return world(first(sim.bots.filter((q) => q.role !== 'controller' && !q.dead)), a, b);
      case 'nest': return world(first(sim.nests.filter((n) => !n.place)), a, b);
      case 'ruin': return world(first(sim.ruins), a, b);
      case 'place': return world(first(sim.places.flatMap((p) => p.parts)), a, b);
      case 'seam': return world(first(sim.seams), a, b);
    }
    return 'error: tip [alt on|off | off | hud <id> | at <x> <y> | me|foe|bot|nest|ruin|place|seam]';
  }, 'tip: the tooltip shown now; `alt on|off` holds Alt; `hud <id>`, `at <worldX> <worldY>` or `foe|bot|nest|ruin|place|seam` pins that tip at a screen place (add `x y` for where); `off` unpins', g);
}
