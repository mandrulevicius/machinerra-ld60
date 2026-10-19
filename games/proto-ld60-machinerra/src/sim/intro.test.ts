import { describe, expect, it } from 'vitest';
import { KICK, T } from './defs';
import { INTRO, INTRO_LAND, introLetters } from './intro';
import { landProblems, loadLand } from './lands';
import { kickWait } from './controller';
import { NO_INPUT, Sim, type Input } from './sim';
import { rideLift, tap } from './testkit';
import { haulFrom } from '../hub/state';

const intro = () => new Sim(INTRO_LAND, [], 'desert', [], undefined, undefined, { land: loadLand(INTRO_LAND), crew: [] });
const L = introLetters();
const px = (s: { x: number; y: number }) => ({ x: (s.x + 0.5) * T, y: (s.y + 0.5) * T });
const stand = (s: Sim, x: number, y: number) => Object.assign(s.controller, { x, y });
const run = (s: Sim, sec: number, input: Input = NO_INPUT) => {
  for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, input);
};
/** Stand `tiles` west of a tile and kick east. */
const kickEast = (s: Sim, at: { x: number; y: number }, tiles = 1.2) => {
  const p = px(at);
  stand(s, p.x - tiles * T, p.y);
  s.step(1 / 30, { ...NO_INPUT, kick: true, ax: p.x + 200, ay: p.y });
  run(s, 1.5);
};

describe('the intro: the old works', () => {
  it('is sound, and lands him alone at half oil with nothing in hand and no clock', () => {
    expect(landProblems(loadLand(INTRO_LAND))).toEqual([]);
    const s = intro();
    expect(s.intro).not.toBeNull();
    expect(s.controller.x).toBeCloseTo(px(L.S[0]).x);
    expect(s.controller.hp / s.controller.maxHp).toBeCloseTo(INTRO.oil);
    expect(s.unarmed).toBe(true);
    expect(s.crew).toHaveLength(0);
    run(s, 2);
    expect(s.dayT).toBe(0);
    expect(s.intro!.stepNow).toBe('kick');
  });

  it('stands the dazed Crawlcams hurt, about half a kick from what they crash into', () => {
    const s = intro();
    const all = [s.intro!.key!, ...s.intro!.pair];
    for (const h of all) expect(h.hp).toBeCloseTo(h.maxHp * INTRO.dazedHp, 3);
    const half = (KICK.knock / 5 / T) / 2; // tiles: a kick flies about knock / friction, and these stand half of it away
    const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) / T;
    const wall = px(L.w[0]);
    expect(gap(all[0], wall)).toBeGreaterThan(half * 0.6);
    expect(gap(all[0], wall)).toBeLessThan(half * 1.6);
    expect(gap(all[1], all[2])).toBeGreaterThan(half * 0.6);
    expect(gap(all[1], all[2])).toBeLessThan(half * 1.6);
  });

  it('swings nothing before the shovel', () => {
    const s = intro();
    s.step(1 / 30, { ...NO_INPUT, fire: true, ax: s.controller.x + 50, ay: s.controller.y });
    expect(s.events.some((e) => e.e === 'swing')).toBe(false);
  });

  it('teaches the kick: the dazed Crawlcam kicked into the rotten wall breaks it whole and dies', () => {
    const s = intro();
    const key = s.intro!.key!;
    run(s, 1);
    expect(key.dead).toBe(false);
    expect(s.hornets.find((h) => h === key)?.x).toBeCloseTo(px(L[1][0]).x, 0); // dazed: it stays put
    kickEast(s, L[1][0]);
    expect(s.intro!.plug.every((p) => p.broken)).toBe(true);
    expect(key.dead).toBe(true);
    expect(s.intro!.stepNow).toBe('crash');
  });

  it('brings the first Crawlcam back if it dies with the wall still up', () => {
    const s = intro();
    s.slay(s.intro!.key!);
    run(s, INTRO.key + 0.5);
    expect(s.intro!.key!.dead).toBe(false);
    expect(s.intro!.key!.dazed).toBe(true);
  });

  it('crashes one dazed Crawlcam into the one behind it: both fall', () => {
    const s = intro();
    s.intro!.go('pair');
    kickEast(s, L[2][0]);
    expect(s.intro!.pair.every((h) => h.dead)).toBe(true);
    expect(s.intro!.stepNow).toBe('shovel');
  });

  it('puts the shovel in hand as he walks over it, and sends a Crawlcam over', () => {
    const s = intro();
    s.intro!.go('pair');
    stand(s, px(L.v[0]).x, px(L.v[0]).y);
    run(s, 0.1);
    expect(s.unarmed).toBe(false);
    expect(s.intro!.walker?.dead).toBe(false);
    expect(s.intro!.stepNow).toBe('walker');
    s.step(1 / 30, { ...NO_INPUT, fire: true, ax: s.controller.x + 50, ay: s.controller.y });
    expect(s.events.some((e) => e.e === 'swing')).toBe(true);
  });

  it('keeps the den sealed until all three rooms are done', () => {
    const s = intro();
    s.god = true;
    s.intro!.go('hall');
    const den = s.intro!.den;
    expect(den.length).toBeGreaterThan(0);
    // The scrap pile, picked up.
    for (const l of s.intro!.pile) {
      stand(s, l.x, l.y);
      run(s, 0.3);
    }
    expect(s.intro!.rooms.scrap).toBe(true);
    // A blow on the seal does nothing.
    stand(s, den[1].x - 40, den[1].y);
    s.step(1 / 30, { ...NO_INPUT, fire: true, ax: den[1].x, ay: den[1].y });
    run(s, 0.5);
    expect(den.every((p) => !p.broken)).toBe(true);
    // The tap.
    stand(s, s.seeps[0].x, s.seeps[0].y + 20);
    run(s, 0.2);
    expect(s.intro!.rooms.tap).toBe(true);
    expect(s.intro!.open).toBe(false);
    // Bellows, mended where he lies (his guards slain first).
    for (const g of s.intro!.guards) s.slay(g);
    const b = s.intro!.bellows!;
    stand(s, b.x + 20, b.y);
    tap(s);
    run(s, 3.5);
    expect(b.downed).toBeFalsy();
    expect(s.intro!.rooms.bellows).toBe(true);
    run(s, 0.1);
    expect(s.intro!.open).toBe(true);
    expect(den.every((p) => p.broken)).toBe(true);
    expect(s.intro!.stepNow).toBe('den');
  });

  it("wakes the boss in the den; its fall opens the lift, and the lift ends the mission with Bellows sent home", () => {
    const s = intro();
    s.god = true;
    s.intro!.go('bellows');
    for (const g of s.intro!.guards) s.slay(g);
    const b = s.intro!.bellows!;
    stand(s, b.x + 20, b.y);
    tap(s);
    run(s, 3.5);
    s.intro!.go('boss');
    run(s, 0.2);
    const boss = s.intro!.boss!;
    expect(boss.boss).toBe(true);
    expect(boss.kind).toBe('caterpillar');
    expect(boss.grub).toBeTruthy();
    expect(s.intro!.gate.every((p) => !p.broken)).toBe(true);
    s.slay(boss);
    run(s, 0.2);
    expect(s.intro!.gate.every((p) => p.broken)).toBe(true);
    expect(s.loot.some((l) => l.kind === 'part' && l.part?.startsWith('spider'))).toBe(true); // it drops a part
    expect(s.intro!.stepNow).toBe('lift');
    stand(s, s.lift.x, s.lift.y);
    rideLift(s);
    expect(s.phase).toBe('done');
    expect(haulFrom(s, 'h').fetched).toEqual([{ name: 'Bellows', role: 'gatherer' }]);
  });

  it('stands him up for free at the last checkpoint after a fall', () => {
    const s = intro();
    s.intro!.go('shovel');
    run(s, 0.2);
    s.hurt(s.controller, 9999);
    run(s, INTRO.down + 0.3);
    expect(s.downT).toBeLessThanOrEqual(0);
    expect(s.controller.hp / s.controller.maxHp).toBeCloseTo(INTRO.oil, 1);
    expect(Math.hypot(s.controller.x - px(L.k[1]).x, s.controller.y - px(L.k[1]).y)).toBeLessThan(T);
    expect(s.phase).toBe('mission');
    expect(s.stats.winched).toBe(0);
  });
});

