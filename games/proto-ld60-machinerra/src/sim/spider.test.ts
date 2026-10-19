import { describe, expect, it } from 'vitest';
import { SPIDER, T } from './defs';
import { NO_INPUT, Sim, type Hornet, type SimEvent } from './sim';
import { spawnAtRim } from './spider';

/** The Communicator alone, by day, in the desert. */
const alone = (seed = 3) => {
  const s = new Sim(seed);
  s.bots = [s.controller];
  s.setClock('day');
  return s;
};
const kill = (s: Sim, h: Hornet) => (s as unknown as { damageHornet(h: Hornet, d: number, by: null): void }).damageHornet(h, 9999, null);
/** Step `sec` seconds, collecting every event. */
const run = (s: Sim, sec: number, each?: (s: Sim) => void) => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, NO_INPUT);
    ev.push(...s.events);
    s.events.length = 0;
    each?.(s);
  }
  return ev;
};
/** A spider `tiles` east of the Communicator, with its web held back (unless asked) and its pounce ready. */
const spiderAt = (s: Sim, tiles: number, o: { twisted?: boolean; elite?: boolean; web?: boolean } = {}) => {
  const c = s.controller;
  const h = s.spawnHornet(c.x + tiles * T, c.y, 0, o.elite ?? false, o.twisted ?? false, 'spider');
  h.spider!.pounceT = 0;
  h.spider!.webT = o.web ? 0 : 999;
  return h;
};
const spiderEvents = (ev: SimEvent[], what: string) => ev.filter((e) => e.e === 'spider' && e.what === what);

describe('the pounce', () => {
  it('rears up (a tell), leaps, lands and rests: nothing hurts before the landing, and the rest is the opening', () => {
    const s = alone();
    const h = spiderAt(s, 3);
    const c = s.controller;
    const seen: string[] = [];
    let tellAt = -1, leapAt = -1, landAt = -1, hpAtLeap = 0;
    for (let i = 0; i < 90 && landAt < 0; i++) {
      s.step(1 / 30, NO_INPUT);
      for (const e of s.events) {
        if (e.e !== 'spider') continue;
        if (e.what === 'tellPounce' && tellAt < 0) tellAt = i;
        if (e.what === 'leap') {
          leapAt = i;
          hpAtLeap = c.hp;
        }
        if (e.what === 'land') landAt = i;
      }
      s.events.length = 0;
      if (seen[seen.length - 1] !== h.spider!.mode) seen.push(h.spider!.mode);
      if (tellAt >= 0 && landAt < 0) expect(c.hp).toBe(c.maxHp); // no damage from a tell or a leap in the air
    }
    expect(seen.filter((m) => m !== 'stalk')).toEqual(['tellPounce', 'leap', 'recover']);
    expect((leapAt - tellAt) / 30).toBeGreaterThanOrEqual(SPIDER.pounce.tell * 0.85); // a readable beat
    expect(c.hp).toBeLessThan(hpAtLeap); // and then the landing hurt
    expect(hpAtLeap).toBe(c.maxHp);
    expect(h.spider!.mode).toBe('recover');
    run(s, SPIDER.pounce.rest + 0.5);
    expect(h.spider!.mode).not.toBe('recover');
  });

  it('can be sidestepped: the landing is locked for the last moments of the tell, and a robot that has moved away is not hit', () => {
    const s = alone();
    const h = spiderAt(s, 3);
    const c = s.controller;
    const hp = c.hp;
    let locked = false;
    for (let i = 0; i < 90; i++) {
      s.step(1 / 30, NO_INPUT);
      if (h.spider!.mode === 'tellPounce' && h.spider!.t <= SPIDER.pounce.lock && !locked) {
        locked = true;
        c.x += 90; // steps aside
      }
      if (locked && h.spider!.mode === 'recover') break;
    }
    expect(locked).toBe(true);
    expect(c.hp).toBe(hp);
    expect(h.spider!.mode).toBe('recover');
  });

});

describe('the web', () => {
  it('a cable from range tethers a robot and slows it; killing the spider lets go', () => {
    const s = alone();
    const h = spiderAt(s, 5, { web: true });
    const c = s.controller;
    h.spider!.pounceT = 999;
    const ev = run(s, 2);
    expect(spiderEvents(ev, 'tellWeb').length).toBeGreaterThan(0);
    expect(spiderEvents(ev, 'web').length).toBe(1);
    expect(spiderEvents(ev, 'snare').length).toBe(1);
    expect(c.web?.by).toBe(h.id);
    expect(s.mobility(c)).toBeLessThanOrEqual(SPIDER.web.slow);
    kill(s, h);
    run(s, 0.2);
    expect(c.web).toBeUndefined();
    expect(s.mobility(c)).toBe(1);
  });

});

describe('rock and the rim', () => {

  it('spiders leap in over the rim from the day on, even with every hive dead, and never in the morning', () => {
    const calm = new Sim(4);
    calm.bots = [calm.controller];
    calm.cfg.morningSwarm = 0;
    run(calm, 60);
    expect(calm.hornets.length).toBe(0);

    const s = alone(4);
    for (const n of s.nests) n.dead = true;
    const ev = run(s, 90);
    const w = s.W * T, hh = s.H * T;
    // They landed inside the map, with a thud and no blow.
    const drops = spiderEvents(ev, 'drop') as Extract<SimEvent, { e: 'spider' }>[];
    expect(drops.length).toBeGreaterThan(0);
    for (const e of drops) expect(e.hits).toBeUndefined();
    const rim = s.hornets.filter((h) => h.rim && h.spider && !h.spider.drop);
    expect(rim.length).toBeGreaterThan(0);
    for (const h of rim) expect(h.x > 0 && h.x < w && h.y > 0 && h.y < hh).toBe(true);
    // From anywhere they come for the nearest robot.
    expect(s.spiders.edgeT).toBeGreaterThan(0);
  });

  it('a rim spider starts outside the map, leaps in on a high arc, lands without a blow and goes for the Communicator', () => {
    const s = alone();
    s.god = true;
    const h = spawnAtRim(s);
    const out = h.x < 0 || h.y < 0 || h.x > s.W * T || h.y > s.H * T;
    expect(out).toBe(true);
    expect(h.spider!.mode).toBe('leap');
    const oil = s.controller.hp;
    let peak = 0;
    const ev = run(s, 1.5, () => { peak = Math.max(peak, h.spider!.z); });
    expect(peak).toBeGreaterThan(SPIDER.edge.arc * 0.9);
    expect(spiderEvents(ev, 'drop').length).toBe(1);
    expect(h.spider!.mode).not.toBe('leap');
    expect(h.spider!.drop).toBeUndefined();
    expect(h.spider!.z).toBeLessThan(1);
    expect(h.x > 0 && h.x < s.W * T && h.y > 0 && h.y < s.H * T).toBe(true);
    expect(s.controller.hp).toBe(oil);
    const start = Math.hypot(h.x - s.controller.x, h.y - s.controller.y);
    run(s, 8);
    expect(Math.hypot(h.x - s.controller.x, h.y - s.controller.y)).toBeLessThan(start);
  });

  it('arrivals do not stack: their rim points and landings differ', () => {
    const s = alone();
    s.god = true;
    const at = Array.from({ length: 12 }, () => spawnAtRim(s));
    expect(new Set(at.map((h) => `${Math.round(h.x / 8)},${Math.round(h.y / 8)}`)).size).toBe(12);
    expect(new Set(at.map((h) => `${Math.round(h.spider!.tx / 8)},${Math.round(h.spider!.ty / 8)}`)).size).toBe(12);
  });
});

