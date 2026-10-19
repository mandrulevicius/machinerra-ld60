import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEMS, itemIds } from './sim/gear';
import { KINDS, itemKind, type ItemKind } from './itemkinds';

describe('item kinds', () => {
  it('every item has a kind, and every kind has a name and an icon file', () => {
    for (const id of itemIds) {
      const k = itemKind(id);
      expect(k, id).toBeTruthy();
      expect(KINDS[k as ItemKind], id).toBeTruthy();
    }
    for (const [k, v] of Object.entries(KINDS)) {
      expect(v.name, k).toBeTruthy();
      expect(existsSync(join(__dirname, '..', 'public', 'icons', `${v.icon}.svg`)), `${k}: public/icons/${v.icon}.svg`).toBe(true);
    }
  });
  it('a weapon is a weapon, a worn piece its slot', () => {
    expect(itemKind('shovel')).toBe('weapon');
    expect(itemKind('kettleHelm')).toBe('head');
    expect(itemKind('tankTreads')).toBe('mobility');
    expect(ITEMS.tankTreads.bot).toBe('mobility');
  });
  it('every kind is used by some item', () => {
    const used = new Set(itemIds.map(itemKind));
    for (const k of Object.keys(KINDS)) expect(used.has(k as ItemKind), k).toBe(true);
  });
});
