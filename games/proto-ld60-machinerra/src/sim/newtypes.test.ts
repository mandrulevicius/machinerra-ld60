import { describe, expect, it } from 'vitest';
import { T } from './defs';
import { areasOf } from './botskills';
import { NO_INPUT, Sim, type Bot, type Hornet } from './sim';
import type { CrewBot } from './types';
import type { SpecId } from './specs';

/** The three newest base types (P15) and the Marksman's specs at work: a quiet land, the Communicator and the given robots beside him. */
const field = (...crew: CrewBot[]) => {
  const s = new Sim(3, [], 'desert', [], undefined, undefined, { crew });
  s.god = true;
  const c = s.controller;
  const bots = s.bots.filter((b) => b !== c);
  s.bots = [c, ...bots];
  bots.forEach((b, i) => {
    b.x = c.x + 50 + i * 30;
    b.y = c.y + 10;
  });
  return { s, c, bots };
};
const run = (s: Sim, sec: number, each?: () => void) => {
  const evs: Sim['events'] = [];
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    evs.push(...s.events);
    s.events.length = 0;
    each?.();
  }
  return evs;
};
const cast = (evs: Sim['events'], b: Bot, why: string) => evs.some((e) => e.e === 'ai' && e.bot === b && e.what === 'cast' && e.why === why);
const bot = (role: CrewBot['role'], spec?: SpecId): CrewBot => ({ role, name: role, uid: role, ...(spec && { spec }) });
/** A foe that stays put (rooted), stings no one and takes a lot to kill. */
const post = (s: Sim, x: number, y: number, o: { elite?: boolean; twisted?: boolean } = {}): Hornet => {
  const h = s.spawnHornet(x, y, 0, !!o.elite, !!o.twisted, 'hornet');
  s.engine.apply(h, 'rooted', { duration: 9999 });
  h.cd = 9999;
  h.hp = h.maxHp = 1e6;
  return h;
};
const stat = (s: Sim, key: string) => s.stats[`deed.${key}`] ?? 0;

describe('the Boilermancer (P15)', () => {
  it('throws a steam cloud at a cluster of three foes: it scalds and wets them, and the deed counts', () => {
    const { s, c, bots: [b] } = field(bot('boilermancer'));
    const foes = [post(s, c.x + 6 * T, c.y), post(s, c.x + 6 * T + 30, c.y + 20), post(s, c.x + 6 * T + 10, c.y - 25)];
    const evs = run(s, 3);
    expect(cast(evs, b, 'cloud')).toBe(true);
    expect(evs.some((e) => e.e === 'ability' && e.what === 'cloud')).toBe(true);
    for (const h of foes) {
      expect(h.hp).toBeLessThan(h.maxHp);
      expect(s.engine.status(h, 'wet')).toBeTruthy();
    }
    expect(stat(s, 'boilermancer.scald')).toBeGreaterThanOrEqual(3);
  });

  it('keeps its cloud for three foes or an elite, and for none on an empty field', () => {
    const none = field(bot('boilermancer'));
    expect(cast(run(none.s, 2), none.bots[0], 'cloud')).toBe(false);
    const two = field(bot('boilermancer'));
    post(two.s, two.c.x + 6 * T, two.c.y);
    post(two.s, two.c.x + 6 * T + 30, two.c.y + 20);
    expect(cast(run(two.s, 2), two.bots[0], 'cloud')).toBe(false);
    const elite = field(bot('boilermancer'));
    post(elite.s, elite.c.x + 6 * T, elite.c.y, { elite: true });
    expect(cast(run(elite.s, 2), elite.bots[0], 'cloud')).toBe(true);
  });

  it('a Scalder\'s cloud is wider and lasts longer; a Condenser throws none', () => {
    const cloudOf = (spec?: SpecId) => {
      const { s, c } = field(bot('boilermancer', spec));
      post(s, c.x + 6 * T, c.y, { elite: true });
      run(s, 1.5);
      return areasOf(s)[0];
    };
    const plain = cloudOf(), scalder = cloudOf('scalder');
    expect(scalder.r).toBeGreaterThan(plain.r);
    expect(scalder.ttl).toBeGreaterThan(plain.ttl);
    expect(cloudOf('condenser')).toBeUndefined();
  });

  it('blesses the ally in the fight with Haste, and the crew with Steaming as a Choirmaster', () => {
    const haste = field(bot('boilermancer'), bot('guard'));
    post(haste.s, haste.c.x + 8 * T, haste.c.y);
    expect(cast(run(haste.s, 2), haste.bots[0], 'blessing')).toBe(true);
    expect(haste.s.engine.status(haste.bots[1], 'haste')).toBeTruthy();
    expect(stat(haste.s, 'boilermancer.bless')).toBeGreaterThanOrEqual(1);
    const choir = field(bot('boilermancer', 'choirmaster'), bot('guard'));
    post(choir.s, choir.c.x + 8 * T, choir.c.y);
    run(choir.s, 2);
    expect(choir.s.engine.status(choir.bots[1], 'steaming')).toBeTruthy();
  });

  it('stands off from a foe that comes close', () => {
    const { s, c, bots: [b] } = field(bot('boilermancer'));
    const h = post(s, c.x + 90, c.y + 10);
    run(s, 1.5);
    expect(Math.hypot(b.x - h.x, b.y - h.y)).toBeGreaterThan(100);
  });
});

