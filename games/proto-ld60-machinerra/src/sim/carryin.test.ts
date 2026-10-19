import { describe, expect, it } from 'vitest';
import { haulFrom } from '../hub/state';
import { } from './defs';
import { Sim } from './sim';

const alone = (perks: string[] = []) => {
  const s = new Sim(3, [], 'desert', perks);
  s.bots = [s.controller];
  return s;
};


describe('what the haul carries home', () => {
  it('no oil comes home: the haul has no cans, only the charges left', () => {
    const s = alone();
    s.carryIn(3);
    s.support.barrage! -= 1;
    s.finish();
    const h = haulFrom(s, 'a');
    expect(h).not.toHaveProperty('spare');
    expect(h.charges).toEqual(s.support.barrage ? { barrage: s.support.barrage } : {});
  });

  it('copper is in the haul, and so is the scrap, insight and cores, and the places the Communicator came upon', () => {
    const s = alone();
    s.cores = 2;
    s.scrap = 14;
    s.copper = 21.8;
    s.addInsight(3); // three finds, one card (Minos: not more than one a stage)
    for (const p of s.places) p.visited = p.id === 'graveyard' || p.id === 'mast';
    s.finish();
    const h = haulFrom(s, 'a');
    expect(h).toMatchObject({ insight: 1, cores: 2, scrap: 14, copper: 21 });
    expect([...h.discovered!].sort()).toEqual(['graveyard', 'mast'].filter((id) => s.places.some((p) => p.id === id)));
  });

});


