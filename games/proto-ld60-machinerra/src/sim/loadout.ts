/**
 * What the Communicator carries from one mission to the next (a persistent slice, `hub/carry.ts`): the weapons found,
 * the one in hand and the air support calls unlocked. Plain TS; the Sim starts from it and reports it back.
 */
import { SUPPORT, SUPPORT_START, WEAPONS, type SupportId, type WeaponId } from './defs';

export interface Loadout {
  /** Every weapon found (the shovel is always there). */
  weapons: WeaponId[];
  /** The primary slot (left click), in hand when the next mission starts. */
  weapon: WeaponId;
  /** The secondary slot (right click): free until a find fills it. */
  secondary: WeaponId | null;
  /** Unlocked calls; each mission refills their charges. */
  support: SupportId[];
}

export const freshLoadout = (): Loadout => ({ weapons: ['shovel'], weapon: 'shovel', secondary: null, support: [...SUPPORT_START] });

/** Drop what this build does not know (a renamed or removed weapon or call) and keep the invariants: the shovel is owned, the weapon in hand is owned. */
export function cleanLoadout(l: Loadout): Loadout {
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);
  const weapons = [...new Set(['shovel', ...arr(l.weapons)])].filter((w): w is WeaponId => w in WEAPONS);
  const support = [...new Set([...SUPPORT_START, ...arr(l.support)])].filter((s): s is SupportId => s in SUPPORT);
  // Any weapon may be the primary with the secondary free (the inventory allows it), so a save from before the two slots
  // (the gun in hand, nothing else) simply keeps the gun in hand.
  const weapon = weapons.includes(l.weapon) ? l.weapon : 'shovel';
  const secondary = l.secondary && l.secondary !== weapon && weapons.includes(l.secondary) ? l.secondary : null;
  return { weapons, weapon, secondary, support };
}

/** The loadout a finished mission hands back: what it started with, plus what it found. */
export function loadoutFrom(m: { weapon: WeaponId; secondary?: WeaponId | null; weapons: Iterable<WeaponId>; support: Partial<Record<SupportId, number>> }): Loadout {
  const secondary = m.secondary ?? null;
  return cleanLoadout({ weapons: [...m.weapons, m.weapon, ...(secondary ? [secondary] : [])], weapon: m.weapon, secondary, support: Object.keys(m.support) as SupportId[] });
}

/**
 * Put a weapon found into a slot. The one it displaces moves to the other slot when that is free or when it held this
 * weapon (they swap). Null when it is not owned, or when the swap would leave the primary empty.
 */
export function equip(l: { weapon: WeaponId; secondary: WeaponId | null; weapons: WeaponId[] }, id: WeaponId, slot: 'primary' | 'secondary'): { weapon: WeaponId; secondary: WeaponId | null } | null {
  if (!l.weapons.includes(id)) return null;
  let { weapon, secondary } = l;
  if (slot === 'primary') {
    if (secondary === id || (!secondary && weapon !== id)) secondary = weapon;
    weapon = id;
  } else {
    if (weapon === id) {
      if (!secondary) return null;
      weapon = secondary;
    }
    secondary = id;
  }
  return { weapon, secondary };
}

export type Slot = 'primary' | 'secondary';
