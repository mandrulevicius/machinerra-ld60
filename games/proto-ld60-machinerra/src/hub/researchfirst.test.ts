import { beforeEach, describe, expect, it } from 'vitest';
import { Sim } from '../sim/sim';
import { hub } from './save';
import { land } from './carry';
import { freshHub, haulFrom } from './state';
import { RESEARCH, pick, prepare } from './research';
import { picksWaiting, researchCtx, researchSave } from './researchslice';

beforeEach(() => hub.reset());

/** A stage that decoded something old (level 1's mast) brings the Oracle's pick of three; docking alone brings none (Minos: one card a stage, earned). */
const stage = (insights: number) => {
  const s = new Sim(3);
  s.bots = [s.controller];
  for (let i = 0; i < insights; i++) s.addInsight(1);
  s.finish();
  return s;
};

describe('the first visit to the Oracle on a new game', () => {
  it('docking with nothing decoded brings no pick, and nothing is banked for later', () => {
    land(freshHub(), haulFrom(stage(0), 'intro:1'));
    expect(picksWaiting()).toBe(0);
    expect(researchSave.get().credit).toBe(0);
  });

  it('a new game holds no pick until a lift docks with a decode, then exactly one, of three cards', () => {
    expect(picksWaiting()).toBe(0);
    const s = stage(1);
    land(freshHub(), haulFrom(s, 'level1:1'));
    expect(researchSave.get()).toMatchObject({ owned: [], credit: 1, offer: [] });
    expect(picksWaiting()).toBe(1);
    // The church opens: it draws the offer and adds no pick, however often it is opened.
    researchSave.set(prepare(researchSave.get(), researchCtx()));
    researchSave.set(prepare(researchSave.get(), researchCtx()));
    expect(researchSave.get().credit).toBe(1);
    expect(researchSave.get().offer).toHaveLength(RESEARCH.offered);
    expect(picksWaiting()).toBe(1);
    // Taking it spends it: one card owned, no second offer.
    const got = pick(researchSave.get(), researchSave.get().offer[0], researchCtx());
    researchSave.set(got.r);
    expect(researchSave.get()).toMatchObject({ credit: 0, offer: [] });
    expect(researchSave.get().owned).toHaveLength(1);
    expect(picksWaiting()).toBe(0);
  });

  it('several insights in one stage are still one pick', () => {
    land(freshHub(), haulFrom(stage(4), 'desert:1'));
    expect(picksWaiting()).toBe(1);
  });

  it('skipping the church keeps the pick but a later stage adds no second one; a dry stage adds none', () => {
    land(freshHub(), haulFrom(stage(1), 'level1:1'));
    expect(picksWaiting()).toBe(1);
    // A second lift docks with the church never opened: still the one pick.
    land(hub.get(), haulFrom(stage(2), 'h2'));
    expect(picksWaiting()).toBe(1);
    land(hub.get(), haulFrom(stage(0), 'h3'));
    expect(picksWaiting()).toBe(1);
    // The same docking again changes nothing.
    land(hub.get(), haulFrom(stage(1), 'h2'));
    expect(picksWaiting()).toBe(1);
    // Opening the church then adds none.
    researchSave.set(prepare(researchSave.get(), researchCtx()));
    expect(picksWaiting()).toBe(1);
    // Spent, the next stage that decodes brings the next.
    researchSave.set(pick(researchSave.get(), researchSave.get().offer[0], researchCtx()).r);
    expect(picksWaiting()).toBe(0);
    land(hub.get(), haulFrom(stage(1), 'h4'));
    expect(picksWaiting()).toBe(1);
  });
});
