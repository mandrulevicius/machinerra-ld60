/**
 * The management screens' glyphs: one-colour silhouettes inline in the text, filled with its colour (`currentColor`). The files in
 * `glyphs/` are game-icons.net placeholders (`npm run icons`, credit in `glyphs/CREDITS.md`): the game draws no stat, damage-type or
 * slot icons yet. Add one: drop its `.svg` here and name it in a map below.
 */
import type { CanonType, DamageType } from '../sim/effects';
import type { BotSlot, CommSlot, GearStat } from '../sim/gear';
import { KINDS } from '../itemkinds';

const raw = import.meta.glob('./glyphs/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const svgs: Record<string, string> = {};
for (const [path, svg] of Object.entries(raw)) svgs[path.slice('./glyphs/'.length, -'.svg'.length)] = svg.replace(/fill="#000"/g, 'fill="currentColor"');

/** Every glyph's name (the kit page lists them). */
export const glyphNames = () => Object.keys(svgs).sort();
export const hasGlyph = (name: string) => name in svgs;

/** Primary and secondary are both weapons: a mouse with the button that fires it lit (left, right). Drawn here, not a file. */
const mouse = (side: 'L' | 'R') =>
  `<svg viewBox="0 0 16 16"><rect x="3.5" y="1" width="9" height="14" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v6M3.5 7h9" stroke="currentColor" stroke-width="1.2"/><path d="${side === 'L' ? 'M8 1.6a4 4 0 0 0-3.9 4.3V6.6H8z' : 'M8 1.6a4 4 0 0 1 3.9 4.3V6.6H8z'}" fill="currentColor"/></svg>`;
svgs['mouse-left'] = mouse('L');
svgs['mouse-right'] = mouse('R');

/** A glyph by name, inline (`mg-g`, sized by the text it sits in; `mg-g--s` smaller). An unknown name is the cog. */
export const glyph = (name: string, cls = '') => `<span class="mg-g${cls ? ` ${cls}` : ''}" aria-hidden="true">${svgs[name] ?? svgs.cog}</span>`;

/** A stat's glyph. */
export const STAT_GLYPH: Record<GearStat, string> = {
  dmg: 'open-wound', meleeDmg: 'open-wound', rangedDmg: 'open-wound', atkSpeed: 'stopwatch', crit: 'crosshair', armour: 'bordered-shield', oil: 'oil-can',
  speed: 'running-shoe', steam: 'boiling-bubbles', steamRegen: 'boiling-bubbles', accuracy: 'crosshair', range: 'bullseye', knock: 'fist', gather: 'gears',
  repair: 'auto-repair', magnet: 'magnet', plating: 'metal-plate', parry: 'bordered-shield',
};
/** A damage type's glyph (`scald` and `rust` are the old names of steam and acid). */
export const TYPE_GLYPH: Record<CanonType, string> = { impact: 'hammer-drop', pierce: 'arrowhead', shock: 'focused-lightning', steam: 'steam', fire: 'fire', cold: 'snowflake-1', acid: 'acid', dark: 'evil-moon' };
export const typeGlyph = (t: DamageType) => TYPE_GLYPH[(t === 'scald' ? 'steam' : t === 'rust' ? 'acid' : t) as CanonType];
/** A slot's glyph: the inventory's item-kind badges (`itemkinds.ts`); a robot's arms and back read as arm and pack, the weapons as the mouse button that fires them. */
export const SLOT_GLYPH: Record<CommSlot | BotSlot, string> = {
  primary: 'mouse-left', secondary: 'mouse-right', head: KINDS.head.icon, arm: KINDS.arm.icon, arms: KINDS.arm.icon, core: KINDS.core.icon, heart: KINDS.core.icon,
  legs: KINDS.legs.icon, rear: KINDS.rear.icon, pack: KINDS.pack.icon, back: KINDS.pack.icon, mobility: KINDS.mobility.icon,
};
/** The other glyphs the screens use, by what they mean. */
export const G = {
  scrap: 'cog', coal: 'coal-pile', parts: 'gear-hammer', copper: 'two-coins', wrench: 'wrench', rebuild: 'anvil', wreck: 'broken-skull', down: 'hand-bandage',
  promote: 'light-bulb', sell: 'two-coins', salvage: 'hammer-break', hits: 'stopwatch', hit: 'open-wound', reach: 'bullseye', crew: 'gears', lug: 'cog', core: 'processor', insight: 'light-bulb',
} as const;
