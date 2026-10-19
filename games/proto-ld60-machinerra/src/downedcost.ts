/**
 * What leaving a downed robot costs against carrying it home (P5; Minos: the player must see it, so no one feels obliged to
 * carry everything back). The words the views show, from the economy's own numbers: carried home it is repaired for
 * `REPAIR.carried` scrap, left behind it comes home a wreck (its core, spec and relic with it) and is rebuilt for `REBUILD`.
 * `BotsView` shows `lyingTip` over a robot lying near him; `TeachView` adds `leavingNote` to the lift's "Ride up?".
 */
import { REPAIR } from './hub/economy';
import { REBUILD } from './hub/workshop';
import type { Role } from './sim/defs';
import type { Sim } from './sim/sim';
import { rides } from './sim/use';

/** Over a robot lying down: its name and the two costs. A wreck not yet ours (a type wreck, level 1's Bellows) costs nothing to leave: it says how to mend it. */
export const lyingTip = (name: string, wreck = false) =>
  wreck ? `${name} lies here\nPress E and stay near to mend it` : `${name} is down\nCarry home: ${REPAIR.carried.scrap} scrap · Leave it: a wreck, ${REBUILD.scrap} scrap`;

/** A robot that would stay on the sands if the lift rose now: what leaving it costs (a wreck, rebuilt for `rebuild` scrap) and, if it lies downed, what carrying it up would cost instead. */
export interface Leaving { name: string; role: Role; down: boolean; rebuild: number; carry: number | null }

/** On the lift's ask (Minos: costs at the moment of choice): every robot that is out here and would not ride, alive or downed, each with its cost. A live one left behind comes home a wreck too (`hub/workshop.ts` `landRoster`). */
export function leaving(sim: Sim): Leaving[] {
  return sim.fielded.filter((b) => !rides(sim, b)).map((b) => ({ name: b.name, role: b.role, down: !!b.downed, rebuild: REBUILD.scrap, carry: b.downed ? REPAIR.carried.scrap : null }));
}
