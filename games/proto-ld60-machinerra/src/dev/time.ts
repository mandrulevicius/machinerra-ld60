/**
 * Dev commands, group `time`: the mission clock. Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { clockText } from '../sim/clock';
import { BERSERK, MENACE } from '../sim/defs';

export function timeCommands(play: Play) {
  const sim = play.sim;
  const tm = { group: 'time' };
  const now = () => `${sim.day.phase} ${clockText(sim.day.hour)} (t ${Math.round(sim.dayT)}s, twist ${sim.day.twist.toFixed(2)}, menace ${sim.day.buff.toFixed(2)}${sim.boss ? ', queen alive' : ''})`;
  command('time', ([spec]) => {
    if (spec === undefined) return now();
    if (!sim.setClock(spec)) return 'error: time is morning, day, evening, boss, midnight or hh:mm (06:00 to 23:59, 00:00 to 05:00 after midnight)';
    return now();
  }, 'time [morning|day|evening|boss|midnight|hh:mm]: jump the mission clock (no argument: show it). Phase effects (hives, Oracle, queen) follow on the next step', { ...tm, args: () => ['morning', 'day', 'evening', 'boss', 'midnight'] });
  command('menace', ([n]) => {
    if (n === undefined) return `${now()}, level ${sim.day.level}, step ${sim.day.step}, packs ${sim.hunt.n}${sim.hunt.warned ? ' (one announced)' : ''}`;
    const lv = Number(n);
    if (!Number.isFinite(lv) || lv < 0) return 'error: menace [level] (0 or more)';
    sim.setClock(sim.day.at.midnight + lv * BERSERK.perLevel * sim.cfg.stepEvery);
    return `${now()}, level ${sim.day.level}`;
  }, `menace [level]: jump to the start of a menace level past midnight (no argument: show it): 2 chains the twisted dashes, 3 doubles elites, 4 gives them two traits, 5 sends a hunter pack every ${MENACE.pack.every} s, announced ${MENACE.pack.warn} s ahead`, { ...tm, args: () => ['1', '2', '3', '4', '5'] });
  command('timescale', ([x]) => {
    if (x !== undefined) play.timeScale = Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 1;
    return `timescale ${play.timeScale}`;
  }, 'timescale [x]: run the mission clock and everything with it x times as fast (1 = normal, 0 = paused)', tm);
}
