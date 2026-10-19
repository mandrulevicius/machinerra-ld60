/**
 * P47's buildings on screen (`sim/buildings.ts`): their floors, wall footings and overgrowth stamped once into the props' baked
 * ground (`stampBuildings`, called by `PropView` before any rubble, so rubble lies over them), each centrepiece's warm lamp while
 * its find is unsearched (part A: the heart is lit), the words a tiered find says (part C), and a village's turrets: the tell (a red
 * line to the locked spot with a ring closing on it) and the shot's flash. The walls, furniture and turrets themselves are props
 * (`propview.ts`, pictures in `buildingart.ts`). Looks are guesses (Directive 47).
 */
import { rng } from '../../../harness/kit/rng';
import { FOOTING, GROWTH, floorKey } from './buildingart';
import type { GroundChunks } from './groundchunks';
import { DANGER, DANGER_HOT, LINE, SOOT } from './house';
import { ViewBase, type G, type PlayHost } from './playhost';
import { BLUEPRINTS, T, TURRET, type BiomeId } from './sim/defs';
import { shapeOf, turnAt } from './sim/buildings';
import { Ter } from './sim/mapgen';
import type { Sim, SimEvent } from './sim/sim';

/** Looks: a floor's alpha by intactness (`floor` + `floorK` x intact), the footing's, growth per floor tile at intactness 0, the centre's lamp. */
export const BUILDING_LOOK = { floor: 0.2, floorK: 0.6, footing: 0.45, footingK: 0.35, growth: 0.32, lamp: { color: 0xffc070, radius: 150, intensity: 0.45 } };
/** Growth tinted to the land (multiplied over its greens). */
const GROWTH_TINT: Record<BiomeId, number> = { desert: 0xd8c890, jungle: 0xffffff, city: 0xc8d0b0, mountains: 0xd0dcd0, demon: 0x9a8070, ether: 0xb8c8e8 };
/** The words a find in a building says by its tier (part C). */
const TIER_WORDS = ['Battered: a little scrap', 'Standing: a part', 'Intact: old tech'];
const STEAM_TOP = 'Intact: a punch card';

/** Stamp the buildings' floors, footings and overgrowth from the `from`th on into the props' baked ground (ids below zero: props' are above). Returns how many there are. */
export function stampBuildings(chunks: GroundChunks, sim: Sim, from = 0): number {
  const bs = sim.map.buildings;
  if (!bs) return 0;
  const W = sim.map.w;
  bs.forEach((b, bi) => {
    if (bi < from) return;
    let id = -1 - bi * 8192;
    const r = rng(`floors/${sim.seed}/${bi}`), a = BUILDING_LOOK.floor + BUILDING_LOOK.floorK * b.intact;
    for (const c of b.cells) {
      const x = c % W, y = Math.floor(c / W);
      chunks.add({ id: id--, frame: floorKey(b.floor, (x * 7 + y * 13) % 2), x: x * T, y: y * T, ox: 0, oy: 0, alpha: a });
    }
    // The footings: where every wall of the blueprint stood, standing now or not.
    const bp = BLUEPRINTS[b.bp], walls = new Set<string>();
    for (const [lx, ly] of shapeOf(b.bp).walls) {
      const [tx, ty] = turnAt(bp, b.turn, b.mirror, lx, ly);
      walls.add(`${b.x + tx},${b.y + ty}`);
    }
    for (const k of walls) {
      const [x, y] = k.split(',').map(Number);
      if (sim.map.ter[y * W + x] === Ter.Rock) continue;
      const across = walls.has(`${x - 1},${y}`) || walls.has(`${x + 1},${y}`);
      chunks.add({ id: id--, frame: across ? FOOTING.h : FOOTING.v, x: (x + 0.5) * T, y: (y + 0.5) * T + (across ? 8 : 0), alpha: BUILDING_LOOK.footing + BUILDING_LOOK.footingK * b.intact });
    }
    // Nature takes the faded ones back.
    const n = Math.round((1 - b.intact) * b.cells.length * BUILDING_LOOK.growth);
    for (let k = 0; k < n; k++) {
      const c = r.pick(b.cells), x = c % W, y = Math.floor(c / W);
      chunks.add({ id: id--, frame: r.pick(GROWTH), x: (x + r.range(0.2, 0.8)) * T, y: (y + r.range(0.2, 0.8)) * T, alpha: r.range(0.6, 0.95), tint: GROWTH_TINT[sim.biomeId], scale: r.range(0.7, 1.15) });
    }
  });
  return bs.length;
}

