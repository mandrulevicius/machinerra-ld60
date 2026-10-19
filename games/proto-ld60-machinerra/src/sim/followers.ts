/**
 * Who follows the Communicator and is not crew: the Princess after the knight falls, the Esteemed Ghost once freed.
 * Add a follower: push a `Follower` on `sim.followers` (see `freeGhost`); the place's `BEHAVE` entry calls it.
 */

import { dist } from './geom';
import { GHOST_TOUCH } from './missionfx';
import { say } from './oracle';
import type { Sim } from './sim';
import type { Follower } from './types';

export type FollowerEvent =
  /** A follower joined (the Princess, the Esteemed Ghost). */
  | { e: 'follow'; f: Follower };

/** The Esteemed Ghost is free (the place `ghost`): his touch from now on, and he haunts the Communicator. */
export function freeGhost(sim: Sim, x: number, y: number) {
  if (sim.ghostFreed) return;
  sim.ghostFreed = true;
  sim.engine.addSource(sim.controller, GHOST_TOUCH);
  sim.stats.ghostFreed = 1;
  const bot = sim.makeBot('repairer', 'The Esteemed Ghost', x, y, -3);
  const f: Follower = { bot, id: 'esteemedGhost', name: 'The Esteemed Ghost', ghost: true };
  sim.followers.push(f);
  sim.events.push({ e: 'follow', f });
  say(sim, 'ghost-free', 'He is free, and he has lent you his touch: your weapons remember they were once ghosts. Every hit lands now. Now the church.', 'urgent');
}

/** The knight falls in the museum's plaza and who he guarded rolls out: the Princess. She follows you to the lift. */
export function princessFreed(sim: Sim, x: number, y: number) {
  if (sim.followers.some((f) => f.id === 'princess')) return;
  const bot = sim.makeBot('gatherer', 'The Princess', x + 30, y + 10, -3);
  sim.pace(bot, 0.95);
  const f: Follower = { bot, id: 'princess', name: 'The Princess' };
  sim.followers.push(f);
  sim.events.push({ e: 'follow', f });
  say(sim, 'princess', 'Something rolled out of the knight\'s saddlebag. A vacuum cleaner in a copper skirt, a hose for a nose and her plug for a tail. She says her name is Princess and that she has been "guarded" for three hundred years. She is following you. Get her onto the lift.', 'urgent');
}

/** Followers keep near the Communicator (a ghost floats closer); they ride the lift if they reach it. */
export function followStep(sim: Sim, dt: number) {
  const c = sim.controller;
  for (const f of sim.followers) {
    const b = f.bot;
    b.moving = false;
    if (sim.phase === 'rising' || sim.phase === 'done' || c.dead) continue;
    const near = f.ghost ? 50 : 70;
    if (f.ghost) {
      // He drifts: straight over anything.
      const d = dist(b.x, b.y, c.x, c.y);
      if (d > near) {
        const k = Math.min(1, (dt * 4 * (d - near)) / d);
        b.x += (c.x - 30 - b.x) * k;
        b.y += (c.y - 20 - b.y) * k;
        b.moving = true;
      }
    } else if (dist(b.x, b.y, c.x, c.y) > near) sim.go(b, c.x, c.y, dt, near);
  }
}

/** `summary().followers`: who follows him, and whether they stand on the lift. */
export function followersSummary(sim: Sim) {
  return sim.followers.map((f) => ({ id: f.id, x: Math.round(f.bot.x), y: Math.round(f.bot.y), onLift: sim.onLift(f.bot, 1.6) }));
}
