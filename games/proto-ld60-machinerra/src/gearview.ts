/**
 * What he wears and holds, as it changes in a mission: the inventory's gear going on (`wear`: the Sim takes its slots and
 * sources, `host.dressComm()` dresses the bodies), and a weapon found (`Sim.give` raises `found`): `found` turns it into an item in the
 * inventory at once, in the hand slot it took when one was free (`syncWeapons`: a Standard item for every weapon owned),
 * like a boss's weapon from a dungeon (`DungeonLink.surface`). With both slots full it is only in the inventory, to equip
 * there. The saved gear holds it from now on.
 * Add a gear change that needs the screen's help: here.
 */
import { gear } from './hub/carry';
import { features } from './hub/story';
import { talkSave } from './hub/talkslice';
import { handsOf } from './missionstart';
import { ViewBase } from './playhost';
import { WEAPONS, type WeaponId } from './sim/defs';
import { MODS } from './sim/defs/mods';
import { ITEMS, addItem, ownedMods, syncWeapons, type Gear } from './sim/gear';
import type { SimEvent } from './sim/sim';

export class GearView extends ViewBase {
  /** Wear this gear: the Sim takes its slots and sources, and the body its pieces. */
  wear(g: Gear) {
    this.sim.setGear(g);
    this.host.dressComm();
  }

  event(e: SimEvent) {
    if (e.e === 'found') this.found(e.weapon, e.hand);
    else if (e.e === 'modFound') this.modFound(e.mod, e.x, e.y);
  }

  /** A boss's cache held a wild mod (P57): into the inventory if it is new, to be fitted aboard (the lugs are locked on the sands). */
  private modFound(id: keyof typeof MODS, x: number, y: number) {
    if (ownedMods(gear.get()).includes(id)) return;
    const g = addItem(gear.get(), id).gear;
    gear.set(g);
    this.wear(g);
    this.host.inv.refresh();
    this.host.hud.banner(`${MODS[id].name}: a wild mod, in your inventory (I)`, 4200);
    this.floater(x, y - 60, `${ITEMS[id].name}: fit it aboard`, '#ffd760', 4200, 18);
  }

  private found(id: WeaponId, hand: boolean) {
    const g = syncWeapons(gear.get(), handsOf(this.sim));
    gear.set(g);
    this.wear(g);
    this.host.inv.refresh();
    const c = this.sim.controller;
    if (!hand && features(talkSave.get()).has('inventory')) this.floater(c.x, c.y - 70, `${WEAPONS[id].name}: in your inventory (I)`, '#ffd760', 4200, 18);
  }
}
