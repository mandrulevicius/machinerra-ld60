import { describe, expect, it } from 'vitest';
import { cardOf, cardSources, freshResearch, offerFor, sourceOf, CARDS, noCtx, type CardSources } from '../hub/research';
import { REVIVE, WEAPONS } from './defs';
import { Effects } from './effects';
import { rng } from '../../../../harness/kit/rng';
import { ITEMS, NIGHT_BASES, SKILL_EFFECTS, addItem, equip, freshGear, gearCans, gearSources, itemIds, type Gear, type ItemId } from './gear';
import { chirped, remoteTarget } from './junkplay';
import { RELICS } from './junk';
import { carrySpeed, fixed } from './downed';
import { addArea, areasOf, cast } from './botskills';
import { hurt } from './combat';
import { NO_INPUT, Sim } from './sim';
import type { CrewBot } from './types';
import { PARTS } from './defs';

/** A gear with these items worn on the Communicator (and what each is: `uid` by id). */
const wearing = (...ids: ItemId[]): Gear => {
  let g = freshGear();
  for (const id of ids) {
    g = addItem(g, id).gear;
    const uid = g.items[g.items.length - 1].uid;
    g = equip(g, uid, 'comm', ITEMS[id].comm!);
  }
  return g;
};
const cards = (comm: string[] = [], roles: Record<string, string[]> = {}, party: string[] = []): CardSources => ({
  comm: comm.map((id) => sourceOf(cardOf(id)!)),
  roles: Object.fromEntries(Object.entries(roles).map(([r, ids]) => [r, ids.map((id) => sourceOf(cardOf(id)!))])),
  party: party.map((id) => sourceOf(cardOf(id)!)),
});
const bot = (role: CrewBot['role'], name = role as string): CrewBot => ({ role, name, uid: name });
const sim = (o: { gear?: Gear; cards?: CardSources; crew?: CrewBot[] } = {}) => {
  const s = new Sim(3, [], 'desert', [], undefined, o.gear, { crew: o.crew ?? [], ...(o.cards && { cards: o.cards }) });
  s.god = true;
  return s;
};
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    s.events.length = 0;
  }
};

describe('night recipes (P23)', () => {
  it('each is its base plus one twisted part and a Dark rider, in the same slot', () => {
    for (const b of NIGHT_BASES) {
      const base = ITEMS[b], night = ITEMS[`${b}Night` as ItemId];
      expect(night.weapon, b).toBe(base.weapon);
      expect(night.comm, b).toBe(base.comm);
      expect(night.bot, b).toBe(base.bot);
      expect(night.recipe.scrap, b).toBe(base.recipe.scrap);
      const extra = Object.keys(night.recipe.parts ?? {}).filter((k) => !(k in (base.recipe.parts ?? {})));
      expect(extra.length, b).toBe(1);
      expect(PARTS[extra[0] as keyof typeof PARTS].twisted, b).toBe(true);
      expect(JSON.stringify(night.effects), b).toContain('dread');
    }
    expect(itemIds.filter((i) => i.endsWith('Night')).length).toBe(NIGHT_BASES.length);
  });
  it('a night weapon is the weapon of its base, and its rider rides on its own hits only', () => {
    const g = addItem(freshGear(), 'pipeWrenchNight').gear;
    const src = gearSources(equip(g, g.items[1].uid, 'comm', 'primary')).comm.find((s) => s.id === 'pipeWrenchNight')!;
    expect(src.effects.some((e) => 'when' in e && e.when === 'hit' && JSON.stringify(e.if).includes('pipeWrench'))).toBe(true);
    expect(WEAPONS[ITEMS.pipeWrenchNight.weapon!]).toBe(WEAPONS.pipeWrench);
  });
});

