import { describe, expect, it } from 'vitest';
import { rng } from '../../../../harness/kit/rng';
import {
  ARC_SHARE, DOT_STEP, MAX_AREA, MAX_CHAIN, SHOCK_JUMP, STATUSES, WEAK,
  Effects, validate, type Cond, type Effect, type EventKind, type Out, type Source, type StatusId, type Unit
} from './effects';

const unit = (x = 0, y = 0, hp = 100): Unit => ({ x, y, hp, maxHp: hp });
/** Hits roll their type's status by chance. Units from `setup` never do (`rider` -100%) unless made `sure` (always) or `real` (the real chances). */
const riders = (pct: number, add = 0): Source => ({ id: 'riders', effects: [{ when: 'always', do: { do: 'stat', stat: 'rider', pct, add } }] });
const setup = (seed = 'test') => {
  const fx = new Effects(rng(seed));
  const crew = (u = unit(), tags: string[] = []) => {
    fx.add(u, { team: 'crew', tags });
    fx.addSource(u, riders(-1));
    return u;
  };
  const foe = (u = unit(50, 0, 100), family?: string, tags: string[] = []) => {
    fx.add(u, { team: 'foe', family, tags });
    fx.addSource(u, riders(-1));
    return u;
  };
  const sure = (u: Unit) => fx.addSource(u, riders(0, 1));
  const real = (u: Unit) => fx.removeSource(u, 'riders');
  return { fx, crew, foe, sure, real };
};
const count = (outs: Out[], when: EventKind, source?: string) =>
  outs.filter((o) => o.t === 'proc' && o.when === when && (!source || o.source === source)).length;
/** An effect that adds a Charge stack to its owner: a probe for "did it fire". */
const probe = (when: EventKind, extra: Partial<Extract<Effect, { when: EventKind }>> = {}): Effect => ({
  when, cd: 0, do: { do: 'status', id: 'charge', to: 'self' }, ...extra,
});

describe('triggers', () => {
  it('fires every emitted kind for its owner, and nothing for the wrong kind', () => {
    const kinds: EventKind[] = ['shot', 'skill', 'dash', 'kick', 'crash', 'siphon', 'search', 'break', 'decode', 'hit', 'kill', 'hurt', 'down', 'dusk', 'tick'];
    const { fx, crew } = setup();
    const a = crew();
    for (const k of kinds) fx.addSource(a, { id: k, effects: [{ when: k, cd: 0, do: { do: 'spawn', what: 'x', kind: k } }] });
    for (const k of ['shot', 'skill', 'dash', 'kick', 'crash', 'siphon', 'search', 'break', 'decode'] as const) {
      fx.drain();
      fx.emit({ kind: k, self: a });
      const outs = fx.drain().filter((o) => o.t === 'spawn');
      expect(outs.map((o) => o.t === 'spawn' && o.kind)).toEqual([k]);
    }
  });

  it('hit, hurt, kill and down come from a lethal strike, to the right units', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const b = foe(unit(50, 0, 10));
    for (const k of ['hit', 'kill', 'hurt', 'down'] as const) {
      fx.addSource(a, { id: `a-${k}`, effects: [probe(k)] });
      fx.addSource(b, { id: `b-${k}`, effects: [probe(k)] });
    }
    fx.strike(a, b, { type: 'pierce', amount: 50 });
    const o = fx.drain();
    expect([count(o, 'hit', 'a-hit'), count(o, 'kill', 'a-kill'), count(o, 'hurt', 'b-hurt'), count(o, 'down', 'b-down')]).toEqual([1, 1, 1, 1]);
    expect([count(o, 'hurt', 'a-hurt'), count(o, 'hit', 'b-hit'), count(o, 'down', 'a-down')]).toEqual([0, 0, 0]);
    expect(fx.isDown(b)).toBe(true);
    expect(o.some((x) => x.t === 'down' && x.unit === b && x.by === a)).toBe(true);
  });

  it('tick fires once a second, dusk once on entering the evening', () => {
    const { fx, crew } = setup();
    const a = crew();
    fx.addSource(a, { id: 'a', effects: [probe('tick'), probe('dusk')] });
    fx.tick(0.5);
    expect(fx.stacks(a, 'charge')).toBe(0);
    fx.tick(0.5);
    expect(fx.stacks(a, 'charge')).toBe(1);
    fx.tick(2);
    expect(fx.stacks(a, 'charge')).toBe(3);
    fx.setPhase('evening');
    expect(fx.stacks(a, 'charge')).toBe(4);
    fx.setPhase('evening');
    expect(fx.stacks(a, 'charge')).toBe(4);
    fx.setPhase('midnight');
    fx.setPhase('evening');
    expect(fx.stacks(a, 'charge')).toBe(5);
  });

  it('who: ally effects hear allies, within near, and not foes', () => {
    const { fx, crew, foe } = setup();
    const a = crew(unit(0, 0));
    const near = crew(unit(100, 0));
    const far = crew(unit(1000, 0));
    const e = foe(unit(0, 50, 10));
    fx.addSource(a, { id: 'bb', effects: [{ when: 'down', who: 'ally', near: 300, cd: 0, do: { do: 'status', id: 'fury' } }] });
    fx.addSource(e, { id: 'bb', effects: [{ when: 'down', who: 'ally', cd: 0, do: { do: 'status', id: 'fury' } }] });
    fx.down(near);
    expect(fx.stacks(a, 'fury')).toBe(1);
    fx.strip(a, 'fury');
    fx.down(far);
    expect(fx.stacks(a, 'fury')).toBe(0);
    fx.down(a);
    expect(fx.stacks(a, 'fury')).toBe(0);
    expect(fx.stacks(e, 'fury')).toBe(0);
  });

});

