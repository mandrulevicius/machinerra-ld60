/**
 * What leaving a downed robot costs against carrying it home (P5; Minos: the player must see it, so no one feels obliged to
 * carry everything back). The words the views show, from the economy's own numbers: carried home it is repaired for
 * `REPAIR.carried` scrap, left behind it comes home a wreck (its core, spec and relic with it) and is rebuilt for `REBUILD`.
 * `BotsView` shows `lyingTip` over a robot lying near him; `TeachView` adds `leavingNote` to the lift's "Ride up?".
 */
import { REPAIR } from './hub/economy';
import { REBUILD } from './hub/workshop';

/** Over a robot lying down: its name and the two costs. A wreck not yet ours (a type wreck, level 1's Bellows) costs nothing to leave: it says how to mend it. */
export const lyingTip = (name: string, wreck = false) =>
  wreck ? `${name} lies here\nPress E and stay near to mend it` : `${name} is down\nCarry home: ${REPAIR.carried.scrap} scrap · Leave it: a wreck, ${REBUILD.scrap} scrap`;

/** On the lift's ask, when `n` downed robots would be left behind (the Communicator's own, carried or on the lift, ride): empty when none. */
export const leavingNote = (n: number) =>
  n > 0 ? `Leave ${n} down: ${REBUILD.scrap} scrap${n === 1 ? '' : ' each'} to rebuild (core, spec, relic kept)\nCarry up: ${REPAIR.carried.scrap} scrap${n === 1 ? '' : ' each'} to repair` : '';
