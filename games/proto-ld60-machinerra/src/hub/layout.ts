/**
 * The command deck of the Zeppelin Wanderer, plain TS (the floor plan: `games/lab/art/FloorPlans/MainHubstarterFloorPlan .jpg`).
 * A grid of cells framed by girders, open to the sky below. Five enclosed rooms in a cross, joined by grated catwalks
 * (the walkable floor); every other cell is an empty building slot, open air at the start (vendors, shops and the like
 * get built there later). Where each station and NPC spot stands, walking that slides along walls, what is in reach.
 * World px, top-down, y down.
 */
import type { SpotId } from './state';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Room extends Rect { id: string; name: string }
/** An empty cell where something can be built. `n` is the number stencilled on its girder. */
export interface Slot extends Rect { id: string; n: number }

/** Girder width between cells (and around the deck). */
export const GIRDER = 40;
const COLS = [300, 300, 420, 300, 300];
const ROWS = [340, 240, 440, 260, 340];
const edges = (sizes: number[]) => sizes.map((_, i) => GIRDER * (i + 1) + sizes.slice(0, i).reduce((a, b) => a + b, 0));
const CX = edges(COLS), CY = edges(ROWS);

/** Where the girders run: the left (top) edge of each one. */
export const GIRDER_X = [0, ...CX.map((x, i) => x + COLS[i])];
export const GIRDER_Y = [0, ...CY.map((y, i) => y + ROWS[i])];

export const DECK = { w: CX[4] + COLS[4] + GIRDER, h: CY[4] + ROWS[4] + GIRDER };

/** A cell (column, row), `span` columns wide (the girders between are inside it). */
export const cell = (c: number, r: number, span = 1): Rect => ({ x: CX[c], y: CY[r], w: CX[c + span - 1] + COLS[c + span - 1] - CX[c], h: ROWS[r] });

const room = (id: string, name: string, c: number, r: number): Room => ({ id, name, ...cell(c, r) });
/** The enclosed rooms, the cross of the plan: the course planner in the middle. */
export const ROOMS: Room[] = [
  room('workshop', 'Workshop', 2, 0),
  room('lift', 'Lift', 0, 2),
  room('planner', 'Course planner', 2, 2),
  room('church', 'Church of the Oracle', 4, 2),
  room('colony', 'Colony manager', 2, 4),
];
const R = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<string, Room>;

/** Catwalks: see-through grates over the drop, overlapping the rooms they join (so the floor is one piece). */
const WALK = 120;
const vWalk = (a: Room, b: Room): Rect => ({ x: a.x + a.w / 2 - WALK / 2, y: a.y + a.h - 10, w: WALK, h: b.y - a.y - a.h + 20 });
const hWalk = (a: Room, b: Room): Rect => ({ x: a.x + a.w - 10, y: a.y + a.h / 2 - WALK / 2 + 20, w: b.x - a.x - a.w + 20, h: WALK - 10 });
export const WALKWAYS: Rect[] = [vWalk(R.workshop, R.planner), hWalk(R.lift, R.planner), hWalk(R.planner, R.church), vWalk(R.planner, R.colony)];
export const FLOOR: Rect[] = [...ROOMS, ...WALKWAYS];

/**
 * Where the Communicator can walk: the rooms, the catwalks, the girders (the truss lattice between every cell is walkable
 * deck), and lots with a station built on them. The rooms' walls (`WALL`, drawn round each) are low: you step over them
 * onto the girders anywhere (Laimonas). A lot with nothing on it is open air, even where a wide lot's middle girder
 * was left out. Built lots are set by the hub scene from the save (`setBuilt`).
 */
export const WALL = 26;
let built: string[] = [];
let bridges: Rect[] = [];
export function setBuilt(lots: string[]) {
  built = [...lots];
  bridges = bridgesTo(lots);
}
/**
 * Bridges to built lots: the open air between a catwalk and a built lot across one girder is grated over, from the
 * catwalk's edge (over its rail) to the lot's edge, the width the two share. `along`: how the grate's bars run (as the
 * catwalk's). Walkable like the catwalks.
 */
