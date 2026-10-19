import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEMS, craftable, itemIds } from '../sim/gear';
import { LOT_PROPS } from './layout';
import { BASICS, TEACHERS, isTaught, recipesOf, stillToTeach, teacherOf, teaching, waitingNote, type Teacher } from './taught';
import { NPCS, freshHub, isAboard, pilgrimIn, rescue } from './state';

const src = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const built = (...ids: string[]) => ({ stations: Object.fromEntries(ids.map((id, i) => [id, `slot-${i + 1}`])) });

/** Every item but the gifts (P58: the Main Brush is the Princess's) and the wild mods (P57), neither on the bench. */
const recipes = itemIds.filter((id) => craftable(id) && !ITEMS[id].gift);

describe('who teaches which recipe (D5 row 1)', () => {
  it('every recipe has one teacher: weapons Hob, Communicator body parts Gasket, robots-only pieces Sprocket, a few basics nobody', () => {
    for (const id of itemIds) {
      const d = ITEMS[id], t = teacherOf(id);
      expect(t, id).toBe(BASICS.includes(id) ? 'basics' : d.weapon || d.mod ? 'hob' : d.comm ? 'gasket' : 'sprocket');
    }
    const all = (['basics', 'hob', 'gasket', 'sprocket'] as Teacher[]).flatMap(recipesOf);
    expect(all.slice().sort()).toEqual(recipes.slice().sort()); // a gift (the Main Brush, P58) is nobody's recipe; the wild mods (P57) are found, never taught
  });

  it('the basics are real recipes and a few of each kind: the workbench is never empty on day one', () => {
    expect(BASICS.length).toBeGreaterThanOrEqual(3);
    for (const id of BASICS) expect(ITEMS[id], id).toBeDefined();
    expect(BASICS.some((id) => ITEMS[id].weapon)).toBe(true);
    expect(BASICS.some((id) => ITEMS[id].comm)).toBe(true);
    expect(BASICS.some((id) => ITEMS[id].bot && !ITEMS[id].comm)).toBe(true);
  });

  it('each teacher is a station NPC, and the catalogue stays whole', () => {
    for (const t of Object.values(TEACHERS)) expect(NPCS.find((n) => n.id === t.npc)?.station, t.npc).toBeDefined();
    expect(recipesOf('hob').length).toBeGreaterThan(5);
    expect(recipesOf('gasket').length).toBeGreaterThan(5);
    expect(recipesOf('sprocket').length).toBeGreaterThan(5);
  });
});

describe('what the workbench lists', () => {
  it('only the basics on a new game', () => {
    const s = freshHub();
    expect(itemIds.filter((id) => isTaught(s, id))).toEqual(BASICS.slice().sort((a, b) => itemIds.indexOf(a) - itemIds.indexOf(b)));
    expect(stillToTeach(s)).toEqual(['hob', 'gasket', 'sprocket']);
  });

  it("a teacher's recipes come with their station, and only theirs", () => {
    const s = built('hob');
    for (const id of recipesOf('hob')) expect(isTaught(s, id), id).toBe(true);
    for (const id of [...recipesOf('gasket'), ...recipesOf('sprocket')]) expect(isTaught(s, id), id).toBe(false);
    expect(teaching(built('gasket'), 'gasket')).toBe(true);
    expect(teaching(built('sprocket'), 'sprocket')).toBe(true);
    expect(recipes.every((id) => isTaught(built('hob', 'gasket', 'sprocket'), id))).toBe(true);
  });

  it('the dev toggle opens every recipe, with no station standing', () => {
    expect(recipes.every((id) => isTaught(freshHub(), id, true))).toBe(true);
    expect(isTaught(freshHub(), 'mainBrush', true)).toBe(false);
    expect(waitingNote(freshHub(), true)).toBe('');
  });

  it('the note names who has recipes still to teach, and goes once all do', () => {
    expect(waitingNote(freshHub())).toMatch(/Hob's forge \(weapons\).*Gasket's clinic \(body parts\).*Sprocket's workshop \(crew pieces\)/);
    expect(waitingNote(built('hob'))).not.toMatch(/Hob/);
    expect(waitingNote(built('hob', 'gasket', 'sprocket'))).toBe('');
  });
});

describe('the rescue order and their lots (P20)', () => {
  it('Sprocket, the Trader, Hob, Gasket, then the Expeditioner, the Planner, the Kicker', () => {
    expect(NPCS.filter((n) => !n.always && !n.story).map((n) => n.id)).toEqual(['sprocket', 'trader', 'hob', 'gasket', 'expeditioner', 'cityPlanner', 'kicker']);
  });

  it('each pilgrim place strands the next one not aboard, down the whole order', () => {
    const order = ['trader', 'hob', 'gasket', 'expeditioner', 'cityPlanner', 'kicker'];
    let s = { ...freshHub(), rescued: ['sprocket'] };
    for (const id of order) {
      expect(pilgrimIn(s, 'desert')).toBe(id);
      s = rescue(s, id);
    }
    expect(pilgrimIn(s, 'desert')).toBeNull();
  });

  it('every one can be rescued by the dev command and is aboard', () => {
    const s = rescue(freshHub(), 'all');
    for (const id of ['sprocket', 'trader', 'hob', 'gasket']) expect(isAboard(s, id)).toBe(true);
  });

  it("every station NPC's lot has three props, a floor and a centrepiece drawn", () => {
    const lots = src('art/lots.ts'), marks = src('art/landmarks.ts');
    for (const n of NPCS.filter((x) => x.station)) {
      expect(LOT_PROPS[n.id], n.id).toHaveLength(3);
      for (const kind of LOT_PROPS[n.id]) expect(lots, `${n.id} prop ${kind}`).toMatch(new RegExp(`^  ${kind}: \\[`, 'm'));
      expect(lots, `${n.id} floor`).toMatch(new RegExp(`^  ${n.id}\\(c, w, h\\) \\{`, 'm'));
      expect(marks, `${n.id} centrepiece`).toMatch(new RegExp(`^  ${n.id}\\(c\\) \\{`, 'm'));
    }
  });

  it('each new NPC is drawn and has a script and a plate', () => {
    const npcs = src('art/npcs.ts'), talk = src('talk.ts');
    for (const id of ['hob', 'gasket']) {
      expect(npcs, id).toContain(`'npc-${id}'`);
      expect(src('art/portraits.ts'), id).toMatch(new RegExp(`^  ${id}: \\{ paint`, 'm'));
      expect(talk, id).toMatch(new RegExp(`^  ${id}: '`, 'm'));
    }
  });
});