describe('the kick cooldown by target', () => {
  it('waits longer after an elite, longer still after a mini-boss, longest after a boss', () => {
    expect(kickWait([])).toBe(0);
    expect(kickWait([{ boss: false, elite: false, kind: 'hornet' }])).toBe(0);
    expect(kickWait([{ boss: false, elite: true, kind: 'hornet' }])).toBe(KICK.after.elite);
    expect(kickWait([{ boss: true, elite: false, kind: 'foreman' }])).toBe(KICK.after.mini);
    expect(kickWait([{ boss: true, elite: false, kind: 'hornet' }])).toBe(KICK.after.boss);
    expect(kickWait([{ boss: false, elite: true, kind: 'hornet' }, { boss: true, elite: false, kind: 'hornet' }])).toBe(KICK.after.boss);
    expect(KICK.after.elite).toBeLessThan(KICK.after.mini);
    expect(KICK.after.mini).toBeLessThan(KICK.after.boss);
  });

  it('a kick on an elite sets the longer wait in play', () => {
    const s = new Sim(7, [], 'desert', [], undefined, undefined, { crew: [] });
    const c = s.controller;
    const plain = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'hornet');
    s.step(1 / 30, { ...NO_INPUT, kick: true, ax: plain.x, ay: plain.y });
    const base = s.kickCd;
    s.kickCd = 0;
    s.slay(plain);
    const elite = s.spawnHornet(c.x + 30, c.y, 0, true, false, 'hornet');
    s.step(1 / 30, { ...NO_INPUT, kick: true, ax: elite.x, ay: elite.y });
    expect(s.kickCd - base).toBeCloseTo(KICK.after.elite, 2);
  });
});