describe('conditions', () => {
  const fires = (cond: Cond | Cond[], arrange: (w: ReturnType<typeof setup>, a: Unit, t: Unit) => void, via?: string) => {
    const w = setup();
    const a = w.crew();
    const t = w.foe();
    arrange(w, a, t);
    w.fx.addSource(a, { id: 'p', effects: [probe('shot', { if: cond })] });
    w.fx.emit({ kind: 'shot', self: a, target: t, via, type: 'pierce' });
    return w.fx.stacks(a, 'charge') === 1;
  };

  it('status on the target (default) or self, with a minimum', () => {
    const wet: Cond = { is: 'status', id: 'wet' };
    expect(fires(wet, () => {})).toBe(false);
    expect(fires(wet, (w, _a, t) => w.fx.apply(t, 'wet'))).toBe(true);
    expect(fires({ is: 'status', id: 'scalded', min: 2 }, (w, _a, t) => w.fx.apply(t, 'scalded'))).toBe(false);
    expect(fires({ is: 'status', id: 'scalded', min: 2 }, (w, _a, t) => w.fx.apply(t, 'scalded', { stacks: 2 }))).toBe(true);
    expect(fires({ is: 'status', id: 'fury', of: 'self' }, (w, a) => w.fx.apply(a, 'fury'))).toBe(true);
  });
  it('tags: twisted, elite, boss', () => {
    expect(fires({ is: 'tag', tag: 'twisted' }, () => {})).toBe(false);
    expect(fires({ is: 'tag', tag: 'twisted' }, (w, _a, t) => w.fx.tag(t, 'twisted'))).toBe(true);
    expect(fires({ is: 'tag', tag: 'elite' }, (w, _a, t) => w.fx.tag(t, 'elite'))).toBe(true);
    expect(fires({ is: 'tag', tag: 'boss', of: 'self' }, (w, _a, t) => w.fx.tag(t, 'boss'))).toBe(false);
  });
  it('a share of oil', () => {
    const low: Cond = { is: 'hp', below: 0.5, of: 'self' };
    expect(fires(low, () => {})).toBe(false);
    expect(fires(low, (_w, a) => (a.hp = 40))).toBe(true);
    expect(fires({ is: 'hp', below: 0.25 }, (_w, _a, t) => (t.hp = 20))).toBe(true);
    expect(fires({ is: 'hp', above: 0.9 }, () => {})).toBe(true);
  });
  it('a passive conditioned on oil works (it does not read its own maximum forever)', () => {
    const fx = new Effects(rng('hp'));
    const u: Unit = { x: 0, y: 0, hp: 60, maxHp: 100 };
    fx.add(u, { team: 'crew' });
    fx.addSource(u, { id: 'rage', effects: [{ when: 'always', if: { is: 'hp', below: 0.5, of: 'self' }, do: { do: 'stat', stat: 'damage', pct: 0.25 } }] });
    expect(fx.stat(u, 'damage', 100)).toBe(100);
    u.hp = 40;
    expect(fx.stat(u, 'damage', 100)).toBe(125);
  });
  it('crew size counts the living of the owner\'s team', () => {
    const three: Cond = { is: 'crew', min: 3 };
    expect(fires(three, (w) => w.crew())).toBe(false);
    expect(fires(three, (w) => { w.crew(); w.crew(); })).toBe(true);
    expect(fires(three, (w) => { w.crew(); const d = w.crew(); w.fx.down(d); })).toBe(false);
    expect(fires({ is: 'crew', max: 1 }, () => {})).toBe(true);
  });
  it('time of day, with night meaning evening and midnight', () => {
    expect(fires({ is: 'time', phase: 'night' }, () => {})).toBe(false);
    expect(fires({ is: 'time', phase: 'night' }, (w) => w.fx.setPhase('evening'))).toBe(true);
    expect(fires({ is: 'time', phase: 'night' }, (w) => w.fx.setPhase('midnight'))).toBe(true);
    expect(fires({ is: 'time', phase: ['morning', 'day'] }, () => {})).toBe(true);
    expect(fires({ is: 'time', phase: 'morning' }, () => {})).toBe(false);
  });
  it('via and type of the event', () => {
    expect(fires({ is: 'via', via: 'gun' }, () => {}, 'gun')).toBe(true);
    expect(fires({ is: 'via', via: ['saw', 'melee'] }, () => {}, 'gun')).toBe(false);
    expect(fires({ is: 'type', type: 'pierce' }, () => {})).toBe(true);
    expect(fires({ is: 'type', type: ['shock', 'scald'] }, () => {})).toBe(false);
  });
  it('not, any, and a list means all', () => {
    const wet: Cond = { is: 'status', id: 'wet' };
    const lit: Cond = { is: 'status', id: 'lit' };
    expect(fires({ is: 'not', cond: wet }, () => {})).toBe(true);
    expect(fires({ is: 'any', of: [wet, lit] }, (w, _a, t) => w.fx.apply(t, 'lit'))).toBe(true);
    expect(fires([wet, lit], (w, _a, t) => w.fx.apply(t, 'lit'))).toBe(false);
    expect(fires([wet, lit], (w, _a, t) => { w.fx.apply(t, 'lit'); w.fx.apply(t, 'wet'); })).toBe(true);
  });
});

describe('chance, every and cooldowns', () => {
  it('chance 0 never and 1 always; same seed gives the same sequence', () => {
    const run = (seed: string, chance: number) => {
      const { fx, crew } = setup(seed);
      const a = crew();
      fx.addSource(a, { id: 'p', effects: [{ when: 'shot', cd: 0, chance, do: { do: 'spawn', what: 'x', kind: 'k' } }] });
      const hits: boolean[] = [];
      for (let i = 0; i < 40; i++) {
        fx.drain();
        fx.emit({ kind: 'shot', self: a });
        hits.push(fx.drain().some((o) => o.t === 'spawn'));
      }
      return hits;
    };
    expect(run('s', 0).some(Boolean)).toBe(false);
    expect(run('s', 1).every(Boolean)).toBe(true);
    expect(run('s', 0.5)).toEqual(run('s', 0.5));
    expect(run('s', 0.5)).not.toEqual(run('other', 0.5));
    const n = run('s', 0.5).filter(Boolean).length;
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(35);
  });

  it('every n fires on each nth qualifying trigger only', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const t = foe(unit(50, 0, 1000));
    fx.addSource(a, { id: 'rust', effects: [{ when: 'hit', every: 3, cd: 0, do: { do: 'status', id: 'rusted' } }] });
    for (let i = 0; i < 8; i++) fx.strike(a, t, { type: 'impact', amount: 1 });
    expect(fx.stacks(t, 'rusted')).toBe(2);
  });


  it('a cooldown holds an effect off, per owner and per effect', () => {
    const { fx, crew } = setup();
    const a = crew();
    const b = crew();
    for (const u of [a, b]) fx.addSource(u, { id: 'p', effects: [probe('shot', { cd: 2 }), probe('shot', { cd: 0 })] });
    fx.emit({ kind: 'shot', self: a });
    fx.emit({ kind: 'shot', self: a });
    expect(fx.stacks(a, 'charge')).toBe(3);
    expect(fx.stacks(b, 'charge')).toBe(0);
    fx.emit({ kind: 'shot', self: b });
    expect(fx.stacks(b, 'charge')).toBe(2);
    fx.tick(1.9);
    fx.emit({ kind: 'shot', self: a });
    expect(fx.stacks(a, 'charge')).toBe(4);
    fx.tick(0.1);
    fx.emit({ kind: 'shot', self: a });
    expect(fx.stacks(a, 'charge')).toBe(6);
  });


});