describe('body parts (P23)', () => {
  it('the Can Rack adds a can to the cap; Third Hand doubles his work rate; the Bot Harness carries a load at full speed', () => {
    const plain = sim();
    const racked = sim({ gear: wearing('canRack') });
    expect(gearCans(wearing('canRack'))).toBe(1);
    expect(racked.canCap).toBe(plain.canCap + REVIVE.cost); // one can
    const s = sim({ gear: wearing('thirdHand', 'botHarness') });
    expect(s.engine.stat(s.controller, 'siphonRate', 1)).toBe(2);
    expect(carrySpeed(s, s.controller, 1)).toBe(1);
    expect(carrySpeed(s, s.controller, 5)).toBe(1);
    expect(carrySpeed(plain, plain.controller, 5)).toBeLessThan(1);
  });
  it('the Radar scope pins every signal to its spot, and gives the areas back when it comes off', () => {
    const s = sim();
    const rough = s.signals.map((x) => x.r);
    expect(Math.max(...rough)).toBeGreaterThan(1);
    s.setGear(wearing('radarScope'));
    expect(s.signals.every((x) => x.r === 1 && x.x === x.at.x && x.y === x.at.y)).toBe(true);
    s.setGear(freshGear());
    expect(s.signals.map((x) => x.r)).toEqual(rough);
  });
  it('the Furnace core scalds what stands near him while his steam is full, and not once it is spent', () => {
    const s = sim({ gear: wearing('furnaceCore') });
    const c = s.controller;
    const h = s.spawnHornet(c.x + 40, c.y, 0, false, false, 'hornet');
    h.cd = 9999;
    h.hp = h.maxHp = 1e6;
    c.steam = c.maxSteam;
    run(s, 2.5);
    expect(s.engine.stacks(h, 'scalded')).toBeGreaterThan(0);
    s.engine.strip(h, 'scalded');
    c.steam = 0;
    s.controller.steam = 0;
    s.cfg.steamRegen = 0;
    run(s, 2.5);
    expect(s.engine.stacks(h, 'scalded')).toBe(0);
  });
  it('Lantern eyes give him a lamp that lights the crew and puts the twisted halos out', () => {
    const s = sim({ gear: wearing('lanternEyes'), crew: [bot('guard')] });
    const g = s.bots.find((b) => b.role === 'guard')!;
    g.x = s.controller.x + 60;
    g.y = s.controller.y;
    const h = s.spawnHornet(s.controller.x + 90, s.controller.y, 0, false, true, 'hornet');
    h.cd = 9999;
    run(s, 1);
    expect(s.engine.stacks(g, 'lit')).toBeGreaterThan(0);
    expect(h.dimT ?? 0).toBeGreaterThan(s.time - 0.1);
  });
  it('the Smoke stack\'s dash leaves smoke that Blinds', () => {
    expect(JSON.stringify(SKILL_EFFECTS.smokeDash)).toContain('blinded');
    expect(ITEMS.smokeStack.skill).toBe('smokeDash');
  });
  it('the Grapple reels a small foe in, not an elite or a boss', () => {
    const s = sim({ gear: wearing('grapple') });
    const c = s.controller;
    const small = s.spawnHornet(c.x + 200, c.y, 0, false, false, 'hornet');
    small.cd = 9999;
    const elite = s.spawnHornet(c.x + 200, c.y + 80, 0, true, false, 'hornet');
    elite.cd = 9999;
    s.engine.strike(c, small, { type: 'pierce', amount: 1, via: 'gun' });
    s.engine.strike(c, elite, { type: 'pierce', amount: 1, via: 'gun' });
    s.drainFx();
    expect(small.vx).toBeLessThan(-100);
    expect(elite.vx).toBe(0);
  });
});

describe('gear that gives a positive status (P23)', () => {
  it('Stoker\'s gloves stoke on a kill, Leyden spurs charge on a dash, the pressure vest steams at full steam', () => {
    const fx = new Effects(rng('p23'));
    const u = fx.add({ x: 0, y: 0, hp: 100, maxHp: 100 }, { team: 'crew' });
    const foe = fx.add({ x: 10, y: 0, hp: 1, maxHp: 1 }, { team: 'foe' });
    for (const src of gearSources(wearing('stokerGloves', 'leydenSpurs', 'pressureVest')).comm) fx.addSource(u, src);
    fx.strike(u, foe, { type: 'impact', amount: 50 });
    expect(fx.stacks(u, 'stoked')).toBe(1);
    fx.emit({ kind: 'dash', self: u });
    expect(fx.stacks(u, 'charged')).toBe(1);
    fx.tag(u, 'steamFull');
    fx.tick(1.1);
    expect(fx.stacks(u, 'steaming')).toBe(1);
  });
});

