import { describe, expect, it } from 'vitest';
import { freshTalk, type Talk } from './dialog';
import { journal } from './journal';
import { } from './save';
import { freshHub, type HubState } from './state';
import { freshTitles } from './titles';

const at = (quests: Record<string, number>): Talk => ({ ...freshTalk(), quests });
const withStation = (s: HubState, id: string): HubState => ({ ...s, stations: { ...s.stations, [id]: 'a' } });

describe('quest log', () => {

  it('marks steps, counts progress, and sees a met step as ready to hand in', () => {
    const s = withStation(freshHub(), 'kicker');
    const going = journal(at({ kicker: 1 }), { kicker: { step: 1, n: 1 } }, s, freshTitles()).entries.find((e) => e.id === 'kicker')!;
    expect(going.steps.map((x) => x.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
    expect(going.progress).toEqual({ have: 1, n: 2, pending: 0 });
    expect(going.ready).toBe(false);
    const met = journal(at({ kicker: 1 }), { kicker: { step: 1, n: 2 } }, s, freshTitles()).entries[0];
    expect(met).toMatchObject({ id: 'kicker', ready: true });
  });



});