describe('statuses', () => {
  it('stacks up to the cap and no further', () => {
    const { fx, foe } = setup();
    const t = foe();
    for (let i = 0; i < 6; i++) fx.apply(t, 'scalded');
    expect(fx.stacks(t, 'scalded')).toBe(STATUSES.scalded.maxStacks);
    for (let i = 0; i < 9; i++) fx.apply(t, 'rusted');
    expect(fx.stacks(t, 'rusted')).toBe(5);
    fx.apply(t, 'wet', { stacks: 4 });
    expect(fx.stacks(t, 'wet')).toBe(1);
    fx.apply(t, 'menace', { stacks: 40 });
    expect(fx.stacks(t, 'menace')).toBe(40);
  });

  it('reapplying refreshes the duration and never extends it past the status\'s own', () => {
    const { fx, foe } = setup();
    const t = foe();
    fx.apply(t, 'wet');
    fx.tick(3);
    expect(fx.status(t, 'wet')!.left).toBeCloseTo(1);
    fx.apply(t, 'wet');
    expect(fx.status(t, 'wet')!.left).toBeCloseTo(4);
    fx.tick(4);
    expect(fx.status(t, 'wet')).toBeUndefined();
  });

  it('immunity: Brass Shins stop Rooted; an explicit duration is used as given', () => {
    const { fx, crew } = setup();
    const a = crew();
    fx.addSource(a, { id: 'shins', effects: [{ when: 'always', do: { do: 'stat', stat: 'immune:rooted', add: 1 } }] });
    expect(fx.apply(a, 'rooted')).toBe(false);
    expect(fx.flag(a, 'noMove')).toBe(false);
    expect(fx.apply(a, 'blinded', { duration: 0.3 })).toBe(true);
    expect(fx.status(a, 'blinded')!.left).toBeCloseTo(0.3);
  });

  it('strip removes some stacks or all', () => {
    const { fx, foe } = setup();
    const t = foe();
    fx.apply(t, 'rusted', { stacks: 4 });
    fx.strip(t, 'rusted', 1);
    expect(fx.stacks(t, 'rusted')).toBe(3);
    fx.strip(t, 'rusted');
    expect(fx.stacks(t, 'rusted')).toBe(0);
  });

  it('a modifier can scale with the stacks of a status (per)', () => {
    const { fx, crew } = setup();
    const a = crew();
    fx.addSource(a, { id: 'kettle', effects: [{ when: 'always', do: { do: 'stat', stat: 'damage', pct: 0.15, per: { status: 'menace', of: 'self' } } }] });
    expect(fx.stat(a, 'damage', 100)).toBe(100);
    fx.apply(a, 'menace', { stacks: 4 });
    expect(fx.stat(a, 'damage', 100)).toBeCloseTo(160);
  });

  it('a timed stat change from an event lasts its seconds and refreshes rather than stacks', () => {
    const { fx, crew } = setup();
    const a = crew();
    fx.addSource(a, { id: 'p', effects: [{ when: 'kill', who: 'any', cd: 0, do: { do: 'stat', stat: 'speed', pct: 0.2, for: 2 } }] });
    for (let i = 0; i < 2; i++) fx.strike(a, fx.add(unit(10, 0, 1), { team: 'foe' }), { type: 'pierce', amount: 1 });
    expect(fx.stat(a, 'speed', 100)).toBeCloseTo(120);
    fx.tick(2.1);
    expect(fx.stat(a, 'speed', 100)).toBe(100);
  });
});

describe('damage, types and resistances', () => {
  it('a unit can override its family; penetration ignores a resistance but not a weakness', () => {
    const { fx, crew } = setup();
    const a = crew();
    const t = fx.add(unit(50, 0, 100), { team: 'foe', family: 'hornet', resist: { impact: 0.25, shock: 3 } });
    expect(fx.preview(a, t, 'impact', 10)).toBe(2.5);
    expect(fx.preview(a, t, 'shock', 10)).toBe(30);
    const h = fx.add(unit(50, 0, 100), { team: 'foe', family: 'demon' });
    fx.addSource(a, { id: 'plasma', effects: [{ when: 'always', do: { do: 'stat', stat: 'pen:dark', add: 1 } }] });
    expect(fx.preview(a, h, 'dark', 10)).toBe(10);
    fx.addSource(a, { id: 'scalder', effects: [{ when: 'always', do: { do: 'stat', stat: 'pen:scald', add: 1 } }] });
    expect(fx.preview(a, h, 'scald', 10)).toBe(15);
  });
  it('attacker stats scale damage: Fury, a typed bonus, and a per-type taken stat on the victim', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const t = foe();
    fx.addSource(a, { id: 'aq', effects: [{ when: 'always', do: { do: 'stat', stat: 'damage:scald', pct: 0.2 } }] });
    expect(fx.preview(a, t, 'scald', 10)).toBeCloseTo(12);
    expect(fx.preview(a, t, 'impact', 10)).toBeCloseTo(10);
    fx.apply(a, 'fury');
    expect(fx.preview(a, t, 'scald', 10)).toBeCloseTo(10 * 1.25 * 1.2);
    fx.addSource(t, { id: 'plate', effects: [{ when: 'always', do: { do: 'stat', stat: 'damageTaken:impact', pct: -0.5 } }] });
    expect(fx.preview(a, t, 'impact', 10)).toBeCloseTo(10 * 1.25 * 0.5);
  });
  it('the old ids still work: Scald is Steam and applies Scalded, Rust is Acid and applies Corroded (read as Rusted too)', () => {
    const { fx, crew, foe, sure } = setup();
    const a = crew();
    sure(a);
    const t = foe(unit(50, 0, 1000));
    fx.strike(a, t, { type: 'scald', amount: 1 });
    fx.strike(a, t, { type: 'rust', amount: 1 });
    expect([fx.stacks(t, 'scalded'), fx.stacks(t, 'rusted'), fx.stacks(t, 'corroded'), fx.stacks(t, 'wet')]).toEqual([1, 1, 1, 0]);
    const outs = fx.drain().filter((o) => o.t === 'damage');
    expect(outs.map((o) => o.t === 'damage' && o.type)).toEqual(['steam', 'acid']);
  });
});

