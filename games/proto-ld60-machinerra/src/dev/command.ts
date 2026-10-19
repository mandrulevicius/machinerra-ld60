/**
 * Dev commands, group `command`: command mode, the zoom and the pick. Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { ZOOM, assignGroup, clampZoom, orderSelection, rejoin, selectGroup } from '../sim/command';

export function commandCommands(play: Play) {
  const sim = play.sim;
  const cm = { group: 'command' };
  command('command', ([arg]) => {
    play.cmd.toggle(arg === undefined ? undefined : arg === 'on');
    return `command mode ${play.cmd.on ? 'on' : 'off'}`;
  }, 'command [on|off]: toggle command mode (slow time, wide view, select and order with the mouse)', { ...cm, args: () => ['on', 'off'] });
  command('zoom', ([z]) => {
    if (z !== undefined) play.cmd.want = clampZoom(Number(z) || 1);
    return `zoom ${play.cmd.zoom.toFixed(2)} (wanted ${play.cmd.want.toFixed(2)}${play.cmd.on ? ', command mode holds it at the widest' : ''}; ${ZOOM.min} to ${ZOOM.max})`;
  }, 'zoom [x]: the player zoom, 0.6 to 1.5 (what the wheel sets; no argument: show it)', cm);
  command('pick', ([what]) => {
    const p = play.pick;
    if (what === undefined) return `picked ${[...p.ids].map((id) => sim.bot(id)?.name).join(', ') || 'nobody'}; map crew ${p.crew}`;
    if (what === 'none') p.ids = new Set();
    else if (what === 'all') p.ids = new Set(sim.crew.map((b) => b.id));
    else if (/^\d$/.test(what)) selectGroup(sim, p, Number(what));
    else p.ids = new Set(sim.crew.filter((b) => what.split(',').map((n) => n.toLowerCase()).includes(b.name.toLowerCase())).map((b) => b.id));
    return `picked ${[...p.ids].map((id) => sim.bot(id)?.name).join(', ') || 'nobody'}`;
  }, 'pick [none|all|<crew 0-3>|<name,name>]: pick robots (no argument: show who is picked); what the mouse picks in command mode', cm);
  command('order', ([a, b]) => {
    // What a right click does with the pick (P3): a whole crew goes as a crew, a part on its own.
    const r = a === 'lift' ? sim.lift : a === 'comm' ? sim.controller : a === 'ruin' ? sim.ruins.find((x) => !x.searched) : { x: Number(a), y: Number(b) };
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return 'error: order <x> <y> | lift | ruin | comm';
    const out = orderSelection(sim, play.pick, r.x, r.y, a === 'comm');
    const alone = out.alone.map((id) => sim.bot(id)?.name).join(', ');
    return out.why ?? `crews ${out.sent.join(', ') || 'none'} sent; on their own: ${alone || 'nobody'}`;
  }, 'order <x> <y>|lift|ruin|comm: order the picked robots as a right click would (a whole crew as a crew, a part on its own; comm: follow him)', { ...cm, args: () => ['lift', 'ruin', 'comm'] });
  command('rejoin', ([what]) => {
    const ids = what === 'all' ? sim.crew.map((b) => b.id) : [...play.pick.ids];
    return `${rejoin(sim, ids)} robot(s) given back to their crew's order`;
  }, "rejoin [all]: give the picked robots (or all) back to their crew's order (Shift+crew does it in play)", { ...cm, args: () => ['all'] });
  command('assign', ([n]) => {
    const moved = assignGroup(sim, play.pick, Number(n ?? 1));
    return `${moved} robot(s) to crew ${n ?? 1}`;
  }, 'assign <0-3>: put the picked robots in a crew, as Shift+number does (ends their own orders)', { ...cm, args: () => ['0', '1', '2', '3'] });
}
