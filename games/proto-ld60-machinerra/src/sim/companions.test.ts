/**
 * P42: the dog (what it points at, the dusk bark, the cards' rules, coming home), the stray cat (eating gobs, tamed) and the
 * Replicator's kill bonus. Cheap: one desert land, short spans, the Communicator alone.
 */
import { describe, expect, it } from 'vitest';
import { cityFx } from '../hub/buildings';
import { CAT, DOG, LOOT, T } from './defs';
import { dogSummary, moundsOf, nearestPoint, pointRange, pointTargets, type CompanionEvent } from './companions';
import type { PlaceRT } from './placeplay';
import { forced, type PlaceId } from './places';
import { NO_INPUT, Sim } from './sim';
import { rideLift } from './testkit';

type Opts = { perks?: string[]; titles?: string[]; city?: ReturnType<typeof cityFx>; places?: PlaceId[]; seed?: number };

/** A desert land with the dog (unless `dog: false`), the Communicator alone, nothing arriving. */
const land = (o: Opts = {}) => {
  for (const id of o.places ?? []) forced.add(id);
  let s: Sim;
  try {
    s = new Sim(o.seed ?? 4, ['sprocket'], 'desert', o.perks ?? ['companionDog'], undefined, undefined, { titles: o.titles, city: o.city });
  } finally {
    for (const id of o.places ?? []) forced.delete(id);
  }
  s.bots = [s.controller];
  s.cfg.morningSwarm = 0;
  s.cfg.edge = 0;
  s.god = true;
  return s;
};
const dogEvents = (log: CompanionEvent[]) => log.filter((e) => e.e === 'dog') as Extract<CompanionEvent, { e: 'dog' }>[];
/** Run `sec` seconds, keeping the dog's and cat's events (a step clears them). */
const run = (s: Sim, sec: number, log: CompanionEvent[] = []) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    for (const e of s.events) if (e.e === 'dog' || e.e === 'cat') log.push(e);
    s.events.length = 0; // the scene drains them; a test does
  }
  return log;
};
const place = (s: Sim, id: PlaceId) => s.places.find((p) => p.id === id) as PlaceRT;
const stand = (s: Sim, a: { x: number; y: number }, dx = 0, dy = 0) => {
  s.controller.x = a.x + dx;
  s.controller.y = a.y + dy;
};

describe('the dog points at what it smells', () => {
  it('the nearest ruin, mound or place not found yet, within its smell: and the next one once that is found', () => {
    const s = land({ places: ['mounds'] });
    const r = s.ruins[0];
    stand(s, r, 0, 12);
    const p = nearestPoint(s)!;
    // Brute force: the nearest of every target.
    const nearest = pointTargets(s).sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y - 12) - Math.hypot(b.x - r.x, b.y - r.y - 12))[0];
    expect(p.id).toBe(nearest.id);
    expect(p.id).toBe(`ruin:${r.id}`);
    r.searched = true;
    expect(nearestPoint(s)!.id).not.toBe(`ruin:${r.id}`);
    // A mound is a target until it is dug.
    const m = moundsOf(s)[0];
    stand(s, m, 0, 6);
    expect(nearestPoint(s)!.id).toBe(m.id);
    place(s, 'mounds').v.dug0 = 1;
    expect(nearestPoint(s)!.id).not.toBe(m.id);
  });

  it('nothing beyond its smell, and half as far again with a better nose (dog.2)', () => {
    const plain = land();
    // A spot whose nearest target is between the plain range and the nosy one (a scan over the land).
    const plainR = pointRange(plain), nosyR = plainR * 1.5;
    let spot: { x: number; y: number } | null = null;
    for (let y = 2; y < plain.map.h - 2 && !spot; y += 2) {
      for (let x = 2; x < plain.map.w - 2 && !spot; x += 2) {
        stand(plain, { x: (x + 0.5) * T, y: (y + 0.5) * T });
        const near = Math.min(...pointTargets(plain).map((t) => Math.hypot(t.x - plain.controller.x, t.y - plain.controller.y)));
        if (near > plainR * 1.05 && near < nosyR * 0.95) spot = { ...plain.controller };
      }
    }
    expect(spot, 'a spot between the two ranges').toBeTruthy();
    stand(plain, spot!);
    expect(nearestPoint(plain)).toBeNull();
    const nosy = land({ perks: ['companionDog', 'dogNose'] });
    stand(nosy, spot!);
    expect(pointRange(nosy)).toBeCloseTo(nosyR);
    expect(nearestPoint(nosy)).not.toBeNull();
  });

  it('it stands with its nose out toward the target and says so once', () => {
    const s = land();
    stand(s, s.ruins[0], 0, 12);
    s.dog!.bot.x = s.controller.x - 20;
    s.dog!.bot.y = s.controller.y + 20;
    const log = run(s, 4);
    const d = s.dog!;
    expect(d.target?.id).toBe(`ruin:${s.ruins[0].id}`);
    expect(d.pointing).toBe(true);
    expect(dogEvents(log).filter((e) => e.what === 'point')).toHaveLength(1);
    expect(dogSummary(s)!.target).toBe(d.target!.id);
  });

  it('it is never on the crew, never a target and the Communicator\'s own', () => {
    const s = land();
    expect(s.dog).toBeTruthy();
    expect(s.bots).not.toContain(s.dog!.bot);
    expect(s.fielded).not.toContain(s.dog!.bot);
    expect(land({ perks: [] }).dog).toBeNull();
  });
});

