import { describe, expect, it } from 'vitest';
import { BOSSES, CATERPILLAR, T, bossNow } from './defs';
import { NO_INPUT, Sim, type Hornet, type SimEvent } from './sim';
import { spawnBoss } from './boss';
import { INTRO_LAND, introLetters } from './intro';
import { loadLand } from './lands';

/** The Communicator alone, by day, in the desert. */
const alone = (seed = 3) => {
  const s = new Sim(seed);
  s.bots = [s.controller];
  s.setClock('day');
  return s;
};
/** The tusked caterpillar `tiles` east of the Communicator, ready to wind up. */
const mother = (s: Sim, tiles = 4) => {
  const c = s.controller;
  const h = spawnBoss(s, 'caterpillar', { x: c.x + tiles * T, y: c.y - 30 });
  h.grub!.coolT = 0;
  return h;
};
const step = (s: Sim, ev: SimEvent[] = []) => {
  s.step(1 / 30, NO_INPUT);
  ev.push(...s.events);
  s.events.length = 0;
  return ev;
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const toHim = (s: Sim, h: Hornet) => Math.atan2(s.controller.y - h.y, s.controller.x - h.x);

describe('the tusked caterpillar', () => {
  it('spirals, lifts its head, rears with the jaw opening, lunges, rests, in that order', () => {
    const s = alone();
    const h = mother(s);
    const seen: string[] = [];
    const c = s.controller;
    let hpAtLunge = -1;
    for (let i = 0; i < 30 * 8 && !(seen.includes('rest') && h.grub!.mode === 'crawl'); i++) {
      const was = h.grub!.mode;
      step(s);
      const now = h.grub!.mode;
      if (now !== was) {
        seen.push(now);
        if (now === 'lift') {
          // The spiral: at least its turns, and the head points at him as it ends.
          expect(h.grub!.wound).toBeGreaterThanOrEqual(CATERPILLAR.spiral.turns * Math.PI * 2);
          expect(Math.abs(wrap(h.grub!.ang - toHim(s, h)))).toBeLessThan(0.4);
        }
        if (now === 'lunge') hpAtLunge = c.hp;
      }
      if (hpAtLunge < 0) expect(c.hp).toBe(c.maxHp); // nothing hurts before the lunge
    }
    expect(seen).toEqual(['spiral', 'lift', 'rear', 'lunge', 'rest', 'crawl']);
    expect(c.hp).toBeLessThan(hpAtLunge); // he stood on the line
  });

  it('the rear is the slow, readable part: the jaw opens over it', () => {
    const s = alone();
    const h = mother(s);
    let rearT = 0, jawAtLunge = 0;
    for (let i = 0; i < 30 * 8 && h.grub!.mode !== 'lunge'; i++) {
      step(s);
      if (h.grub!.mode === 'rear') rearT += 1 / 30;
    }
    jawAtLunge = h.grub!.jaw;
    expect(rearT).toBeGreaterThanOrEqual(BOSSES.caterpillar!.charge.tell * 0.9);
    expect(rearT).toBeGreaterThan(CATERPILLAR.lift);
    expect(jawAtLunge).toBe(1);
  });

  it('lunges toward where he stood when the jaw began to open, so stepping aside dodges it', () => {
    const s = alone();
    const h = mother(s);
    const c = s.controller;
    for (let i = 0; i < 30 * 8 && h.grub!.mode !== 'rear'; i++) step(s);
    expect(h.grub!.mode).toBe('rear');
    const lock = Math.atan2(c.y - h.y, c.x - h.x);
    // He steps well aside while it rears.
    c.y += 3 * T;
    c.hold = { x: c.x, y: c.y };
    const hp = c.hp;
    const from = { x: h.x, y: h.y };
    for (let i = 0; i < 30 * 3 && h.grub!.mode !== 'rest'; i++) step(s);
    const went = Math.atan2(h.y - from.y, h.x - from.x);
    expect(Math.abs(wrap(went - lock))).toBeLessThan(0.05);
    expect(c.hp).toBe(hp);
  });
});

describe('the tusked elite', () => {
  it('an elite caterpillar is tusked: the same attack in the same order, with a shorter tell than the boss', () => {
    const s = alone();
    const c = s.controller;
    const h = s.spawnHornet(c.x + 3 * T, c.y, 0, true, false, 'caterpillar');
    expect(h.grub).toBeTruthy();
    h.grub!.coolT = 0;
    const seen: string[] = [];
    let rearT = 0;
    for (let i = 0; i < 30 * 8 && !(seen.includes('rest') && h.grub!.mode === 'crawl'); i++) {
      const was = h.grub!.mode;
      step(s);
      if (h.grub!.mode === 'rear') rearT += 1 / 30;
      if (h.grub!.mode !== was) seen.push(h.grub!.mode);
    }
    expect(seen).toEqual(['spiral', 'lift', 'rear', 'lunge', 'rest', 'crawl']);
    expect(CATERPILLAR.elite.charge.tell).toBeLessThan(BOSSES.caterpillar!.charge.tell);
    expect(rearT).toBeGreaterThanOrEqual(CATERPILLAR.elite.charge.tell * 0.9);
  });
});

describe('the baby caterpillar', () => {
  it('crawls in and bites, with no attack of its own', () => {
    const s = alone();
    const c = s.controller;
    const h = s.spawnHornet(c.x + 3 * T, c.y, 0, false, false, 'caterpillar');
    expect(h.grub).toBeUndefined();
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30 * 5; i++) step(s, ev);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(ev.some((e) => e.e === 'sting' && e.h === h)).toBe(true);
  });
});

