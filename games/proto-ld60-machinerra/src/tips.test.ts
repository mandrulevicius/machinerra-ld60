import { describe, expect, it } from 'vitest';
import { BELL, NEST, WINCH } from './sim/defs';
import { Sim } from './sim/sim';
import { tollWords } from './sim/placebehave';
import { HUD_TIPS, botTip, foeTip, hudTip, menaceNote, nestTip, ruinTip, statusWords, winchFee, winchLine, worldTip } from './tips';

const land = () => new Sim(7, [], 'desert', [], undefined, undefined, { crew: [{ role: 'gatherer', name: 'Ladle', uid: 'r1' }] });
const plain = (t: { more: string; full?: string }) => `${t.more} ${t.full ?? ''}`.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe("the mission's tooltips", () => {
  it('a foe: name and oil first; with the full tip its traits, counters and the twisted halo\'s drain', () => {
    const s = land();
    const h = s.spawnHornet(s.controller.x + 80, s.controller.y, s.nests[0].id, true, true, 'hornet');
    const t = foeTip(s, h);
    expect(plain({ more: t.more })).toContain('Mechahornet');
    expect(plain({ more: t.more })).toContain('Elite');
    expect(plain({ more: t.more })).toContain('Twisted');
    expect(plain({ more: '', full: t.full })).toMatch(/Halo.*oil a second/);
  });

  it('a status says what it does, from its row', () => {
    expect(statusWords('burning')).toMatch(/4 fire damage a second/);
    expect(statusWords('steaming')).toMatch(/\+25% speed/);
  });

  it('the world under a point: a foe, a robot, a hive, a ruin; bare ground says nothing', () => {
    const s = land();
    const h = s.spawnHornet(s.controller.x + 300, s.controller.y, s.nests[0].id, false, false, 'hornet');
    expect(plain(worldTip(s, h.x, h.y - 14)!)).toContain('Mechahornet');
    const b = s.fielded[0];
    expect(plain(worldTip(s, b.x, b.y - 14)!)).toContain('Ladle');
    expect(plain(botTip(s, b))).toContain('Gatherer');
    const n = s.nests.find((q) => !q.place)!;
    n.awake = false;
    expect(plain(worldTip(s, n.x, n.y)!)).toMatch(/Asleep/);
    expect(worldTip(s, -500, -500)).toBeNull();
  });

  it('a sleeping hive says what wakes it, with the gatherer\'s reach', () => {
    const s = land();
    const n = s.nests.find((q) => !q.place)!;
    n.awake = false;
    expect(plain(nestTip(s, n))).toContain(`within ${NEST.wakeTiles} tiles`);
    n.awake = true;
    expect(plain(nestTip(s, n))).toMatch(/Awake/);
  });

  it('a live ruin says that decoding it wakes the nearest hive', () => {
    const s = land();
    const r = s.ruins.find((q) => q.live) ?? { ...s.ruins[0], live: true, searched: false };
    expect(plain(ruinTip(s, r))).toMatch(/wakes the nearest sleeping/);
  });

  it('the spare oil shows the winch fee when no can is left', () => {
    const s = land();
    s.scrap = 40;
    s.reserve = 0;
    expect(winchFee(s)).toEqual({ scrap: Math.floor(40 * WINCH.cost), clock: WINCH.clock });
    expect(plain(hudTip('cans', s)!)).toContain(`−${Math.floor(40 * WINCH.cost)} scrap`);
    expect(winchLine(s)).toContain(`−${WINCH.clock} s`);
    s.reserve = 99;
    expect(plain(hudTip('cans', s)!)).not.toContain('No can');
  });

  it('the dial and the bell say what they do; a toll says what it adds, from the numbers', () => {
    const s = land();
    expect(plain(hudTip('clock', s)!)).toMatch(/menace level/);
    expect(tollWords()).toBe(`Each toll: foes x${BELL.spawn}, elites x${BELL.elite}, loot x${BELL.loot}`);
    expect(menaceNote(2)).toMatch(/chain/);
    expect(menaceNote(5)).toMatch(/hunter/);
  });

  it('every HUD tip id makes a tip', () => {
    const s = land();
    for (const id of Object.keys(HUD_TIPS)) expect(hudTip(id, s)?.more, id).toBeTruthy();
    expect(hudTip('nope', s)).toBeNull();
  });
});
