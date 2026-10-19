/**
 * Dev commands, group `dungeon`: a land's dungeon entrance (twist, tier, handcrafted) and, down one, the den, wall, lever and rooms. Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { T } from '../sim/defs';
import { EXIT, HANDCRAFTED, TWIST_IDS, clampTier, rollTwist, specFor, type DungeonSpec, type Twist } from '../sim/dungeon';

export function dungeonCommands(play: Play) {
  const sim = play.sim;
  command('dungeon', ([what, arg]) => {
    const spec = () => (play.down ? sim.run!.spec : sim.dungeonSpec());
    // Below, a new spec means a new dungeon: this scene starts over with it.
    const again = (over: Partial<DungeonSpec>) => play.scene.restart({ seed: play.seed, biome: play.biome, dungeon: { ...play.down!, spec: specFor(play.seed, play.biome, { ...sim.run!.spec, ...over }) } });
    const shown = () => `entrance: ${JSON.stringify(spec())}`;
    if (what === 'twist') {
      if (arg && arg !== 'roll' && arg !== 'off' && !TWIST_IDS.includes(arg as Twist)) return `twist is one of ${TWIST_IDS.join(', ')}, off or roll`;
      const twist = arg === 'off' ? null : arg === 'roll' || !arg ? undefined : (arg as Twist);
      if (play.down) return again({ twist: twist === undefined ? rollTwist(play.seed, play.biome) : twist }), 'restarting the dungeon';
      if (twist === undefined) delete sim.entrance.twist;
      else sim.entrance.twist = twist;
      return shown();
    }
    if (what === 'tier') {
      const n = Number(arg);
      if (!(n >= 1 && n <= 3)) return "tier is 1, 2 or 3 (the landing's threat tier)";
      if (play.down) return again({ tier: clampTier(n) }), 'restarting the dungeon';
      sim.tier = clampTier(n);
      return shown();
    }
    if (what === 'hand') {
      if (arg && arg !== 'off' && !HANDCRAFTED[arg]) return `handcrafted dungeons: ${Object.keys(HANDCRAFTED).join(', ')} (or off)`;
      const id = !arg || arg === 'off' ? null : arg;
      if (play.down) return again({ handcrafted: id }), 'restarting the dungeon';
      sim.entrance.handcrafted = id;
      return shown();
    }
    if (play.down) {
      const run = sim.run!;
      if (what === 'up') return play.link.climbOut(true), 'climbing out';
      if (what === 'boss' && sim.denBoss) {
        sim.controller.x = sim.denBoss.x - 140;
        sim.controller.y = sim.denBoss.y + 30;
        return `beside ${sim.dungeon!.name}'s den`;
      }
      if (what === 'clear') {
        if (sim.denBoss && !sim.denBoss.dead) sim.slay(sim.denBoss);
        const w = run.wallAt();
        sim.controller.x = w.x - w.hw - 70;
        sim.controller.y = w.y;
        return 'the den is cleared; you stand by its cracked wall';
      }
      if (what === 'wall') {
        if (arg === 'break') return run.wall === 'cracked' ? (run.breakWall(), 'the wall is open') : `the wall is ${run.wall}: only a cracked one breaks (dungeon clear)`;
        return `wall ${run.wall}, ${run.blows}/${EXIT.blows} blows`;
      }
      if (what === 'lever') return run.lever ? (run.pull(), `lever ${run.lever}`) : 'no lever room in this dungeon';
      if (what === 'noise') return sim.noise(sim.controller.x, sim.controller.y), run.twist === 'echoing' ? `a noise: ${run.echoes} echoes so far` : 'a noise, but only an Echoing dungeon carries it (dungeon twist echoing)';
      if (what === 'room') {
        const rm = run.d.rooms.find((r) => r.kind === arg);
        if (!rm) return `no ${arg ?? '?'} room here; this one has ${[...new Set(run.d.rooms.map((r) => r.kind))].join(', ')}`;
        sim.controller.x = (rm.cx + 0.5) * T;
        sim.controller.y = (rm.cy + 0.5) * T;
        return `in the ${rm.kind} room`;
      }
      return JSON.stringify(sim.summary().dungeon ?? null);
    }
    if (what === 'spec') return `${shown()} ${sim.entranceDef().title}`;
    if (!sim.places.some((p) => p.id === 'dungeon')) return `no dungeon on this land (${sim.biomeId}); \`dungeon twist|tier|hand\` still set what the next one is`;
    play.link.descend();
    return 'going down';
  }, `dungeon [down|up|boss|clear|wall [break]|lever|noise|room <kind>|twist <${TWIST_IDS.join('|')}|off|roll>|tier <1-3>|hand <id|off>|spec]: on a land, set its entrance (twist, tier, a handcrafted dungeon) or go down; down there, climb out (up), stand by the den (boss), fell its boss and stand by the cracked wall (clear), the wall's state or break it (wall), pull the lever, make a noise (collapse), stand in a room (hall, ambush, side, trap, lever, den); twist, tier and hand restart the dungeon`, { group: 'dungeon', args: () => ['down', 'up', 'boss', 'clear', 'wall', 'lever', 'noise', 'room', 'twist', 'tier', 'hand', 'spec'] });
}
