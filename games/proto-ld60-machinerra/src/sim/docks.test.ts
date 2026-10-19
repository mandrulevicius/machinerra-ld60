/**
 * P58 H in a mission: prying an old dock (a small ruin, hold E), what carries home, Keeper of Docks on the lift, the Receipts line and
 * Moss in the brush. The ladder and its perks at home are `hub/princessdocks.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { DOCK, RUIN_FINDS, T, WEAPONS } from './defs';
import { NO_INPUT, Sim, type SimEvent } from './sim';
import { generateReal, tap } from './testkit';
import { PING, bearing, nearestUnsearched } from './docks';
import { ruinToStrip } from './coal';
import { BRUSH, brushReach, brushSweep } from './brush';
import { VOICE } from './princessvoice';

/** A desert with a dock in it (the ladder asking for one), found once. */
let land: ReturnType<typeof generateReal> | null = null;
const dockLand = () => {
  if (land) return land;
  const ask = { questActive: (s: string) => s === 'dock.desert', had: () => false };
  for (let seed = 1; seed < 60; seed++) {
    const m = generateReal(seed, undefined, undefined, 'desert', ask);
    if (m.ruins.some((r) => r.kind === 'dock')) return (land = m);
  }
  throw new Error('no dock in 60 seeds');
};
const make = (o: { perks?: string[]; titles?: boolean; wife?: 'home' | 'stolen' } = {}) => {
  const s = new Sim(1, [], 'desert', o.perks ?? [], undefined, undefined, { tier: 1, land: dockLand(), ...(o.titles && { titles: ['keeperOfDocks'] }), ...(o.wife && { wife: o.wife }) });
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.controller.hp = s.controller.maxHp = 100;
  return s;
};
const dockOf = (s: Sim) => s.ruins.find((r) => r.kind === 'dock')!;
const beside = (s: Sim) => {
  const d = dockOf(s);
  s.controller.x = d.x;
  s.controller.y = d.y + 20;
};
const run = (s: Sim, secs: number) => {
  const ev: SimEvent[] = [];
  for (let t = 0; t < secs; t += 1 / 30) {
    s.step(1 / 30, NO_INPUT);
    ev.push(...(s.events.splice(0) as SimEvent[]));
  }
  return ev;
};

describe('an old charging dock (P58 H)', () => {
  it('is a small ruin of its own kind, pried (not decoded), never part of a gatherer\'s work', () => {
    const s = make();
    const d = dockOf(s);
    expect(RUIN_FINDS.dock.pry).toBe(true);
    expect(d.live).toBe(false);
    expect(d.size).toBe('small');
    s.controller.x = d.x;
    s.controller.y = d.y;
    expect(ruinToStrip(s, d.x, d.y, 600)).not.toBe(d); // a robot will not pry it
  });

  it('hold E for DOCK.pry seconds: the contacts come loose, the dock counts for the mission, copper falls, no insight, no relic', () => {
    const s = make();
    const d = dockOf(s);
    beside(s);
    tap(s);
    expect(s.action?.ruin).toBe(d);
    expect(s.action!.need).toBe(DOCK.pry);
    const insight = s.insight, copper = () => s.copper + s.loot.filter((l) => l.kind === 'copper').length;
    const before = copper();
    const ev = run(s, DOCK.pry - 0.5);
    expect(d.searched).toBe(false); // not before the time is up
    ev.push(...run(s, 1.5));
    expect(d.searched).toBe(true);
    expect(s.stats.docks).toBe(1);
    expect(ev.some((e) => e.e === 'ruin' && e.ruin === d && /dock|contacts/i.test(e.text))).toBe(true);
    expect(copper()).toBeGreaterThan(before);
    expect(s.insight).toBe(insight);
    expect(ev.some((e) => e.e === 'relic')).toBe(false);
    // Once.
    beside(s);
    tap(s);
    expect(s.action).toBeNull();
    expect(s.stats.docks).toBe(1);
  });

  it('Quick hands and the Scavenger\'s eye do not shorten a pry; stepping away pauses it', () => {
    const s = make({ perks: ['quickHands', 'scavenger'] });
    beside(s);
    tap(s);
    expect(s.action!.need).toBe(DOCK.pry);
    s.controller.x += 400;
    run(s, 1);
    expect(s.action!.paused).toBe(true);
    expect(s.action!.t).toBeLessThan(0.1);
  });

  it('knocking its walls down loses nothing: the contacts stay to be pried', () => {
    const s = make();
    const d = dockOf(s);
    s.flatten(d);
    expect(d.broken).toBe(true);
    expect(d.searched).toBe(false);
    beside(s);
    tap(s);
    run(s, DOCK.pry + 1);
    expect(s.stats.docks).toBe(1);
  });

  it('a dock unpried is the nearest unsearched ruin when it is the nearest one', () => {
    const s = make();
    const d = dockOf(s);
    s.controller.x = d.x;
    s.controller.y = d.y + 60;
    expect(nearestUnsearched(s)).toBe(d);
    d.searched = true;
    expect(nearestUnsearched(s)).not.toBe(d);
  });
});

