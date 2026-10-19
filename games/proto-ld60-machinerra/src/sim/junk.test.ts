import { describe, expect, it } from 'vitest';
import { RELICS, RELIC_IDS, RUIN_JUNK, duplicates, isRelic, relicSource, stripSize, cleanJunk } from './junk';
import { NO_INPUT, Sim } from './sim';

const USE = { ...NO_INPUT, use: true };
const run = (s: Sim, secs: number, input = NO_INPUT) => {
  for (let i = 0; i < secs * 30; i++) {
    s.step(1 / 30, input);
    s.events.length = 0;
  }
};

describe('relic data (P19)', () => {
  it('every relic validates, has a source with its id, and says its effect and flaw', () => {
    expect(RELIC_IDS.length).toBe(22);
    for (const id of RELIC_IDS) {
      const r = RELICS[id];
      expect(r.id).toBe(id);
      expect(relicSource(id)!.id).toBe(`relic:${id}`);
      expect(r.effect.length).toBeGreaterThan(5);
      expect(r.flaw.length).toBeGreaterThan(5);
      expect(isRelic(id)).toBe(true);
    }
    expect(relicSource('nonsense')).toBeNull();
    expect(cleanJunk(['toaster', 'x', 'queens-crown', 3])).toEqual(['toaster']); // uniques are parts, never stock
  });

  it('the strip is six, two more for each Carrier; duplicates are the stock items a robot already wears', () => {
    expect(stripSize()).toBe(6);
    expect(stripSize(2)).toBe(10);
    expect(duplicates(['toaster', 'fan', 'toaster'], ['toaster', undefined])).toEqual([0, 2]);
    expect(duplicates(['fan'], [undefined])).toEqual([]);
  });
});

describe('searching a ruin finds junk (P19)', () => {
  it('a ruin gives a relic onto the carry strip, once, and the summary shows it', () => {
    // Some seeds give nothing from a ruin (the chance): search until one does.
    let got = 0;
    for (let seed = 1; seed < 20 && !got; seed++) {
      const s = new Sim(seed);
      s.bots = [s.controller];
      const ruin = s.ruins.find((r) => r.trail === undefined)!;
      s.controller.x = ruin.x;
      s.controller.y = ruin.y + 20;
      run(s, 8, USE);
      expect(ruin.searched).toBe(true);
      got = s.junk.length;
      if (got) {
        expect(RUIN_JUNK[ruin.kind]).toContain(s.junk[0]);
        expect(s.summary().found.junk).toEqual(s.junk);
      }
    }
    expect(got).toBe(1);
  });

  it('a full strip leaves the relic where it lay; a Carrier gatherer makes the strip longer', () => {
    const c = new Sim(3, [], 'desert', [], undefined, undefined, { crew: [{ role: 'gatherer', name: 'Ladle', uid: 'r1', spec: 'carrier' }] });
    expect(c.stripSize).toBe(8);
    const t = new Sim(3);
    expect(t.stripSize).toBe(6);
    t.junk = ['fan', 'fan', 'fan', 'fan', 'fan', 'fan'];
    t.bots = [t.controller];
    let kept = 0, left = 0;
    for (const ruin of t.ruins.filter((r) => r.trail === undefined)) {
      t.controller.x = ruin.x;
      t.controller.y = ruin.y + 20;
      t.step(1 / 30, NO_INPUT); // a press needs a key that was up
      for (let i = 0; i < 8 * 30; i++) {
        t.step(1 / 30, USE);
        for (const e of t.events) if (e.e === 'relic') e.kept ? kept++ : left++;
        t.events.length = 0;
      }
    }
    expect(kept).toBe(0);
    expect(left).toBeGreaterThan(0);
    expect(t.junk.length).toBe(6);
  });
});