describe('the Rising District\'s stats (P55 B)', () => {
  const stat = (s: 'shockJumps' | 'scaldBurst', add: number): Source => ({ id: 'city', effects: [{ when: 'always', do: { do: 'stat', stat: s, add } }] });

  it('shockJumps: a Shock chain jumps that many foes farther, and other hits do not arc', () => {
    const jumped = (extra: number) => {
      const { fx, crew, foe, sure } = setup();
      const a = crew();
      sure(a);
      if (extra) fx.addSource(a, stat('shockJumps', extra));
      const row = [0, 20, 30, 40, 50].map((y) => foe(unit(100, y, 100))); // all within a jump of the first
      fx.strike(a, row[0], { type: 'shock', amount: 10 });
      const hurt = row.slice(1).filter((u) => u.hp < 100).length;
      const before = row.map((u) => u.hp);
      fx.strike(a, row[4], { type: 'pierce', amount: 5 }); // a pierce hit beside the cluster does not arc
      return { hurt, pierceArcs: row.some((u, i) => i !== 4 && u.hp < before[i]) };
    };
    expect(jumped(0)).toEqual({ hurt: 1, pierceArcs: false });
    expect(jumped(2)).toEqual({ hurt: 3, pierceArcs: false });
  });

  it('scaldBurst: a Scalded foe that dies Scalds the foes round it, once, and not across the field', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    fx.addSource(a, stat('scaldBurst', 60));
    const t = foe(unit(100, 0, 5)), near = foe(unit(140, 0, 100)), far = foe(unit(400, 0, 100));
    fx.apply(t, 'scalded', { by: a });
    fx.strike(a, t, { type: 'impact', amount: 50 });
    expect(fx.isDown(t)).toBe(true);
    expect([fx.stacks(near, 'scalded'), fx.stacks(far, 'scalded')]).toEqual([1, 0]);
    // The Scald that came of a burst does not burst again.
    fx.strike(a, near, { type: 'impact', amount: 500 });
    expect(fx.stacks(far, 'scalded')).toBe(0);
    // Without the stat nothing bursts.
    const w = setup();
    const b = w.crew(), t2 = w.foe(unit(100, 0, 5)), n2 = w.foe(unit(140, 0, 100));
    w.fx.apply(t2, 'scalded', { by: b });
    w.fx.strike(b, t2, { type: 'impact', amount: 50 });
    expect(w.fx.stacks(n2, 'scalded')).toBe(0);
  });
});

describe('Shock', () => {
  it('stuns what it hits and jumps to the nearest within 80 px, not beyond', () => {
    const { fx, crew, foe, sure } = setup();
    const a = crew();
    sure(a);
    const t = foe(unit(100, 0, 100));
    const near = foe(unit(100 + SHOCK_JUMP - 1, 0, 100));
    const nearer2 = foe(unit(100, SHOCK_JUMP - 10, 100));
    const far = foe(unit(100 + SHOCK_JUMP + 5, 0, 100));
    fx.strike(a, t, { type: 'shock', amount: 10 });
    expect(t.hp).toBe(90);
    expect(fx.flag(t, 'stunned')).toBe(true);
    expect(nearer2.hp).toBe(100 - 10 * ARC_SHARE);
    expect(near.hp).toBe(100);
    expect(far.hp).toBe(100);
    expect(fx.flag(nearer2, 'stunned')).toBe(true);
  });
  it('does not jump to allies of the attacker', () => {
    const { fx, crew, foe, sure } = setup();
    const a = crew();
    sure(a);
    const ally = crew(unit(110, 0));
    const t = foe(unit(100, 0, 100));
    fx.strike(a, t, { type: 'shock', amount: 10 });
    expect(ally.hp).toBe(100);
  });
});

