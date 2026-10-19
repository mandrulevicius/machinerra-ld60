/**
 * Dev commands for P47's buildings (group `world`): `building` puts a blueprint down ahead of him at an intactness and lists the
 * land's, `village` a hive village's hall with huts and turrets, `turret` one turret, `looks` the classes' looks on or off (part A).
 * Buildings on a generated land come with the fourth mission; `?remnants=1` (or `?flown=3`) has them on any.
 */
import { command } from '../../../../harness/dev/commands';
import { rng } from '../../../../harness/kit/rng';
import type { Play } from '../Play';
import { classLooks } from '../propart';
import { BLUEPRINTS, T, VILLAGE, type BlueprintId } from '../sim/defs';
import { intactness, stamp, tierOf, turnedSize, wallOf, type BuildingSpec } from '../sim/buildings';
import { passable } from '../sim/mapgen';
import { addProp } from '../sim/props';

export function buildingCommands(play: Play) {
  const sim = play.sim;
  const wd = { group: 'world' };
  const IDS = Object.keys(BLUEPRINTS) as BlueprintId[];
  const open = (i: number) => passable(sim.map.ter[i]) && !sim.props.at.has(i);

  /** Stamp a blueprint with its centre on tile (cx, cy) into the running land; returns its index. */
  const put = (id: BlueprintId, cx: number, cy: number, intact: number, turn: number, extra: Partial<BuildingSpec> = {}) => {
    const bp = BLUEPRINTS[id], [w, h] = turnedSize(bp, turn), r = rng(`dev-building/${sim.map.buildings?.length ?? 0}`);
    const s = stamp({ id, x: cx - Math.floor(w / 2), y: cy - Math.floor(h / 2), turn, mirror: false, intact, material: wallOf(bp.era, sim.biomeId, r), W: sim.W, open, r });
    const list = (sim.map.buildings ??= []), bi = list.length;
    list.push({ ...s.spec, ruins: [], ...extra });
    for (const p of s.props) addProp(sim, { ...p, bld: bi });
    return bi;
  };
  const ahead = (tiles: number) => ({ x: Math.floor(sim.controller.x / T) + tiles, y: Math.floor(sim.controller.y / T) });
  const line = (b: BuildingSpec, i: number) => {
    const now = intactness(sim, i);
    return `${i} ${b.bp} (${b.era}, ${b.material}${b.faded ? ', faded' : ''}${b.village !== undefined ? `, village ${b.village}` : ''}) at ${b.x},${b.y} intact ${b.intact.toFixed(2)} now ${now.toFixed(2)} tier ${tierOf(now)}${b.ruins.length ? ` finds ${b.ruins.length}` : ''}`;
  };

  command('building', ([a, b, c]) => {
    if (!a || a === 'list') {
      const bs = sim.map.buildings ?? [];
      return bs.length ? bs.map(line).join('; ') : 'no buildings on this land (they come with the fourth mission: ?remnants=1)';
    }
    const id = a as BlueprintId;
    if (!IDS.includes(id)) return `error: a blueprint is one of ${IDS.join(', ')}`;
    const intact = b === undefined ? 1 : Math.max(0, Math.min(1, Number(b)));
    const bp = BLUEPRINTS[id], at = ahead(Math.ceil(Math.max(bp.w, bp.h) / 2) + 3);
    const i = put(id, at.x, at.y, intact, Number(c) || 0);
    return line(sim.map.buildings![i], i);
  }, 'building [<blueprint> [intact 0-1] [quarter turns]|list]: put a blueprint down ahead of him (intact 1 by default), or list the land\'s buildings with their intactness now and the tier a find in them would pay', { ...wd, args: () => ['list', ...IDS] });

  command('village', ([t]) => {
    const tier = Math.max(1, Math.min(3, Number(t) || 3)) - 1, n = ahead(14), r = rng(`dev-village/${sim.props.list.length}`);
    put('hivehall', n.x, n.y, r.range(...VILLAGE.intact), r.int(0, 3));
    const huts = VILLAGE.huts[tier];
    for (let k = 0; k < huts; k++) {
      const a = (k / huts) * Math.PI * 2;
      put(k % 2 ? 'shed' : 'hut', Math.round(n.x + Math.cos(a) * 9), Math.round(n.y + Math.sin(a) * 8), r.range(...VILLAGE.intact), r.int(0, 3));
    }
    let turrets = 0;
    for (let k = 0; k < VILLAGE.turrets[tier] + 1; k++) {
      const a = Math.PI / 4 + (k / (VILLAGE.turrets[tier] + 1)) * Math.PI * 2, x = Math.round(n.x + Math.cos(a) * 6), y = Math.round(n.y + Math.sin(a) * 6);
      if (!open(y * sim.W + x)) continue;
      addProp(sim, { kind: 'turret', x, y, wear: 1 });
      turrets++;
    }
    return `a tier ${tier + 1} village 14 tiles ahead: a hall, ${huts} huts, ${turrets} turrets`;
  }, 'village [tier 1-3]: a hive village\'s hall with huts round it and turrets, 14 tiles ahead of him (no hive in it)', { ...wd, args: () => ['1', '2', '3'] });

  command('turret', () => {
    const at = ahead(6);
    if (!open(at.y * sim.W + at.x)) return 'error: no room 6 tiles ahead';
    addProp(sim, { kind: 'turret', ...at, wear: 1 });
    return `a turret at tile ${at.x},${at.y}`;
  }, 'turret: a village turret 6 tiles ahead of him (it shoots him and the robots in range, with a tell)', wd);

  command('looks', ([a]) => {
    if (a !== 'on' && a !== 'off') return 'error: looks on|off';
    return classLooks(play, a === 'on') ? 'class looks on: scenery muted, loot smashables with the brass trim and glint' : 'class looks off: the props as drawn';
  }, 'looks on|off: the classes\' looks on the props (P47 part A: scenery muted, loot smashables a brass trim and a glint)', { ...wd, args: () => ['on', 'off'] });
}
