import { describe, expect, it, beforeEach } from 'vitest';
import { _resetTunes, tune, setTune, exportTunes, applyTunes, onAnyTune, tunesFromQuery, tunesQuery } from './tune';

describe('tune', () => {
  beforeEach(() => _resetTunes());

  it('gives live values by kind and reflects changes', () => {
    const t = tune(null as never, { speed: [200, 50, 600], dash: true, mode: ['orbit', 'chase'] });
    expect([t.speed, t.dash, t.mode]).toEqual([200, true, 'orbit']);
    const seen: string[] = [];
    onAnyTune((k) => seen.push(k));
    setTune('speed', 9999);
    setTune('dash', '0');
    setTune('mode', 'chase');
    expect([t.speed, t.dash, t.mode, seen]).toEqual([600, false, 'chase', ['speed', 'dash', 'mode']]);
    expect(setTune('mode', 'nope')).toBe(false);
    expect(setTune('speed', 'abc')).toBe(false);
    expect(t.mode).toBe('chase');
    expect(exportTunes()).toEqual({ speed: 600, dash: false, mode: 'chase' });
  });

  it('URL beats game config beats default; bad URL values fall back', () => {
    _resetTunes('?t.speed=320&t.mode=bogus&scene=Play');
    applyTunes({ speed: 100, dash: false, mode: 'chase' });
    const t = tune({ speed: [200, 50, 600], dash: true, mode: ['orbit', 'chase'] });
    expect([t.speed, t.dash, t.mode]).toEqual([320, false, 'chase']);
    applyTunes({ speed: 150 }); // after registration: URL still wins
    expect(t.speed).toBe(320);
  });

  it('keeps the value when a scene registers the same name again', () => {
    tune({ speed: [200, 50, 600] });
    setTune('speed', 400);
    expect(tune({ speed: [200, 50, 600] }).speed).toBe(400);
  });

  it('takes an edited definition (hot reload); a changed value stays', () => {
    const t = tune({ speed: [200, 50, 600], mode: ['a', 'b'] });
    expect(tune({ speed: [300, 50, 900], mode: ['a', 'b'] }).speed).toBe(300);
    setTune('speed', 500);
    expect(tune({ speed: [250, 50, 900], mode: ['b', 'a'] }).speed).toBe(500);
    expect(t.mode).toBe('b');
    expect(tune({ speed: [250, 50, 400] }).speed).toBe(400);
  });

  it('round-trips through a query string', () => {
    tune({ speed: [200, 50, 600], mode: ['a,b', 'c'] });
    setTune('speed', 320);
    const q = tunesQuery('?scene=Play&t.old=1');
    expect(tunesFromQuery(q)).toEqual({ old: '1', speed: '320', mode: 'a,b' });
    expect(q).toContain('scene=Play');
  });
});
