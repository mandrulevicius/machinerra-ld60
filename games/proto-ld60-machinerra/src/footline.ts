/**
 * Where a picture meets the floor, for the cast shadows (`shadowview.ts` `sunCast`; the hub's `DeckShadows.stand`, the mission's
 * `Play.place` and `PropView`). A shadow is thrown from the picture's contact line: the row where the thing touches the floor.
 * By default that is the lowest opaque row of its picture (`contactRow`), which is right for everything that stands on its own
 * feet. A row below it (a baked ground patch, a front lip) falls away from the shadow; the thing's height is counted from the line.
 * Where the lowest row is not the floor, a row here says where: the picture's key (the texture's name before any `~`), and
 * - `foot`: the contact line as a share of the picture's height from its top (1: the bottom edge);
 * - `wall`: set against a wall or hung on one: it casts no floor shadow, only the small patch under its feet (the hub's blob).
 * Add a row only when the picture needs it.
 */
export interface Floor {
  foot?: number;
  wall?: boolean;
}

export const FLOOR: Record<string, Floor> = {
  // The dojo: a gate against the back wall with a gong hung between its posts: its patch under the posts, no cast.
  'landmark-kicker': { wall: true },
};

/** A texture key without the dressing (`~hub`, `~ss`, a land's grade): the key the table is written in. */
export const baseKey = (key: string) => key.replace(/~.*$/, '');
export const floorOf = (key: string): Floor => FLOOR[baseKey(key)] ?? {};
