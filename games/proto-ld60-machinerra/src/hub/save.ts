/**
 * The one save slot (harness/kit/savefiles.ts) and the persistent-state registry on it (`../persist.ts`): the file is
 * every registered slice. The hub's state is the `hub` slice below; what a mission hands back for later ones is in
 * `carry.ts`. Systems add their own with `persist(key, default)` (persist.ts). Mid-mission state is not saved.
 * The hub writes on arrival and on every change (`hub.set`); the title's Continue goes to the hub when a slot is
 * filled; New game erases it after a confirm (`saveHooks`, passed to `bootGame`), except the slices declared `keep: true`
 * (the deeds' profile, `deeds.ts`: meta-progression across runs). The hub slice also keeps where the Communicator last
 * stopped on the deck (`HubState.at`).
 */
import { createSave } from '../../../../harness/save';
import { createSaveStore, type SaveStore } from '../../../../harness/kit/savefiles';
import { createRegistry } from '../persist';
import { freshHub, migrateHub, type Haul, type HubState } from './state';

const GAME = 'proto-ld60-machinerra';
/** The one file. */
export const slot = createSaveStore(GAME, 1);
const registry = createRegistry(slot);

/**
 * What the kit's menus read (`main.ts`): the same file, but a file holding only kept slices (a New game that kept the
 * profile) is empty, so the title offers no Continue for it.
 */
export const menuSlot: SaveStore = {
  count: slot.count,
  list: () => (registry.exists() ? slot.list() : slot.list().map(() => null)),
  put: (i, data) => slot.put(i, data),
  clear: (i) => slot.clear(i),
  latest: () => (registry.exists() ? slot.latest() : -1),
};

/** Declare a persistent slice: `persist('key', () => defaultValue)`, then `.get()` and `.set(value)`. */
export const persist = registry.persist;
/** The whole save as the kit's `save` hook wants it. */
export const snapshot = registry.snapshot;
/** Every registered slice with its default, and the keys: what the save audit (`../saveaudit.ts`) works on. */
export const sliceEntries = registry.entries;
export const registeredKeys = registry.keys;

/** A mission's haul with every field filled (the hub sample's `lastHaul`). */
const haulSample: Haul = {
  id: '4242:1760000000000',
  onboard: ['oil', 'clock'],
  parts: { 'hornet-head': 2, 'spider-lens': 1 },
  robots: [{ name: 'Bellows', role: 'gatherer', uid: 'r1' }],
  went: ['r1', 'r4'],
  rescued: ['trader'],
  gathered: ['kicker'],
  tier: 2,
  scrap: 31,
  insight: 2,
  cores: 1,
  copper: 14,
  charges: { barrage: 1 },
  discovered: ['shrine', 'mast'],
  carry: {
    loadout: { weapons: ['shovel', 'steamGun'], weapon: 'steamGun', secondary: 'shovel', support: ['barrage'] },
    stats: { killed: 14, ruins: 3 },
  },
  bosses: ['hornet'],
  ghost: true,
  expedition: { coal: 20, scrap: 60, junk: 'toaster', charted: 'jungle' },
};

const hubSample: HubState = {
  rescued: ['expeditioner', 'trader'],
  parts: { 'hornet-head': 3, 'queens-crown': 1 },
  robots: [{ name: 'Sprocket', role: 'guard' }, { name: 'Hob', role: 'repairer' }],
  missions: 5,
  lastHaul: haulSample,
  course: 3,
  biome: 'jungle',
  found: { desert: ['shrine', 'mast'], jungle: ['pilgrim'] },
  stranded: { trader: 'jungle' },
  city: 340,
  stations: { expeditioner: 'north-1', trader: 'south-2' },
  buildings: { built: ['foundry', 'scrapyard'], raising: ['aqueducts'], pickedAt: 4, cored: true, picks: 2 },
  district: { stage: 2, poured: 120, raising: false, perks: ['copperWiring', 'crowsNest'] },
  expedition: { load: 12, out: 20, charted: ['jungle'], sent: 2 },
  civilians: 3,
  perks: ['scavenger', 'packSack', 'kick'],
  at: { x: 312, y: 188 },
  story: { bosses: ['hornet', 'drone'], ghost: true, evil: true, wife: 'home' },
  call: 'lance',
};

const hubSlice = persist<HubState>('hub', freshHub, { version: 4, migrate: migrateHub, sample: hubSample });

// A save from before the title (the hub's own storage key) moves into the slot once.
const legacy = createSave<HubState>(`${GAME}-hub`, freshHub());
if (legacy.get().missions > 0 || legacy.get().rescued.length) {
  if (!registry.exists()) hubSlice.set(legacy.get());
  legacy.reset();
}

export const hub = {
  get: hubSlice.get,
  set: hubSlice.set,
  /** New game: erase the save, but the kept slices (the deeds' profile) stay. */
  reset: registry.reset,
  /** Erase everything, kept slices too (tests, `deeds reset`). */
  wipe: registry.wipe,
  /** A game is saved: the title offers Continue. */
  exists: registry.exists,
};
