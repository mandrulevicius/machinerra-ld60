/**
 * The Princess's dev commands (P58, group `princess`): `princess` alone shows her state; `princess wife <home|stolen|none>` puts her
 * there (saved); `princess homecoming [land] [n]` plays n lift homecomings as they would dock (her sweepings, the crew's errands,
 * his trail, the dust while she is gone); `princess return` brings her back from the Ether (the return sweep plays); `princess ride
 * [on|off|auto]` Rumba on her rounds; `princess clean` sweeps the deck at once.
 */
import { command } from '../../../../harness/dev/commands';
import { rng } from '../../../../harness/kit/rng';
import { BIOMES, type BiomeId } from '../sim/defs';
import { printsAlong, walk } from './deckprints';
import { ALTAR, ARRIVE, BENCH, TABLE, WINDOW } from './layout';
import { addTrail, homecoming, swept } from './princess';
import { deckFloor, TRAIL, type PrincessView } from './princessview';
import { princessSave } from './princessslice';
import { aboard, type HubState } from './state';

export interface PrincessDevHost {
  readonly s: HubState;
  readonly her: PrincessView;
  save(next: HubState): void;
}

const LANDS = Object.keys(BIOMES) as BiomeId[];

export function registerPrincessCommands(host: PrincessDevHost) {
  const wifeOf = () => host.s.story?.wife ?? 'none';
  /** A trail of his from the hatch to somewhere on the deck, as the hub would keep it. */
  const fakeTrail = (b: BiomeId, i: number) => {
    const to = [TABLE, BENCH, ALTAR, WINDOW][i % 4];
    const floor = deckFloor(host.s);
    const way = walk([{ x: ARRIVE.x, y: ARRIVE.y }, { x: to.x + (i % 3) * 30 - 30, y: to.y + 150 }], floor);
    return printsAlong(way, { stride: TRAIL.stride, gap: TRAIL.gap, scale: TRAIL.scale, alpha: TRAIL.alpha }, floor, rng(`his:${i}`))
      .slice(0, TRAIL.prints)
      .flatMap((s) => [Math.round(s.x), Math.round(s.y), Math.round(s.a)]);
  };
  return command(
    'princess',
    (args) => {
      const [sub, a, b] = args;
      const her = host.her;
      if (!sub) return JSON.stringify(her.debug());
      if (sub === 'wife') {
        if (a !== 'home' && a !== 'stolen' && a !== 'none') return 'error: princess wife <home|stolen|none>';
        const rescued = host.s.rescued.filter((id) => id !== 'princess');
        host.save({ ...host.s, rescued: a === 'home' ? [...rescued, 'princess'] : rescued, story: { ...host.s.story, wife: a } });
        her.draw();
        return `wife ${a}`;
      }
      if (sub === 'homecoming') {
        const land = (LANDS.includes(a as BiomeId) ? a : host.s.biome) as BiomeId;
        const n = Math.max(1, Math.min(60, Math.floor(Number(b ?? 1)) || 1));
        const crew = aboard(host.s).filter((x) => x.id !== 'princess').map((x) => x.id);
        let st = princessSave.get();
        for (let i = 0; i < n; i++) {
          st = homecoming(st, { was: wifeOf(), now: wifeOf(), biome: land, crew, id: `dev:${Date.now()}:${i}`, brought: true });
          if (i < n - 1) st = addTrail(st, land, fakeTrail(land, st.deck.his.length + i));
        }
        princessSave.set(st);
        her.draw();
        her.dirtyBoots(land);
        return `${n} homecoming(s) from ${land}, wife ${wifeOf()}: ${JSON.stringify({ ...her.debug(), deck: undefined })}`;
      }
      if (sub === 'return') {
        host.save({ ...host.s, rescued: [...host.s.rescued.filter((id) => id !== 'princess'), 'princess'], story: { ...host.s.story, wife: 'home', evil: true } });
        princessSave.set({ ...princessSave.get(), deck: { ...princessSave.get().deck, owed: true } });
        her.draw();
        her.playSweep(() => her.dirtyBoots('ether'));
        return 'she is home: the return sweep plays';
      }
      if (sub === 'ride') {
        her.ride(a === 'on' ? true : a === 'off' ? false : null);
        return `Rumba rides: ${a ?? 'auto'}`;
      }
      if (sub === 'clean') {
        princessSave.set(swept(princessSave.get()));
        her.draw();
        return 'deck swept';
      }
      return 'error: princess [wife <home|stolen|none>|homecoming [land] [n]|return|ride [on|off|auto]|clean]';
    },
    'princess [wife <home|stolen|none>|homecoming [land] [n]|return|ride [on|off|auto]|clean]: the Princess at home (P58): her state; where she is; n lift homecomings (sweepings, prints, dust while she is gone); back from the Ether (the return sweep); Rumba on her rounds; a clean deck',
    { group: 'princess', args: () => ['wife', 'homecoming', 'return', 'ride', 'clean'] },
  );
}
