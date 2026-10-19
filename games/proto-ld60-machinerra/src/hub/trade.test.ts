import { describe, expect, it } from 'vitest';
import { freshGear } from '../sim/gear';
import { buy, buyBack, freshTrade, left, sell, sellAll, shelf, type Stall } from './trade';

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
});
