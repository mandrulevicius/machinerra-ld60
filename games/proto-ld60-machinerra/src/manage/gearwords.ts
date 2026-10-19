/**
 * What an item does, in the management screens' three levels (Minos, decisions.md "three levels of detail"): `chips` and `line`
 * on the screen (a glyph and a value per stat; one line of what is not a number), `more` in the tooltip, `full` with Alt held.
 * Everything is read from the game's data (`ITEMS`, `WEAPONS`, `SKILLS`, `MODS`), worded as the inventory's card words it
 * (`inventory.ts` `defCard`). Plain TS, no DOM: the views turn a `Chip` into markup (`manage.ts` `chipHtml`).
 */
import { WEAPONS } from '../sim/defs';
import { MODS, FITS_NAMES } from '../sim/defs/mods';
import type { DamageType } from '../sim/effects';
import { ITEMS, QUALITIES, SKILLS, STATS, TUNE_UP, scaled, type GearStat, type ItemId, type Quality, type Stats } from '../sim/gear';
import { STAT_GLYPH, G } from './glyphs';

/** One number on the screen: its glyph, its value as shown, its name (the tooltip), red when it costs. `type` makes it a damage-type disc. */
export interface Chip { glyph: string; value: string; name: string; bad?: boolean; type?: DamageType; key?: string }

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
export const statText = (k: GearStat, v: number) => `${sign(v)}${STATS[k].pts ? '' : '%'}`;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const words = (st: Stats) => (Object.entries(st) as [GearStat, number][]).map(([k, v]) => `${statText(k, v)} ${STATS[k].name.toLowerCase()}`).join(', ');

/** A weapon's numbers at a quality: its type, damage a hit, hits a second, reach (melee) or range (gun). */
export function weaponNumbers(id: ItemId, q: Quality = 'standard') {
  const w = WEAPONS[ITEMS[id].weapon!];
  const m = QUALITIES[q].mult;
  const melee = w.kind === 'melee';
  return { type: w.type, hit: Math.round(w.dmg * m), pellets: w.pellets?.n ?? 0, rate: 1 / w.rate, dist: melee ? w.reach : w.range, melee };
}

export interface Words {
  chips: Chip[];
  /** One line of what it does that is not a number ('' when nothing): a weapon's extras, every bot's share, an aura, the calm, a skill, an effect. */
  line: string;
  /** The skill's own words (the tooltip). */
  skill: string;
  /**
   * The effect worded here from its data, where the game's card shows only its flavour (the item's rule lives as an effect with no
   * words of its own). The mock's wording, kept: a guess (`guessedLines` lists them).
   */
  guess: string;
  /** Alt: everything the inventory's card says (kind, tags, how it looks, the flavour). */
  full: string[];
}

/** What an item does at a quality (tuned: Gasket's +20% on its bonuses). */
export function itemWords(id: ItemId, q: Quality = 'standard', tuned = false): Words {
  const d = ITEMS[id];
  const chips: Chip[] = [];
  const line: string[] = [];
  let guess = '';
  if (d.mod) {
    const m = MODS[d.mod];
    return { chips, line: m.text, skill: '', guess: '', full: [`Weapon mod${m.wild ? ', wild' : ''}: fits ${FITS_NAMES[m.fits].toLowerCase()}.`, d.look ? `Looks: ${d.look}` : '', d.flavour].filter(Boolean) };
  }
  if (d.weapon) {
    const w = WEAPONS[d.weapon];
    const n = weaponNumbers(id, q);
    chips.push({ glyph: '', value: cap(w.type), name: `${cap(w.type)} damage`, type: w.type, key: 'type' });
    chips.push({ glyph: G.hit, value: `${n.hit}${n.pellets ? `×${n.pellets}` : ''}`, name: n.pellets ? `Damage a rivet, ${n.pellets} rivets` : 'Damage a hit', key: 'hit' });
    chips.push({ glyph: G.hits, value: `${n.rate.toFixed(1)}/s`, name: 'Hits a second', key: 'rate' });
    chips.push({ glyph: G.reach, value: `${n.dist}`, name: n.melee ? 'Reach (px)' : 'Range (px)', key: 'dist' });
    if (w.crit) line.push(`${Math.round(w.crit * 100)}% critical${w.bounce ? ', a crit ricochets on' : ''}`);
    if (w.chain) line.push(`arcs to ${w.chain.n} more foes`);
    if (w.kind === 'gun') line.push(w.ammo === 'scrap' ? 'shoots scrap (1 a shot)' : 'spends steam');
    else if (w.knock > 400) line.push('big knockback');
  }
  for (const [k, v] of Object.entries(scaled(d.stats, q, tuned)) as [GearStat, number][]) chips.push({ glyph: STAT_GLYPH[k], value: statText(k, v), name: STATS[k].name, bad: v < 0, key: k });
  if (d.crew) line.push(`every bot ${words(scaled(d.crew, q, tuned))}`);
  if (d.aura) line.push(`allies within ${d.aura.r} px ${words(scaled(d.aura.stats, q, tuned))}`);
  if (d.calm) line.push('plain hornets leave the wearer alone');
  if (d.skill) line.push(`${SKILLS[d.skill].name}: ${SKILLS[d.skill].steam} steam${SKILLS[d.skill].key === 'skill' ? `, ${SKILLS[d.skill].cd} s` : ''}`);
  // A guess (the mock's wording): the first effect, when it is a heal or a status on a hit or a hurt, worded from its data.
  const e = d.effects?.[0] as { when: string; if?: unknown; chance?: unknown; do: unknown } | undefined;
  if (e) {
    const act = (Array.isArray(e.do) ? e.do[0] : e.do) as { do: string; amount?: number; id?: string };
    const cond = e.if as { is?: string; via?: string | string[] } | undefined;
    const via = cond && !Array.isArray(cond) && cond.is === 'via' ? ([] as string[]).concat(cond.via ?? []) : null;
    // The trigger: the hit's way in, a hurt, else the event's own name (the mock left it out there, which read ": +4 oil").
    const on = via ? `${via.join(' or ')} hits` : e.when === 'hurt' ? 'when hurt' : `on ${e.when}`;
    const chance = typeof e.chance === 'number' ? `${Math.round(e.chance * 100)}% ` : '';
    if (act.do === 'heal') guess = `${on}: +${act.amount} oil`;
    else if (act.do === 'status' && act.id) guess = `${on}: ${chance}${cap(act.id)}`;
    if (guess) line.push(guess);
  }
  if (d.needs === 'antenna') line.push('needs an antenna on you');
  const text = line.join('; ');
  const kind = d.weapon ? 'Weapon' : d.comm ? `${cap(d.comm)}, yours` : d.bot ? `${cap(d.bot)}, ${d.roles ? d.roles.join(', ') : 'any robot'}` : '';
  const full = [
    `${QUALITIES[q].name}${tuned ? `, tuned +${Math.round((TUNE_UP.mult - 1) * 100)}%` : ''}. ${kind}.`,
    d.skill ? `${SKILLS[d.skill].name}: ${SKILLS[d.skill].text}` : '',
    d.look ? `Looks: ${d.look}` : '',
    d.flavour,
  ].filter(Boolean);
  return { chips, line: cap(text), skill: d.skill ? SKILLS[d.skill].text : '', guess, full };
}

/** Items whose line holds a guessed wording (the report lists them; the kit page shows them). */
export const guessedLines = (ids: readonly ItemId[] = Object.keys(ITEMS) as ItemId[]) => ids.filter((id) => itemWords(id).guess).map((id) => ({ id, name: ITEMS[id].name, guess: itemWords(id).guess }));
