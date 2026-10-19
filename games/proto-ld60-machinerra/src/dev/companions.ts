/**
 * Dev commands, group `companions` (P42): the sniffer dog, its smell, the dig mounds and the stray cat. The quest-only places are in `place`
 * (`placeland kennel|stray|mounds|compactor|cairn`, `place do <id> <what>`); the hub's side is `hub companion`. Add one: a `command(...)` here.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { barkWarning, digMound, dogSummary, makeDog, moundsOf, nearestPoint, pointRange, pointTargets } from '../sim/companions';
import { T } from '../sim/defs';

export function companionsCommands(play: Play) {
  const sim = play.sim;
  const cm = { group: 'companions' };
  command('dog', ([what, ...rest]) => {
    if (what === 'off') {
      sim.dog = null;
      return 'the dog is gone';
    }
    if (what === 'new' || what === 'fresh') {
      const c = sim.controller;
      makeDog(sim, c.x - 30, c.y + 20, rest.join(' ') || 'The dog', what === 'fresh');
      return `the dog is here${what === 'fresh' ? ' (freed, not yet home)' : ''}`;
    }
    if (what === 'bark') {
      // Skip to the bark: the clock jumps to the moment it barks (`barkWarning` s before dusk).
      sim.setClock(sim.day.at.evening - barkWarning(sim) - 0.05);
      if (sim.dog) sim.dog.barked = false;
      return `the clock is ${barkWarning(sim).toFixed(0)} s from the twisted: step and it barks`;
    }
    return JSON.stringify({ ...dogSummary(sim), smellTiles: Math.round(pointRange(sim) / T), barkWarning: barkWarning(sim), digs: sim.stats.dug ?? 0 });
  }, 'dog [new|fresh|bark|off]: the sniffer dog (P42): none given - its state; new [name] - he has his dog; fresh [name] - freed at the Kennel, not home yet; bark - jump the clock to its dusk bark; off - remove', { ...cm, args: () => ['new', 'fresh', 'bark', 'off'] });

  command('smell', () => {
    const c = sim.controller;
    const near = pointTargets(sim).map((t) => ({ id: t.id, tiles: +(Math.hypot(t.x - c.x, t.y - c.y) / T).toFixed(1) })).sort((a, b) => a.tiles - b.tiles).slice(0, 8);
    return JSON.stringify({ range: Math.round(pointRange(sim) / T), points: nearestPoint(sim)?.id ?? null, near });
  }, 'smell: what the dog would point at: the nearest within its smell, and the nearest eight ruins, mounds and places not found yet', cm);

  command('mounds', ([dig]) => {
    const list = moundsOf(sim);
    if (dig === 'dig') {
      const m = list.sort((a, b) => Math.hypot(a.x - sim.controller.x, a.y - sim.controller.y) - Math.hypot(b.x - sim.controller.x, b.y - sim.controller.y))[0];
      if (!m) return 'error: no mound left';
      digMound(sim, m);
      return `dug ${m.id}; digs ${sim.stats.dug}`;
    }
    return JSON.stringify({ left: list.map((m) => m.id), dug: sim.stats.dug ?? 0, toyHunt: !!sim.quest.toyHunt, toy: !!sim.stats['got.toy'] });
  }, 'mounds [dig]: the dig mounds left on the land (dig - dig the nearest at once) and whether the toy is wanted', { ...cm, args: () => ['dig'] });

  command('toy', ([on]) => {
    sim.quest.toyHunt = on !== 'off';
    return `toy hunt ${sim.quest.toyHunt ? 'on: the first mound of a dig heap holds the Squeaky Toy' : 'off'}`;
  }, "toy [on|off]: turn the dog's third step on or off for this mission (the first mound of the mounds place holds the toy)", { ...cm, args: () => ['on', 'off'] });
}
