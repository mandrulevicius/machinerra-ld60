/**
 * Dev commands, group `intro`: mission 1's old works (`sim/intro.ts`). `intro` alone restarts the mission there (or says where he is
 * in it); `intro go <where>` stands him at a beat, doing the earlier beats that place needs; `intro open` opens the den, `intro lift`
 * fells the boss and opens the lift; `intro opening` plays the Wanderer's opening scene. Add one: a branch here.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { INTRO_LAND, INTRO_SPOTS, type IntroSpot } from '../sim/intro';

export function introCommands(play: Play) {
  const sim = play.sim;
  command('intro', ([what, arg]) => {
    const run = sim.intro;
    if (what === 'opening') return play.scene.start('Opening', { force: true }), 'the opening';
    if (!run || what === 'restart') return play.scene.restart({ land: INTRO_LAND }), 'restarting in the old works';
    if (!what) return `intro: ${JSON.stringify(run.summary())}`;
    if (what === 'go') {
      if (!INTRO_SPOTS.includes(arg as IntroSpot)) return `go where: ${INTRO_SPOTS.join(', ')}`;
      return run.go(arg as IntroSpot);
    }
    if (what === 'open') return run.unseal(), 'the den is open';
    if (what === 'lift') return run.go('lift');
    if (what === 'arm') return run.arm(), 'shovel in hand';
    return `intro [restart|go <${INTRO_SPOTS.join('|')}>|open|lift|arm|opening]`;
  }, `intro [restart|go <where>|open|lift|arm|opening]: mission 1's old works (sim/intro.ts); go: ${INTRO_SPOTS.join(', ')}`, { group: 'intro', args: () => ['restart', 'go', 'open', 'lift', 'arm', 'opening', ...INTRO_SPOTS] });
}
