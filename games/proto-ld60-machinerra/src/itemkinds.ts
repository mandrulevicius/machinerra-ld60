/**
 * What kind of thing an item is, for the badge on its tile in the inventory (`inventory.ts`): a weapon, or the body slot it
 * goes in. A bot's arms and back are the arm and pack kinds, its mobility its own (a tread is not a leg). The icon files
 * are placeholders from `npm run icons` (`public/icons/`, credit in its `CREDITS.md`); `itemkinds.test.ts` fails for an item
 * with no kind or a kind with no file. A new slot or item shape needs its kind here.
 */
import { ITEMS, type BotSlot, type CommSlot, type ItemDef, type ItemId } from './sim/gear';

export type ItemKind = 'weapon' | 'mod' | Exclude<CommSlot, 'primary' | 'secondary'> | 'mobility';

/** Each kind's name (the badge's tooltip) and icon file (without `.svg`). */
export const KINDS: Record<ItemKind, { name: string; icon: string }> = {
  weapon: { name: 'Weapon', icon: 'crossed-swords' },
  mod: { name: 'Weapon mod (fits a lug)', icon: 'cog' },
  head: { name: 'Head', icon: 'robot-helmet' },
  arm: { name: 'Arm', icon: 'mechanical-arm' },
  core: { name: 'Core', icon: 'chest-armor' },
  legs: { name: 'Legs', icon: 'boots' },
  rear: { name: 'Rear', icon: 'rocket-thruster' },
  pack: { name: 'Pack', icon: 'backpack' },
  mobility: { name: 'Mobility', icon: 'tank-tread' },
};

const BOT_KIND: Record<BotSlot, ItemKind> = { head: 'head', arms: 'arm', back: 'pack', mobility: 'mobility' };

/** The kind of an item: its weapon, a mod (the lug badge, P57), else its body slot, else its bot socket. */
export function kindOf(d: ItemDef): ItemKind | null {
  return d.weapon ? 'weapon' : d.mod ? 'mod' : d.comm ?? (d.bot ? BOT_KIND[d.bot] : null);
}
export const itemKind = (id: ItemId) => kindOf(ITEMS[id]);