describe('punch cards (P23)', () => {
  it('a card that waits is never offered; the rest of the table is in', () => {
    const waiting = CARDS.filter((c) => c.waits).map((c) => c.id);
    expect(waiting.sort()).toEqual([]);
    const ctx = { types: ['gatherer', 'guard', 'repairer', 'boilermancer', 'lamplighter', 'stalker', 'marksman'] as never[], dog: false };
    for (let i = 0; i < 40; i++) for (const id of offerFor({ ...freshResearch(), owned: ['twinNozzle', 'wideSwing', 'bootPolish', 'deepDraw'] }, ctx, `s${i}`)) expect(waiting).not.toContain(id);
    for (const id of ['pressureCooker', 'staticAntenna', 'lanternFaith', 'pressureRelease', 'shieldBrothers', 'fieldTinker', 'overTheRocks', 'bowlingSeason', 'wetSeason', 'pressureChoir', 'mothLight', 'backstabGears', 'secondShadow', 'lastGasp', 'kineticFaith', 'deadMansLamp', 'liveWire']) expect(cardOf(id), id).toBeTruthy();
    expect(offerFor(freshResearch(), noCtx, 'x').length).toBe(3);
  });
  it('Live Wire doubles the positive statuses a unit gives, downsides and all', () => {
    const fx = new Effects(rng('lw'));
    const a = fx.add({ x: 0, y: 0, hp: 100, maxHp: 100 }, { team: 'crew' });
    const b = fx.add({ x: 0, y: 0, hp: 100, maxHp: 100 }, { team: 'crew' });
    fx.apply(b, 'stoked', { by: a });
    const plain = fx.status(b, 'stoked')!.left;
    fx.addSource(a, sourceOf(cardOf('liveWire')!));
    fx.strip(b, 'stoked');
    fx.apply(b, 'stoked', { by: a });
    expect(fx.status(b, 'stoked')!.left).toBeCloseTo(plain * 2);
    fx.apply(b, 'burning', { by: a });
    expect(fx.status(b, 'burning')!.left).toBeLessThan(plain); // a debuff is not a positive
  });
  it('Shield Brothers: guards close together split a blow evenly; far apart they do not', () => {
    const s = sim({ crew: [bot('guard', 'A'), bot('guard', 'B')], cards: cards([], { guard: ['shieldBrothers'] }) });
    const [a, b] = s.bots.filter((x) => x.role === 'guard');
    a.x = 400; a.y = 400; b.x = 460; b.y = 400;
    s.god = false;
    a.hp = b.hp = a.maxHp = b.maxHp = 100;
    hurt(s, a, 20, false, { type: 'impact' });
    expect(a.hp).toBeCloseTo(b.hp, 3);
    expect(a.hp).toBeGreaterThan(80);
    b.x = 900;
    a.hp = b.hp = 100;
    hurt(s, a, 20, false, { type: 'impact' });
    expect(b.hp).toBe(100);
  });
  it('Pressure Choir shields the crew round a blessing boilermancer', () => {
    const s = sim({ crew: [bot('boilermancer', 'Bo'), bot('guard', 'G')], cards: cards([], { boilermancer: ['pressureChoir'] }) });
    const bo = s.bots.find((x) => x.role === 'boilermancer')!, g = s.bots.find((x) => x.role === 'guard')!;
    g.x = bo.x + 40;
    g.y = bo.y;
    const before = s.engine.shield(g);
    expect(cast(s, bo, 'blessing', g)).toBe(true);
    expect(before).toBe(0);
    expect(s.engine.shield(g)).toBe(10);
    expect(s.engine.shield(bo)).toBe(10);
  });
  it('Over the Rocks: a marksman\'s shot at a Marked foe flies over rock; at an unmarked one it does not', async () => {
    const s = sim({ crew: [bot('marksman', 'M')], cards: cards([], { marksman: ['overTheRocks'] }) });
    const m = s.bots.find((x) => x.role === 'marksman')!;
    const h = s.spawnHornet(m.x + 200, m.y, 0, false, false, 'hornet');
    const { shoot } = await import('./combat');
    expect(shoot(s, m, h.x, h.y, { dmg: 1, speed: 500, range: 300 }).over).toBeFalsy();
    s.engine.apply(h, 'marked');
    expect(shoot(s, m, h.x, h.y, { dmg: 1, speed: 500, range: 300 }).over).toBe(true);
  });
  it('Last Gasp releases a nova when a spare can is spent; Static Antenna listens to the Oracle', () => {
    const s = sim({ cards: cards([], {}, ['lastGasp']) });
    const c = s.controller;
    const h = s.spawnHornet(c.x + 60, c.y, 0, false, false, 'hornet');
    h.cd = 9999;
    h.hp = h.maxHp = 1e6;
    const hp = h.hp;
    s.engine.emit({ kind: 'cast', self: c, via: 'spareOil' });
    s.drainFx();
    expect(h.hp).toBeLessThan(hp);
    const t = sim({ cards: cards(['staticAntenna']) });
    const f = t.spawnHornet(t.controller.x + 100, t.controller.y, 0, false, false, 'hornet');
    f.cd = 9999;
    f.hp = f.maxHp = 1e6;
    run(t, 2); // nothing said yet beyond the greeting at t > 1: it speaks for a few seconds
    expect(t.speakUntil).toBeGreaterThan(0);
    expect(f.hp).toBeLessThan(1e6);
  });
});