export function bridgesTo(lots: string[]): (Rect & { along: boolean; id: string })[] {
  const out: (Rect & { along: boolean; id: string })[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= GIRDER + 2;
  for (const w of WALKWAYS) {
    const mx = w.x + w.w / 2, my = w.y + w.h / 2;
    let c: Rect | null = null;
    for (let i = 0; i < COLS.length && !c; i++) for (let j = 0; j < ROWS.length && !c; j++) {
      const r = cell(i, j);
      if (inside(r, mx, my) && !ROOMS.some((room) => inside(room, mx, my))) c = r;
    }
    if (!c) continue;
    const across = w.w >= w.h; // a catwalk running east-west: lots above and below it
    for (const id of lots) {
      const L = SLOTS.find((l) => l.id === id);
      if (!L) continue;
      if (across) {
        const x0 = Math.max(L.x, c.x), x1 = Math.min(L.x + L.w, c.x + c.w);
        if (x1 - x0 < 60) continue;
        if (near(L.y + L.h, c.y)) out.push({ id, along: true, x: x0, y: L.y + L.h, w: x1 - x0, h: w.y + 20 - (L.y + L.h) });
        else if (near(c.y + c.h, L.y)) out.push({ id, along: true, x: x0, y: w.y + w.h - 20, w: x1 - x0, h: L.y - (w.y + w.h - 20) });
      } else {
        const y0 = Math.max(L.y, c.y), y1 = Math.min(L.y + L.h, c.y + c.h);
        if (y1 - y0 < 60) continue;
        if (near(L.x + L.w, c.x)) out.push({ id, along: false, x: L.x + L.w, y: y0, w: w.x + 20 - (L.x + L.w), h: y1 - y0 });
        else if (near(c.x + c.w, L.x)) out.push({ id, along: false, x: w.x + w.w - 20, y: y0, w: L.x - (w.x + w.w - 20), h: y1 - y0 });
      }
    }
  }
  return out;
}

const grow = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Free lots a station can go on: beside a catwalk (a bridge reaches it), or across a girder from a lot already built (the deck grows outward). */
export function openLots(taken: string[]) {
  const done = SLOTS.filter((l) => taken.includes(l.id));
  return SLOTS.filter((l) => !taken.includes(l.id) && (bridgesTo([l.id]).length > 0 || done.some((d) => overlap(grow(l, GIRDER + 2), d))));
}
/** Every built lot still joins the deck: bridged from a catwalk, or across a girder from a lot that does (moving a station must not strand another). */
export function connected(taken: string[]) {
  const left = SLOTS.filter((l) => taken.includes(l.id));
  const ok = left.filter((l) => bridgesTo([l.id]).length > 0);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of left) if (!ok.includes(l) && ok.some((d) => overlap(grow(l, GIRDER + 2), d))) (ok.push(l), (grew = true));
  }
  return ok.length === left.length;
}
/**
 * A station on a lot: the booth at the back (`x, y` the middle of its footprint, `foot` where it stands), its NPC at the
 * counter in front, and its props (`LOT_PROPS`) beside and before it.
 */
export const lotOf = (id: string) => SLOTS.find((l) => l.id === id)!;
/** Station centrepieces are drawn at this share of their texture size (so a narrow lot has room beside one). */
export const BOOTH_SCALE = 0.8;
/** Sprocket's station is the workbench itself (Minos): it stands from the day she is aboard, on no lot (`HubState.stations.sprocket`). Old saves that built her on a lot keep it. */
export const WORKBENCH = 'workbench';
export const stationAt = (id: string) => {
  if (id === WORKBENCH) return { x: SPOTS.workshop.x, y: SPOTS.workshop.y, foot: SPOTS.workshop.y, npc: SPOTS.workshop };
  const l = lotOf(id);
  const foot = l.y + 140;
  return { x: l.x + l.w / 2, y: foot - 30, foot, npc: { x: l.x + l.w / 2, y: Math.min(foot + 44, l.y + l.h - 14) } };
};

/** What stands on each station's lot beside its centrepiece (`stationTex`): Hob's anvil and barrels, the clinic's limbs and jars, the dojo's kicking gear, the Trader's wares, the expedition kit, the draftsman's things, your stove and armchair, shells, firewood, the signal lamp. */
export type PropKind =
  | 'bag' | 'rack' | 'dummy' | 'crates' | 'barrels' | 'goods' | 'tent' | 'scope' | 'pack' | 'drafting' | 'tubes' | 'model'
  | 'armchair' | 'stove' | 'plant' | 'ammo' | 'shells' | 'hoist' | 'woodpile' | 'valve' | 'signal' | 'spool'
  | 'anvil' | 'barrelrack' | 'trough' | 'limbs' | 'trolley' | 'jar';
