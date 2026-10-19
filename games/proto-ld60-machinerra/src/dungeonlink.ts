/**
 * The way down and back up a dungeon (`sim/dungeon.ts`). The land's Play carries the Communicator down (`descend`: the whole
 * party, what he holds, the oil he has; the land sleeps and its clock stops) into the second scene, `Dungeon`, which is this
 * same Play run on a dungeon's Sim. Down there, a climbed-out or winched-out dungeon ends the scene (`climbOut`) and wakes
 * the land with what was found (`surface`). This view also draws the dungeon's rooms at work (`dungeonview.ts`: water, traps,
 * the lever and its gate, the roof's countdown, the exit wall) and gives it the sim's `dungeon` events; the lamps and the ambient
 * light (Dark) are `LightView`'s and `BotsView`'s.
 * What goes down is `DungeonCarry`, what comes back `DungeonBack` (both `missionstart.ts`): `cleared` is true only when the player
 * killed the boss. Add something a dungeon brings back: a field of `DungeonBack`, set in `climbOut`, applied in `surface`.
 */
import Phaser from 'phaser';
import { ITEMS, addItem, syncWeapons, type ItemId } from './sim/gear';
import { DungeonView } from './dungeonview';
import { gear } from './hub/carry';
import { handsOf, type DungeonBack, type DungeonCarry } from './missionstart';
import { ViewBase, type G, type PlayHost } from './playhost';
import { PROP_CASTS, groundShadow } from './shadowview';
import type { PartKind } from './sim/defs';
import { settleReward } from './sim/dungeon';
import { wear } from './sim/graft';
import type { PartyBot, SimEvent } from './sim/sim';

export class DungeonLink extends ViewBase {
  /** Down a dungeon: its rooms' rules drawn. */
  private dview: DungeonView | null = null;

