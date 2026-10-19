import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim } from '../sim/sim';
import { bank, freshEconomy } from './economy';
import { oldCrewEconomy, oldCrewRoster } from './fixtures';
import { benchRelics, fit, unfit } from './relics';
import { freshHub, haulFrom } from './state';
import { salvage, type Shop } from './workshop';

const shop = (junk: string[] = ['toaster', 'fan', 'toaster'], parts: Record<string, number> = {}): Shop => ({
  eco: oldCrewEconomy({ junk: junk as never }),
  hub: { ...freshHub(), parts },
  roster: oldCrewRoster(),
});
const relicOf = (s: Shop, uid: string) => s.roster.bots.find((b) => b.uid === uid)?.relic;

describe('fitting relics by hand at the bench (D10)', () => {
  it('fitting takes the junk out of the stock and onto the robot; the old one goes back', () => {
    const a = fit(shop(), 'r1', { junk: 1 });
    expect(relicOf(a, 'r1')).toBe('fan');
    expect(a.eco.junk).toEqual(['toaster', 'toaster']);
    const b = fit(a, 'r1', { junk: 0 });
    expect(relicOf(b, 'r1')).toBe('toaster');
    expect(b.eco.junk).toEqual(['toaster', 'fan']);
    expect(() => fit(b, 'r1', { junk: 9 })).toThrow(/no such junk/);
    expect(() => fit(b, 'nope', { junk: 0 })).toThrow(/no robot/);
  });

  it('one socket per robot: taking it off returns it, and dragging between robots swaps', () => {
    const a = fit(fit(shop(), 'r1', { junk: 0 }), 'r2', { junk: 0 }); // toaster, then fan
    expect([relicOf(a, 'r1'), relicOf(a, 'r2')]).toEqual(['toaster', 'fan']);
    const swapped = fit(a, 'r1', { bot: 'r2' });
    expect([relicOf(swapped, 'r1'), relicOf(swapped, 'r2')]).toEqual(['fan', 'toaster']);
    const moved = fit(a, 'r3', { bot: 'r1' }); // r3 was bare: r1 ends bare
    expect([relicOf(moved, 'r1'), relicOf(moved, 'r3')]).toEqual([undefined, 'toaster']);
    const off = unfit(a, 'r1');
    expect(relicOf(off, 'r1')).toBeUndefined();
    expect(off.eco.junk).toEqual(['toaster', 'toaster']);
    expect(() => unfit(off, 'r1')).toThrow(/no relic/);
  });

  it("a unique is a boss's part in the stores: fitting takes it, taking it off puts it back, and a salvaged robot returns it", () => {
    const s = shop([], { 'queens-crown': 1 });
    expect(benchRelics(s)).toEqual([{ id: 'queens-crown', part: 'queens-crown' }]);
    const a = fit(s, 'r1', { part: 'queens-crown' });
    expect(a.hub.parts['queens-crown']).toBe(0);
    expect(relicOf(a, 'r1')).toBe('queens-crown');
    expect(() => fit(a, 'r2', { part: 'queens-crown' })).toThrow(/in the stores/);
    expect(unfit(a, 'r1').hub.parts['queens-crown']).toBe(1);
    const gone = salvage(a, 'r1');
    expect(gone.hub.parts['queens-crown']).toBe(1);
    expect(gone.roster.bots.some((b) => b.uid === 'r1')).toBe(false);
    const plain = salvage(fit(shop(), 'r2', { junk: 1 }), 'r2');
    expect(plain.eco.junk).toContain('fan');
  });

});

describe('junk at home', () => {
  it("a mission's strip rides home in the haul and joins the stock once", () => {
    const sim = new Sim(3);
    sim.bots = [sim.controller];
    sim.junk = ['satnav', 'fan'];
    sim.step(1 / 30, NO_INPUT);
    const h = haulFrom(sim, 'j1');
    expect(h.junk).toEqual(['satnav', 'fan']);
    const e = bank({ ...freshEconomy(), junk: ['toaster'] }, h);
    expect(e.junk).toEqual(['toaster', 'satnav', 'fan']);
    expect(bank(e, h)).toBe(e);
    expect(haulFrom(new Sim(3), 'j2').junk).toBeUndefined();
  });

});