describe('the Lamplighter (P15)', () => {
  it('lights its allies, and the twisted halos inside its lamp go out', () => {
    const { s, bots: [l, g, away] } = field(bot('lamplighter'), bot('guard'), bot('guard'));
    g.x = l.x + 40;
    away.x = l.x + 300;
    for (const x of [l, g, away]) s.engine.apply(x, 'rooted', { duration: 9999 }); // they stay where they stand
    const near = post(s, l.x + 60, l.y, { twisted: true });
    const far = post(s, l.x + 400, l.y, { twisted: true });
    run(s, 1);
    expect(s.engine.status(g, 'lit')).toBeTruthy();
    expect(s.engine.status(away, 'lit')).toBeFalsy(); // beyond 140 px
    expect(near.dimT ?? 0).toBeGreaterThan(s.time);
    expect(far.dimT ?? 0).toBeLessThan(s.time);
  });

  it('a Beacon\'s lamp is 1.6 times wider; a Shade has none', () => {
    const lamp = (spec?: SpecId) => {
      const { s, bots: [l] } = field(bot('lamplighter', spec));
      return s.engine.stat(l, 'lamp', 0);
    };
    expect(lamp()).toBe(140);
    expect(lamp('beacon')).toBeCloseTo(224);
    expect(lamp('shade')).toBe(0);
  });

  it('throws a flare at foes no light reaches: it lights the ground and shows the fog; a Flare-runner blinds them', () => {
    const run1 = (spec?: SpecId) => {
      const { s, c } = field(bot('lamplighter', spec));
      const h = post(s, c.x + 8 * T, c.y);
      let blind = false;
      const evs = run(s, 2, () => void (blind ||= s.engine.flag(h, 'blind')));
      return { s, h, evs, blind };
    };
    const a = run1();
    expect(a.evs.some((e) => e.e === 'ability' && e.what === 'flare')).toBe(true);
    expect(a.s.fog.at(a.h.x / T - 0.5, a.h.y / T - 0.5)).toBe(true);
    expect(a.blind).toBe(false);
    const b = run1('flareRunner');
    expect(b.blind).toBe(true);
    expect(stat(b.s, 'lamplighter.flare')).toBeGreaterThanOrEqual(1);
  });

  it('holds the middle of its crew', () => {
    const { s, c, bots: [l, g, h] } = field(bot('lamplighter'), bot('guard'), bot('guard'));
    g.x = c.x - 100;
    h.x = c.x + 100;
    run(s, 4);
    expect(Math.hypot(l.x - c.x, l.y - c.y)).toBeLessThan(80);
  });
});