export const LOT_PROPS: Record<string, [PropKind, PropKind, PropKind]> = {
  sprocket: ['hoist', 'spool', 'valve'],
  hob: ['anvil', 'barrelrack', 'trough'],
  gasket: ['limbs', 'trolley', 'jar'],
  kicker: ['bag', 'rack', 'dummy'],
  trader: ['crates', 'barrels', 'goods'],
  expeditioner: ['tent', 'scope', 'pack'],
  cityPlanner: ['drafting', 'tubes', 'model'],
  home: ['stove', 'armchair', 'plant'],
  magazine: ['hoist', 'ammo', 'shells'],
  boilers: ['woodpile', 'valve', 'woodpile'],
  mast: ['spool', 'signal', 'scope'],
};
/** Props are drawn at this share of their texture size; each blocks a small circle at its feet. */
export const PROP_SCALE = 0.55;
/** A station's props on its lot, feet positions: back left beside the booth, then front left and front right (the NPC stands front centre). */
export function lotProps(npcId: string, lotId: string) {
  if (lotId === WORKBENCH) return [];
  const l = lotOf(lotId);
  const spots = [{ x: l.x + 42, y: l.y + 118 }, { x: l.x + l.w * 0.2, y: l.y + l.h - 14 }, { x: l.x + l.w * 0.8, y: l.y + l.h - 14 }];
  return (LOT_PROPS[npcId] ?? []).map((kind, i) => ({ kind, ...spots[i], r: 18 }));
}

/** What each NPC leaves standing on their lot at the fifth step of their relationship track (P52): a prop from the set above, one per NPC (guesses). Sprocket's bench, the Oracle and the Princess have no lot. */
export const KEEPSAKE: Record<string, PropKind> = { hob: 'barrels', gasket: 'plant', expeditioner: 'signal', cityPlanner: 'armchair', kicker: 'woodpile', trader: 'spool' };
/** Where the keepsake stands: the back right of the lot, across from the first prop. Null for an NPC with none. */
export function keepsake(npcId: string, lotId: string) {
  const kind = KEEPSAKE[npcId];
  if (!kind || lotId === WORKBENCH) return null;
  const l = lotOf(lotId);
  return { kind, x: l.x + l.w - 42, y: l.y + 118, r: 18 };
}

/** What a built station blocks: its booth and its props (the workbench is blocked as a fixed prop). */
export const boothBlocks = (stations: Record<string, string>) =>
  Object.entries(stations).flatMap(([id, l]) => (l === WORKBENCH ? [] : [{ ...stationAt(l), r: 86 }, ...lotProps(id, l)]));

/** Every other cell: empty building slots, numbered in reading order. The two east cells of the top rows are one wide slot. */
const SLOT_CELLS: [number, number, number?][] = [[0, 0], [1, 0], [3, 0, 2], [0, 1], [1, 1], [3, 1, 2], [0, 3], [1, 3], [3, 3], [4, 3], [0, 4], [1, 4], [3, 4], [4, 4]];
export const SLOTS: Slot[] = SLOT_CELLS.map(([c, r, span], i) => ({ id: `slot-${i + 1}`, n: i + 1, ...cell(c, r, span) }));

/** The lift's hatch: where the Communicator comes up and goes down. */
export const ARRIVE = { x: R.lift.x + R.lift.w / 2, y: R.lift.y + R.lift.h / 2 + 40 };
/** The course table in the planner (its glass centre), the workbench, the lift's lever: props that block. */
export const TABLE = { x: R.planner.x + R.planner.w / 2, y: R.planner.y + R.planner.h / 2 - 40 };
export const BENCH = { x: R.workshop.x + 120, y: R.workshop.y + 100 };
export const LEVER = { x: ARRIVE.x, y: R.lift.y + 70 };
/** The D-city window: a bay in the colony manager's east wall. */
export const WINDOW = { x: R.colony.x + R.colony.w + 10, y: R.colony.y + R.colony.h / 2 };
/** The altar against the church's north wall. */
export const ALTAR = { x: R.church.x + R.church.w / 2, y: R.church.y + 80 };

export type StationId = 'command' | 'workshop' | 'window' | 'lift';
export interface Station { id: StationId; name: string; verb: string; x: number; y: number; reach: number }

/** Stations: a place in a room and a panel. `x, y` is where it stands on the floor (its foot). */
export const STATIONS: Station[] = [
  { id: 'command', name: 'Course table', verb: 'plot the course', x: TABLE.x, y: TABLE.y + 10, reach: 120 },
  { id: 'workshop', name: 'Workbench', verb: 'look over the parts', x: BENCH.x, y: BENCH.y, reach: 100 },
  { id: 'window', name: 'D-city window', verb: 'look out at the city', x: WINDOW.x - 50, y: WINDOW.y, reach: 110 },
  { id: 'lift', name: 'Lift lever', verb: 'ride the lift down', x: LEVER.x, y: LEVER.y + 10, reach: 80 },
];

