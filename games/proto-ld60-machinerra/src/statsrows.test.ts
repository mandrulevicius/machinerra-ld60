import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim } from './sim/sim';
import type { Source } from './sim/effects';
import { addItem, equip, freshGear, type Gear } from './sim/gear';
import { fitted, partOf, statRows, typeRows, type Row, type Subject } from './statsrows';
import { offlineSubjects, subjectOf, type Build } from './statsunit';

const wear = (g: Gear, id: Parameters<typeof addItem>[1], q: Parameters<typeof addItem>[2], slot: Parameters<typeof equip>[3]) => {
  const r = addItem(g, id, q);
  return equip(r.gear, r.item.uid, 'comm', slot);
};
const build = (o: Partial<Build> = {}): Build => ({ gear: freshGear(), earned: [], chassis: {}, robots: [], ...o });
const row = (rows: Row[], stat: string, label?: string) => rows.find((r) => r.stat === stat && (!label || r.label === label));
/** The engine's own formula, from a row's parts. */
const rebuilt = (r: Row) => Math.max(0, (r.base + r.parts.reduce((n, p) => n + p.add, 0)) * (1 + r.parts.reduce((n, p) => n + p.pct, 0)) * r.parts.reduce((n, p) => n * p.more, 1));
const CARD: Source = { id: 'card:quickstep', kind: 'research', name: 'Quickstep', effects: [{ when: 'always', do: { do: 'stat', stat: 'speed', pct: 0.08 } }] };

