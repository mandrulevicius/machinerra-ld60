/**
 * Trait parts' icons (P12) and the twisted parts' (P13): `part-<kind>` for each elite trait's drop (`ELITE_TRAITS`) and each twisted part (`TWISTED_PART`), 24x20 like the other parts: a
 * plate (brass-edged for a trait, violet-edged for a twisted part) with a glyph for what it does. Drawn in code; a painted one can replace any.
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, rr, shape, type Ctx } from './art';
import { DANGER_TWISTED } from './house';
import { ELITE_TRAITS, type TraitId, type TwistedPart } from './sim/defs';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** A glyph in the plate's middle (centre 12, 10) for each trait. */
const GLYPH: Record<TraitId, (c: Ctx, col: string) => void> = {
  drummer: (c, col) => {
    shape(c, col, circ(c, 12, 10, 5.5), 1.2);
    shape(c, COL.ironHi, rr(c, 5, 8.5, 14, 3, 1), 0.6);
  },
  carapace: (c, col) => shape(c, col, () => { c.moveTo(12, 3); c.lineTo(19, 7); c.lineTo(17, 15); c.lineTo(12, 18); c.lineTo(7, 15); c.lineTo(5, 7); c.closePath(); }, 1.2),
  splitter: (c, col) => { shape(c, col, circ(c, 8, 10, 4), 1.1); shape(c, col, circ(c, 16, 10, 4), 1.1); },
  brood: (c, col) => shape(c, col, () => { c.ellipse(12, 10, 6, 7.5, 0, 0, Math.PI * 2); }, 1.2),
  weaver: (c, col) => { shape(c, col, circ(c, 12, 10, 6), 1); shape(c, COL.iron, circ(c, 12, 10, 2.5), 0.9); },
  broadcaster: (c, col) => { shape(c, col, rr(c, 6, 5, 12, 10, 2), 1.2); shape(c, COL.soot, circ(c, 12, 10, 2.5), 0.4); },
  hooded: (c, col) => shape(c, col, () => { c.moveTo(4, 16); c.quadraticCurveTo(4, 3, 12, 3); c.quadraticCurveTo(20, 3, 20, 16); c.closePath(); }, 1.2),
  broodRattle: (c, col) => { for (const x of [7, 12, 17]) shape(c, col, circ(c, x, 10, 2.6), 0.9); },
  leech: (c, col) => shape(c, col, () => { c.moveTo(5, 5); c.lineTo(19, 5); c.lineTo(12, 17); c.closePath(); }, 1.2),
  twinBlade: (c, col) => { for (const x of [8, 15]) shape(c, col, () => { c.moveTo(x, 3); c.lineTo(x + 3, 17); c.lineTo(x - 1, 14); c.closePath(); }, 1); },
  herald: (c, col) => shape(c, col, () => { c.moveTo(5, 8); c.lineTo(11, 8); c.lineTo(19, 3); c.lineTo(19, 17); c.lineTo(11, 12); c.lineTo(5, 12); c.closePath(); }, 1.1),
  bulwark: (c, col) => shape(c, col, () => { c.moveTo(12, 2); c.lineTo(19, 10); c.lineTo(12, 18); c.lineTo(5, 10); c.closePath(); }, 1.2),
  mortar: (c, col) => shape(c, col, rr(c, 9, 3, 7, 14, 2), 1.2),
  overclock: (c, col) => shape(c, col, () => { c.moveTo(13, 2); c.lineTo(6, 11); c.lineTo(11, 11); c.lineTo(9, 18); c.lineTo(18, 8); c.lineTo(12.5, 8); c.closePath(); }, 1.1),
};

/** The twisted parts (P13): a violet-edged plate with a glyph for what the night form does. */
const TWISTED_GLYPH: Record<TwistedPart, (c: Ctx, col: string) => void> = {
  'twisted-coil': (c, col) => { shape(c, col, circ(c, 12, 10, 6), 1.2); shape(c, COL.soot, circ(c, 12, 10, 3), 0.8); shape(c, col, circ(c, 12, 10, 1), 0.5); },
  'twisted-cable': (c, col) => shape(c, col, () => { c.moveTo(4, 14); c.quadraticCurveTo(9, 3, 12, 10); c.quadraticCurveTo(15, 17, 20, 6); c.lineTo(20, 9); c.quadraticCurveTo(15, 20, 12, 13); c.quadraticCurveTo(9, 7, 4, 17); c.closePath(); }, 1),
  'twisted-gland': (c, col) => shape(c, col, () => { c.moveTo(12, 3); c.quadraticCurveTo(19, 11, 12, 17); c.quadraticCurveTo(5, 11, 12, 3); c.closePath(); }, 1.2),
  'twisted-fang': (c, col) => shape(c, col, () => { c.moveTo(7, 4); c.lineTo(17, 4); c.lineTo(12, 17); c.closePath(); }, 1.2),
  'twisted-lens': (c, col) => { shape(c, col, circ(c, 12, 10, 6), 1.1); for (const a of [-0.6, 0, 0.6]) shape(c, COL.ironHi, () => { c.moveTo(12, 10); c.lineTo(12 + Math.sin(a) * 7, 10 - Math.cos(a) * 7); c.lineTo(12 + Math.sin(a + 0.15) * 7, 10 - Math.cos(a + 0.15) * 7); c.closePath(); }, 0.5); },
};

export function makeTraitArt(scene: Phaser.Scene) {
  for (const k of Object.keys(TWISTED_GLYPH) as TwistedPart[]) {
    SIZE[`part-${k}`] = [24, 20];
    canvas(scene, `part-${k}`, 24, 20, (c) => {
      shape(c, hex(DANGER_TWISTED), rr(c, 1, 1, 22, 18, 3), 1);
      shape(c, COL.soot, rr(c, 2.5, 2.5, 19, 15, 2), 0.8);
      TWISTED_GLYPH[k](c, '#d8a0ff');
    });
  }
  for (const [id, d] of Object.entries(ELITE_TRAITS) as [TraitId, (typeof ELITE_TRAITS)[TraitId]][]) {
    const key = `part-${d.part}`;
    SIZE[key] = [24, 20];
    canvas(scene, key, 24, 20, (c) => {
      shape(c, COL.ironHi, rr(c, 1, 1, 22, 18, 3), 1);
      shape(c, COL.brass, rr(c, 2.5, 2.5, 19, 15, 2), 0.6);
      GLYPH[id](c, hex(d.color));
    });
  }
}