describe('in the intro', () => {
  it('babies wait in the scrap room and the tap room beside the Crawlcams, leashed to their spots', () => {
    const s = new Sim(INTRO_LAND, [], 'desert', [], undefined, undefined, { land: loadLand(INTRO_LAND), crew: [] });
    const babies = s.hornets.filter((h) => h.kind === 'caterpillar' && !h.dead);
    expect(babies.length).toBe(introLetters().b.length);
    expect(babies.every((h) => !h.grub && h.leash)).toBe(true);
  });
});

describe('the intro boss fight', () => {
  it('a player who steps out of the line while it rears and swings while it rests beats it; its fall opens the lift', () => {
    const s = new Sim(INTRO_LAND, [], 'desert', [], undefined, undefined, { land: loadLand(INTRO_LAND), crew: [] });
    s.intro!.go('boss');
    const c = s.controller;
    let boss: Hornet | null = null;
    let lunges = 0, hitByLunge = 0, swings = 0;
    for (let i = 0; i < 30 * 240 && !(boss && boss.dead); i++) {
      boss = s.intro!.boss;
      const input = { ...NO_INPUT };
      if (boss && !boss.dead) {
        const g = boss.grub!;
        const dx = boss.x - c.x, dy = boss.y - c.y, d = Math.hypot(dx, dy) || 1;
        input.ax = boss.x;
        input.ay = boss.y;
        if (g.mode === 'lift' || g.mode === 'rear') {
          // Out of the line: across it, away from the lane.
          const lx = g.tx - g.sx, ly = g.ty - g.sy, ll = Math.hypot(lx, ly) || 1;
          const side = (c.x - g.sx) * (-ly / ll) + (c.y - g.sy) * (lx / ll) >= 0 ? 1 : -1;
          input.mx = (-ly / ll) * side;
          input.my = (lx / ll) * side;
        } else if (d > 40) {
          input.mx = dx / d;
          input.my = dy / d;
        } else {
          input.fire = i % 2 === 0;
          swings++;
        }
        if (g.mode === 'lunge' && g.t > bossNow('caterpillar').charge.time - 1 / 30) lunges++;
      }
      const hp = c.hp;
      s.lessons.press(); // the boss's warning pause (the intro's one)
      s.step(1 / 30, input);
      s.events.length = 0;
      if (boss?.grub?.mode === 'lunge' && c.hp < hp) hitByLunge++;
    }
    expect(boss?.dead).toBe(true);
    expect(lunges).toBeGreaterThan(0);
    expect(hitByLunge).toBe(0);
    step(s);
    expect(s.intro!.gate.every((p) => p.broken)).toBe(true);
    expect(swings).toBeGreaterThan(0);
  });
});
