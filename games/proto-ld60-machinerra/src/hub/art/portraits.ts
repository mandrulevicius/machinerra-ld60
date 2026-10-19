/**
 * Drawn portraits for the dialog's glass (`Hub.portraitOf` looks for `npc-portrait-<id>` after a painted `npc/portrait-<id>`):
 * the NPC's own sprite painter (`npcs.ts`) drawn large, rust-mottled and put through the house pass (`house.ts`), so it sits
 * beside Laimonas's painted busts (`tools/portraits.cjs`). The window is `PORTRAIT` game px (`talk.css` `.tk-glass`), the
 * bottom of it hidden by the bezel, so the head goes near the top. Add one: a painter in `npcs.ts` and a row in `BUSTS`.
 */
import Phaser from 'phaser';
import { house } from '../../house';
import { type Ctx, seeded } from './draw';
import { paintGasket, paintHob } from './npcs';

/** The portrait window, game px (the painted busts are made at twice this). */
export const PORTRAIT = { w: 230, h: 276 };
/** How big a 60 x 90 sprite is drawn (it fills the window's width), and where it starts (sprite px from the top, so the head sits near the top). */
const K = PORTRAIT.w / 60;
const BUSTS: Record<string, { paint: (c: Ctx) => void; top: number; rust: string[] }> = {
  hob: { paint: paintHob, top: 4, rust: ['rgba(150,84,34,0.30)', 'rgba(40,24,12,0.22)', 'rgba(230,170,90,0.16)'] },
  gasket: { paint: paintGasket, top: 0, rust: ['rgba(120,100,70,0.20)', 'rgba(60,40,24,0.18)', 'rgba(255,250,235,0.14)'] },
};

/** Blotches over what is already drawn (not the empty glass): the mottle of a painted figure. */
function mottle(c: Ctx, seed: number, colours: string[]) {
  const r = seeded(seed);
  c.save();
  c.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 70; i++) {
    c.fillStyle = colours[i % colours.length];
    c.beginPath();
    c.ellipse(r() * PORTRAIT.w, r() * PORTRAIT.h, 8 + r() * 26, 6 + r() * 18, r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export function makePortraits(scene: Phaser.Scene) {
  let seed = 11;
  for (const [id, b] of Object.entries(BUSTS)) {
    const key = `npc-portrait-${id}`;
    seed += 17;
    if (scene.textures.exists(key)) continue;
    const S = 2;
    const t = scene.textures.createCanvas(key, PORTRAIT.w * S, PORTRAIT.h * S)!;
    house(t.getContext(), PORTRAIT.w, PORTRAIT.h, S, (c) => {
      c.save();
      c.translate(0, -b.top * K);
      c.scale(K, K);
      b.paint(c);
      c.restore();
      mottle(c, seed, b.rust);
    });
    t.refresh();
  }
}