describe('the Stalker (P15)', () => {
  it('hides when out of a fight, foes do not hunt it, and it shows when it strikes', () => {
    const { s, bots: [k] } = field(bot('stalker'));
    run(s, 0.3);
    expect(k.hidden).toBe(true);
    const h = s.spawnHornet(k.x + 4 * T, k.y, 0, false, false, 'hornet');
    run(s, 1);
    expect(h.target === k.id).toBe(false);
  });

  it('goes round to a foe\'s back and strikes it for twice the blow', () => {
    const { s, c, bots: [k] } = field(bot('stalker'));
    const h = post(s, c.x + 3 * T, c.y);
    s.hornets = [h]; // alone on the land
    h.target = c.id; // it faces the Communicator, the stalker comes up behind it
    const hits: number[] = [];
    let prev = h.hp;
    run(s, 4, () => {
      s.engine.apply(h, 'rooted', { duration: 9999 });
      h.target = c.id;
      if (h.hp < prev) hits.push(prev - h.hp);
      prev = h.hp;
    });
    expect(hits.length).toBeGreaterThan(1);
    expect(k.x).toBeGreaterThan(h.x - 20); // behind it (it faces west, toward him)
    expect(Math.max(...hits)).toBeGreaterThan(Math.min(...hits) * 1.5 - 0.001);
    expect(stat(s, 'stalker.backKill')).toBe(0);
  });

  it('the burst from behind needs no empty ground: a foe with an ally at its side takes it too', () => {
    const { s, c } = field(bot('stalker'));
    const h = post(s, c.x + 3 * T, c.y);
    const mate = post(s, h.x, h.y + 30); // an ally 30 px from the target
    s.hornets = [h, mate];
    const hits: number[] = [];
    const prev = new Map([[h, h.hp], [mate, mate.hp]]);
    run(s, 4, () => {
      for (const f of [h, mate]) {
        s.engine.apply(f, 'rooted', { duration: 9999 });
        f.target = c.id;
        if (f.hp < prev.get(f)!) hits.push(prev.get(f)! - f.hp);
        prev.set(f, f.hp);
      }
    });
    expect(hits.length).toBeGreaterThan(1);
    expect(Math.max(...hits)).toBeGreaterThan(Math.min(...hits) * 1.5 - 0.001);
  });

  it('a kill from behind is counted for the deed', () => {
    const { s, c } = field(bot('stalker'));
    const h = post(s, c.x + 3 * T, c.y);
    s.hornets = [h];
    h.maxHp = 40;
    h.hp = 40;
    run(s, 6, () => {
      s.engine.apply(h, 'rooted', { duration: 9999 });
      h.target = c.id;
    });
    expect(h.dead).toBe(true);
    expect(stat(s, 'stalker.backKill')).toBe(1);
  });

  it('a Ghost scouts farther on an order and its share of the land is its deed; its elite kills drop an extra part', () => {
    const { s, c, bots: [k] } = field(bot('stalker', 'ghost'));
    s.hornets = [];
    s.order(0, c.x + 15 * T, c.y);
    run(s, 6);
    expect(stat(s, 'stalker.scoutPct')).toBeGreaterThan(0);
    const plain = field(bot('stalker')), ghost = field(bot('stalker', 'ghost'));
    const drops = ({ s, c }: typeof plain) => {
      const e = post(s, c.x + 2 * T, c.y, { elite: true });
      s.hornets = [e];
      e.maxHp = 30;
      e.hp = 30;
      const evs = run(s, 5, () => void (e.dead || (s.engine.apply(e, 'rooted', { duration: 9999 }), (e.target = c.id))));
      return evs.filter((ev) => ev.e === 'drop' && ev.l.kind === 'part').length;
    };
    expect(drops(ghost)).toBe(drops(plain) + 1);
    void k;
  });

  it('an Executioner finishes a foe under 25% outright and hides again at once', () => {
    const { s, c, bots: [k] } = field(bot('stalker', 'executioner'));
    const h = post(s, c.x + 2 * T, c.y);
    h.hp = h.maxHp * 0.2;
    h.maxHp = 100;
    h.hp = 20;
    run(s, 3);
    expect(h.dead).toBe(true);
    expect(k.mind!.fought).toBe(-Infinity);
  });

  it('a Bodyguard stays by the Communicator and takes the first blow meant for him every 8 s', () => {
    const { s, c, bots: [k] } = field(bot('stalker', 'bodyguard'));
    k.x = c.x + 40;
    const h = post(s, c.x + 30, c.y);
    s.hurt(c, 10, false, { by: h });
    const first = k.hp;
    expect(first).toBeLessThan(k.maxHp); // it took the blow
    s.hurt(c, 10, false, { by: h });
    expect(k.hp).toBe(first); // once in 8 s
    run(s, 8.5);
    s.hurt(c, 10, false, { by: h });
    expect(k.hp).toBeLessThan(first);
  });
});

describe('the Marksman\'s specs (P15)', () => {
  it('marks the first foe it sees; a Spotter marks every 3 s', () => {
    const marks = (spec?: SpecId) => {
      const { s, c } = field(bot('marksman', spec));
      post(s, c.x + 9 * T, c.y);
      post(s, c.x + 9 * T, c.y + 60);
      post(s, c.x + 9 * T, c.y - 60);
      run(s, 7.5);
      return stat(s, 'marksman.mark');
    };
    expect(marks()).toBe(2); // at 0 and 6 s
    expect(marks('spotter')).toBe(3); // three foes, three marks, then nothing left to mark
  });

  it('a Sniper\'s shot passes through two foes; a Scattergun fires a cone of five and keeps two tiles off', () => {
    const { s, bots: [m] } = field(bot('marksman', 'sniper'));
    expect(s.engine.stat(m, 'pierceShots', 0)).toBe(2);
    const g = field(bot('marksman', 'scattergun'));
    const h = post(g.s, g.c.x + 6 * T, g.c.y);
    let shots = 0;
    run(g.s, 2, () => void 0);
    const evs = run(g.s, 3);
    shots = evs.filter((e) => e.e === 'shot').length;
    expect(shots % 5).toBe(0);
    expect(shots).toBeGreaterThanOrEqual(5);
    expect(h.hp).toBeLessThan(h.maxHp);
  });
});
