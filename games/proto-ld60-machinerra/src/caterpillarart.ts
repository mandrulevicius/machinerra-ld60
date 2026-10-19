/**
 * The caterpillars' textures, drawn in code (Canvas 2D, the house style like spiderart.ts, whose Crawlcam they are kin to):
 * a modern machine gone feral, white plastic pods ringed with cyan LEDs strung on a black cable, a black camera head with the
 * Crawlcam's red lens, scuffed and grimy (docs/design/art-direction.md). Everything is drawn pointing right (+x), joint ends at
 * x = 0 and mid-height; `caterpillar.ts` places them. The mother's jaw is four pieces: `grub-jaw` (top and bottom, mirrored)
 * and `grub-tusk` (one each side, mirrored), so the view can open them outward.
 */
import type Phaser from 'phaser';
import { COL, canvas, circ, glow, grad, radial, rr, shape, type Ctx } from './art';
import { LINE } from './house';

/** Boxes (game px at scale 1) and where each piece's centre or joint is. */
export const GRUB_ART = {
  seg: { w: 16, h: 20 },
  head: { w: 24, h: 22, cx: 10 },
  leg: { w: 10, h: 5 },
  foot: { w: 6, h: 6 },
  jaw: { w: 18, h: 8 },
  tusk: { w: 26, h: 9 },
};

const WHITE = '#f2f5f8', PLASTIC = '#e8edf2', GLOSS = '#0c0f12';

function scuffs(c: Ctx, seed: number, x: number, y: number, w: number, h: number, n: number, col: string, len = 3) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.save();
  c.strokeStyle = col;
  c.lineWidth = LINE.detail;
  for (let i = 0; i < n; i++) {
    const px = x + r() * w, py = y + r() * h, a = r() * Math.PI;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + Math.cos(a) * len * (0.4 + r()), py + Math.sin(a) * len * (0.4 + r()));
    c.stroke();
  }
  c.restore();
}