describe('relics J9-J12 (P23)', () => {
  it('they are on the list with their sockets, and the power bank is a Shock chain at eight charges', () => {
    expect(['smokedetector', 'remote', 'powerbank', 'quadcopter'].map((r) => RELICS[r as 'remote'].no)).toEqual(['J9', 'J10', 'J11', 'J12']);
    const fx = new Effects(rng('pb'));
    const w = fx.add({ x: 0, y: 0, hp: 100, maxHp: 100 }, { team: 'crew' });
    const foes = [10, 40, 70, 100].map((x) => fx.add({ x, y: 0, hp: 1000, maxHp: 1000 }, { team: 'foe' }));
    fx.addSource(w, RELICS.powerbank.source());
    for (let i = 0; i < 8; i++) fx.apply(w, 'charge');
    expect(fx.stat(w, 'arcs', 0)).toBe(1);
    fx.strike(w, foes[0], { type: 'impact', amount: 1, via: 'melee' });
    expect(foes[1].hp).toBeLessThan(1000);
    expect(foes[3].hp).toBeLessThan(1000);
    expect(fx.stacks(w, 'charge')).toBe(0);
  });
  it('a smoke detector\'s crew sidestep at once; a TV remote\'s wearer fires where he aims; a quadcopter is shot down once', () => {
    const s = sim({ crew: [{ ...bot('guard', 'G'), relic: 'smokedetector' }, { ...bot('marksman', 'M'), relic: 'remote' }, { ...bot('gatherer', 'Q'), relic: 'quadcopter' }] });
    const g = s.bots.find((b) => b.role === 'guard')!, m = s.bots.find((b) => b.role === 'marksman')!, q = s.bots.find((b) => b.role === 'gatherer')!;
    g.x = 300; g.y = 300; m.x = 320; m.y = 300; m.crew = 0; delete m.own;
    expect(chirped(s, m)).toBe(true);
    m.x = 2000;
    expect(chirped(s, m)).toBe(false);
    const h = s.spawnHornet(500, 300, 0, false, false, 'hornet');
    s.look.x = 505;
    s.look.y = 305;
    expect(remoteTarget(s, m)).toBe(h);
    s.look.x = 900;
    expect(remoteTarget(s, m)).toBeNull();
    s.god = false;
    const x0 = q.x + 100;
    s.drop(x0, q.y, 'scrap');
    const loot = s.loot[s.loot.length - 1];
    q.hold = { x: q.x, y: q.y };
    run(s, 0.2);
    expect(loot.x).toBeLessThan(x0); // pulled in
    hurt(s, q, 1, false, { type: 'pierce', via: 'gun' });
    run(s, 0.1);
    expect(s.junkw.wearers.get(q)!.shotDown).toBe(true); // gone for the mission
  });
});

