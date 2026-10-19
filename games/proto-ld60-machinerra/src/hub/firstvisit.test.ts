import { describe, expect, it } from 'vitest';
import { guideTarget, type GuideFacts } from './firstvisit';

const facts = (o: Partial<GuideFacts> = {}): GuideFacts => ({ missions: 1, mainStep: 0, picks: 0, sprocketAboard: true, sprocketTaught: false, tableSeen: false, ...o });

describe('the first hub visit: one place glows at a time', () => {
  it('goes church, workshop, course table, lift', () => {
    expect(guideTarget(facts())).toBe('highPriest'); // she has not spoken yet
    expect(guideTarget(facts({ mainStep: 2, picks: 2 }))).toBe('highPriest'); // heard, but the research picks wait
    expect(guideTarget(facts({ mainStep: 2 }))).toBe('sprocket');
    expect(guideTarget(facts({ mainStep: 2, sprocketTaught: true }))).toBe('command');
    expect(guideTarget(facts({ mainStep: 2, sprocketTaught: true, tableSeen: true }))).toBe('lift');
  });

  it('the first arrival, after the intro (she is not aboard yet), runs the church, the table and the lift', () => {
    const intro = { sprocketAboard: false, mainStep: 0 };
    expect(guideTarget(facts(intro))).toBe('highPriest');
    expect(guideTarget(facts({ ...intro, mainStep: 2 }))).toBe('command');
    expect(guideTarget(facts({ ...intro, mainStep: 2, tableSeen: true }))).toBe('lift');
    expect(guideTarget(facts({ missions: 0 }))).toBeNull();
  });

  it('the first arrival after she is aboard glows her workshop until her lesson is taken or the lift lowers', () => {
    const after = { missions: 2, mainStep: 2, tableSeen: false };
    expect(guideTarget(facts(after))).toBe('sprocket');
    expect(guideTarget(facts({ ...after, sprocketTaught: true }))).toBeNull();
    expect(guideTarget(facts({ ...after, workshopSeen: true }))).toBeNull(); // a later visit: the lift lowered with her aboard
    expect(guideTarget(facts({ ...after, sprocketAboard: false }))).toBeNull();
  });
});
