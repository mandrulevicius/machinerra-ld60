/**
 * Dev commands, group `world`: the props (`sim/props.ts`). Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import { rng } from '../../../../harness/kit/rng';
import type { Play } from '../Play';
import { MATERIALS, PROPS, T, type Material, type PropKind } from '../sim/defs';
import { addProp, hitProp, propState } from '../sim/props';

export function worldCommands(play: Play) {
  const sim = play.sim;
  const wd = { group: 'world' };
  const near = () => [...sim.props.list].filter((p) => !p.broken).sort((a, b) => Math.hypot(a.x - sim.controller.x, a.y - sim.controller.y) - Math.hypot(b.x - sim.controller.x, b.y - sim.controller.y))[0];
  const line = (p: ReturnType<typeof near>) => (p ? `${p.kind} (${p.material}) ${Math.round(p.hp)}/${p.maxHp} ${propState(p)}${p.primed !== undefined ? ` primed ${p.primed.toFixed(1)}s` : ''} at tile ${p.tx},${p.ty}` : 'no prop');
  command('prop', ([what, a, b, ...rest]) => {
    const c = sim.controller;
    switch (what) {
      case 'spawn': {
        const kind = a as PropKind;
        if (!(kind in PROPS)) return `error: a prop is one of ${Object.keys(PROPS).join(', ')}`;
        const mat = b as Material | undefined;
        if (mat && !(mat in MATERIALS)) return `error: a material is one of ${Object.keys(MATERIALS).join(', ')}`;
        const at = sim.passableNear(c.x + 80, c.y);
        const p = addProp(sim, { kind, x: 0, y: 0, wear: 1, ...(mat && { material: mat }) }, undefined, { x: Math.floor(at.x / T) * T + T / 2, y: Math.floor(at.y / T) * T + T / 2 });
        return `a ${line(p)}`;
      }
      case 'hit': {
        const p = near();
        if (!p) return 'no prop';
        const broke = hitProp(sim, p, Number(a) || 999, { by: c });
        return `${broke ? 'down: ' : ''}${line(p)}`;
      }
      case 'hp': {
        const p = near();
        if (!p) return 'no prop';
        const n = Number(a);
        if (!(n > 0)) return 'error: prop hp <health, or a share like 0.4 of its maximum>';
        p.hp = n <= 1 ? Math.max(1, Math.round(p.maxHp * n)) : Math.min(n, p.maxHp);
        return line(p);
      }
      case 'scatter': {
        // A stress land (P51): n props of one kind on free tiles across the whole land, a share already rubble. Quiet: no break events.
        const n = Number(a) || 1000, kind = (b as PropKind | undefined) ?? 'wall', rubble = Number(rest[0] ?? 0.12);
        if (!(kind in PROPS)) return `error: a prop is one of ${Object.keys(PROPS).join(', ')}`;
        const R = rng(`scatter-${kind}-${sim.props.list.length}`), reach = Number(rest[1]) || 0;
        let made = 0;
        for (let tries = 0; made < n && tries < n * 6; tries++) {
          const tx = reach ? Math.max(1, Math.min(sim.W - 2, Math.floor(c.x / T) + R.int(-reach, reach))) : R.int(1, sim.W - 2);
          const ty = reach ? Math.max(1, Math.min(sim.H - 2, Math.floor(c.y / T) + R.int(-reach, reach))) : R.int(1, sim.H - 2);
          const x = tx * T + T / 2, y = ty * T + T / 2;
          if (sim.blocked(x, y) || sim.props.at.has(ty * sim.W + tx) || Math.hypot(x - c.x, y - c.y) < 3 * T) continue;
          const p = addProp(sim, { kind, x: 0, y: 0, wear: R.chance(0.3) ? 0.4 : 1 }, undefined, { x, y });
          if (R.chance(rubble)) {
            sim.props.solid[ty * sim.W + tx] = 0;
            sim.props.at.delete(ty * sim.W + tx);
            Object.assign(p, { solid: false, broken: true, hp: 0 });
          }
          made++;
        }
        return `${made} ${kind} put across the land (${sim.props.list.length} props in all)`;
      }
      case 'break': {
        const r = (Number(a) || 6) * T;
        let n = 0;
        for (const p of [...sim.props.list]) if (!p.broken && p.primed === undefined && Math.hypot(p.x - c.x, p.y - c.y) <= r) n += hitProp(sim, p, p.hp + 1, { by: c }) ? 1 : 0;
        return `${n} broken within ${r / T} tiles`;
      }
      default:
        return `${sim.props.list.filter((p) => !p.broken).length} props standing, ${sim.props.list.filter((p) => p.broken).length} rubble, ${sim.props.zones.length} zones; nearest: ${line(near())}`;
    }
  }, 'prop [spawn <kind> [material]|scatter <n> [kind] [rubble share] [tiles round him]|hit [dmg]|hp <n>|break [tiles]]: the props. spawn puts one ahead of him; hit and hp work on the nearest standing one (hit with no number breaks it); break knocks down everything within the radius (default 6 tiles); no argument: a summary', { ...wd, args: () => ['spawn', 'scatter', 'hit', 'hp', 'break', ...Object.keys(PROPS)] });
}