describe('the bounds', () => {
  it('depth 1: what an effect does fires no triggers of its own', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const t = foe(unit(50, 0, 1000));
    fx.addSource(a, {
      id: 'cards',
      effects: [
        { when: 'hit', cd: 0, do: [{ do: 'damage', type: 'pierce', amount: 5 }, { do: 'pulse', radius: 200, then: { do: 'damage', type: 'impact', amount: 5 } }] },
        probe('hit'),
        probe('hurt'),
      ],
    });
    fx.addSource(t, { id: 'thorns', effects: [probe('hurt')] });
    fx.strike(a, t, { type: 'pierce', amount: 1 });
    expect(fx.stacks(a, 'charge')).toBe(1);
    expect(fx.stacks(t, 'charge')).toBe(1);
    expect(t.hp).toBeLessThan(990);
  });

  it('a kill by an effect fires no kill triggers, but the unit is down and reported', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const weak = foe(unit(60, 0, 1));
    fx.addSource(a, {
      id: 'cards',
      effects: [{ when: 'shot', cd: 0, do: { do: 'pulse', radius: 100, then: { do: 'damage', type: 'pierce', amount: 5 } } }, probe('kill', { who: 'any' })],
    });
    fx.emit({ kind: 'shot', self: a });
    expect(fx.isDown(weak)).toBe(true);
    expect(fx.stacks(a, 'charge')).toBe(0);
    expect(fx.drain().some((o) => o.t === 'down' && o.unit === weak && o.by === a)).toBe(true);
  });

  it('a down from an effect still fires that unit\'s down effects once; downs those cause are silent', () => {
    const { fx, crew, foe } = setup();
    const a = crew(unit(0, 0));
    const b = foe(unit(50, 0, 1));
    const c = foe(unit(60, 0, 1));
    fx.addSource(a, { id: 'a', effects: [{ when: 'shot', do: { do: 'pulse', radius: 55, then: { do: 'damage', type: 'pierce', amount: 5 } } }] });
    fx.addSource(b, { id: 'b', effects: [{ when: 'down', cd: 0, do: { do: 'pulse', radius: 100, side: 'ally', then: { do: 'damage', type: 'pierce', amount: 5 } } }] });
    fx.addSource(c, { id: 'c', effects: [probe('down')] });
    fx.emit({ kind: 'shot', self: a });
    const o = fx.drain();
    expect(count(o, 'down', 'b')).toBe(1);
    expect(fx.isDown(c)).toBe(true);
    expect(o.filter((x) => x.t === 'down').map((x) => x.t === 'down' && x.unit)).toEqual([c, b]);
    expect(count(o, 'down', 'c')).toBe(0);
  });

  it('an area pulse reaches at most MAX_AREA units, nearest first', () => {
    const { fx, crew, foe } = setup();
    const a = crew(unit(0, 0));
    const foes = Array.from({ length: 40 }, (_, i) => foe(unit(10 + i, 0, 100)));
    fx.addSource(a, { id: 'p', effects: [{ when: 'shot', do: { do: 'pulse', radius: 500, then: { do: 'damage', type: 'pierce', amount: 1 } } }] });
    fx.emit({ kind: 'shot', self: a });
    expect(foes.filter((f) => f.hp < 100).length).toBe(MAX_AREA);
    expect(foes[0].hp).toBe(99);
    expect(foes[39].hp).toBe(100);
  });

  it('a chain makes at most MAX_CHAIN jumps, each to a new unit', () => {
    const { fx, crew, foe } = setup();
    const a = crew(unit(0, 0));
    const foes = Array.from({ length: 20 }, (_, i) => foe(unit(50 + i * 10, 0, 100)));
    fx.addSource(a, { id: 'c', effects: [{ when: 'hit', do: { do: 'chain', jumps: 99, range: 15, decay: 0.5, then: { do: 'damage', type: 'pierce', amount: 8 } } }] });
    fx.strike(a, foes[0], { type: 'pierce', amount: 1 });
    expect(foes.filter((f) => f.hp < 100).length).toBe(1 + MAX_CHAIN);
    expect(foes[1].hp).toBeCloseTo(100 - 4);
    expect(foes[2].hp).toBeCloseTo(100 - 2);
    const chain = fx.drain().find((o) => o.t === 'chain');
    expect(chain && chain.t === 'chain' && chain.path.length).toBe(1 + MAX_CHAIN);
  });

  it('source data that breaks the language is refused', () => {
    const bad = (effects: Effect[]) => () => validate({ id: 'bad', effects });
    expect(bad([{ when: 'always', do: { do: 'damage', type: 'impact', amount: 1 } } as unknown as Effect])).toThrow(/passive/);
    expect(bad([{ when: 'hit', do: { do: 'stat', stat: 'speed', pct: 0.1 } }])).toThrow(/for/);
    expect(bad([{ when: 'hit', do: { do: 'status', id: 'nope' as StatusId } }])).toThrow(/unknown status/);
    expect(bad([{ when: 'hit', chance: 2, do: { do: 'status', id: 'wet' } }])).toThrow(/chance/);
    expect(bad([{ when: 'hit', every: 1.5, do: { do: 'status', id: 'wet' } }])).toThrow(/every/);
    const p = (then: never): Effect => ({ when: 'hit', do: { do: 'pulse', radius: 1, then } });
    expect(bad([p({ do: 'pulse', radius: 1, then: { do: 'pulse', radius: 1, then: { do: 'pulse', radius: 1, then: { do: 'status', id: 'wet' } } } } as never)])).toThrow(/nest/);
    expect(bad([{ when: 'hit', do: { do: 'status', id: 'wet' } }])).not.toThrow();
  });

  it('the output queue is bounded if the host never drains it', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const t = foe(unit(50, 0, 1e9));
    for (let i = 0; i < 6000; i++) fx.strike(a, t, { type: 'pierce', amount: 1 });
    expect(fx.drain().length).toBeLessThanOrEqual(4096);
  });
});

describe('heal, revive and shields', () => {

  it('a downed unit takes no more damage, statuses or healing; revive brings it back', () => {
    const { fx, crew, foe } = setup();
    const bot = crew();
    const h = foe();
    fx.down(bot);
    expect(fx.strike(h, bot, { type: 'pierce', amount: 5 }).blocked).toBe(true);
    expect(fx.apply(bot, 'fury')).toBe(false);
    expect(fx.heal(bot, 10)).toBe(0);
    fx.revive(bot, 0.35);
    expect(bot.hp).toBe(35);
    expect(fx.isDown(bot)).toBe(false);
  });

  it('Medic: healing above full becomes an Overcharge shield, capped at 30% of max oil, which soaks damage and decays', () => {
    const { fx, crew, foe } = setup();
    const medic = crew();
    const ally = crew(unit(10, 0, 100));
    const h = foe();
    fx.addSource(medic, { id: 'medic', effects: [{ when: 'always', do: { do: 'stat', stat: 'overcharge', add: 0.3 } }] });
    ally.hp = 90;
    expect(fx.heal(ally, 50, medic)).toBe(10);
    expect(fx.shield(ally)).toBe(30);
    expect(fx.heal(ally, 50, medic)).toBe(0);
    expect(fx.shield(ally)).toBe(30);
    fx.strike(h, ally, { type: 'pierce', amount: 20 });
    expect([ally.hp, fx.shield(ally)]).toEqual([100, 10]);
    fx.tick(1);
    expect(fx.shield(ally)).toBeCloseTo(5);
    const plain = crew(unit(0, 0, 100));
    expect(fx.heal(plain, 50, ally)).toBe(0);
    expect(fx.shield(plain)).toBe(0);
  });
});

