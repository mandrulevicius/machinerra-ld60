/**
 * Dev commands, group `junk`: the carry strip and relics worn now. Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { RELIC_IDS, isRelic, isUnique } from '../sim/junk';

export function junkCommands(play: Play) {
  const sim = play.sim;
  const jg = { group: 'junk' };
  command('junk', ([what, id]) => {
    if (what === 'give') {
      if (!isRelic(id) || isUnique(id)) return `junk give <${RELIC_IDS.filter((r) => !isUnique(r)).join('|')}>`;
      sim.junk.push(id);
    } else if (what === 'clear') sim.junk.length = 0;
    else if (what === 'strip') return `the carry strip is ${sim.stripSize}`;
    return `strip ${sim.junk.length} / ${sim.stripSize}: ${sim.junk.join(', ') || 'empty'}; worn: ${sim.crew.filter((b) => b.relic).map((b) => `${b.name} ${b.relic}`).join(', ') || 'none'}`;
  }, 'junk [give <relic>|clear|strip]: the carry strip (relics found this mission; it rides home with the haul)', { ...jg, args: () => ['give', 'clear', 'strip', ...RELIC_IDS] });
  command('relic', ([who, id]) => {
    const b = sim.crew.find((x) => x.name.toLowerCase() === (who ?? '').toLowerCase());
    if (!b) return `relic <robot: ${sim.crew.map((x) => x.name).join(', ')}> <${RELIC_IDS.join('|')}|off>`;
    if (id === 'off') sim.setRelic(b, undefined);
    else if (isRelic(id)) sim.setRelic(b, id);
    else return `no relic "${id}"`;
    return `${b.name} wears ${b.relic ?? 'nothing'}`;
  }, 'relic <robot> <relic|off>: put a relic on a robot right now (the workshop fits them for good: `workshop relic`)', { ...jg, args: () => [...sim.crew.map((x) => x.name), ...RELIC_IDS, 'off'] });
}
