/**
 * A picture by key, for the onboarding views (`fanfare.ts`, `cueview.ts`): a texture of the scene (`scrapgob`, `gear-shovel`,
 * `part-hornet-head`) or a frame of the atlas (`communicator/portrait`). `texOf` says how to ask Phaser for it, `iconCanvas`
 * draws it small for the DOM.
 */
import type Phaser from 'phaser';

/** The arguments `scene.add.image` wants for `key`, or null when there is no such picture. */
export function texOf(scene: Phaser.Scene, key: string): { key: string; frame?: string } | null {
  if (scene.textures.exists(key)) return { key };
  return scene.textures.exists('atlas') && scene.textures.get('atlas').has(key) ? { key: 'atlas', frame: key } : null;
}

const cache = new Map<string, HTMLCanvasElement>();

/** `key` drawn to fit a `px` square (aspect kept), cached; null without such a picture. Callers clone it (`cloneNode`) before putting it in the page. */
export function iconCanvas(scene: Phaser.Scene, key: string, px = 40): HTMLCanvasElement | null {
  const id = `${key}@${px}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const t = texOf(scene, key);
  if (!t) return null;
  const f = scene.textures.getFrame(t.key, t.frame);
  const c = document.createElement('canvas');
  c.width = c.height = px * 2; // drawn at 2x so it stays sharp when the page is scaled
  const k = Math.min(c.width / f.cutWidth, c.height / f.cutHeight);
  const w = f.cutWidth * k, h = f.cutHeight * k;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, (c.width - w) / 2, (c.height - h) / 2, w, h);
  cache.set(id, c);
  return c;
}

/** A fresh canvas holding `key`'s picture (`cloneNode` on a canvas leaves its pixels behind), ready to put in the page; null without such a picture. */
export function iconCopy(scene: Phaser.Scene, key: string, px = 40): HTMLCanvasElement | null {
  const src = iconCanvas(scene, key, px);
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}
