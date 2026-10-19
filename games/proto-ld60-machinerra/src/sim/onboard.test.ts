import { describe, expect, it } from 'vitest';
import { HUD_IDS, Onboard, type OnboardEvent } from './onboard';
import { haulFrom } from '../hub/state';
import { Sim } from './sim';

const make = (o?: ConstructorParameters<typeof Onboard>[0]) => {
  const ev: OnboardEvent[] = [];
  return { ob: new Onboard(o, (e) => ev.push(e)), ev };
};

describe('Onboard HUD', () => {
  it('shows everything by default', () => {
    const { ob } = make();
    expect(ob.revealed).toEqual([...HUD_IDS]);
    expect(ob.saved).toBeNull();
  });

  it('starts empty, shows what the save revealed, and reveals once', () => {
    const { ob, ev } = make({ empty: true, shown: ['oil'] });
    expect(ob.revealed).toEqual(['oil']);
    expect(ob.reveal('oil')).toBe(false);
    expect(ob.reveal('clock', 'oil')).toBe(true);
    expect(ev).toEqual([{ e: 'reveal', id: 'clock' }]);
    expect(ob.saved).toEqual(['oil', 'clock']);
  });

  it('a gain reveals its slot', () => {
    const { ob } = make({ empty: true });
    ob.gain('scrap');
    ob.gain('part');
    expect(ob.revealed).toEqual(['scrap', 'parts']);
  });

  it('hides again (dev)', () => {
    const { ob, ev } = make();
    ob.hide('clock');
    expect(ob.shows('clock')).toBe(false);
    expect(ev).toEqual([{ e: 'unreveal', id: 'clock' }]);
  });

  it('ignores ids the save does not know', () => {
    const { ob } = make({ empty: true, shown: ['oil', 'gone' as never] });
    expect(ob.revealed).toEqual(['oil']);
  });
});

describe('Onboard cues', () => {
  it('only the first untaken cue glows; taking it passes the glow on', () => {
    const { ob, ev } = make();
    const a = ob.cue({ x: 1, y: 2, icon: 'scrapgob' });
    const b = ob.cue({ x: 3, y: 4, icon: 'gear-shovel' });
    expect(ob.glowing?.id).toBe(a);
    ob.take(a);
    ob.take(a);
    expect(ob.glowing?.id).toBe(b);
    ob.take(b);
    expect(ob.glowing).toBeUndefined();
    expect(ev.map((e) => (e.e === 'cue' ? `${e.what}${e.cue.id}` : e.e))).toEqual(['new1', 'new2', 'taken1', 'taken2']);
  });

  it('a cue placed taken is an engraving at once', () => {
    const { ob } = make();
    ob.cue({ x: 0, y: 0, icon: 'scrapgob', taken: true });
    expect(ob.glowing).toBeUndefined();
  });
});

describe('Onboard in the Sim', () => {
  it('is full by default and empty on request, and its events reach the sim', () => {
    const full = new Sim('onboard', [], 'desert');
    expect(full.onboard.shows('clock')).toBe(true);
    const bare = new Sim('onboard', [], 'desert', [], undefined, undefined, { onboard: { empty: true, shown: ['oil'] } });
    expect(bare.onboard.revealed).toEqual(['oil']);
    bare.events.length = 0;
    bare.onboard.reveal('clock');
    expect(bare.events).toEqual([{ e: 'reveal', id: 'clock' }]);
  });

  it('comes home in the haul only when the run started empty', () => {
    const full = new Sim('onboard', [], 'desert');
    expect(haulFrom(full, 'a').onboard).toBeUndefined();
    const bare = new Sim('onboard', [], 'desert', [], undefined, undefined, { onboard: { empty: true, shown: ['oil'] } });
    bare.onboard.reveal('clock');
    expect(haulFrom(bare, 'b').onboard).toEqual(['oil', 'clock']);
  });
});

describe('Onboard cued (a text hint stays quiet beside a cue for the same thing)', () => {
  it('an untaken cue near the point says it; once taken, or far, it does not', () => {
    const { ob } = make();
    const id = ob.cue({ x: 100, y: 132, icon: '', key: 'use' });
    expect(ob.cued(100, 100, 64)).toBe(true);
    expect(ob.cued(100, 400, 64)).toBe(false);
    ob.take(id);
    expect(ob.cued(100, 100, 64)).toBe(false);
  });
});