describe('the dusk bark', () => {
  it('comes DOG.barkWarning s before the twisted arrive, once', () => {
    const s = land();
    const evening = s.day.at.evening;
    s.setClock(evening - DOG.barkWarning - 2);
    const log = run(s, 1.5);
    expect(dogEvents(log).filter((e) => e.what === 'bark')).toHaveLength(0);
    expect(s.dog!.barked).toBe(false);
    // Cross the warning: it barks, while no foe is twisted yet.
    const at: number[] = [];
    let firstTwisted = -1;
    for (let i = 0; i < 30 * 12; i++) {
      s.step(1 / 30, NO_INPUT);
      if (s.events.some((e) => e.e === 'dog' && e.what === 'bark')) at.push(s.dayT);
      s.events.length = 0;
      if (firstTwisted < 0 && s.day.twist > 0) firstTwisted = s.dayT;
    }
    expect(at).toHaveLength(1);
    expect(at[0]).toBeLessThan(evening - DOG.barkWarning + 0.2);
    expect(at[0]).toBeGreaterThan(evening - DOG.barkWarning - 0.2);
    expect(firstTwisted - at[0]).toBeGreaterThan(DOG.barkWarning - 0.3);
    expect(firstTwisted - at[0]).toBeLessThan(DOG.barkWarning + 0.3);
    expect(s.dog!.barked).toBe(true);
  });

  it('Good Boy\'s Friend (the dog\'s line) brings it 2 s earlier', () => {
    const s = land({ titles: ['goodBoysFriend'] });
    const evening = s.day.at.evening;
    s.setClock(evening - DOG.barkWarning - 2 - 0.5);
    let at = -1;
    for (let i = 0; i < 30 * 4 && at < 0; i++) {
      s.step(1 / 30, NO_INPUT);
      if (s.events.some((e) => e.e === 'dog' && e.what === 'bark')) at = s.dayT;
      s.events.length = 0;
    }
    expect(at).toBeGreaterThan(0);
    expect(evening - at).toBeCloseTo(DOG.barkWarning + 2, 0);
  });

  it('it does not bark when no dog is on the land', () => {
    const s = land({ perks: [] });
    s.setClock(s.day.at.evening - 3);
    expect(dogEvents(run(s, 5))).toHaveLength(0);
  });
});