export function makeCaterpillarArt(scene: Phaser.Scene) {
  const G = GRUB_ART.seg;
  // A segment from above: a white pod, wider than long, a cyan LED band across it, the black cable through it.
  canvas(scene, 'grub-seg', G.w, G.h, (c) => {
    const cx = G.w / 2, cy = G.h / 2;
    shape(c, GLOSS, rr(c, 0, cy - 2.2, G.w, 4.4, 1.5), 0.7, '#000');
    shape(c, radial(c, cx - 2.5, cy - 4, 10, [[0, '#ffffff'], [0.55, '#dde3e8'], [1, '#8f9aa4']]), () => c.ellipse(cx, cy, 6.6, 8.8, 0, 0, Math.PI * 2), 1, '#000');
    c.save();
    c.setLineDash([2.6, 1.3]);
    c.strokeStyle = COL.cyan;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(cx + 0.6, cy - 7.6);
    c.lineTo(cx + 0.6, cy + 7.6);
    c.stroke();
    c.restore();
    glow(c, cx + 0.6, cy, 7, 'rgba(61,242,255,0.18)');
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.ellipse(cx - 1.2, cy - 2.5, 3.2, 4.4, 0, Math.PI * 1.05, Math.PI * 1.6);
    c.stroke();
    c.fillStyle = 'rgba(56,44,32,0.35)';
    c.beginPath();
    c.ellipse(cx + 2.5, cy + 5.4, 3.4, 2.2, 0.4, 0, Math.PI * 2);
    c.fill();
    scuffs(c, 7, cx - 5, cy - 7, 10, 14, 6, 'rgba(70,74,80,0.55)');
  });

  const H = GRUB_ART.head;
  // The head from above: a black camera housing, white bezel, one red lens, a pair of small mandibles (the baby's).
  const head = (key: string, mandibles: boolean) =>
    canvas(scene, key, H.w, H.h, (c) => {
      c.translate(H.cx, H.h / 2);
      if (mandibles)
        for (const s of [-1, 1]) {
          shape(c, PLASTIC, () => {
            c.moveTo(8, s * 3.2);
            c.quadraticCurveTo(14, s * 4.6, 13.6, s * 0.8);
            c.lineTo(11.6, s * 1.6);
            c.quadraticCurveTo(11, s * 2.6, 8, s * 1.4);
          }, 0.7, '#000');
        }
      shape(c, grad(c, 0, -9, 0, 9, [[0, '#566069'], [0.3, '#1d2329'], [1, '#07090b']]), () => c.ellipse(0, 0, 9.6, 9, 0, 0, Math.PI * 2), 1.1, '#000');
      c.strokeStyle = 'rgba(255,255,255,0.4)';
      c.lineWidth = LINE.detail;
      c.beginPath();
      c.arc(-0.5, -0.5, 7, Math.PI * 1.1, Math.PI * 1.6);
      c.stroke();
      shape(c, WHITE, circ(c, 4, 0, 4.8), 0.9, '#000');
      shape(c, '#07080a', circ(c, 4, 0, 3.8), 0.5, '#000');
      shape(c, radial(c, 4, 0, 3.1, [[0, '#ff9aa6'], [0.35, '#ff2a40'], [1, '#55050f']]), circ(c, 4, 0, 3), 0);
      shape(c, '#050203', circ(c, 4, 0, 1.2), 0);
      shape(c, '#ffffff', circ(c, 3, -1.1, 0.7), 0);
      glow(c, 4, 0, 8, 'rgba(255,48,72,0.35)');
      for (const y of [-5.8, 5.8]) shape(c, y < 0 ? COL.red : COL.cyan, circ(c, -2.5, y, 1), 0.5, '#000');
      scuffs(c, 23, -8, -7, 10, 14, 5, 'rgba(210,218,226,0.4)');
    });
  head('grub-head', true);
  head('grub-skull', false);

  const L = GRUB_ART.leg;
  // A stubby leg piece, black gloss with a white cuff at the joint.
  canvas(scene, 'grub-leg', L.w, L.h, (c) => {
    shape(c, grad(c, 0, 0, 0, L.h, [[0, '#59626c'], [0.4, '#1a1f25'], [1, '#07090b']]), () => {
      c.moveTo(0.6, 0.5);
      c.lineTo(L.w - 1, 1.2);
      c.quadraticCurveTo(L.w, L.h / 2, L.w - 1, L.h - 1.2);
      c.lineTo(0.6, L.h - 0.5);
      c.closePath();
    }, 0.7, '#000');
    shape(c, PLASTIC, rr(c, 0.4, 0.6, 2.2, L.h - 1.2, 0.6), 0.5, '#000');
  });
  const F = GRUB_ART.foot;
  canvas(scene, 'grub-foot', F.w, F.h, (c) => {
    shape(c, radial(c, 2.4, 2.4, 3.6, [[0, '#ffffff'], [1, '#9aa5ae']]), circ(c, 3, 3, 2.3), 0.7, '#000');
  });

  const J = GRUB_ART.jaw;
  // One jaw plate (top; the bottom is it mirrored): white plastic gone grey, black serrations on its inner side, pointing forward.
  canvas(scene, 'grub-jaw', J.w, J.h, (c) => {
    shape(c, grad(c, 0, 0, 0, J.h, [[0, '#ffffff'], [0.5, '#d4dbe1'], [1, '#8a959f']]), () => {
      c.moveTo(0.5, 1);
      c.quadraticCurveTo(10, 0, J.w - 0.5, J.h - 2.2);
      c.lineTo(0.5, J.h - 1);
      c.closePath();
    }, 0.8, '#000');
    c.fillStyle = GLOSS;
    c.strokeStyle = '#000';
    c.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 3.5;
      c.beginPath();
      c.moveTo(x, J.h - 1);
      c.lineTo(x + 1.4, J.h + 0.6 - 2.4);
      c.lineTo(x + 2.8, J.h - 1);
      c.closePath();
      c.fill();
      c.stroke();
    }
    scuffs(c, 31, 1, 1, 12, 4, 3, 'rgba(70,74,80,0.5)', 2.5);
  });

  const K = GRUB_ART.tusk;
  // One tusk (the left; the right is it mirrored): a long curved ceramic blade, ivory-white with grime, out of a brass collar.
  canvas(scene, 'grub-tusk', K.w, K.h, (c) => {
    shape(c, grad(c, 0, 0, K.w, 0, [[0, '#d9d4c6'], [0.6, '#f4f0e6'], [1, '#ffffff']]), () => {
      c.moveTo(3, 2.2);
      c.quadraticCurveTo(14, 0.4, K.w - 0.5, 3.6);
      c.quadraticCurveTo(14, 3.2, 3, K.h - 1.6);
      c.closePath();
    }, 0.9, '#000');
    c.strokeStyle = 'rgba(80,70,56,0.5)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(5, 4.6);
    c.quadraticCurveTo(13, 3, 20, 3.8);
    c.stroke();
    shape(c, COL.brass, rr(c, 0.5, 1.4, 4, K.h - 2.8, 1), 0.7, '#000');
    shape(c, COL.brassHi, rr(c, 1.2, 2, 1.2, K.h - 4, 0.5), 0);
    scuffs(c, 47, 6, 2, 12, 4, 4, 'rgba(90,80,64,0.5)', 2.5);
  });
}