describe('Keeper of Docks: the lift is a dock too', () => {
  it('a robot standing on the platform regains oil slowly; off it, or without the title, none', () => {
    const s = make({ titles: true });
    const c = s.controller;
    c.hp = 50;
    run(s, 5);
    expect(c.hp).toBeGreaterThanOrEqual(50 + DOCK.regen * 4); // on the lift at the start
    c.x = s.lift.x + 12 * T;
    c.y = s.lift.y;
    const was = c.hp;
    run(s, 5);
    expect(c.hp).toBe(was); // off the platform
    const plain = make();
    plain.controller.hp = 50;
    run(plain, 5);
    expect(plain.controller.hp).toBe(50);
  });

  it('crew on the platform mend too, but not a robot lying downed', () => {
    const s = make({ titles: true });
    const bot = s.addBot('guard', 'Guard', s.lift.x + 10, s.lift.y + 10, 1);
    bot.hp = bot.maxHp / 2;
    s.bots = [s.controller, bot];
    const was = bot.hp;
    run(s, 4);
    expect(bot.hp).toBeGreaterThan(was);
    const lying = s.addBot('guard', 'Guard', s.lift.x - 10, s.lift.y, 1);
    lying.hp = 1;
    lying.downed = { by: null } as typeof lying.downed;
    s.bots.push(lying);
    run(s, 4);
    expect(lying.hp).toBe(1);
  });
});

describe('Receipts: her voice names the nearest unsearched ruin (the city dock)', () => {
  const said = (s: Sim, secs: number) => run(s, secs).flatMap((e) => (e.e === 'oracle' && 'who' in e && e.who === 'princess' ? [e.text] : []));

  it('once a mission, with a direction and a distance, and the map pulses its ring', () => {
    const s = make({ perks: ['receipts'], wife: 'home' });
    const lines = said(s, VOICE.ruinAt + 40);
    const named = lines.filter((l) => /nearest .*you have not searched|Receipts/.test(l));
    expect(named).toHaveLength(1);
    const r = nearestUnsearched(s)!;
    expect(named[0]).toMatch(/\d+ tiles (north|south|east|west)/);
    expect(s.ruinPing).not.toBeNull();
    expect(s.ruinPing!.until - s.time).toBeLessThanOrEqual(PING + 0.01);
    expect(typeof bearing(s.controller, r)).toBe('string');
    expect(said(s, 60).filter((l) => /not searched/.test(l))).toEqual([]); // once
  });

  it('not without the perk, and not while she is gone', () => {
    expect(said(make({ wife: 'home' }), VOICE.ruinAt + 40).some((l) => /not searched/.test(l))).toBe(false);
    expect(make({ perks: ['receipts'], wife: 'stolen' }).voice!.wife).toBe('stolen');
    expect(said(make({ perks: ['receipts'], wife: 'stolen' }), VOICE.ruinAt + 40).some((l) => /not searched/.test(l))).toBe(false);
  });
});

describe('Moss in the brush: a quarter farther', () => {
  it('the sweep reaches BRUSH.sweep x 1.25, the swing too', () => {
    const plain = make(), moss = make({ perks: ['mossBrush'] });
    expect(brushReach(plain)).toBe(1);
    expect(brushReach(moss)).toBe(1.25);
    for (const s of [plain, moss]) {
      const c = s.controller;
      s.loot.push({ id: 1, x: c.x + BRUSH.sweep * 1.15, y: c.y, kind: 'scrap', part: null, amt: 1, t: 60, dead: false });
    }
    expect(brushSweep(plain, plain.controller)).toBe(0);
    expect(brushSweep(moss, moss.controller)).toBe(1);
  });

  it('a swing in hand carries the longer reach to the foes and to the whirl', () => {
    const reach = (s: Sim) => {
      s.weapon = 'mainBrush';
      const c = s.controller;
      const ev: SimEvent[] = [];
      s.step(1 / 30, { ...NO_INPUT, fire: true, ax: c.x + 50, ay: c.y });
      ev.push(...(s.events.splice(0) as SimEvent[]));
      return (ev.find((e) => e.e === 'swing') as Extract<SimEvent, { e: 'swing' }>).reach;
    };
    const base = (WEAPONS.mainBrush as { reach: number }).reach;
    expect(reach(make())).toBeCloseTo(base);
    expect(reach(make({ perks: ['mossBrush'] }))).toBeCloseTo(base * 1.25);
  });
});
