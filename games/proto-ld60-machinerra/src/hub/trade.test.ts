import { describe, expect, it } from 'vitest';
import { ITEMS, addItem, freshGear } from '../sim/gear';
import { buy, buyBack, freshTrade, left, sell, sellAll, shelf, slotLabel, wareName, type Stall } from './trade';

const stall = (o: Partial<Stall> = {}): Stall => ({ missions: 3, tier: 1, trade: freshTrade(), scrap: 1000, parts: {}, gear: freshGear(), valued: false, ...o });

describe('the Trader', () => {
  it('stocks parts and gear (Fine or better), the same shelf for a lift, a new one the next', () => {
    const s = shelf(3, 1);
    expect(s.filter((w) => w.kind === 'part')).toHaveLength(3);
    const items = s.filter((w) => w.kind === 'item');
    expect(items).toHaveLength(2);
    for (const w of items) expect(w.kind === 'item' && w.q).not.toBe('standard');
    expect(shelf(3, 1)).toEqual(s);
    expect(shelf(4, 1)).not.toEqual(s);
  });

  it('sells a part for scrap until the stack runs out; a new lift restocks', () => {
    const i = 0, w = shelf(3, 1)[i];
    let s = stall();
    for (let k = 0; k < w.n; k++) s = buy(s, i);
    expect(s.scrap).toBe(1000 - w.price * w.n);
    expect(w.kind === 'part' && s.parts[w.part]).toBe(w.n);
    expect(() => buy(s, i)).toThrow(/sold out/);
    expect(left(s.trade, 4, i, 1)).toBe(shelf(4, 1)[i].n);
  });

  it('buys spare parts back at half price, never a boss\'s own', () => {
    const s = sell(stall({ scrap: 0, parts: { 'hornet-stinger': 3 } }), 'hornet-stinger', 2);
    expect(s.scrap).toBe(buyBack('hornet-stinger') * 2);
    expect(s.parts['hornet-stinger']).toBe(1);
    expect(() => sell(s, 'hornet-stinger', 2)).toThrow(/you have 1/);
    expect(() => sell(stall({ parts: { 'queens-crown': 1 } }), 'queens-crown')).toThrow(/will not touch/);
  });


  it('Sell all is the whole stack at the same price a unit, and refuses an empty or a boss own stack', () => {
    const all = sellAll(stall({ scrap: 0, parts: { 'hornet-stinger': 5 } }), 'hornet-stinger');
    expect(all.scrap).toBe(buyBack('hornet-stinger') * 5);
    expect(all.parts['hornet-stinger']).toBe(0);
    expect(() => sellAll(stall(), 'hornet-stinger')).toThrow(/cannot sell 0/);
    expect(() => sellAll(stall({ parts: { 'queens-crown': 1 } }), 'queens-crown')).toThrow(/will not touch/);
  });

  it('never stocks a gift (the Main Brush, Old Earful: nobody sells those)', () => {
    for (let m = 0; m < 400; m++) for (const tier of [0, 1, 2, 3]) {
      for (const w of shelf(m, tier, true)) if (w.kind === 'item') expect(ITEMS[w.item].gift, `${w.item} at lift ${m}, tier ${tier}`).toBeUndefined();
    }
  });

  it('a mod is one of a kind: a second copy is refused', () => {
    const i = shelf(0, 0).findIndex((w) => w.kind === 'item' && !!ITEMS[w.item].mod);
    expect(i).toBeGreaterThanOrEqual(0);
    const w = shelf(0, 0)[i];
    if (w.kind !== 'item') throw new Error('item expected');
    const s = buy(stall({ missions: 0, tier: 0 }), i);
    expect(s.gear.items.some((o) => o.id === w.item)).toBe(true);
    expect(() => buy({ ...s, trade: freshTrade() }, i)).toThrow(/already have one/);
    expect(() => buy(stall({ missions: 0, tier: 0, gear: addItem(freshGear(), w.item).gear }), i)).toThrow(/already have one/);
  });

  it('labels every ware on the shelf at lifts 0-10, a weapon mod too (it has no slot and no quality)', () => {
    let mods = 0;
    for (let m = 0; m <= 10; m++) for (const tier of [0, 1, 2, 3]) for (const w of shelf(m, tier, true)) {
      if (w.kind !== 'item') continue;
      const d = ITEMS[w.item];
      expect(slotLabel(d)).toMatch(/^[a-z]/);
      expect(wareName(d, w.q)).toContain(d.name);
      if (d.mod) { mods++; expect(slotLabel(d)).toMatch(/^weapon mod \((gun|melee|any)\)$/); expect(wareName(d, w.q)).toBe(d.name); }
    }
    expect(mods).toBeGreaterThan(0);
    expect(shelf(0, 0).some((w) => w.kind === 'item' && !!ITEMS[w.item].mod)).toBe(true);
  });
});
