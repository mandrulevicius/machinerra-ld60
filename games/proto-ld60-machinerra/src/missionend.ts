/**
 * How a land's mission ends: the lift docks (`phase: done`) or the Communicator goes dark (`lost`). The hub's song comes back,
 * the results screen lists what came up once (`resultrows.ts`; the Oracle's welcome in the hub only comments), and its buttons
 * go on to the Ascent with the haul (`ascentData`: the haul and the view the lift left the land in, so the ascent picks up where
 * this ended), or run the land again. Down a dungeon `DungeonLink` ends the scene instead.
 * Add a line to the results: a row in `resultRows`.
 */
import { results } from '../../../harness/kit';
import { RESCUE_THANKS, freedBy, haulFrom, npc } from './hub/state';
import { hub } from './hub/save';
import { ViewBase } from './playhost';
import { resultRows } from './resultrows';
import { HUB_MUSIC, playMusic } from './sound';
import type { SimEvent } from './sim/sim';

export class MissionEnd extends ViewBase {
  event(e: SimEvent) {
    if (e.e !== 'phase' || this.host.down) return;
    if (e.phase === 'done') this.end(true);
    if (e.phase === 'lost') this.end(false);
  }

  /** What the Ascent starts from: the haul, and the view the lift left the land in (so the ascent picks up where this ended). */
  ascentData(haul = haulFrom(this.sim, `${this.host.land.seed}:${Date.now()}`)) {
    const cam = this.scene.cameras.main, land = this.host.land;
    // The land as the mission painted it: a hand-made one (level1) is not what its seed generates, and the ground texture is shared by key.
    const map = this.sim.run ? this.sim.run.paintMap : this.sim.map;
    return { haul, seed: land.seed, biome: land.biome, map, from: { x: cam.midPoint.x, y: cam.midPoint.y, zoom: cam.zoom, top: cam.worldView.y } };
  }

  private end(win: boolean) {
    const host = this.host, sim = this.sim, land = host.land;
    if (host.ended) return;
    host.ended = true;
    // The results and the ascent are the hub's: its song comes back.
    playMusic(this.k.audio, HUB_MUSIC, { fade: 3 });
    host.cmd.toggle(false);
    host.map.hide();
    this.scene.time.delayedCall(400, () => {
      // What came up, listed once on the results (the Oracle's welcome in the hub only comments). A win is the haul the lift carries.
      const haul = win ? haulFrom(sim, `${land.seed}:${Date.now()}`) : null;
      const guests = sim.rescued.map((id) => npc(id)?.name).filter((n): n is string => !!n);
      const stats = resultRows({
        scrap: sim.scrap,
        copper: sim.copper,
        coal: sim.coal,
        cores: sim.cores,
        insight: sim.insight,
        junk: sim.junk.length,
        stats: sim.stats,
        guests,
        thanks: haul ? freedBy(hub.get(), haul) * RESCUE_THANKS : 0,
      });
      const again = { seed: land.seed, biome: land.biome, tier: land.tier, anomaly: land.anomaly, ...(land.id && { land: land.id }) };
      results(this.scene, win
        ? {
            title: 'Back to the city',
            tone: 'win',
            subtitle: 'The Oracle is pleased, in her way.',
            stats,
            actions: [
              { label: 'Up to the zeppelin', to: 'Ascent', data: this.ascentData(haul ?? undefined), primary: true, key: 'Enter' },
              { label: 'Run the sands again', to: 'Play', data: again },
            ],
          }
        : {
            title: 'Signal lost',
            tone: 'lose',
            subtitle: 'The Communicator went dark.',
            stats,
            actions: [
              { label: 'Try again', to: 'Play', data: again, primary: true, key: 'Enter' },
              { label: 'New sands', to: 'Play', data: { seed: Math.floor(Date.now() % 1e6), biome: land.biome, tier: land.tier, anomaly: land.anomaly } },
            ],
          });
    });
  }
}
