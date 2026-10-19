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

  it('skips the workshop when she did not come, and is off on every other visit', () => {
    expect(guideTarget(facts({ mainStep: 2, sprocketAboard: false }))).toBe('command');
    expect(guideTarget(facts({ missions: 0 }))).toBeNull();
    expect(guideTarget(facts({ missions: 2 }))).toBeNull();
  });
});
