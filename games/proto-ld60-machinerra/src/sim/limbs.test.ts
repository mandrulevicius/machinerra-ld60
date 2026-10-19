/** Elite limbs (P50): who grows them, the claw's half and reach, the whip's locked spot and line, the cadence, the socket rows and the telegraphs. */
import { describe, expect, it } from 'vitest';
import { BIOMES, FOES, LIMBLESS, LIMBS, SOCKETS, T, type Enemy } from './defs';
import { KITS } from './dungeon';
import { clawReach, limbKindOf, limbsStep, limbTeles, socketAt, whipReach } from './limbs';
import { telegraphs } from './botai';
import { addProp, propState } from './props';
import { NO_INPUT, Sim, type Bot, type Hornet } from './sim';
import type { Tele } from './brain';

/** The Communicator alone on a quiet desert, no hives, nothing else on the land to be hit. */
const alone = () => {
  const s = new Sim(5, [], 'desert');
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.god = false;
  s.props.list.length = 0;
  s.props.solid.fill(0);
  s.props.at.clear();
  return s;
};
/** A foe at (x, y) heading east (so its right half, +1, is south), its limbs stepped by hand (`limbsStep`), the sim not stepped. */
const foe = (s: Sim, o: { elite?: boolean; twisted?: boolean; menacing?: boolean; kind?: Enemy } = {}) => {
  const h = s.spawnHornet(s.controller.x - 400, s.controller.y, 0, o.elite ?? true, o.twisted ?? !o.menacing, o.kind ?? 'cat', o.menacing ? { menacing: true } : {});
  h.vx = 100;
  h.vy = 0;
  return h;
};
const tick = (s: Sim, h: Hornet, secs: number, each?: () => void) => {
  for (let i = 0; i < Math.round(secs * 30); i++) {
    limbsStep(s, h, 1 / 30);
    each?.();
  }
};
const strikes = (s: Sim) => s.events.filter((e): e is Extract<typeof e, { e: 'limb' }> => e.e === 'limb' && e.what === 'strike');
const place = (b: Bot, h: Hornet, dx: number, dy: number) => {
  b.x = h.x + dx;
  b.y = h.y + dy;
};

describe('who has limbs', () => {
  it('a twisted elite has two claws and a menacing elite two tentacles; no one else has any', () => {
    const s = alone();
    const twisted = foe(s), menacing = foe(s, { menacing: true });
    const day = foe(s, { twisted: false }), plain = foe(s, { elite: false }), boss = s.spawnBoss('gorilla', { x: s.controller.x - 300, y: s.controller.y });
    for (const h of [twisted, menacing, day, plain, boss]) limbsStep(s, h, 1 / 30);
    expect(twisted.limbs?.map((l) => l.kind)).toEqual(['claw', 'claw']);
    expect(menacing.limbs?.map((l) => l.kind)).toEqual(['whip', 'whip']);
    expect(day.limbs).toBeUndefined();
    expect(plain.limbs).toBeUndefined();
    expect(boss.limbs).toBeUndefined();
    expect(limbKindOf(twisted)).toBe('claw');
    expect(limbKindOf(menacing)).toBe('whip');
  });
  it('a kind without a socket row has none, a chain and the Crawlcam among them', () => {
    const s = alone();
    for (const kind of ['snake', 'spider', 'veinworm'] as Enemy[]) {
      const h = foe(s, { kind });
      limbsStep(s, h, 1 / 30);
      expect(h.limbs, kind).toBeUndefined();
    }
  });
});