  constructor(host: PlayHost) {
    super(host);
    const { scene, sim } = host;
    if (host.down && sim.run) {
      const dv = (this.dview = new DungeonView({ scene, sim, ui: host.ui, sfx: (key, x, y, o) => this.sfx(key, x, y, o), burst: (x, y, o) => this.k.fx.burst(x, y, o), shake: (size) => this.k.juice.shake(size), floater: (x, y, text, color, ms, size) => this.floater(x, y, text, color, ms, size), banner: (text, ms) => host.hud.banner(text, ms), place: (key, x, y, scale) => host.place(key, x, y, scale), rise: () => host.rise(), shade: (img) => void (PROP_CASTS && groundShadow(host.w, img, { foot: 0.5 })) }));
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => dv.destroy());
      host.hud.banner(sim.dungeon!.title, 3200);
    }
    // Back up from a dungeon: what was found down there joins the land's mission.
    const onWake = (_sys: unknown, back?: { dungeonBack?: DungeonBack }) => back?.dungeonBack && this.surface(back.dungeonBack);
    scene.events.on(Phaser.Scenes.Events.WAKE, onWake);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.WAKE, onWake));
  }

  update(_dt: number, g: G) {
    this.dview?.update(g, this.scene.time.now);
  }

  event(e: SimEvent) {
    switch (e.e) {
      case 'dungeon':
        this.dview?.event(e);
        break;
      case 'place':
        if (e.what === 'descend') this.descend();
        break;
      case 'phase':
        // Down a dungeon the lift (or the den's exit) ends the scene, not the mission.
        if (this.host.down && !this.host.ended) {
          if (e.phase === 'done') this.climbOut(true);
          if (e.phase === 'lost') this.climbOut(false);
        }
        break;
    }
  }

  /** Down the dungeon's lift: the land sleeps (its clock stops) and the dungeon runs as its own scene, carrying what he has. */
  descend() {
    const sim = this.sim, c = sim.controller, host = this.host;
    if (this.scene.scene.isActive('Dungeon') || host.ended) return;
    host.inv.hide();
    host.log.hide();
    host.toggleMap(false);
    host.cmd.toggle(false);
    // The whole party rides down with him, wherever its crews were working (D16: no herding them to the shaft first).
    const party = sim.crew.map((b) => ({ id: b.id, role: b.role as PartyBot['role'], name: b.name, hp: b.hp, uid: b.uid, rank: b.rank, spec: b.spec, relic: b.relic, stoked: b.stoked }));
    const pil = sim.pilgrim?.state === 'follow' ? [{ id: sim.pilgrim.npc.id, name: sim.pilgrim.npc.name }] : [];
    const followers = [...pil, ...sim.followers.map((f) => ({ id: f.id, name: f.name, ...(f.ghost && { ghost: true }) }))];
    const dungeon: DungeonCarry = { spec: sim.dungeonSpec(), dayT: sim.dayT, hp: c.hp, steam: c.steam, reserve: sim.reserve, scrap: sim.scrap, card: sim.cardEarned, hands: handsOf(sim), party, followers };
    this.sfx('lift', undefined, undefined, { gain: 0.7 });
    const cam = this.scene.cameras.main;
    cam.fadeOut(400, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.scene.launch('Dungeon', { seed: `${host.land.seed}:${sim.biomeId}`, biome: sim.biomeId, dungeon });
      this.scene.scene.sleep();
    });
  }

  /** The dungeon is over (climbed out, or winched out with nothing): hand what was found back to the land and wake it. */
  climbOut(ok: boolean) {
    const host = this.host;
    host.ended = true;
    const sim = this.sim, c = sim.controller, down = host.down!;
    // A boss's weapon comes as the weapon once; with it already owned the part stays a part (the workbench's copy recipe, sim/dungeon.ts).
    const { items, parts } = ok ? settleReward(sim.parts, (id) => gear.get().items.some((i) => i.id === id)) : { items: [], parts: {} };
    const back: DungeonBack = {
      ok, hands: handsOf(sim), party: sim.party.map((b, i) => ({ id: down.party![i].id, hp: b.hp, dead: b.dead, down: !!b.downed })), lost: sim.stats.lost, copper: ok ? sim.copper : 0, parts, items, scrap: ok ? sim.scrap : down.scrap, insight: ok ? sim.insight : 0,
      hp: c.hp, steam: c.steam, reserve: sim.reserve, killed: sim.stats.killed, cleared: !!sim.run?.cleared,
    };
    const cam = this.scene.cameras.main;
    const go = () => {
      this.scene.scene.wake('Play', { dungeonBack: back });
      this.scene.scene.stop();
    };
    // A rise already faded out as the platform left the screen (`LiftView`): go on at once if the dark is full, else when it is.
    if (host.riseFaded && cam.fadeEffect.isComplete) return go();
    if (!host.riseFaded) cam.fadeOut(400, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }

  /** Up from the dungeon: its copper, parts and scrap join the mission, a boss's weapon goes into the inventory, and the way down closes once its den is cleared. */
  private surface(b: DungeonBack) {
    const sim = this.sim, c = sim.controller, host = this.host;
    sim.copper += b.copper;
    for (const [k, n] of Object.entries(b.parts) as [PartKind, number][]) if (n) sim.parts[k] = (sim.parts[k] ?? 0) + n;
    sim.stats.parts += Object.values(b.parts).reduce((a, n) => a + (n ?? 0), 0);
    sim.stats.killed += b.killed;
    sim.addInsight(b.insight);
    sim.stats.lost += b.lost;
    // Whoever followed him down comes up beside him.
    for (const f of [...(sim.pilgrim?.state === 'follow' ? [sim.pilgrim.bot] : []), ...sim.followers.map((x) => x.bot)]) {
      const at = sim.passableNear(c.x - 40, c.y + 30);
      f.x = at.x;
      f.y = at.y;
      f.path = [];
    }
    // The party climbs out with him and stands round the shaft; each crew walks back to its orders from there. One
    // destroyed below is lost up here too (its wreck falls by him).
    b.party.forEach((p, i) => {
      const bot = sim.bots.find((x) => x.id === p.id);
      if (!bot || bot.dead) return;
      const a = (i / b.party.length) * Math.PI * 2;
      const at = sim.passableNear(c.x + Math.cos(a) * 60, c.y + Math.sin(a) * 45);
      bot.x = at.x;
      bot.y = at.y;
      bot.path = [];
      bot.hp = Math.min(bot.maxHp, p.hp);
      if (p.dead) {
        bot.dead = true;
        sim.events.push({ e: 'die', on: 'bot', x: bot.x, y: bot.y, bot });
      } else if (p.down) {
        // Down below (P5): it comes up lying beside him, to be carried or fixed.
        sim.engine.down(bot);
        sim.drainFx();
      }
    });
    sim.scrap = b.scrap;
    c.hp = Math.max(1, Math.min(c.maxHp, b.hp));
    c.steam = Math.min(c.maxSteam, b.steam);
    sim.reserve = b.reserve;
    let g = gear.get();
    for (const id of b.items) if (id in ITEMS) g = addItem(g, id as ItemId).gear;
    if (b.items.length) gear.set(g);
    // What he held down there comes back in his hands (the saved gear does not know a weapon found on the sands yet).
    for (const w of b.hands.weapons) sim.weapons.add(w);
    sim.setGear(syncWeapons(gear.get(), { ...b.hands, weapons: [...sim.weapons] }));
    sim.support = { ...b.hands.support };
    sim.call = b.hands.call;
    wear(sim, b.hands.graft); // the limb he wears comes back up (one grafted below too)
    host.dressComm();
    const place = sim.places.find((p) => p.id === 'dungeon');
    if (place && b.cleared) place.state = 'cleared';
    // The dungeon's shutdown let go of the sound's listener: hear from him again.
    this.k.audio.listener = () => this.sim.controller;
    this.scene.cameras.main.fadeIn(500, 0, 0, 0);
    host.commands();
    host.hud.banner(b.ok ? `Back on ${sim.biome.talk.land}` : 'Winched out of the dark', 2600);
    if (b.items.length) this.scene.time.delayedCall(900, () => this.floater(c.x, c.y - 70, `${b.items.map((id) => ITEMS[id as ItemId]?.name ?? id).join(', ')}: in your inventory ({inventory})`.replace('{inventory}', 'I'), '#ffd760', 4200, 18));
    if (!b.ok) sim.say(`dungeon-lost-${sim.time | 0}`, 'I hauled you out of that hole by the cable. Whatever you found down there, it stayed down there.', 'warn');
  }
}
