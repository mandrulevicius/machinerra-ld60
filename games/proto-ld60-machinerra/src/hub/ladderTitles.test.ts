/** The mastery ladders' own titles (P38 follow-up, Minos: "different titles for completing those"). */
import { describe, expect, it } from 'vitest';
import { JUNK } from '../sim/junk';
import { NO_INPUT, Sim } from '../sim/sim';
import { freshEconomy } from './economy';
import { LINES } from './lines';
import { junkPrice, sellJunk } from './relics';
import { STATION_COSTS, freshHub, stationCost } from './state';
import { STORY_LINES } from './storylines';
import { TITLES, earn, freshTitles } from './titles';

const NEW = { kicker: 'heelOfFiveLands', expeditioner: 'pageTurner', trader: 'haggler', cityPlanner: 'signedInTriplicate' } as const;

describe('each ladder ends with a title of its own, the story lines keep theirs', () => {
  it('the four ladders grant the new titles, not the story title', () => {
    for (const [npc, id] of Object.entries(NEW)) {
      expect(LINES[npc].kind, npc).toBeUndefined(); // the ladder, not the story
      expect(LINES[npc].grants, npc).toBe(id);
      expect(TITLES[id], id).toBeDefined();
      expect(STORY_LINES[`${npc}.story`].grants, `${npc}.story`).not.toBe(id);
    }
    expect(STORY_LINES['kicker.story'].grants).toBe('theBoot');
    expect(STORY_LINES['expeditioner.story'].grants).toBe('farWalker');
    expect(STORY_LINES['trader.story'].grants).toBe('valuedCustomer');
    expect(STORY_LINES['cityPlanner.story'].grants).toBe('architect');
  });

  it('The Haggler: junk sells for 10% more scrap; without it the plain price', () => {
    const haggler = earn(freshTitles(), 'haggler');
    expect(junkPrice()).toBe(JUNK.sell);
    expect(junkPrice(freshTitles())).toBe(JUNK.sell);
    expect(junkPrice(haggler)).toBe(Math.round(JUNK.sell * 1.1));
    const shop = { eco: { ...freshEconomy(), junk: ['toaster' as const] }, hub: freshHub(), roster: { bots: [] } } as unknown as Parameters<typeof sellJunk>[0];
    const r = sellJunk(shop, 0, haggler);
    expect(r.scrap).toBe(junkPrice(haggler));
    expect(r.eco.scrap).toBe(freshEconomy().scrap + junkPrice(haggler));
  });

  it('Signed in Triplicate: a station costs 10% less copper', () => {
    const s = freshHub();
    expect(stationCost(s)).toBe(STATION_COSTS[0]);
    expect(stationCost(s, freshTitles())).toBe(STATION_COSTS[0]);
    expect(stationCost(s, earn(freshTitles(), 'signedInTriplicate'))).toBe(Math.round(STATION_COSTS[0] * 0.9));
  });
});

describe('the ladder titles in a mission', () => {
  const land = (titles: string[]) => {
    const s = new Sim(3, [], 'desert', ['kick'], undefined, undefined, { titles });
    s.bots = [s.controller];
    s.god = true;
    return s;
  };

  it('Heel of Five Lands (a kicked body slides 15% farther) and Page-turner (ruin wiring gives 10% more copper) are stats of the Communicator', () => {
    const none = land([]), both = land(['heelOfFiveLands', 'pageTurner']);
    expect(none.engine.stat(none.controller, 'kickSlide', 1)).toBe(1);
    expect(both.engine.stat(both.controller, 'kickSlide', 1)).toBeCloseTo(1.15);
    expect(both.engine.stat(both.controller, 'ruinCopper', 1)).toBeCloseTo(1.1);
  });

  it('the Page-turner reads it: a searched ruin pays more copper', () => {
    const copper = (titles: string[]) => {
      const s = land(titles);
      s.cfg.morningSwarm = 0;
      s.cfg.edge = 0;
      const r = s.ruins.find((x) => !x.live && x.trail === undefined)!;
      s.controller.x = r.x;
      s.controller.y = r.y + 20;
      s.step(1 / 30, { ...NO_INPUT, use: true });
      for (let i = 0; i < 90 && !r.searched; i++) s.step(1 / 30, NO_INPUT);
      expect(r.searched).toBe(true);
      return s.loot.filter((l) => l.kind === 'copper').reduce((n, l) => n + l.amt, 0) + s.copper;
    };
    expect(copper(['pageTurner'])).toBeGreaterThan(copper([]));
  });

  it('the kick reads it: a kicked swarmer flies farther with the Heel on', () => {
    // The farthest it gets from the kicker in the flight (a swarmer is soft: it may die at the end of it).
    const slide = (titles: string[]) => {
      const s = land(titles), c = s.controller;
      const h = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'swarmer');
      s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y, kick: true });
      let far = 0;
      for (let i = 0; i < 60 && !h.dead; i++) {
        s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y });
        far = Math.max(far, Math.hypot(h.x - c.x, h.y - c.y));
      }
      return far;
    };
    expect(slide(['heelOfFiveLands'])).toBeGreaterThan(slide([]));
  });
});