describe('claws', () => {
  it('a claw strikes only what stands in its half, and nothing past its reach', () => {
    const s = alone();
    const h = foe(s);
    const c = s.controller;
    const R = clawReach(h);
    // South of a foe heading east is side +1: the right claw only.
    place(c, h, 10, R * 0.6);
    tick(s, h, LIMBS.claw.wind + LIMBS.claw.strike + 0.1);
    const south = strikes(s);
    expect(south.map((e) => e.side)).toEqual([1]);
    expect(south[0].hits).toBe(1);
    expect(c.hp).toBeLessThan(c.maxHp);
    // North is the other claw's: it winds up on its own and hits there.
    c.hp = c.maxHp;
    s.events.length = 0;
    place(c, h, 10, -R * 0.6);
    tick(s, h, LIMBS.claw.rest + LIMBS.claw.wind + LIMBS.claw.strike + 0.1);
    expect(strikes(s).map((e) => e.side)).toEqual([-1]);
    expect(c.hp).toBeLessThan(c.maxHp);
    // Past its reach nothing winds up and nothing is hurt.
    c.hp = c.maxHp;
    s.events.length = 0;
    place(c, h, 10, R + 40);
    tick(s, h, 6);
    expect(s.events.filter((e) => e.e === 'limb')).toHaveLength(0);
    expect(c.hp).toBe(c.maxHp);
  });
  it('a swing hurts a prop in its half and a robot there, and spares a foe', () => {
    const s = alone();
    const h = foe(s);
    const R = clawReach(h);
    const crate = addProp(s, { kind: 'crate', x: Math.floor(h.x / T), y: Math.floor(h.y / T) + 1, wear: 1 }, undefined, { x: h.x + 5, y: h.y + 14 });
    const other = foe(s, { elite: false, kind: 'swarmer' });
    other.x = h.x + 8;
    other.y = h.y + 12;
    const hp = other.hp;
    place(s.controller, h, 8, R * 0.5);
    tick(s, h, LIMBS.claw.wind + 0.1);
    expect(crate.hp).toBeLessThan(crate.maxHp);
    expect(propState(crate)).not.toBe('rubble');
    expect(other.hp).toBe(hp);
  });
  it('the two claws run apart: a target in front draws whichever is ready, never both at once', () => {
    const s = alone();
    const h = foe(s);
    place(s.controller, h, clawReach(h) * 0.5, 1);
    const winding: number[] = [];
    tick(s, h, 6, () => winding.push(h.limbs!.filter((l) => l.mode === 'wind').length));
    expect(Math.max(...winding)).toBe(1);
    expect(strikes(s).length).toBeGreaterThanOrEqual(2);
  });
});

describe('tentacles', () => {
  it('a lash lands on the spot locked as its wind-up began, even when the target has left', () => {
    const s = alone();
    const h = foe(s, { menacing: true });
    const c = s.controller;
    place(c, h, whipReach(h) * 0.7, 0);
    tick(s, h, 0.1);
    const l = h.limbs!.find((x) => x.mode === 'wind')!;
    expect(l).toBeTruthy();
    expect(l.tx).toBeCloseTo(c.x, 3);
    // It walks away during the wind-up: the lash still comes down where it stood.
    const [sx, sy] = [l.tx, l.ty];
    place(c, h, 0, whipReach(h) * 0.99);
    c.y += 300;
    tick(s, h, LIMBS.whip.wind + 0.1);
    expect([l.tx, l.ty]).toEqual([sx, sy]);
    expect(strikes(s)[0].hits).toBe(0);
    expect(c.hp).toBe(c.maxHp);
  });
  it('the lash hurts a robot and a prop on its line, and spares a foe there', () => {
    const s = alone();
    const h = foe(s, { menacing: true });
    const c = s.controller;
    place(c, h, whipReach(h) * 0.8, 0);
    const mid = socketAt(h, 1);
    const crate = addProp(s, { kind: 'crate', x: 0, y: 0, wear: 1 }, undefined, { x: (mid.x + c.x) / 2, y: (mid.y + c.y) / 2 });
    const other = foe(s, { elite: false, kind: 'swarmer' });
    other.x = (mid.x + c.x) / 2 - 10;
    other.y = (mid.y + c.y) / 2;
    const hp = other.hp;
    tick(s, h, LIMBS.whip.wind + 0.1);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(crate.hp).toBeLessThan(crate.maxHp);
    expect(other.hp).toBe(hp);
  });
  it('the two tentacles take turns: a lash lands about every half cooldown', () => {
    const s = alone();
    const h = foe(s, { menacing: true });
    place(s.controller, h, whipReach(h) * 0.5, 0);
    s.god = true;
    const at: { t: number; side: number }[] = [];
    let t = 0;
    tick(s, h, 8, () => {
      t += 1 / 30;
      for (const e of strikes(s)) at.push({ t, side: e.side });
      s.events.length = 0;
    });
    expect(at.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < at.length; i++) {
      expect(at[i].side).not.toBe(at[i - 1].side);
      expect(at[i].t - at[i - 1].t).toBeCloseTo(LIMBS.whip.cooldown / 2, 0);
    }
  });
});

