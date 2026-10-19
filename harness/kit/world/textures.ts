import Phaser from 'phaser';

/** Keys of the generated textures the world kit stamps with. All white (tint them), made once per game. */
export const MARK_SOFT = 'world-soft'; // 64px radial blob, alpha falls to 0 at the edge: scorch, shadows
export const MARK_SPLAT = 'world-splat'; // 128px irregular splat: blood, mud, smudges
export const MARK_FOOT = 'world-foot'; // 24x40 shoe print pointing up

/** Tiny deterministic generator so the splat looks the same every run. */
const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

export function ensureTextures(scene: Phaser.Scene) {
  const T = scene.textures;
  const canvas = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (T.exists(key)) return;
    const t = T.createCanvas(key, w, h)!;
    draw(t.getContext());
    t.refresh();
  };
  const blob = (c: CanvasRenderingContext2D, x: number, y: number, r: number, hard: number) => {
    const g = c.createRadialGradient(x, y, r * hard, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  canvas(MARK_SOFT, 64, 64, (c) => blob(c, 32, 32, 32, 0));
  canvas(MARK_SPLAT, 128, 128, (c) => {
    const rnd = lcg(7);
    blob(c, 64, 64, 40, 0.55);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 18 + rnd() * 22;
      blob(c, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 10 + rnd() * 14, 0.6);
    }
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 44 + rnd() * 16;
      blob(c, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + rnd() * 4, 0.7);
    }
  });
  canvas(MARK_FOOT, 24, 40, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(12, 13, 9, 12, 0, 0, Math.PI * 2); // sole
    c.fill();
    c.beginPath();
    c.ellipse(12, 31, 6.5, 7, 0, 0, Math.PI * 2); // heel
    c.fill();
  });
}
