import { describe, expect, it } from 'vitest';
import { resultRows, type Came } from './resultrows';

const came = (over: Partial<Came> = {}): Came => ({ scrap: 0, copper: 0, coal: 0, cores: 0, insight: 0, junk: 0, stats: {}, guests: [], thanks: 0, ...over });
const label = (c: Came) => resultRows(c).map((r) => r.label);

describe('the results rows', () => {
  it('list everything that came up the lift', () => {
    const rows = resultRows(came({ scrap: 80.6, copper: 41.2, coal: 6.9, cores: 1, insight: 1, junk: 3, thanks: 75, guests: ['The Kicker', 'The Trader'], stats: { parts: 5, saved: 3, lost: 1, left: 1, killed: 20, ruins: 4, decoded: 1, tapped: 30, winched: 1 } }));
    const by = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(by).toMatchObject({
      'Scrap brought up': 80,
      'Scrap of thanks from the colony': 75,
      'Copper stripped': 41,
      'Coal mined': 6,
      'AI cores found': 1,
      'Enemy parts': 5,
      'Old tech on the strip': 3,
      'Punch card earned': 1,
      'Robots saved': 3,
      'Robots lost': 1,
      'Left on the sands': 1,
      'Guests': 'The Kicker and The Trader',
      'Ruins searched': 3,
      'Live ruins decoded': 1,
    });
  });

  it('keep the haul and the crew when nothing happened, and drop what did not', () => {
    const l = label(came());
    expect(l).toEqual(expect.arrayContaining(['Scrap brought up', 'Enemy parts', 'Robots saved', 'Robots lost', 'Left on the sands']));
    for (const gone of ['Copper stripped', 'Coal mined', 'AI cores found', 'Punch card earned', 'Guest', 'Scrap of thanks from the colony']) expect(l).not.toContain(gone);
  });

  it('say guest for one', () => {
    expect(label(came({ guests: ['The Kicker'] }))).toContain('Guest');
  });
});
