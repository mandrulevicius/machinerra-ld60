/**
 * How a research card looks (`research.ts` has the rules): an old punch card. Plain TS, no Phaser; strings of HTML and SVG that the
 * church (`stations/church.ts`) and the inventory (`inventory.ts`) put in their own buttons, styled by `punchcard.css`.
 *
 * **The holes are the card's identity.** `punches(id)` is a pure function of the id (FNV-1a into mulberry32), so a card has the
 * same holes in every place it shows and in every run. One column is one punched character: a digit row (0-9), now and then a zone
 * punch (rows 12 and 11) with it, or nothing; the card's data ends at a length of its own, and the rest of the card is blank.
 * `holesSvg` draws them as one path over the printed digit rows, scaled by CSS to the size of the card (one viewBox, any width).
 * A keystone is told apart by its stock, not its holes: a red stripe and a brass edge (`punchcard.css`, `pc--key`).
 *
 * Sizes (the CSS class `pc--<size>`): `big` (the church's pick, 3 stacked), `mid` (the inventory's picked card), `sm` (a slot, a tile
 * in the collection), `chip` (a holes-only chip beside a row). A guess, `GRID`: 48 columns of 12 rows, not an 80-column card, so the
 * holes stay readable at the pane's sizes.
 */

/** The grid in viewBox units: a column's pitch, a row's pitch, and the hole inside it. */
export const GRID = { cols: 48, rows: 12, px: 16, py: 7.6, pad: 3, hw: 9.2, hh: 5.8 } as const;
/** The viewBox's size. */
export const VIEW = { w: GRID.cols * GRID.px, h: GRID.rows * GRID.py + GRID.pad * 2 };

/** A row's place from the top: 12, 11 (the zone rows), then 0 to 9. */
const ZONE = [0, 1];
const DIGIT_AT = (d: number) => d + 2;

export type PunchSize = 'big' | 'mid' | 'sm' | 'chip';
export interface Face {
  id: string;
  pool: string;
}

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The punched rows of each column (0 = row 12 ... 11 = row 9), from the card's id alone. */
export function punches(id: string): number[][] {
  const r = mulberry(fnv(id));
  const used = 26 + Math.floor(r() * (GRID.cols - 26));
  const out: number[][] = [];
  for (let c = 0; c < GRID.cols; c++) {
    const u = r(), d = Math.floor(r() * 10), z = r(), zone = ZONE[Math.floor(r() * 2)];
    if (c >= used || u < 0.18) out.push([]);
    else out.push(z < 0.3 ? [zone, DIGIT_AT(d)] : [DIGIT_AT(d)]);
  }
  return out;
}

const n = (v: number) => +v.toFixed(1);

/** The hole field: the printed digit rows, then every punch as one path (see through to what lies behind the card). */
export function holesSvg(id: string): string {
  const x0 = (c: number) => c * GRID.px + (GRID.px - GRID.hw) / 2;
  const y0 = (row: number) => GRID.pad + row * GRID.py + (GRID.py - GRID.hh) / 2;
  const d = punches(id).flatMap((rows, c) => rows.map((row) => `M${n(x0(c))} ${n(y0(row))}h${GRID.hw}v${GRID.hh}h-${GRID.hw}z`)).join('');
  const xs = Array.from({ length: GRID.cols }, (_, c) => n(c * GRID.px + GRID.px / 2)).join(' ');
  const print = Array.from({ length: 10 }, (_, k) => `<text x="${xs}" y="${n(GRID.pad + (DIGIT_AT(k) + 0.5) * GRID.py + 2.1)}">${String(k).repeat(GRID.cols)}</text>`).join('');
  return `<svg class="pc__holes" viewBox="0 0 ${VIEW.w} ${n(VIEW.h)}" preserveAspectRatio="none" aria-hidden="true"><g class="pc__digits">${print}</g><path class="pc__hole" d="${d}"/></svg>`;
}

/** Where this card's smudge sits on the stock (percent), from its id: no two cards are worn alike. */
export function smudge(id: string): { x: number; y: number } {
  const h = fnv(id + '#stain');
  return { x: 12 + (h % 76), y: 25 + ((h >>> 8) % 60) };
}

/** The classes a card carries: `pc pc--<size>`, and `pc--key` for a keystone. */
export const pcClass = (c: Face, size: PunchSize) => `pc pc--${size}${c.pool === 'keystone' ? ' pc--key' : ''}`;
/** Its style attribute: the smudge's place (a custom property the CSS reads). */
export const pcStyle = (c: Face) => {
  const s = smudge(c.id);
  return `style="--sx:${s.x}%;--sy:${s.y}%"`;
};
/** The card stock, behind everything else in the card. */
export const STOCK = '<i class="pc__stock"></i>';