describe('the stats rows (P27)', () => {
  it('a gear piece, a title and a punch card on speed are all listed, and the parts sum to the final value', () => {
    const gear = wear(freshGear(), 'brassShins', 'rare', 'legs');
    const [comm] = offlineSubjects(build({ gear, earned: ['farWalker'] }));
    comm.fx.addSource(comm.unit, CARD);
    const speed = row(statRows(comm), 'speed')!;
    expect(speed.parts.map((p) => [p.group, p.name])).toEqual([['gear', 'Brass shins'], ['research', 'Quickstep'], ['title', 'Far Walker']]);
    // Rare scales the piece's +10%: its quality shows beside its name, the number is what it gives.
    const shins = speed.parts[0];
    expect(shins.quality).toBe('rare');
    expect(shins.text).toBe('+13%');
    expect(speed.parts.map((p) => p.text)).toEqual(['+13%', '+8%', '+10%']);
    expect(speed.base).toBe(1);
    expect(speed.value).toBeCloseTo(1.31);
    expect(rebuilt(speed)).toBeCloseTo(speed.value);
    expect(speed.value).toBeCloseTo(comm.fx.stat(comm.unit, 'speed', 1));
  });

  it('every row sums to the engine value, whatever touches it', () => {
    const gear = wear(wear(freshGear(), 'brassShins', 'fine', 'legs'), 'boilerCorset', 'epic', 'core');
    const subs = offlineSubjects(build({ gear, earned: ['queenBreaker', 'shepherdOfBrass', 'patchworkSaint', 'theBoot'], chassis: { tank: 2, pistons: 1 }, robots: [{ uid: 'r1', name: 'Rivet', role: 'guard', rank: 2, spec: 'bulwark', relic: 'toaster' }] }));
    for (const s of subs)
      for (const r of statRows(s)) {
        if (r.shape === 'taken') continue;
        expect(rebuilt(r), `${s.label} ${r.label}`).toBeCloseTo(r.value);
      }
  });

  it('armour has diminishing returns in the damage-taken row, and a vulnerability adds', () => {
    const s = offlineSubjects(build())[0];
    s.fx.addSource(s.unit, { id: 'dev:armour', kind: 'gear', name: 'Plates', quality: 'standard', effects: [{ when: 'always', do: { do: 'stat', stat: 'damageTaken', pct: -1 } }] });
    const taken = row(statRows(s), 'damageTaken')!;
    expect(taken.note).toBe('armour 100%');
    expect(taken.value).toBeCloseTo(0.5);
    // What a hit actually does agrees with the row.
    expect(s.fx.preview(undefined, s.unit, 'impact', 100)).toBeCloseTo(100 * taken.value, 0);
  });

  it('melee and ranged damage show as their own rows only when they differ from plain damage; a weapon shows its quality', () => {
    const gear = wear(freshGear(), 'steamGun', 'epic', 'secondary');
    const [comm] = offlineSubjects(build({ gear }));
    const rows = statRows(comm);
    expect(row(rows, 'damage', 'Damage')).toBeUndefined();
    const gun = row(rows, 'damage', 'Damage, with Steam gun')!;
    expect(gun.parts.map((p) => [p.name, p.quality, p.text])).toEqual([['Steam gun', 'epic', 'x1.5']]);
    expect(row(rows, 'damage', 'Damage, melee')).toBeUndefined();
  });

  it('a type pick has no spec; a robot pick adds its rank, spec and relic on top', () => {
    const subs = offlineSubjects(build({ robots: [{ uid: 'r1', name: 'Rivet', role: 'guard', rank: 2, spec: 'bulwark', relic: 'toaster' }] }));
    const type = subs.find((s) => s.key === 'type:guard')!;
    const bot = subs.find((s) => s.key === 'bot:r1')!;
    const groups = (s: Subject) => fitted(s).map((f) => f.group);
    expect(groups(type)).toEqual(['type']);
    expect(groups(bot)).toEqual(['relic', 'spec', 'type', 'other']);
    expect(fitted(bot).find((f) => f.group === 'relic')!.where).toBe('Relic socket');
    expect(row(statRows(bot), 'maxHp')!.parts.map((p) => p.name)).toEqual(['Rank 2']);
    expect(row(statRows(type), 'maxHp')).toBeUndefined();
  });

  it('where a worn piece lives: its slot; a piece the Communicator wears for every robot says so', () => {
    const gear = wear(freshGear(), 'brassShins', 'standard', 'legs');
    const [comm] = offlineSubjects(build({ gear }));
    expect(fitted(comm).find((f) => f.key === 'brassShins')!.where).toBe('Legs slot');
  });

  it('each damage type has its status chance, and what touches it', () => {
    const [comm] = offlineSubjects(build());
    comm.fx.addSource(comm.unit, { id: 'dev:riders', kind: 'relic', name: 'Lighter', effects: [{ when: 'always', do: { do: 'stat', stat: 'rider:fire', add: 0.25 } }] });
    const rows = typeRows(comm);
    expect(rows.map((r) => r.type)).toHaveLength(8);
    const fire = rows.find((r) => r.type === 'fire')!;
    expect(fire.status).toBe('Burning');
    expect(fire.chance).toBeCloseTo(0.45);
    expect(fire.chanceBig).toBeCloseTo(0.65);
    expect(fire.touches.map((t) => [t.what, t.part.name])).toEqual([['Status chance', 'Lighter']]);
    expect(rows.find((r) => r.type === 'cold')!.chance).toBeCloseTo(0.2);
    expect(rows.find((r) => r.type === 'cold')!.touches).toEqual([]);
  });

  it('in a mission a Hasted robot shows Haste with its seconds left', () => {
    const sim = new Sim(3);
    const bot = sim.bots.find((b) => b.role === 'guard')!;
    sim.engine.apply(bot, 'haste', { duration: 3 });
    const s = subjectOf(sim.engine, bot, { key: 'bot', label: bot.name, role: bot.role, gear: freshGear(), live: true });
    const speed = row(statRows(s), 'speed')!;
    const haste = speed.parts.find((p) => p.group === 'status')!;
    expect(haste).toMatchObject({ name: 'Haste', text: '+30%' });
    expect(haste.left).toBeCloseTo(3, 0);
    expect(fitted(s).find((f) => f.key === 'status:haste')).toMatchObject({ group: 'status', name: 'Haste' });
    expect(fitted(s).find((f) => f.key === 'status:haste')!.left).toBeCloseTo(3, 0);
    sim.step(1, NO_INPUT);
    expect(row(statRows(s), 'speed')!.parts.find((p) => p.group === 'status')!.left).toBeCloseTo(2, 0);
    // The Communicator's max oil is read against the role's base, not the modified max the Sim keeps on the unit.
    expect(s.bases.maxHp).toBe(110);
  });

  it('a held effect with no end shows no seconds', () => {
    const sim = new Sim(3);
    sim.engine.hold(sim.controller, 'pace', { stat: 'speed', pct: -0.1 });
    const s = subjectOf(sim.engine, sim.controller, { key: 'comm', label: 'You', role: 'controller', gear: freshGear(), live: true });
    const p = row(statRows(s), 'speed')!.parts.find((x) => x.name === 'Pace')!;
    expect(p.left).toBeUndefined();
    expect(partOf({ id: 'x', kind: 'status', add: 0, pct: 0, more: 1.5 }, 'mult').text).toBe('x1.5');
  });
});