describe('sockets', () => {
  it('every kind in every land\'s mix, and every dungeon foe, has a socket row or is named as limbless', () => {
    const kinds = new Set<Enemy>();
    for (const b of Object.values(BIOMES)) {
      b.foes.forEach(([k]) => kinds.add(k));
      Object.keys(b.mix ?? {}).forEach((k) => kinds.add(k as Enemy));
      if (b.edge) kinds.add(b.edge);
    }
    for (const k of Object.values(KITS)) k.foes.forEach((f) => kinds.add(f));
    for (const k of kinds) expect(!!SOCKETS[k] !== !!LIMBLESS[k], `${k}: a socket row xor a limbless line`).toBe(true);
    for (const k of [...Object.keys(SOCKETS), ...Object.keys(LIMBLESS)]) expect(k in FOES, `${k} is a foe`).toBe(true);
  });
});

describe('telegraphs', () => {
  it('a winding claw is a disc of its reach, a winding whip a lane and a disc at the spot', () => {
    const s = alone();
    const claw = foe(s), whip = foe(s, { menacing: true });
    whip.x += 700;
    place(s.controller, claw, 5, clawReach(claw) * 0.5);
    tick(s, claw, 0.1);
    let out: Tele[] = [];
    limbTeles(s, claw, out);
    expect(out.map((t) => t.kind)).toEqual(['disc']);
    expect((out[0] as { r: number }).r).toBeCloseTo(clawReach(claw));
    place(s.controller, whip, whipReach(whip) * 0.6, 0);
    tick(s, whip, 0.1);
    out = [];
    limbTeles(s, whip, out);
    expect(out.map((t) => t.kind).sort()).toEqual(['disc', 'lane']);
    expect(out.every((t) => (t.fixes ?? 0) === 0)).toBe(true);
  });
  it('a robot on the lane steps off it before the lash lands', () => {
    const s = new Sim(3);
    s.god = true;
    const c = s.controller;
    const g = s.bots.find((b) => b.name === 'Bellows')!;
    s.bots = [c, g];
    s.cfg.swarm = 0;
    s.props.list.length = 0;
    s.props.solid.fill(0);
    s.props.at.clear();
    g.x = c.x + 60;
    g.y = c.y + 10;
    const h = s.spawnHornet(g.x - 3 * T, g.y, 0, true, true, 'commuter', { menacing: true });
    h.target = g.id;
    let dodged = false, told = -1;
    for (let i = 0; i < 150 && !dodged; i++) {
      s.step(1 / 30, NO_INPUT);
      for (const e of s.events) {
        if (e.e === 'limb' && e.what === 'wind' && told < 0) told = s.time;
        if (e.e === 'ai' && e.bot === g && e.what === 'dodge' && h.limbs!.some((l) => l.mode === 'wind')) dodged = telegraphs(s).some((t) => t.id.startsWith('limb'));
      }
      s.events.length = 0;
    }
    expect(told).toBeGreaterThan(0);
    expect(dodged, 'a dodge while a limb winds up, read from its telegraph').toBe(true);
  });
});
