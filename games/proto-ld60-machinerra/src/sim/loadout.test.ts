import { describe, expect, it } from 'vitest';
import { cleanLoadout, equip, loadoutFrom } from './loadout';
import { Sim } from './sim';
import { ITEMS, freshGear, slotWeapons, syncWeapons } from './gear';

describe('weapon slots', () => {
  it('a find fills the free slot, and finding it twice changes nothing', () => {
    const s = new Sim(3);
    expect(s.give('steamGun')).toBe(true);
    expect([s.weapon, s.secondary]).toEqual(['shovel', 'steamGun']);
    expect(s.give('steamGun')).toBe(false);
    expect(s.weapons.has('steamGun')).toBe(true);
    expect(s.hasGun).toBe(true);
  });
  it('a find with both slots full is owned and announced, not in hand; the gear then holds it as an item and keeps the slots', () => {
    const s = new Sim(3);
    s.give('steamGun');
    s.events.length = 0;
    expect(s.give('arcGun')).toBe(true);
    expect([s.weapon, s.secondary]).toEqual(['shovel', 'steamGun']);
    expect(s.weapons.has('arcGun')).toBe(true);
    expect(s.events).toEqual([{ e: 'found', weapon: 'arcGun', hand: false }]);
    const g = syncWeapons(freshGear(), { weapons: [...s.weapons], weapon: s.weapon, secondary: s.secondary });
    expect(g.items.map((o) => ITEMS[o.id].weapon).sort()).toEqual(['arcGun', 'shovel', 'steamGun']);
    expect(slotWeapons(g)).toEqual({ weapon: 'shovel', secondary: 'steamGun' });
  });
  it('what the mission ends with, owned and slotted, comes back as the loadout', () => {
    const s = new Sim(3);
    s.give('steamGun');
    expect(loadoutFrom(s)).toMatchObject({ weapons: ['shovel', 'steamGun'], weapon: 'shovel', secondary: 'steamGun' });
  });
  it('equip puts an owned weapon in a slot and swaps with the other slot; unowned or a bare primary is refused', () => {
    const l = { weapon: 'shovel' as const, secondary: 'steamGun' as const, weapons: ['shovel', 'steamGun'] as ('shovel' | 'steamGun')[] };
    expect(equip(l, 'steamGun', 'primary')).toEqual({ weapon: 'steamGun', secondary: 'shovel' });
    expect(equip({ ...l, secondary: null }, 'steamGun', 'secondary')).toEqual({ weapon: 'shovel', secondary: 'steamGun' });
    expect(equip({ ...l, secondary: null, weapons: ['shovel'] }, 'steamGun', 'secondary')).toBeNull();
    expect(equip({ ...l, secondary: null }, 'shovel', 'secondary')).toBeNull(); // would leave the primary bare
    const s = new Sim(3);
    s.give('steamGun');
    expect(s.equip('steamGun', 'primary')).toBe(true);
    expect([s.weapon, s.secondary]).toEqual(['steamGun', 'shovel']);
  });
  it('a stored loadout is cleaned: the secondary must be owned and differ from the primary', () => {
    expect(cleanLoadout({ weapons: ['shovel'], weapon: 'shovel', secondary: 'steamGun', support: [] }).secondary).toBeNull();
    expect(cleanLoadout({ weapons: ['shovel', 'steamGun'], weapon: 'shovel', secondary: 'shovel', support: [] }).secondary).toBeNull();
  });
});
