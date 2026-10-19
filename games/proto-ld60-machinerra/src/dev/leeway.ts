/**
 * Dev commands, group `leeway`: the oil reserve, the revive and D-city air support. Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { LOOT, REVIVE, SUPPORT, type SupportId } from '../sim/defs';

export function leewayCommands(play: Play) {
  const sim = play.sim;
  const lw = { group: 'leeway' };
  command('reserve', ([n]) => {
    if (n !== undefined) {
      sim.reserve = Math.max(0, Math.min(REVIVE.cap, Number(n) * LOOT.oil));
    }
    return `reserve ${(sim.reserve / LOOT.oil).toFixed(2)} cans (${Math.round(sim.reserve)} oil, at most ${REVIVE.cans} cans)`;
  }, 'reserve [cans]: set the oil reserve in cans (no argument: show it). A fall spends one can and revives in place; with less, the winch takes over', lw);
  command('revive', () => {
    const c = sim.controller;
    if (sim.god) return 'error: god mode is on';
    if (sim.downT > 0) return 'error: already down';
    c.hp = Math.min(c.hp, 1);
    sim.hurt(c, 999);
    return `${sim.downKind === 'revive' ? 'down: reviving from the reserve' : 'down: no reserve, the winch is coming'} (reserve ${(sim.reserve / LOOT.oil).toFixed(2)} cans)`;
  }, 'revive: run the Communicator out of oil now, to see the revive (a can in the reserve) or the winch (none)', lw);
  command('support', ([arg]) => {
    if (arg === 'recharge') {
      for (const id of Object.keys(sim.support) as SupportId[]) sim.support[id] = SUPPORT[id].charges;
      return `recharged: ${JSON.stringify(sim.support)}`;
    }
    if (arg !== undefined && arg !== 'call') return 'error: support [call|recharge]';
    const p = play.input.activePointer;
    const aim = play.cameras.main.getWorldPoint(p.x, p.y);
    const why = play.support.call('barrage', aim.x, aim.y);
    return why ? `error: ${why}` : `barrage called on ${Math.round(sim.strike!.x)},${Math.round(sim.strike!.y)}`;
  }, 'support [call|recharge]: call D-city air support onto the cursor (a charge is spent); recharge refills every call', { ...lw, args: () => ['call', 'recharge'] });
}
