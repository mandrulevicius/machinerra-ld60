/**
 * The lessons: a hint shown the first time its moment comes (the kick when a foe is close, the swing, the secondary, a
 * ruin to search or decode, a coal seam, a place's work, the lift's second press), and once done it is learned for good (the
 * kit's `hint` with an `id`, saved per game). A lesson waits for a calm moment, not over a fight (the fighting ones, `anyTime`, show with a foe close by). The level teaches by
 * sight first; a prompt appears only when the moment comes. The lift's ask (`Sim.armed`, "Ride up? E") is a `hint` that lasts until
 * the second press or the seconds run out; the lift's own lesson (`advise` event) is `teach('lift', ...)`. Also the "No scrap to shoot" word.
 * While one of its hints shows, a calm Oracle line waits (`Hud.holds`, set in the constructor).
 * Add a lesson: a `teach` call in `late`, with what ends it.
 */
import type Phaser from 'phaser';
import { hint, type Hint } from '../../../harness/kit';
import { leaving } from './downedcost';
import { downedNear } from './sim/downed';
import { anyOrder } from './sim/command';
import { graftNear } from './sim/graft';
import { ViewBase, type PlayHost } from './playhost';
import { DECODE, RUIN_FINDS, T, WEAPONS } from './sim/defs';
import { BEHAVE } from './sim/placeplay';
import type { Sim, SimEvent } from './sim/sim';

/** A loud work wakes the nearest sleeping hive (never in the morning, and only if one sleeps): the prompt says so before the press (Minos: costs at the moment of choice). */
const wakes = (sim: Sim) => (sim.day.phase !== 'morning' && sim.nests.some((n) => !n.awake && !n.dead && !n.place) ? `
It wakes the nearest ${sim.biome.talk.hive}` : '');

/** Tiles round a hint's target within which an untaken world cue counts as the same thing (a cue sits a tile below its thing; guess). */
const CUED = 2;

export class TeachView extends ViewBase {
  private taught = new Set<string>();
  /** The armed ask (`Sim.armed`) whose hint is up. */
  private armSeen: object | null = null;
  /** The fighting lesson on screen: they share a spot over his head, so one at a time (swing, then kick, then the secondary). */
  private fighting: Hint | null = null;
  /** The hints this view has made: while one shows, a calm Oracle line waits (`Hud.holds`). */
  private live: Hint[] = [];

  constructor(host: PlayHost) {
    super(host);
    host.hud.paused = () => host.map.open || host.inv.open || host.log.open || host.guide.open;
    host.hud.holds = () => host.fight || host.map.open || host.cmd.on || host.inv.open || host.log.open || host.guide.open || (this.live = this.live.filter((h) => h.state !== 'done')).some((h) => h.state === 'shown');
  }

  /** A hint shown the first time its moment comes; once done it is learned for good. */
  private teach(id: string, target: Phaser.GameObjects.GameObject | { x: number; y: number }, text: string, until: () => boolean, delay = 400, anyTime = false): Hint | null {
    // A lesson waits for a calm moment: not over a fight. The fighting lessons (swing, kick, secondary) and a limb to graft do not wait: their moment is a foe close by, and any foe on screen is a fight.
    if (this.taught.has(id) || (this.host.fight && !anyTime)) return null;
    // A world cue for the same thing (a glow or its dim wait) says it already: no text beside it (onboarding.md, one thing at a time). Not taught, so the hint may come once the cue is engraved.
    // The lessons about his own hands (swing, kick, orders) hang over him and are about no thing.
    const at = target as { x: number; y: number }; // every target the lessons name (a sprite, a ruin view, a point) has a position
    if (target !== this.bots.get(this.sim.controller.id)?.spr && this.sim.onboard.cued(at.x, at.y, CUED * T)) return null;
    this.taught.add(id);
    const h = hint(this.scene, target, text, { until, delay, id, size: 18 });
    this.live.push(h);
    return h;
  }

