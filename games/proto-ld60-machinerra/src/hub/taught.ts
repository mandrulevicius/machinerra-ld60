/**
 * Which workbench recipes are taught so far, plain TS (D5 row 1, answered by Minos; P20). The catalogue (`ITEMS`) stays whole;
 * the workbench lists only the recipes someone has taught:
 * - a few Old Way basics are open from the start (`BASICS`),
 * - Hob's forge teaches the weapons and the weapon mods (the wild mods have no recipe),
 * - Dr. Gasket's clinic the body parts,
 * - Sprocket's workshop the crew pieces (her offers, D42).
 * A teacher teaches once their station stands (`HubState.stations`). The dev toggle `allRecipes` (F10 Kit tab, `?t.allRecipes=1`,
 * `hub recipes open`) opens every one. Nothing is removed and no recipe changes: this only decides what is listed.
 *
 * Add an item: it is taught by its kind (`teacherOf`), no entry needed. Move one to the basics: its id in `BASICS`.
 */
import { ITEMS, craftable, itemIds, type ItemId } from '../sim/gear';
import type { HubState } from './state';

export type Teacher = 'basics' | 'hob' | 'gasket' | 'sprocket';
/** The Old Way basics, open from the start: a guess (the simplest, scrap-only ones: the spade, a wrench, a kettle helm, brass shins, a bigger hose). */
export const BASICS: ItemId[] = ['shovel', 'pipeWrench', 'kettleHelm', 'brassShins', 'deepHose'];
/** The teachers who have a station: who they are, what their station is called, and what they teach. */
export const TEACHERS: Record<Exclude<Teacher, 'basics'>, { npc: string; who: string; station: string; teaches: string }> = {
  hob: { npc: 'hob', who: 'Hob', station: 'forge', teaches: 'weapons' },
  gasket: { npc: 'gasket', who: 'Dr. Gasket', station: 'clinic', teaches: 'body parts' },
  sprocket: { npc: 'sprocket', who: 'Sprocket', station: 'workshop', teaches: 'crew pieces' },
};
export const TEACHER_IDS = Object.keys(TEACHERS) as Exclude<Teacher, 'basics'>[];

/** Who teaches an item's recipe: a weapon is Hob's, a Communicator's body part Gasket's, a piece only robots wear Sprocket's. */
export function teacherOf(id: ItemId): Teacher {
  const d = ITEMS[id];
  if (BASICS.includes(id)) return 'basics';
  if (d.weapon || d.mod) return 'hob';
  if (d.comm) return 'gasket';
  return 'sprocket';
}

/** The recipes one teacher teaches (the basics' too, as `'basics'`). */
export const recipesOf = (t: Teacher): ItemId[] => itemIds.filter((id) => teacherOf(id) === t && craftable(id) && !ITEMS[id].gift);

/** Has this teacher begun teaching: their station stands (the basics always). */
export const teaching = (s: Pick<HubState, 'stations'>, t: Teacher, all = false) => all || t === 'basics' || !!s.stations[TEACHERS[t].npc];

/** Is this recipe on the workbench. `all`: the dev toggle. */
export const isTaught = (s: Pick<HubState, 'stations'>, id: ItemId, all = false) => !ITEMS[id].gift && teaching(s, teacherOf(id), all);

/** The teachers whose station does not stand yet, as the workbench's note names them ("Hob (weapons), ..."). */
export const stillToTeach = (s: Pick<HubState, 'stations'>, all = false) => TEACHER_IDS.filter((t) => !teaching(s, t, all));

/** The workbench's note on recipes still to be taught, or '' when every teacher teaches. */
export function waitingNote(s: Pick<HubState, 'stations'>, all = false) {
  const left = stillToTeach(s, all).map((t) => TEACHERS[t]);
  if (!left.length) return '';
  return `More recipes wait for a teacher: ${left.map((t) => `${t.who}'s ${t.station} (${t.teaches})`).join(', ')}.`;
}