describe('worked combos (systems.md builds)', () => {
  it('Storm: Conductors makes Shock chain through Wet at any distance', () => {
    const { fx, crew, foe } = setup();
    const comm = crew();
    const x = foe(unit(100, 0, 100));
    const y = foe(unit(900, 300, 100));
    fx.apply(x, 'wet');
    fx.apply(y, 'wet');
    fx.strike(comm, x, { type: 'shock', amount: 10 });
    expect([x.hp, y.hp]).toEqual([80, 100]);
    fx.addSource(comm, { id: 'conductors', effects: [{ when: 'always', do: { do: 'stat', stat: 'wetArc', add: 9999 } }] });
    fx.tick(1);
    fx.strike(comm, x, { type: 'shock', amount: 10 });
    expect([x.hp, y.hp]).toEqual([60, 100 - 10 * ARC_SHARE * 2]);
  });

  it('Rust: Saw Teeth and Rust Edge apply Rusted, Rust Bloom passes a dead foe\'s stacks to those near it', () => {
    const { fx, crew, foe } = setup();
    const warrior = crew();
    const a = foe(unit(100, 0, 30));
    const b = foe(unit(150, 0, 500));
    const c = foe(unit(1000, 0, 500));
    fx.addSource(warrior, { id: 'sawTeeth', effects: [{ when: 'hit', if: { is: 'via', via: 'saw' }, cd: 0, do: { do: 'status', id: 'rusted' } }] });
    fx.addSource(warrior, {
      id: 'rustBloom',
      effects: [{
        when: 'kill', who: 'any', cd: 0, if: { is: 'status', id: 'rusted', min: 1 },
        do: { do: 'pulse', radius: 200, at: 'target', then: { do: 'status', id: 'rusted', stacks: 'event' } },
      }],
    });
    for (let i = 0; i < 3; i++) fx.strike(warrior, a, { type: 'impact', amount: 1, via: 'saw' });
    expect(fx.stacks(a, 'rusted')).toBe(3);
    fx.strike(warrior, a, { type: 'impact', amount: 100, via: 'saw' });
    expect(fx.isDown(a)).toBe(true);
    expect([fx.stacks(b, 'rusted'), fx.stacks(c, 'rusted')]).toEqual([3, 0]);
  });

});

