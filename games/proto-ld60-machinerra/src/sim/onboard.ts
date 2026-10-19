/**
 * Onboarding's state (`docs/onboarding.md`, plain TS): which HUD elements the player has been shown, and the cues the world
 * draws (an icon under a thing to take, a control engraved where it is needed). `sim.onboard` is one per Sim.
 *
 * - **The HUD starts full by default.** A land or run starts empty with `SimOptions.onboard = { empty: true }` or the land
 *   file's rule `emptyHud`; then only what the save already revealed (`shown`) is up, and `reveal(id)` adds an element.
 *   A reveal raises `{ e: 'reveal' }` (the HUD gives the new element a short highlight). `haulFrom` carries the list home
 *   (`saved`; null when the run did not start empty), `hub/carry.ts` `landed` keeps it in the `onboard` slice, and
 *   `missionstart.ts` passes it back in. A gain of scrap, copper, coal, enemy parts or relics reveals its own slot (`gain`).
 * - **Cues.** `cue({ x, y, icon, key? })` returns the cue's id. `icon` is a texture key (`scrapgob`, `gear-shovel`); `key`
 *   is an input action ('use', 'kick'), drawn as the player's current binding. `wall` draws it upright, not flat on the floor.
 *   `take(id)` turns the glow into an engraving that stays. Only the first untaken cue glows (`glowing`): the rest wait.
 * `item({ id | name + icon, quality? })` shows an item gained. Dev: group `onboard` (`dev/onboard.ts`). The views are `hudreveal` in `hud.ts` and `cueview.ts`.
 */

import type { ItemId, Quality } from './gear';

/** Every HUD element that can be held back, as the HUD names them (`hud.ts` `data-hid`). */
export const HUD_IDS = [
  'face', // the portrait and name
  'oil', // the Oil bar
  'steam', // the Steam bar (still only with a gun)
  'cans', // the spare oil
  'weapon', // the weapon in hand
  'clock', // the day dial
  'scrap',
  'copper',
  'coal',
  'parts', // enemy parts
  'junk', // old tech carried
  'objective',
  'support', // D-city air support
  'roster', // the crew list
  'map', // the map button
] as const;
export type HudId = (typeof HUD_IDS)[number];

export const isHudId = (s: string): s is HudId => (HUD_IDS as readonly string[]).includes(s);

/** A resource the HUD counts, and the slot that shows it. */
export const SLOT_OF = { scrap: 'scrap', copper: 'copper', coal: 'coal', part: 'parts', core: 'parts', junk: 'junk' } as const satisfies Record<string, HudId>;

/** What a caller gives `cue`. */
export interface Cue {
  /** World px: the centre of the engraving. */
  x: number;
  y: number;
  /** A texture key. */
  icon: string;
  /** An input action drawn with the player's current binding (instead of `icon`'s picture, beside it when both are set). */
  key?: string;
  /** Upright on a wall, not flat on the floor. */
  wall?: boolean;
  /** Taken: its glow has become an engraving (`take`). */
  taken?: boolean;
}
export interface CueRT extends Cue {
  id: number;
  taken: boolean;
}

/**
 * An item gained. A gear item is its `id` (`ITEMS`): the name and the picture (`gear-<id>`) come from it. Anything else gives its own `name` and
 * `icon` (a texture key). `quality` is the item's rolled one (`Owned.q`) and sets the glow; default standard. `x`, `y`: where it came from (default: the Communicator).
 */
export interface Gained {
  id?: ItemId;
  name?: string;
  icon?: string;
  quality?: Quality;
  x?: number;
  y?: number;
}

export type OnboardEvent =
  /** An element of the HUD was shown for the first time. */
  | { e: 'reveal'; id: HudId }
  /** An element was held back again (dev). */
  | { e: 'unreveal'; id: HudId }
  /** An item was gained: it arcs to the Communicator and hovers over him with its name before it goes in (`fanfare.ts`). A found weapon, a mod, a unique part and an AI core raise it by themselves. */
  | { e: 'item'; item: Gained }
  /** A cue was placed, or taken (its glow becomes an engraving). */
  | { e: 'cue'; cue: CueRT; what: 'new' | 'taken' };

export interface OnboardOpts {
  /** Start with the HUD empty: only `shown` is up. Default false (everything is). */
  empty?: boolean;
  /** What the save already revealed. */
  shown?: HudId[];
}

export class Onboard {
  /** The run started with an empty HUD: its reveals go into the save. */
  readonly empty: boolean;
  private up: Set<HudId>;
  readonly cues: CueRT[] = [];
  private nextId = 1;

  constructor(o: OnboardOpts = {}, private emit: (e: OnboardEvent) => void = () => {}) {
    this.empty = !!o.empty;
    this.up = new Set(this.empty ? (o.shown ?? []).filter(isHudId) : HUD_IDS);
  }

  /** The elements up now. */
  get revealed(): HudId[] {
    return HUD_IDS.filter((id) => this.up.has(id));
  }
  shows(id: HudId): boolean {
    return this.up.has(id);
  }
  /** What the save keeps (null: this run did not start empty, there is nothing to keep). */
  get saved(): HudId[] | null {
    return this.empty ? this.revealed : null;
  }

  /** Show an element (or several); true when any was new. */
  reveal(...ids: HudId[]): boolean {
    let fresh = false;
    for (const id of ids) {
      if (this.up.has(id)) continue;
      this.up.add(id);
      fresh = true;
      this.emit({ e: 'reveal', id });
    }
    return fresh;
  }
  /** Hold an element back again (dev). */
  hide(...ids: HudId[]) {
    for (const id of ids) if (this.up.delete(id)) this.emit({ e: 'unreveal', id });
  }
  /** A resource was gained: its slot shows (a part or a relic included). */
  gain(kind: keyof typeof SLOT_OF) {
    this.reveal(SLOT_OF[kind]);
  }

  /** An item was gained: it hovers over him with its name (`fanfare.ts`). */
  item(item: Gained) {
    this.emit({ e: 'item', item });
  }

  /** Place a cue; returns its id. */
  cue(c: Cue): number {
    const cue: CueRT = { ...c, id: this.nextId++, taken: !!c.taken };
    this.cues.push(cue);
    this.emit({ e: 'cue', cue, what: 'new' });
    return cue.id;
  }
  /** The cue is taken: its glow fades into an engraving that stays. */
  take(id: number) {
    const cue = this.cues.find((c) => c.id === id);
    if (!cue || cue.taken) return;
    cue.taken = true;
    this.emit({ e: 'cue', cue, what: 'taken' });
  }
  /** The one cue that glows: the first placed that is not taken yet. */
  get glowing(): CueRT | undefined {
    return this.cues.find((c) => !c.taken);
  }

  /** A cue not yet taken lies within `r` px of the point: it already says that thing, so a text hint for it stays quiet (one thing at a time). */
  cued(x: number, y: number, r: number): boolean {
    return this.cues.some((c) => !c.taken && Math.hypot(c.x - x, c.y - y) <= r);
  }

  summary() {
    return { empty: this.empty, revealed: this.revealed, cues: this.cues.map((c) => `${c.id}:${c.key ?? c.icon}${c.taken ? ' taken' : c === this.glowing ? ' glows' : ' waits'}`) };
  }
}
