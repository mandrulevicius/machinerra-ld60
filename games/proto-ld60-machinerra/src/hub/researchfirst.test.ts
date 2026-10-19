import { beforeEach, describe, expect, it } from 'vitest';
import { Sim } from '../sim/sim';
import { hub } from './save';
import { land } from './carry';
import { freshHub, haulFrom } from './state';
import { RESEARCH, pick, prepare } from './research';
import { picksWaiting, researchCtx, researchSave } from './researchslice';

beforeEach(() => hub.reset());

/** Level 1's lift docks on a new game: the Oracle's first research is one free pick of three, nothing more (systems.md "Old research"). */
describe('the first visit to the Oracle on a new game', () => {
  it('a new game holds no pick until a lift docks, then exactly one, of three cards', () => {
    expect(picksWaiting()).toBe(0);
    const s = new Sim(3);
    s.bots = [s.controller];
    s.finish();
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

  it('skipping the church keeps the pick, and each return adds one more', () => {
    const s = new Sim(3);
    s.bots = [s.controller];
    s.finish();
    land(freshHub(), haulFrom(s, 'level1:1'));
    expect(picksWaiting()).toBe(1);
    // A second lift docks with the church never opened: both picks wait.
    land(hub.get(), haulFrom(s, 'h2'));
    expect(picksWaiting()).toBe(2);
    // The same docking again changes nothing.
    land(hub.get(), haulFrom(s, 'h2'));
    expect(picksWaiting()).toBe(2);
    // Opening the church then adds none.
    researchSave.set(prepare(researchSave.get(), researchCtx()));
    expect(picksWaiting()).toBe(2);
  });
});
