/**
 * The lessons: a hint shown the first time its moment comes (the kick when a foe is close, the swing, the secondary, a
 * ruin to search or decode, a coal seam, a place's work, the lift's second press), and once done it is learned for good (the
 * kit's `hint` with an `id`, saved per game). A lesson waits for a calm moment, not over a fight. The level teaches by
 * sight first; a prompt appears only when the moment comes. The lift's ask (`Sim.armed`, "Ride up? E") is a `hint` that lasts until
 * the second press or the seconds run out; the lift's own lesson (`advise` event) is `teach('lift', ...)`. Also the "No scrap to shoot" word.
 * Add a lesson: a `teach` call in `late`, with what ends it.
 */
import type Phaser from 'phaser';
import { hint } from '../../../harness/kit';
import { leavingNote } from './downedcost';
import { downedNear } from './sim/downed';
import { anyOrder } from './sim/command';
import { graftNear } from './sim/graft';
import { ViewBase } from './playhost';
import { RUIN_FINDS, WEAPONS } from './sim/defs';
import { BEHAVE } from './sim/placeplay';
import type { SimEvent } from './sim/sim';

export class TeachView extends ViewBase {
  private taught = new Set<string>();
  /** The armed ask (`Sim.armed`) whose hint is up. */
  private armSeen: object | null = null;

  /** A hint shown the first time its moment comes; once done it is learned for good. */
  private teach(id: string, target: Phaser.GameObjects.GameObject | { x: number; y: number }, text: string, until: () => boolean, delay = 400, anyTime = false) {
    // A lesson waits for a calm moment: not over a fight (a limb to graft does not wait: it is lying there as the fight ends or goes on).
    if (this.taught.has(id) || (this.host.fight && !anyTime)) return;
    this.taught.add(id);
    hint(this.scene, target, text, { until, delay, id, size: 18 });
  }

  late() {
    const sim = this.sim;
    const used = this.used;
    const c = sim.controller;
    const near = (r: number) => sim.hornets.some((h) => Math.hypot(h.x - c.x, h.y - c.y) < r);
    const morning1 = !!sim.land?.guided && sim.day.phase === 'morning'; // level 1 teaches the swing first and the kick when the day wakes the hive
    if (near(120) && !morning1) this.teach('kick', this.bots.get(c.id)!.spr, 'Press {kick} to kick', () => used.kicked, 1500);
    if (near(160)) this.teach('swing', this.bots.get(c.id)!.spr, `Press {fire} to ${WEAPONS[sim.weapon].kind === 'melee' ? 'swing your shovel' : 'shoot'}`, () => used.swung);
    if (sim.secondary && near(260))
      this.teach('secondary', this.bots.get(c.id)!.spr, `Press {fire2} to ${WEAPONS[sim.secondary].kind === 'melee' ? 'swing' : 'shoot'} your ${WEAPONS[sim.secondary].name.toLowerCase()}`, () => used.shotSecondary, 800);
    // Level 1: the repair (one press, stay near) and the command lesson (the Oracle names the key; the prompts follow the player's hands).
    const lying = downedNear(sim, c.x, c.y, 90);
    if (lying) this.teach('fix', this.bots.get(lying.id)?.spr ?? c, 'Press {use} and stay near to repair', () => !!sim.action || !lying.downed);
    if (sim.said.has('l1-command') && !anyOrder(sim)) {
      if (!this.host.cmd.on) this.teach('command-on', this.bots.get(c.id)!.spr, 'Press {command} to give orders', () => this.host.cmd.on || anyOrder(sim), 1500);
      else this.teach('command-order', this.bots.get(c.id)!.spr, 'Right click a ruin to send Bellows', () => anyOrder(sim) || !this.host.cmd.on, 300);
    }
    const ruin = sim.ruinNear(c.x, c.y);
    if (ruin && RUIN_FINDS[ruin.kind].pry) this.teach('pry', this.host.ruins.get(ruin.id)!, 'Press {use} to pry its contacts loose (three seconds near it), for the Princess', () => !!sim.action || (sim.stats.docks ?? 0) > 0);
    else if (ruin) this.teach(ruin.live ? 'decode' : 'ruin', this.host.ruins.get(ruin.id)!, ruin.live ? `Press {use} to decode it (six seconds near it, and loud: it wakes the ${sim.biome.talk.hives})` : 'Press {use} to search', () => !!sim.action || (ruin.live ? (sim.stats.decoded ?? 0) : sim.stats.ruins - (sim.stats.decoded ?? 0)) > 0);
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
      // Robots down that would be left behind: say what that costs against carrying them up (P5).
      const left = a.key === 'lift' ? sim.fielded.filter((b) => b.downed && !sim.onLift(b, 1.6)).length : 0;
      const note = leavingNote(left);
      hint(this.scene, at ? { x: at.x, y: at.y - 56 } : this.host.liftSpr, `${a.verb} {use}${note ? `
${note}` : ''}`, { until: () => sim.armed !== a, delay: 0 });
    }
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
