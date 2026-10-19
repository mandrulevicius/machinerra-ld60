/**
 * Dev commands, group `places`: the authored places of a land. Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { RUIN, T } from '../sim/defs';
import { BEHAVE } from '../sim/placeplay';
import { PLACES, type PlaceId } from '../sim/places';

export const placeIds = Object.keys(PLACES) as PlaceId[];

/** Put the Communicator beside a place's thing (the case, the pilgrim, the first verse's ruin, the mast's foot; the graveyard: just outside its ring). */
export const goPlace = (play: Play, id: PlaceId) => {
const sim = play.sim;
  const pl = sim.places.find((q) => q.id === id);
  if (!pl) return `error: no ${id} in this land`;
  const at = id === 'trail' ? sim.ruins.find((r) => r.trail === 0)! : BEHAVE[id].use?.at(sim, pl) ?? pl;
  sim.controller.x = at.x;
  sim.controller.y = at.y + (id === 'trail' ? RUIN.reach * 0.5 : id === 'graveyard' ? 150 : 44);
  play.w.update();
  return `Communicator at the ${PLACES[id].name} (${Math.round(sim.controller.x)},${Math.round(sim.controller.y)})`;
};

export function placesCommands(play: Play) {
  const sim = play.sim;
  const pg = { group: 'places' };
  command('place', ([sub, id, what]) => {
    if (!sub || sub === 'list') return sim.places.map((p) => `${p.id.padEnd(9)} ${BEHAVE[p.id].status?.(sim, p) ?? p.state} at tile ${Math.floor(p.x / T)},${Math.floor(p.y / T)}, ${(Math.hypot(p.x - sim.lift.x, p.y - sim.lift.y) / T).toFixed(0)} tiles from the lift`).join('\n');
    if (!placeIds.includes(id as PlaceId)) return `error: place ${sub} <${placeIds.join('|')}>`;
    if (sub === 'tp') return goPlace(play, id as PlaceId);
    if (sub === 'open') return sim.triggerPlace(id as PlaceId) ? `${id}: done` : `error: ${id} has nothing to do now`;
    if (sub === 'do') {
      // P36: a place's own dev moves (the bell's toll, the battery's load and fire, a strike, the husks fixed...).
      const p = sim.places.find((q) => q.id === id);
      const dev = BEHAVE[id as PlaceId].dev ?? {};
      if (!p) return `error: no ${id} in this land (placeland ${id})`;
      if (!what || !dev[what]) return `place do ${id} <${Object.keys(dev).join('|') || 'nothing to do'}>`;
      return dev[what](sim, p);
    }
    return 'error: place [list|tp <id>|open <id>|do <id> <what>]';
  }, 'place [list|tp <id>|open <id>|do <id> <what>]: the authored places of this land (state and distance), go beside one, finish its timed Use action at once (open the case, free the pilgrim, climb the mast, toll the bell), or a place\'s own dev move (`place do lanes` lists them). The seed picks where; placeland <id> starts a land with one', { ...pg, args: () => ['list', 'tp', 'open', 'do', ...placeIds] });
}
