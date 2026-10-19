import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTRIES, PARTS, PLAIN, STATIONS, did, dueNow, entriesFor, freshGuide, hubEntries, offered, type Cue, type GuideEntry } from './guide';
import { STATIONS as DECK_STATIONS } from './hub/layout';
import { NPCS } from './hub/state';

const src = (f: string) => readFileSync(join(__dirname, f), 'utf8');
/** The `data-k` / `data-g` names a source puts in its markup. */
const marks = (text: string, attr: 'k' | 'g') => [...new Set([...text.matchAll(new RegExp(`data-${attr}="(\\w+)"`, 'g'))].map((m) => m[1]))];
const covered = (attr: 'k' | 'g') => new Set(ENTRIES.flatMap((e) => ('dom' in e.at ? e.at.dom : [])).flatMap((s) => [...s.matchAll(new RegExp(`data-${attr}="(\\w+)"`, 'g'))].map((m) => m[1])));

describe('the guide covers the UI', () => {
  it('every piece of the mission HUD has an entry (or is part of one, or is not for explaining)', () => {
    const have = covered('k');
    const missing = marks(src('hud.ts'), 'k').filter((m) => !have.has(m) && !PARTS[m] && !PLAIN.includes(m));
    expect(missing).toEqual([]);
  });

  it('every piece of the hub HUD has an entry', () => {
    const have = covered('k');
    const panels = src('hub/panels.ts');
    const hud = panels.slice(panels.indexOf('class HubHud'), panels.indexOf('this.q = ', panels.indexOf('class HubHud')));
    const missing = marks(hud, 'k').filter((m) => !have.has(m) && !PARTS[m] && !PLAIN.includes(m));
    expect(missing).toEqual([]);
  });

  it('every store figure in the hub has an entry', () => {
    const have = covered('g');
    expect(marks(src('hub/panels.ts'), 'g').filter((m) => !have.has(m))).toEqual([]);
  });

  it('every part and plain name is a real element of a HUD, and every part points at an entry', () => {
    const all = new Set([...marks(src('hud.ts'), 'k'), ...marks(src('hub/panels.ts'), 'k')]);
    const ids = new Set(ENTRIES.map((e) => e.id));
    const stale = [...Object.keys(PARTS), ...PLAIN].filter((m) => !all.has(m));
    expect(stale).toEqual([]);
    for (const [part, whole] of Object.entries(PARTS)) expect(ids.has(whole) || covered('k').has(whole), `${part} -> ${whole}`).toBe(true);
  });

  it('every station on the deck has an entry', () => {
    expect(STATIONS.slice().sort()).toEqual(DECK_STATIONS.map((s) => s.id).sort());
    const worlds = new Set(ENTRIES.flatMap((e) => ('world' in e.at ? [e.at.world] : [])));
    for (const s of DECK_STATIONS) expect(worlds.has(`station:${s.id}`), s.id).toBe(true);
    expect(worlds.has('npc:highPriest')).toBe(true);
  });

  it('every station an NPC builds gets an entry from its data, and only when built', () => {
    expect(hubEntries({ stations: {} })).toEqual([]);
    for (const n of NPCS.filter((x) => x.station)) {
      const e = hubEntries({ stations: { [n.id]: 'slot-1' } });
      expect(e).toHaveLength(1);
      expect(e[0].line).toContain(n.station!.name);
    }
    expect(entriesFor('hub', { stations: { kicker: 'slot-1' } }).some((e) => e.id === 'built:kicker')).toBe(true);
  });

  it('entries are well formed: unique ids, a line, an anchor, and key prompts only for bound actions', () => {
    const ids = ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const actions = new Set(Array.from(src('main.ts').matchAll(/^\s{4}(\w+): \[/gm), (m) => m[1]));
    for (const e of ENTRIES) {
      expect(e.line.length, e.id).toBeGreaterThan(10);
      expect('dom' in e.at ? e.at.dom.length : e.at.world, e.id).toBeTruthy();
      for (const m of e.line.matchAll(/\{(\w+)\}/g)) expect(actions.has(m[1]), `${e.id} {${m[1]}}`).toBe(true);
    }
  });
});

describe('the unprompted cues', () => {
  const cue = (over: Partial<Cue> = {}): Cue => ({ where: 'mission', missions: 0, junk: 0, stripSize: 6, ...over });
  const mission = entriesFor('mission');
  const next = (c: Cue, used: string[] = [], seen: string[] = [], hints = true) => dueNow(mission, c, { hints, seen, used })?.id ?? null;

  it('spare cans: not used by the third mission', () => {
    const seen = ['command']; // the other cue, answered
    expect(next(cue({ missions: 1 }), [], seen)).toBe(null);
    expect(next(cue({ missions: 2 }), [], seen)).toBe('reserve');
    expect(next(cue({ missions: 2 }), ['cans'], seen)).toBe(null);
  });

  it('command mode: not opened by the second mission', () => {
    expect(next(cue({ missions: 0 }))).toBe(null);
    expect(next(cue({ missions: 1 }))).toBe('command');
    expect(next(cue({ missions: 1 }), ['command'])).toBe(null);
  });

  it('a full carry strip', () => {
    expect(next(cue({ junk: 5 }))).toBe(null);
    expect(next(cue({ junk: 6 }))).toBe('junk');
    expect(next(cue({ junk: 9, stripSize: 8 }))).toBe('junk');
    expect(next(cue({ junk: 0, stripSize: 0 }))).toBe(null);
  });

  it('research waiting at the church (P16)', () => {
    const hub = entriesFor('hub');
    const due = (research?: number) => dueNow(hub, { ...cue({ where: 'hub' }), research }, freshGuide())?.id ?? null;
    expect(due()).toBe(null);
    expect(due(0)).toBe(null);
    expect(due(1)).toBe('research');
    expect(dueNow(mission, { ...cue(), research: 1 }, freshGuide())).toBe(null);
  });

  it('fires once under its condition and never again; hints off silences it', () => {
    let st = freshGuide();
    const c = cue({ junk: 6 });
    expect(dueNow(mission, c, st)?.id).toBe('junk');
    st = offered(st, 'junk');
    expect(dueNow(mission, c, st)).toBe(null);
    expect(offered(st, 'junk')).toBe(st);
    expect(dueNow(mission, c, { ...freshGuide(), hints: false })).toBe(null);
  });

  it('what the player did is kept once', () => {
    const st = did(freshGuide(), 'cans');
    expect(st.used).toEqual(['cans']);
    expect(did(st, 'cans')).toBe(st);
  });

  it('the hub offers nothing unprompted (no entry there has a condition yet)', () => {
    const hub: GuideEntry[] = entriesFor('hub', { stations: {} });
    expect(dueNow(hub, cue({ where: 'hub', missions: 9, junk: 6 }), freshGuide())).toBe(null);
  });
});