describe('Loud Bark and Good Nose (the dog\'s cards)', () => {
  const withCards = (cards: string[]) => {
    const s = land({ places: ['mounds'] });
    for (const c of cards) s.engine.addSource(s.controller, { id: `card:${c}`, kind: 'research', name: c, effects: [{ when: 'always', do: { do: 'stat', stat: c === 'loudBark' ? 'barkBlind' : 'dogDigs', add: 1 } }] });
    return s;
  };

  it('Loud Bark: a twisted foe that closes in is barked at and Blinded; none without the card', () => {
    for (const card of [true, false]) {
      const s = withCards(card ? ['loudBark'] : []);
      const d = s.dog!;
      d.bot.x = s.controller.x - 20;
      d.bot.y = s.controller.y + 20;
      const h = s.spawnHornet(d.bot.x + 120, d.bot.y, 0, false, false, 'hornet');
      h.twisted = true;
      const log = run(s, 0.5);
      expect(!!s.engine.status(h, 'blinded')).toBe(card);
      expect(dogEvents(log).some((e) => e.what === 'bark' && e.text === 'twisted')).toBe(card);
    }
  });

  it('Loud Bark barks no more than once in barkEvery s', () => {
    const s = withCards(['loudBark']);
    const d = s.dog!;
    d.bot.x = s.controller.x - 20;
    d.bot.y = s.controller.y + 20;
    const h = s.spawnHornet(d.bot.x + 120, d.bot.y, 0, false, false, 'hornet');
    h.twisted = true;
    const log = run(s, DOG.barkEvery - 1);
    expect(dogEvents(log).filter((e) => e.text === 'twisted')).toHaveLength(1);
  });

  it('Good Nose: it goes to the mound it points at and digs it by itself; without the card it only points', () => {
    for (const card of [true, false]) {
      const s = withCards(card ? ['goodNose'] : []);
      const m = moundsOf(s)[0];
      stand(s, m, 0, 60);
      s.dog!.bot.x = s.controller.x - 20;
      s.dog!.bot.y = s.controller.y + 20;
      const before = s.stats.dug ?? 0;
      run(s, DOG.dig + 6);
      expect((s.stats.dug ?? 0) > before).toBe(card);
    }
  });
});

describe('the dog comes home', () => {
  const kennelLand = () => {
    const s = land({ perks: [], places: ['kennel'] });
    return s;
  };
  it('freed at the Kennel and standing on the lift when it rises: stats.dogHome', () => {
    const s = kennelLand();
    s.triggerPlace('kennel');
    expect(s.dog?.fresh).toBe(true);
    stand(s, s.lift);
    s.dog!.bot.x = s.lift.x + 20;
    s.dog!.bot.y = s.lift.y + 10;
    rideLift(s);
    expect(s.stats.dogHome).toBe(1);
  });

  it('left behind: not home', () => {
    const s = kennelLand();
    s.triggerPlace('kennel');
    stand(s, s.lift);
    s.dog!.bot.x = s.lift.x + 600;
    s.dog!.bot.y = s.lift.y;
    rideLift(s);
    expect(s.stats.dogHome).toBeUndefined();
  });

  it('a mission ended without the ride (finish) counts it too, if it stands on the lift', () => {
    const s = kennelLand();
    s.triggerPlace('kennel');
    stand(s, s.lift);
    s.dog!.bot.x = s.lift.x;
    s.dog!.bot.y = s.lift.y;
    s.finish();
    expect(s.stats.dogHome).toBe(1);
  });

  it('a dog that was already his is not freed again', () => {
    const s = land({ places: ['kennel'] });
    expect(s.dog?.fresh).toBe(false);
    expect(s.triggerPlace('kennel')).toBeFalsy();
  });
});

describe('the stray cat', () => {
  const feed = (s: Sim, p: PlaceRT) => {
    const h = p.parts.find((q) => q.kind === 'stray')!;
    s.restLoot(h.x + 20, h.y + 10, 'scrap');
  };

  it('eats a gob of scrap lying near it, three of them tame it, and it stays a stray without', () => {
    const s = land({ perks: [], places: ['stray'] });
    const p = place(s, 'stray');
    // He is far away: the cat is created once he comes within the place's near radius, so stand beside it, then step off.
    stand(s, p, 0, 40);
    run(s, 0.5);
    stand(s, p, -T * 12, 0);
    expect(p.state).toBe('wild');
    const log: CompanionEvent[] = [];
    run(s, 3, log);
    expect(p.v.fed ?? 0).toBe(0);
    for (let i = 0; i < CAT.fed; i++) {
      expect(p.state, `gob ${i}`).toBe('wild');
      feed(s, p);
      run(s, CAT.eat + 4, log);
    }
    expect(p.v.fed).toBe(CAT.fed);
    expect(p.state).toBe('tamed');
    expect(s.stats.catTamed).toBe(1);
    expect(s.stats.catFed).toBe(CAT.fed);
    expect(log.filter((e) => e.e === 'cat' && e.what === 'eat')).toHaveLength(CAT.fed);
    expect(log.filter((e) => e.e === 'cat' && e.what === 'tamed')).toHaveLength(1);
  });

  it('he picks the gob up first if he stands by it: it is never eaten', () => {
    const s = land({ perks: [], places: ['stray'] });
    const p = place(s, 'stray');
    stand(s, p, 0, 40);
    run(s, 0.5);
    feed(s, p);
    run(s, 3);
    expect(p.v.fed ?? 0).toBe(0);
    expect(s.stats.gathered).toBeGreaterThan(0);
  });
});

