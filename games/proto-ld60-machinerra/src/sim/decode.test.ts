import { describe, expect, it } from 'vitest';
import { ACTION, BIOMES, DECODE, INSIGHT, RUIN, RUIN_FINDS } from './defs';
import { NO_INPUT, Sim, type Ruin } from './sim';

const USE = { ...NO_INPUT, use: true };
const alone = (seed = 3, biome: 'desert' | 'jungle' | 'city' | 'mountains' = 'desert') => {
  const s = new Sim(seed, [], biome);
  s.bots = [s.controller];
  return s;
};
const stand = (s: Sim, r: Ruin) => {
  s.controller.x = r.x;
  s.controller.y = r.y + 20;
};
/** Press Use (a key down after one up) and stay `secs` seconds; returns the events seen. One press starts the action; it runs on its own. */
const hold = (s: Sim, secs: number) => {
  const seen: Sim['events'] = [];
  s.step(1 / 30, NO_INPUT);
  for (let i = 0; i < Math.round(secs * 30); i++) {
    s.step(1 / 30, USE);
    seen.push(...s.events);
    s.events.length = 0;
  }
  return seen;
};
const live = (s: Sim) => s.ruins.find((r) => r.live)!;

describe('live and dead ruins (P30, D9 row 1)', () => {
  it('every land has both kinds of ruin, and the Parable Trail is never live', () => {
    for (const id of Object.keys(BIOMES) as (keyof typeof BIOMES)[]) {
      const kinds = BIOMES[id].ruins;
      if (!kinds) continue;
      expect(kinds.some((k) => RUIN_FINDS[k].live), `${id} has a live ruin`).toBe(true);
      expect(kinds.some((k) => !RUIN_FINDS[k].live), `${id} has a dead ruin`).toBe(true);
    }
    const s = alone();
    for (const r of s.ruins.filter((x) => x.trail !== undefined)) expect(r.live).toBe(false);
    expect(s.ruins.some((r) => r.live)).toBe(true);
    expect(s.summary().ruins.some((r) => r.includes('(live)'))).toBe(true);
  });

  it('a live ruin decodes after a six second hold: insight, its own find, the decode trigger, no scrap and no junk', () => {
    const s = alone();
    const r = live(s);
    stand(s, r);
    const scrap = s.scrap;
    s.engine.addSource(s.controller, { id: 'probe', effects: [{ when: 'decode', cd: 0, do: { do: 'status', id: 'haste', to: 'self' } }] });
    const seen = hold(s, DECODE.time - 1);
    expect(r.searched).toBe(false);
    expect(s.insight).toBe(0);
    expect(s.decodeProgress).toBeGreaterThan(0.5);
    expect(s.engine.stacks(s.controller, 'haste')).toBe(0);
    expect(seen.some((e) => e.e === 'decode' && e.what === 'start')).toBe(true);
    const more = hold(s, 1.2);
    expect(r.searched).toBe(true);
    expect(r.decoded).toBe(true);
    expect(s.insight).toBe(INSIGHT.liveRuin);
    expect(s.scrap).toBe(scrap);
    expect(s.junk).toHaveLength(0);
    expect(more.some((e) => e.e === 'decode' && e.what === 'done')).toBe(true);
    expect(more.some((e) => e.e === 'relic')).toBe(false);
    expect(more.some((e) => e.e === 'drop')).toBe(true);
    expect(s.stats.decoded).toBe(1);
    expect(s.decodeProgress).toBe(0);
    expect(s.engine.stacks(s.controller, 'haste')).toBe(1); // the `decode` trigger fired
  });

  it('one press starts the decode; a hit does not break it; stepping out of the zone pauses it and coming back resumes it', () => {
    const s = alone();
    const r = live(s);
    stand(s, r);
    hold(s, 4);
    const had = s.decodeProgress;
    expect(had).toBeGreaterThan(0.6);
    s.hurt(s.controller, 3, false, { type: 'pierce', via: 'melee' });
    s.events.length = 0;
    expect(s.decodeProgress).toBe(had);
    // Out of the zone (no key held): paused, the progress kept.
    s.controller.x = r.x + RUIN.reach * ACTION.zone + 40;
    for (let i = 0; i < 60; i++) s.step(1 / 30, NO_INPUT);
    expect(s.action?.paused).toBe(true);
    expect(s.decodeProgress).toBe(had);
    // Back in it (still no key): it goes on and finishes.
    stand(s, r);
    for (let i = 0; i < DECODE.time * 30; i++) s.step(1 / 30, NO_INPUT);
    expect(r.searched).toBe(true);
    expect(s.insight).toBe(INSIGHT.liveRuin);
    // A press only starts it within the ruin's reach.
    const t = alone();
    const far = live(t);
    t.controller.x = far.x;
    t.controller.y = far.y + RUIN.reach + 10;
    hold(t, 1);
    expect(t.action).toBeNull();
  });

  it('a live ruin broken keeps its decode: its walls fall, its heart stands and still decodes', () => {
    const s = alone();
    const r = live(s);
    expect(s.props.list.some((p) => p.ruin === r.id)).toBe(true);
    s.flatten(r);
    expect(r.broken).toBe(true);
    expect(r.searched).toBe(false);
    expect(r.live).toBe(true);
    expect(s.stats.ruinsBroken).toBe(1);
    stand(s, r);
    hold(s, DECODE.time + 0.5);
    expect(r.searched).toBe(true);
    expect(r.decoded).toBe(true);
    expect(s.insight).toBe(INSIGHT.liveRuin);
  });

  it('decoded insight rides home in the haul', async () => {
    const { haulFrom } = await import('../hub/state');
    const s = alone();
    for (const r of s.ruins.filter((x) => x.live).slice(0, 2)) {
      stand(s, r);
      hold(s, DECODE.time + 0.5);
    }
    expect(s.insight).toBe(2 * INSIGHT.liveRuin);
    s.step(1 / 30, NO_INPUT);
    expect(haulFrom(s, 'd1').insight).toBe(2);
  });
});