  late() {
    const sim = this.sim;
    const used = this.used;
    const c = sim.controller;
    const near = (r: number) => sim.hornets.some((h) => Math.hypot(h.x - c.x, h.y - c.y) < r);
    const morning1 = !!sim.land?.guided && !used.swung; // level 1 teaches the swing first, the kick once he has swung (its clock is locked to the morning: no day to wait for, `clockhold.ts`)
    const spr = this.bots.get(c.id)!.spr;
    const free = () => !this.fighting || this.fighting.state === 'done';
    const lesson = (id: string, text: string, until: () => boolean, delay?: number) => {
      if (free()) this.fighting = this.teach(id, spr, text, until, delay, true) ?? this.fighting;
    };
    // The intro's old works engrave the kick and the swing on the floor where they are first needed (`sim/intro.ts`): no floating lesson there.
    const intro = !!sim.intro;
    if (near(160) && !intro) lesson('swing', `Press {fire} to ${WEAPONS[sim.weapon].kind === 'melee' ? 'swing your shovel' : 'shoot'}`, () => used.swung);
    if (near(120) && !morning1 && !intro) lesson('kick', 'Press {kick} to kick', () => used.kicked, 1500);
    if (sim.secondary && near(260)) lesson('secondary', `Press {fire2} to ${WEAPONS[sim.secondary].kind === 'melee' ? 'swing' : 'shoot'} your ${WEAPONS[sim.secondary].name.toLowerCase()}`, () => used.shotSecondary, 800);
    // Level 1: the repair (one press, stay near) and the command lesson (the Oracle names the key; the prompts follow the player's hands).
    const lying = downedNear(sim, c.x, c.y, 90);
    if (lying) this.teach('fix', this.bots.get(lying.id)?.spr ?? c, 'Press {use} and stay near to repair', () => !!sim.action || !lying.downed);
    if (sim.said.has('l1-command') && !anyOrder(sim)) {
      if (!this.host.cmd.on) this.teach('command-on', this.bots.get(c.id)!.spr, 'Press {command} to give orders', () => this.host.cmd.on || anyOrder(sim), 1500);
      else this.teach('command-order', this.bots.get(c.id)!.spr, 'Right click a ruin to send Bellows', () => anyOrder(sim) || !this.host.cmd.on, 300);
    }
    const ruin = sim.ruinNear(c.x, c.y);
    if (ruin && RUIN_FINDS[ruin.kind].pry) this.teach('pry', this.host.ruins.get(ruin.id)!, 'Press {use} to pry its contacts loose (three seconds near it), for the Princess', () => !!sim.action || (sim.stats.docks ?? 0) > 0);
    else if (ruin) this.teach(ruin.live ? 'decode' : 'ruin', this.host.ruins.get(ruin.id)!, ruin.live ? `Press {use} to decode it (${DECODE.time} s near it)${wakes(sim)}` : 'Press {use} to search', () => !!sim.action || (ruin.live ? (sim.stats.decoded ?? 0) : sim.stats.ruins - (sim.stats.decoded ?? 0)) > 0);
    // Gasket's capstone: a limb lying beside him is grafted by holding Use (`sim/graft.ts`).
    const limb = graftNear(sim, c.x, c.y);
    if (limb) this.teach('graft', { x: limb.x, y: limb.y - 56 }, 'Hold {use} to graft it on', () => !!sim.action?.graft || !sim.grafts.includes(limb), 200, true);
    const seam = sim.seamNear(c.x, c.y);
    if (seam) this.teach('seam', { x: seam.x, y: seam.y - 56 }, 'Press {use} to mine coal by hand (slow: a gatherer is faster)', () => !!sim.action || sim.coal > 0);
    // A lift or a way down that asked: "Ride up? E" until the second press or the seconds run out.
    if (sim.armed && sim.armed !== this.armSeen) {
      const a = (this.armSeen = sim.armed);
      const hit = a.key === 'lift' ? null : sim.placeUse(c.x, c.y);
      const at = hit ? hit.use.at(sim, hit.p) : null;
      this.live.push(hint(this.scene, at ? { x: at.x, y: at.y - 56 } : this.host.liftSpr, `${a.verb} {use}`, { until: () => sim.armed !== a, delay: 0 }));
    }
    // Standing on the lift is its own prompt (Minos: it had none); the intro's waits until its gate is down.
    if (sim.atLift(c) && !sim.dungeon && (!sim.intro || sim.intro.lift)) this.teach('lift', this.host.liftSpr, 'Press {use} twice on the lift to rise', () => sim.armed?.key === 'lift' || sim.phase !== 'mission');
    // The lift's ask names every robot that would be left on the sands, alive or downed, with its cost (Minos: costs at the moment of choice; P5).
    this.hud.ask(sim.armed?.key === 'lift' ? leaving(sim) : null);
    const act = this.host.places.prompt();
    if (act) {
      const p = sim.places.find((q) => q.id === act.id)!;
      this.teach(`place-${act.id}`, { x: act.x, y: act.y - 56 }, `Press {use} to ${act.verb}`, () => !!sim.action || !!sim.armed || !BEHAVE[act.id].use!.ready(sim, p));
    }
  }

  event(e: SimEvent) {
    switch (e.e) {
      case 'noAmmo': {
        const c = this.sim.controller;
        this.sfx('click', undefined, undefined, { gain: 0.8 });
        if (!this.taught.has('noAmmo') || Math.random() < 0.15) this.floater(c.x, c.y - 56, 'No scrap to shoot', '#ffb640', 900);
        this.taught.add('noAmmo');
        break;
      }
      case 'advise':
        this.teach('lift', this.host.liftSpr, 'Press {use} twice on the lift to rise', () => this.sim.armed?.key === 'lift' || this.sim.phase !== 'mission', 4000);
        break;
    }
  }
}