describe('feeding the stray by hand (Minos: an E prompt by her)', () => {
  const setup = () => {
    const s = land({ perks: [], places: ['stray'] });
    const p = place(s, 'stray');
    stand(s, p, 0, 40);
    run(s, 0.5); // she is made once he comes near
    return { s, p, cat: p.bots[0] };
  };
  const give = (s: Sim, log: CompanionEvent[]) => {
    s.step(1 / 30, { ...NO_INPUT, use: true });
    run(s, CAT.give + 0.5, log);
  };

  it('with scrap carried, one press holds, spends a gob and feeds her; three tame her', () => {
    const { s, p, cat } = setup();
    stand(s, cat, 24, 0);
    s.scrap = CAT.gob * 3 + 1;
    expect(s.placeUse(s.controller.x, s.controller.y)?.p).toBe(p);
    expect(s.placeUse(s.controller.x, s.controller.y)?.use.verb(s, p)).toContain(CAT.name);
    const log: CompanionEvent[] = [];
    for (let i = 0; i < CAT.fed; i++) {
      expect(p.state, `gob ${i}`).toBe('wild');
      give(s, log);
      expect(p.v.fed).toBe(i + 1);
    }
    expect(s.scrap).toBeCloseTo(1, 5);
    expect(p.state).toBe('tamed');
    expect(s.stats.catTamed).toBe(1);
    expect(s.stats.catFed).toBe(CAT.fed);
    expect(log.filter((e) => e.e === 'cat' && e.what === 'eat')).toHaveLength(CAT.fed);
    expect(s.placeUse(s.controller.x, s.controller.y)).toBeNull(); // tamed: no more prompt
  });

  it('with less scrap than a gob there is no prompt and a press feeds nothing; out of reach neither', () => {
    const { s, p, cat } = setup();
    stand(s, cat, 24, 0);
    s.scrap = CAT.gob - 1;
    expect(s.placeUse(s.controller.x, s.controller.y)).toBeNull();
    give(s, []);
    expect(p.v.fed ?? 0).toBe(0);
    expect(s.scrap).toBe(CAT.gob - 1);
    s.scrap = 50;
    stand(s, cat, CAT.reach * 3, 0);
    expect(s.placeUse(s.controller.x, s.controller.y)).toBeNull();
  });
});

describe('the Replicator\'s catsplosion', () => {
  const kill = (city: ReturnType<typeof cityFx>) => {
    const s = land({ perks: [], city });
    const h = s.spawnHornet(s.controller.x + 80, s.controller.y, 0, false, false, 'hornet');
    const before = s.scrap;
    s.slay(h);
    return s.scrap - before;
  };

  it('+CAT.kill scrap a kill, only with the Replicator and the cat', () => {
    const plain = kill(cityFx([]));
    expect(kill(cityFx(['replicator'], { cat: true }))).toBe(plain + CAT.kill);
    expect(kill(cityFx(['replicator'], { cat: false }))).toBe(plain);
    expect(kill(cityFx([], { cat: true }))).toBe(plain);
    // With the Scrapyard too: both add.
    expect(kill(cityFx(['scrapyard', 'replicator'], { cat: true }))).toBe(plain + 1 + CAT.kill);
  });
});

describe("The Cat's Butler (the cat's line's title)", () => {
  /** How far a gob of this kind lying `gap` px beyond the usual pull has rolled after a second. */
  const rolled = (titles: string[], kind: 'scrap' | 'oil', gap: number) => {
    const s = land({ perks: [], titles });
    const at = LOOT.magnet + gap;
    const l = s.drop(s.controller.x + at, s.controller.y, kind);
    const x0 = l.x;
    run(s, 0.4);
    return x0 - l.x;
  };

  it('scrap gobs within a short way beyond the usual pull roll toward him; no other loot, and nothing without the title', () => {
    const gap = CAT.butler / 2;
    expect(rolled([], 'scrap', gap)).toBeLessThan(1);
    expect(rolled(['catsButler'], 'scrap', gap)).toBeGreaterThan(20);
    expect(rolled(['catsButler'], 'oil', gap)).toBeLessThan(1);
    expect(rolled(['catsButler'], 'scrap', CAT.butler + 60)).toBeLessThan(1);
  });
});