export class BuildingView extends ViewBase {
  private lamps = new Map<number, { off: () => void }>();

  constructor(host: PlayHost) {
    super(host);
    // The heart of each building is lit while its find waits (a live ruin keeps its own cyan lamp: `ruinart.ts` `LiveRuins`).
    for (const r of this.sim.ruins) {
      if (r.building === undefined || r.searched || r.live) continue;
      const L = BUILDING_LOOK.lamp, l = this.k.lights.add(r.x, r.y - 30, { color: L.color, radius: L.radius, intensity: L.intensity });
      this.lamps.set(r.id, { off: () => this.k.lights.remove(l) });
    }
  }

  update(_dt: number, g: G) {
    for (const r of this.sim.ruins) {
      const l = this.lamps.get(r.id);
      if (l && r.searched) {
        l.off();
        this.lamps.delete(r.id);
      }
    }
    // A turret winding up: a red line to the spot it locked, a ring closing on it as the shot comes.
    const now = this.scene.time.now;
    for (const [id, m] of this.sim.turrets) {
      if (m.mode !== 'tell') continue;
      const p = this.sim.props.list.find((q) => q.id === id);
      if (!p || p.broken) continue;
      const f = 1 - Math.max(0, m.t) / TURRET.tell, mx = p.x, my = p.y - 14;
      g.lineStyle(LINE.accent, SOOT, 0.35).lineBetween(mx, my, m.ax, m.ay);
      g.lineStyle(LINE.effect, DANGER, 0.35 + 0.5 * f).lineBetween(mx, my, m.ax, m.ay);
      const rr = 34 * (1 - f) + 10;
      g.lineStyle(LINE.effect, DANGER_HOT, 0.5 + 0.4 * f).strokeEllipse(m.ax, m.ay + 8, rr * 2, rr * 1.24);
      g.fillStyle(DANGER, 0.25 + 0.5 * f * (0.5 + 0.5 * Math.sin(now / 50))).fillCircle(mx + 8, my - 2, 3.5);
    }
  }

  event(e: SimEvent) {
    switch (e.e) {
      case 'turret':
        if (e.what === 'tell') this.sfx('warn', e.p.x, e.p.y, { gain: 0.35, vary: 0.1 });
        else {
          this.flash(e.p.x + 8, e.p.y - 16, 0xffb070, 1.2);
          this.k.fx.burst(e.p.x + 8, e.p.y - 16, { color: 0xffd0a0, size: 0.4 });
          this.sfx('shot', e.p.x, e.p.y, { gain: 0.6, vary: 0.12 });
        }
        break;
      case 'remnant': {
        const b = this.sim.map.buildings?.[e.ruin.building ?? -1];
        const words = e.tier === 2 && b?.era === 'steam' ? STEAM_TOP : TIER_WORDS[e.tier];
        this.floater(e.ruin.x, e.ruin.y - 92, words, e.tier === 2 ? '#ffe39a' : '#e8dcc0', 2600, 15);
        break;
      }
    }
  }

  debug() {
    return { buildings: this.sim.map.buildings?.length ?? 0, lamps: this.lamps.size, turrets: [...this.sim.turrets.values()].filter((m) => m.mode === 'tell').length };
  }

  destroy() {
    for (const l of this.lamps.values()) l.off();
    this.lamps.clear();
  }
}