describe('determinism', () => {
  it('the same seed and the same calls give the same outputs', () => {
    const run = () => {
      const { fx, crew, foe } = setup('replay');
      const a = crew();
      const ts = Array.from({ length: 6 }, (_, i) => foe(unit(50 + i * 30, 0, 40)));
      fx.addSource(a, { id: 'c', effects: [{ when: 'hit', chance: 0.5, cd: 0, do: { do: 'pulse', radius: 80, then: { do: 'status', id: 'scalded' } } }] });
      for (let i = 0; i < 30; i++) {
        fx.strike(a, ts[i % 6], { type: 'shock', amount: 3 });
        fx.tick(0.25);
      }
      return { hp: ts.map((t) => t.hp), outs: fx.drain().map((o) => o.t) };
    };
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------- P10: aura, plating, parry, explain, gear's needs

describe('aura', () => {
  const lamp = (r = 120, extra: object = {}): Effect => ({ when: 'aura', r, do: { do: 'stat', stat: 'damage', pct: 0.15 }, ...extra }) as Effect;
  it('gives allies within r the mods, not the owner, not foes, not beyond', () => {
    const { fx, crew, foe } = setup();
    const owner = crew(unit(0, 0));
    const near = crew(unit(100, 0));
    const far = crew(unit(125, 0));
    const enemy = foe(unit(50, 0));
    fx.addSource(owner, { id: 'lamp', effects: [lamp()] });
    expect([owner, near, far, enemy].map((u) => Math.round(fx.stat(u, 'damage', 100)))).toEqual([100, 115, 100, 100]);
    near.x = 121;
    expect(fx.stat(near, 'damage', 100)).toBe(100);
  });
  it('one source id counts once on a receiver however many wear it; a downed wearer gives nothing', () => {
    const { fx, crew } = setup();
    const a = crew(unit(0, 0));
    const b = crew(unit(10, 0));
    const rx = crew(unit(50, 0));
    fx.addSource(a, { id: 'lampOfFaith', effects: [lamp()] });
    fx.addSource(b, { id: 'lampOfFaith', effects: [lamp()] });
    expect(fx.stat(rx, 'damage', 100)).toBeCloseTo(115);
    fx.addSource(b, { id: 'other', effects: [lamp()] });
    expect(fx.stat(rx, 'damage', 100)).toBeCloseTo(130);
    fx.down(a);
    fx.down(b);
    expect(fx.stat(rx, 'damage', 100)).toBe(100);
  });
});

describe('plating, armour and the damage floor', () => {
  const armoured = (pct: number, plating = 0) => {
    const w = setup();
    const a = w.crew();
    const t = w.foe(unit(50, 0, 1000));
    const effects: Effect[] = [];
    if (pct) effects.push({ when: 'always', do: { do: 'stat', stat: 'damageTaken', pct: -pct } });
    if (plating) effects.push({ when: 'always', do: { do: 'stat', stat: 'plating', add: plating } });
    w.fx.addSource(t, { id: 'mail', effects });
    return { ...w, a, t };
  };
  it('plating takes N off a hit, never below 1', () => {
    const { fx, a, t } = armoured(0, 3);
    expect(fx.preview(a, t, 'pierce', 10)).toBe(7);
    expect(fx.preview(a, t, 'pierce', 3)).toBe(1);
    expect(fx.preview(a, t, 'pierce', 1.5)).toBe(1);
    expect(fx.preview(a, t, 'pierce', 0.5)).toBe(0.5);
    fx.strike(a, t, { type: 'pierce', amount: 10 });
    expect(t.hp).toBe(993);
  });
  it('comes after the percentages, and damage over time ignores it', () => {
    const { fx, a, t } = armoured(0.5, 3);
    expect(fx.preview(a, t, 'pierce', 10)).toBeCloseTo(10 / 1.5 - 3);
    fx.apply(t, 'scalded', { stacks: 2 });
    fx.tick(DOT_STEP);
    expect(t.hp).toBeCloseTo(1000 - (3 * 2 * DOT_STEP) / 1.5);
  });
  it('armour has no cap and diminishing returns: 100 / (100 + armour), never 0, never a heal', () => {
    const { fx, a, t } = armoured(0.9);
    expect(fx.preview(a, t, 'pierce', 100)).toBeCloseTo(100 / 1.9);
    const big = armoured(1.5, 3);
    expect(big.fx.preview(big.a, big.t, 'pierce', 100)).toBeCloseTo(100 / 2.5 - 3);
    big.fx.strike(big.a, big.t, { type: 'pierce', amount: 100 });
    expect(big.t.hp).toBeCloseTo(1000 - (100 / 2.5 - 3));
  });
});

describe('parry', () => {
  const duel = (parry: number) => {
    const w = setup('parry');
    const knight = w.crew();
    const hornet = w.foe(unit(30, 0, 1000));
    w.fx.addSource(knight, { id: 'buckler', effects: [{ when: 'always', do: { do: 'stat', stat: 'parry', add: parry } }] });
    return { ...w, knight, hornet };
  };
  it('only melee hits, and a negated hit fires no hurt', () => {
    const { fx, knight, hornet } = duel(1);
    fx.addSource(knight, { id: 'p', effects: [probe('hurt')] });
    fx.strike(hornet, knight, { type: 'pierce', amount: 20, via: 'gun' });
    expect(knight.hp).toBe(80);
    expect(fx.stacks(knight, 'charge')).toBe(1);
    fx.strike(hornet, knight, { type: 'pierce', amount: 20, via: 'saw' });
    expect(knight.hp).toBe(80);
    expect(fx.stacks(knight, 'charge')).toBe(1);
  });
  it('a chance parries about that share, the same every run, and 0 never does', () => {
    const run = (parry: number) => {
      const { fx, knight, hornet } = duel(parry);
      let n = 0;
      for (let i = 0; i < 100; i++) if (fx.strike(hornet, knight, { type: 'impact', amount: 0.01, via: 'melee' }).parried) n++;
      return n;
    };
    expect(run(0.3)).toBe(run(0.3));
    expect(run(0.3)).toBeGreaterThan(15);
    expect(run(0.3)).toBeLessThan(45);
    expect(run(0)).toBe(0);
  });
});

describe('explain', () => {
  it('lists every contribution and sums to the stat', () => {
    const { fx, crew } = setup();
    const a = crew(unit(0, 0));
    const ally = crew(unit(40, 0));
    fx.addSource(a, { id: 'brassShins', kind: 'gear', name: 'Brass shins', quality: 'rare', effects: [{ when: 'always', do: { do: 'stat', stat: 'speed', pct: 0.13 } }] });
    fx.addSource(a, { id: 'oracle', kind: 'research', effects: [{ when: 'always', do: [{ do: 'stat', stat: 'speed', add: 5 }, { do: 'stat', stat: 'damage', pct: 1 }] }] });
    fx.addSource(a, { id: 'title', kind: 'title', effects: [{ when: 'always', do: { do: 'stat', stat: 'speed', more: 1.1 } }] });
    fx.addSource(ally, { id: 'lamp', kind: 'gear', effects: [{ when: 'aura', r: 100, do: { do: 'stat', stat: 'speed', pct: 0.05 } }] });
    fx.apply(a, 'slowed');
    fx.apply(a, 'haste');
    fx.addSource(a, { id: 'kill', effects: [{ when: 'kill', cd: 0, do: { do: 'stat', stat: 'speed', pct: 0.2, for: 3 } }] });
    fx.strike(a, fx.add(unit(10, 0, 1), { team: 'foe' }), { type: 'pierce', amount: 5 });
    const x = fx.explain(a, 'speed', 100);
    expect(x.value).toBeCloseTo(fx.stat(a, 'speed', 100));
    const sum = (k: 'add' | 'pct') => x.parts.reduce((s, p) => s + p[k], 0);
    expect(Math.max(0, (100 + sum('add')) * (1 + sum('pct')) * x.parts.reduce((s, p) => s * p.more, 1))).toBeCloseTo(x.value);
    const by = (id: string) => x.parts.find((p) => p.id === id)!;
    expect(by('brassShins')).toMatchObject({ kind: 'gear', name: 'Brass shins', quality: 'rare', pct: 0.13 });
    expect(by('oracle')).toMatchObject({ kind: 'research', add: 5 });
    expect(by('title')).toMatchObject({ kind: 'title', more: 1.1 });
    expect(by('lamp')).toMatchObject({ kind: 'gear', pct: 0.05, owner: ally });
    expect(by('slowed')).toMatchObject({ kind: 'status', stacks: 1, pct: -0.4 });
    expect(by('haste').left).toBeCloseTo(3);
    expect(by('kill')).toMatchObject({ kind: 'timed', pct: 0.2 });
    expect(fx.explain(a, 'damage', 10).parts.map((p) => p.id)).toEqual(['oracle']);
  });
});

describe('the language additions', () => {
  it('weapon and via conditions read the hit; passive mods on them shape the damage dealt', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const t = foe(unit(50, 0, 1000));
    fx.addSource(a, {
      id: 'g',
      effects: [
        { when: 'always', if: { is: 'weapon', weapon: 'tazer' }, do: { do: 'stat', stat: 'damage', more: 2 } },
        { when: 'always', if: { is: 'via', via: 'melee' }, do: { do: 'stat', stat: 'damage', pct: 0.5 } },
      ],
    });
    fx.strike(a, t, { type: 'pierce', amount: 10, via: 'melee', weapon: 'tazer' });
    expect(t.hp).toBeCloseTo(1000 - 30);
    fx.strike(a, t, { type: 'pierce', amount: 10, via: 'gun', weapon: 'slingshot' });
    expect(t.hp).toBeCloseTo(1000 - 40);
    expect(fx.preview(a, t, 'pierce', 10, { via: 'melee' })).toBeCloseTo(15);
  });
  it("a chance can be read from a stat: the weapon's own plus the gear's", () => {
    const run = (extra: number) => {
      const { fx, crew, foe } = setup('crit');
      const a = crew();
      const t = foe(unit(50, 0, 1e6));
      fx.addSource(a, { id: 'w', effects: [{ when: 'hit', cd: 0, chance: { stat: 'crit', base: 0.2 }, do: { do: 'damage', type: 'pierce', ofBase: 1 } }] });
      if (extra) fx.addSource(a, { id: 'monocle', effects: [{ when: 'always', do: { do: 'stat', stat: 'crit', add: extra } }] });
      for (let i = 0; i < 200; i++) fx.strike(a, t, { type: 'impact', amount: 1 });
      return 1e6 - t.hp - 200;
    };
    expect(run(0)).toBeGreaterThan(15);
    expect(run(0)).toBeLessThan(70);
    expect(run(0.8)).toBe(200);
  });
  it('ofBase deals the hit again as struck, so a crit is a second identical hit with the same modifiers', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const t = foe(unit(50, 0, 1000), 'hornet');
    fx.addSource(a, { id: 'w', effects: [{ when: 'always', do: { do: 'stat', stat: 'damage', pct: 1 } }, { when: 'hit', cd: 0, do: { do: 'damage', type: 'shock', ofBase: 1 } }] });
    fx.strike(a, t, { type: 'shock', amount: 5 });
    expect(t.hp).toBeCloseTo(1000 - 2 * 5 * 2 * WEAK);
  });
  it('a spawn carries its cone, radius and what it does on touch; touch runs it as the owner', () => {
    const { fx, crew, foe } = setup();
    const a = crew();
    const t = foe(unit(50, 0, 100));
    fx.addSource(a, {
      id: 'burner',
      effects: [{ when: 'dash', cd: 0, do: { do: 'spawn', what: 'trail', kind: 'burn', ttl: 0.2, radius: 34, then: { do: 'damage', type: 'impact', amount: 14 } } }],
    });
    fx.emit({ kind: 'dash', self: a });
    const sp = fx.drain().find((o) => o.t === 'spawn');
    expect(sp).toMatchObject({ t: 'spawn', what: 'trail', kind: 'burn', radius: 34, ttl: 0.2, source: 'burner', owner: a });
    if (sp?.t !== 'spawn') throw new Error('no spawn');
    fx.touch(sp.owner, t, sp.then!, { source: sp.source });
    expect(t.hp).toBe(86);
    expect(() => validate({ id: 'x', effects: [{ when: 'dash', do: { do: 'spawn', what: 'a', kind: 'b', then: { do: 'status', id: 'nope' as StatusId } } }] })).toThrow(/unknown status/);
  });
});

// ---------------------------------------------------------------- P24: damage types and the status set

describe('the rider rule', () => {
  it('rolls on every hit: about a fifth of small hits and two fifths of big ones, the same every run', () => {
    const run = (amount: number) => {
      const { fx, crew, foe, real } = setup('riders');
      const a = crew();
      real(a);
      const t = foe(unit(50, 0, 1e9));
      for (let i = 0; i < 400; i++) fx.strike(a, t, { type: 'fire', amount });
      return fx.drain().filter((o) => o.t === 'status' && o.id === 'burning').length;
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).toBeGreaterThan(55);
    expect(run(5)).toBeLessThan(105);
    expect(run(25)).toBeGreaterThan(125);
    expect(run(25)).toBeLessThan(195);
  });
  it('damage over time and arcs never ride', () => {
    const { fx, crew, foe, sure } = setup();
    const a = crew();
    sure(a);
    const t = foe(unit(50, 0, 1e6));
    const n = foe(unit(100, 0, 1e6));
    fx.apply(t, 'punctured', { by: a });
    fx.apply(t, 'corroded', { by: a });
    fx.apply(t, 'scalded', { by: a });
    for (let i = 0; i < 4; i++) fx.tick(DOT_STEP);
    expect([fx.stacks(t, 'punctured'), fx.stacks(t, 'corroded'), fx.stacks(t, 'scalded')]).toEqual([1, 1, 1]);
    fx.apply(a, 'charged');
    fx.strike(a, t, { type: 'pierce', amount: 10 });
    expect(n.hp).toBe(1e6 - 10 * ARC_SHARE);
    expect(['shocked', 'punctured', 'staggered'].map((id) => fx.stacks(n, id as StatusId))).toEqual([0, 0, 0]);
  });
});

describe('Wet and Burning', () => {
  it('Wet halves Fire, doubles Shock, and puts Burning out and keeps it out', () => {
    const { fx, crew, foe, sure } = setup();
    const a = crew();
    sure(a);
    const t = foe(unit(50, 0, 1000));
    expect(fx.preview(a, t, 'fire', 10)).toBe(10);
    fx.apply(t, 'burning');
    fx.apply(t, 'wet');
    expect(fx.stacks(t, 'burning')).toBe(0);
    expect(fx.preview(a, t, 'fire', 10)).toBe(5);
    expect(fx.preview(a, t, 'shock', 10)).toBe(20);
    expect(fx.apply(t, 'burning')).toBe(false);
    fx.strike(a, t, { type: 'fire', amount: 10 });
    expect(fx.stacks(t, 'burning')).toBe(0);
    fx.tick(4.1);
    fx.strike(a, t, { type: 'fire', amount: 10 });
    expect(fx.stacks(t, 'burning')).toBe(1);
  });
});

describe('Burning spreads when its unit dies, once', () => {
  it('sets every unit within 50 px Burning, of any team, but not the Wet, not those beyond, and not a second time', () => {
    const { fx, crew, foe, sure } = setup();
    const a = crew();
    sure(a);
    const dead = foe(unit(100, 0, 1));
    const n1 = foe(unit(140, 0, 1000));
    const ally = crew(unit(100, 45, 1000));
    const wet = foe(unit(100, -30, 1000));
    const far = foe(unit(151, 0, 1000));
    const second = foe(unit(140, 45, 1000));
    fx.apply(wet, 'wet');
    fx.apply(dead, 'burning', { by: a });
    fx.strike(a, dead, { type: 'pierce', amount: 5 });
    expect(fx.isDown(dead)).toBe(true);
    expect([n1, ally].map((u) => fx.stacks(u, 'burning'))).toEqual([1, 1]);
    expect([wet, far, second].map((u) => fx.stacks(u, 'burning'))).toEqual([0, 0, 0]);
    // The ones it spread to burn on, and when they die it goes no further.
    n1.hp = 1;
    fx.tick(DOT_STEP);
    fx.tick(DOT_STEP);
    expect(fx.isDown(n1)).toBe(true);
    expect(fx.stacks(second, 'burning')).toBe(0);
    expect(fx.stacks(ally, 'burning')).toBe(1);
  });
  it('a unit that was set alight for real still spreads, even if it had caught the spread first', () => {
    const { fx, crew, foe, sure } = setup();
    const a = crew();
    sure(a);
    const d1 = foe(unit(0, 0, 1));
    const d2 = foe(unit(30, 0, 1000));
    const d3 = foe(unit(60, 0, 1000));
    fx.apply(d1, 'burning', { by: a });
    fx.strike(a, d1, { type: 'pierce', amount: 5 });
    expect(fx.stacks(d2, 'burning')).toBe(1);
    fx.strike(a, d2, { type: 'fire', amount: 1 });
    d2.hp = 1;
    fx.strike(a, d2, { type: 'pierce', amount: 5 });
    expect(fx.stacks(d3, 'burning')).toBe(1);
  });
});