export const SPOTS: Record<SpotId, { x: number; y: number }> = {
  altar: { x: ALTAR.x, y: ALTAR.y + 12 }, // the Oracle, enthroned on her altar at the head of the carpet
  'colony-north': { x: R.colony.x + 100, y: R.colony.y + 90 },
  'colony-south': { x: R.colony.x + 100, y: R.colony.y + 230 },
  workshop: { x: R.workshop.x + R.workshop.w - 90, y: R.workshop.y + 170 },
  lift: { x: R.lift.x + R.lift.w - 60, y: R.lift.y + 90 },
  planner: { x: R.planner.x + R.planner.w - 70, y: R.planner.y + 90 },
};
export const NPC_REACH = 100;
/** Rescued NPCs without a station wait in the centre of the hub, round the course table, in this order. */
export const WAIT: { x: number; y: number }[] = [
  { x: TABLE.x - 150, y: TABLE.y + 60 },
  { x: TABLE.x + 150, y: TABLE.y + 60 },
  { x: TABLE.x - 110, y: TABLE.y + 175 },
  { x: TABLE.x + 110, y: TABLE.y + 175 },
  { x: TABLE.x, y: TABLE.y + 200 },
  { x: TABLE.x - 185, y: TABLE.y + 125 },
  { x: TABLE.x + 185, y: TABLE.y + 125 },
];

/**
 * How fast the Communicator walks (px/s; lead's call, P2): a step starts slow, to stand beside a counter, and settles into a
 * stride over `ramp` seconds of walking in one go, so any station on the deck is a few seconds away with no run key.
 * `fast` was 440, too fast (Minos); 370 is a guess. `slow` 190 over 0.5 s still felt fast from the first step (Minos): 120 over 1.2 s is a guess. At stride the walk shows it (stride.ts).
 */
export const PACE = { slow: 120, fast: 370, ramp: 1.2 };
/** Eased (smoothstep), so the first steps are gentle and the stride settles in; its average over the ramp is still the midpoint. */
export const hubSpeed = (walked: number) => {
  const t = Math.min(1, walked / PACE.ramp);
  return PACE.slow + (PACE.fast - PACE.slow) * t * t * (3 - 2 * t);
};
/** How much of a stride a speed is: 0 up to 55% of the way from `slow` to `fast` (a step starting; a guess), 1 at `fast`. Drives the speed effect (stride.ts). */
export const strideLevel = (speed: number) => {
  const from = PACE.slow + (PACE.fast - PACE.slow) * 0.55;
  return Math.min(1, Math.max(0, (speed - from) / (PACE.fast - from)));
};

/** The Communicator's feet: a box this wide and this deep must stay on the floor. */
const FOOT = { rx: 14, ry: 8 };

export const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** Every corner of the feet is on some floor piece (corners may be on different ones: doorways). */
const FEET = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [-0.5, 0], [0.5, 0]]; // corners and across the middle: no straddling a wall
export const walkable = (x: number, y: number) => FEET.every(([sx, sy]) => onDeck(x + sx * FOOT.rx, y + sy * FOOT.ry));

const onGirder = (x: number, y: number) =>
  x >= 0 && y >= 0 && x <= DECK.w && y <= DECK.h && (GIRDER_X.some((g) => x >= g && x <= g + GIRDER) || GIRDER_Y.some((g) => y >= g && y <= g + GIRDER));
/** One point of deck: on the floor, a bridge, a girder or a built lot; never over an empty lot. */
function onDeck(x: number, y: number) {
  const lot = SLOTS.find((l) => inside(l, x, y));
  if (lot) return built.includes(lot.id);
  return FLOOR.some((r) => inside(r, x, y)) || bridges.some((r) => inside(r, x, y)) || onGirder(x, y);
}

/** One step, sliding along walls: x and y are tried on their own. Solid objects (`blocks`) are circles. */
export function move(p: { x: number; y: number }, dx: number, dy: number, blocks: { x: number; y: number; r: number }[] = []) {
  const free = (x: number, y: number) => walkable(x, y) && blocks.every((b) => Math.hypot(x - b.x, (y - b.y) * 1.6) >= b.r);
  let { x, y } = p;
  if (free(x + dx, y)) x += dx;
  if (free(x, y + dy)) y += dy;
  return { x, y };
}

export const roomAt = (x: number, y: number) => ROOMS.find((r) => inside(r, x, y)) ?? null;

/** The nearest thing in reach of (x, y), or null. */
export function inReach<T extends { x: number; y: number; reach: number }>(x: number, y: number, things: T[]): T | null {
  let best: T | null = null, bd = Infinity;
  for (const t of things) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= t.reach && d < bd) {
      best = t;
      bd = d;
    }
  }
  return best;
}