describe('the cards whose rule is in the sim (P23)', () => {
  it('Field Tinker clears the fixed robot; the Dead Man lamp shadows the crew round a downed one', () => {
    const s = sim({ crew: [bot('repairer', 'R'), bot('guard', 'A'), bot('guard', 'B')], cards: { ...cards([], { repairer: ['fieldTinker'] }, ['deadMansLamp']) } });
    const [a, b] = s.bots.filter((x) => x.role === 'guard');
    a.x = 400; a.y = 400; b.x = 440; b.y = 400; a.crew = b.crew = 1;
    s.engine.apply(a, 'burning', { duration: 30 });
    hurt(s, a, 9999, false, { type: 'impact' });
    expect(a.downed).toBeTruthy();
    run(s, 0.5);
    expect(s.engine.stacks(b, 'shadowed')).toBeGreaterThan(0);
    s.engine.apply(a, 'burning', { duration: 30 });
    fixed(s, a);
    expect(s.engine.stacks(a, 'burning')).toBe(0);
  });
  it('Lantern Faith marks the twisted in his light; Moth Light taunts those stepping into a lamplighter lamp', () => {
    const s = sim({ gear: wearing('lanternEyes'), crew: [bot('lamplighter', 'L')], cards: cards(['lanternFaith'], { lamplighter: ['mothLight'] }) });
    const c = s.controller, l = s.bots.find((x) => x.role === 'lamplighter')!;
    const h = s.spawnHornet(c.x + 80, c.y, 0, false, true, 'hornet');
    h.cd = 9999;
    const far = s.spawnHornet(c.x + 900, c.y, 0, false, true, 'hornet');
    far.cd = 9999;
    l.x = c.x + 60; l.y = c.y;
    run(s, 0.5);
    expect(s.engine.flag(h, 'marked')).toBe(true);
    expect(s.engine.flag(far, 'marked')).toBe(false);
    expect(s.engine.stacks(h, 'taunted')).toBeGreaterThan(0);
  });
  it('Wet Season leaves a puddle where a cloud fades', () => {
    const s = sim({ crew: [bot('boilermancer', 'Bo')], cards: cards([], { boilermancer: ['wetSeason'] }) });
    const bo = s.bots.find((x) => x.role === 'boilermancer')!;
    addArea(s, { what: 'cloud', x: bo.x + 100, y: bo.y, radius: 60, ttl: 0.2, owner: bo });
    run(s, 0.5);
    const a = areasOf(s);
    expect(a.length).toBe(1);
    expect(a[0].puddle).toBe(true);
  });
});

describe('Oil-Slick Soles (P23)', () => {
  const east = { ...NO_INPUT, mx: 1 };
  const setup = () => {
    const s = sim({ crew: [bot('gatherer')], cards: cards(['oilSlickSoles']) });
    s.hornets = [];
    const c = s.controller;
    const mate = s.bots.find((b) => b !== c)!;
    return { s, c, mate };
  };
  const walk = (s: Sim, sec: number) => {
    for (let i = 0; i < Math.round(sec * 30); i++) {
      s.step(1 / 30, east);
      s.events.length = 0;
    }
  };
  const slicks = (s: Sim) => s.props.zones.filter((z) => z.kind === 'slick');

  it('walking lays a trail of slicks one radius apart, none while standing still', () => {
    const { s } = setup();
    run(s, 1);
    expect(s.props.zones).toHaveLength(0);
    walk(s, 2);
    const z = slicks(s);
    expect(z.length).toBeGreaterThan(5);
    expect(z.length).toBeLessThan(40);
    for (const a of z) for (const b of z) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r);
    const n = z.length;
    run(s, 1);
    expect(slicks(s).length).toBe(n);
  });
  it('a slick Slows foes in it, not him or his crew; walking never lights its own trail', () => {
    const { s, c, mate } = setup();
    walk(s, 1);
    const z = slicks(s)[0];
    const foe = s.spawnHornet(z.x, z.y, 0, false, false, 'hornet');
    foe.cd = 9999;
    mate.x = z.x; mate.y = z.y;
    c.x = z.x; c.y = z.y;
    run(s, 1);
    expect(s.engine.status(foe, 'slowed')).toBeTruthy();
    expect(s.engine.status(c, 'slowed')).toBeFalsy();
    expect(s.engine.status(mate, 'slowed')).toBeFalsy();
    walk(s, 3);
    expect(s.props.zones.some((f) => f.kind === 'fire')).toBe(false);
  });
  it('fire lights a soles slick', () => {
    const { s } = setup();
    walk(s, 1);
    const z = slicks(s)[0];
    const foe = s.spawnHornet(z.x, z.y, 0, false, false, 'hornet');
    foe.cd = 9999;
    s.engine.apply(foe, 'burning', { duration: 3 });
    run(s, 0.6);
    expect(z.kind).toBe('fire');
  });
  it('lays none beside a fire, so walking away from a burning trail does not light the ground under him', () => {
    const { s, c } = setup();
    walk(s, 1);
    const z = slicks(s)[0];
    const foe = s.spawnHornet(z.x, z.y, 0, false, false, 'hornet');
    foe.cd = 9999;
    s.engine.apply(foe, 'burning', { duration: 3 });
    run(s, 0.6);
    const near = (u: { x: number; y: number }) => s.props.zones.some((f) => f.kind === 'fire' && Math.hypot(f.x - u.x, f.y - u.y) < f.r + 40);
    const n = slicks(s).length;
    c.x = z.x;
    c.y = z.y;
    walk(s, 0.2);
    expect(near(c)).toBe(true);
    expect(slicks(s).length).toBe(n);
  });
});
