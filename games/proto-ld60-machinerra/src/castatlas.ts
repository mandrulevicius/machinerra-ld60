/**
 * The cast shadows' pictures, packed into shared pages (`castFrame`): a texture of its own breaks the render batch, so a view with
 * thirty casts of twenty kinds drew twenty-odd times; on a page they all draw in one go. Each picture is drawn once into a page,
 * rows of them side by side; a page is sent to the GPU once per frame at most, and only when a picture was added (a prop that
 * cracks, a station built). A picture too big for a page keeps a texture of its own. Frames are never freed: a land's pictures
 * stay, as the textures they replace did; `forgetCasts` drops the names of pictures that must be drawn again (the hub's art redrawn).
 */
import Phaser from 'phaser';

const PAGE = 1024;
const GAP = 2;

interface Page {
  key: string;
  tex: Phaser.Textures.CanvasTexture;
  ctx: CanvasRenderingContext2D;
  /** The cursor: where the next picture goes, and the height of the row it is on. */
  x: number;
  y: number;
  row: number;
  dirty: boolean;
}
interface Atlas {
  pages: Page[];
  /** name -> where it lives: a page's key, or a texture of its own. */
  frames: Map<string, { texture: string; frame?: string }>;
  hooked: WeakSet<Phaser.Scene>;
}
const atlases = new WeakMap<Phaser.Textures.TextureManager, Atlas>();

function atlasOf(tx: Phaser.Textures.TextureManager): Atlas {
  let a = atlases.get(tx);
  if (!a) atlases.set(tx, (a = { pages: [], frames: new Map(), hooked: new WeakSet() }));
  return a;
}

/** Send the pages that changed to the GPU, before the scene draws. */
function hook(scene: Phaser.Scene, a: Atlas) {
  if (a.hooked.has(scene)) return;
  a.hooked.add(scene);
  const flush = () => {
    for (const p of a.pages)
      if (p.dirty) {
        p.dirty = false;
        p.tex.refresh();
      }
  };
  scene.events.on(Phaser.Scenes.Events.PRE_RENDER, flush);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.PRE_RENDER, flush);
    a.hooked.delete(scene);
  });
}

/**
 * The texture and frame of the picture `name` (`w` x `h` px), drawn by `paint` into a canvas of that size the first time it is asked for.
 * Pass both to `scene.add.image(x, y, texture, frame)`.
 */
export function castFrame(scene: Phaser.Scene, name: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): { texture: string; frame?: string } {
  const tx = scene.textures, a = atlasOf(tx), known = a.frames.get(name);
  if (known) return known;
  hook(scene, a);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paint(cv.getContext('2d')!);
  let out: { texture: string; frame?: string };
  if (w + GAP * 2 > PAGE || h + GAP * 2 > PAGE) {
    const key = `cast~${name}`;
    if (tx.exists(key)) tx.remove(key);
    const t = tx.createCanvas(key, w, h)!;
    t.getContext().drawImage(cv, 0, 0);
    t.refresh();
    out = { texture: key };
  } else {
    let p = a.pages[a.pages.length - 1];
    const fits = (q: Page) => (q.x + w + GAP <= PAGE ? q.y + h + GAP <= PAGE : q.y + q.row + GAP + h + GAP <= PAGE);
    if (!p || !fits(p)) {
      const key = `cast-page-${a.pages.length}`;
      if (tx.exists(key)) tx.remove(key);
      const tex = tx.createCanvas(key, PAGE, PAGE)!;
      a.pages.push((p = { key, tex, ctx: tex.getContext(), x: 0, y: 0, row: 0, dirty: false }));
    }
    // Along the row; when it is full, the next one, as tall as the tallest on the last.
    if (p.x + w + GAP > PAGE) {
      p.y += p.row + GAP;
      p.x = 0;
      p.row = 0;
    }
    p.ctx.drawImage(cv, p.x, p.y);
    p.tex.add(name, 0, p.x, p.y, w, h);
    p.x += w + GAP;
    p.row = Math.max(p.row, h);
    p.dirty = true;
    out = { texture: p.key, frame: name };
  }
  a.frames.set(name, out);
  return out;
}

/** Forget the pictures whose names begin with `prefix` (they will be drawn again on the next ask; the room they took stays). */
export function forgetCasts(scene: Phaser.Scene, prefix: string) {
  const a = atlases.get(scene.textures);
  if (!a) return;
  for (const [name, at] of a.frames)
    if (name.startsWith(prefix)) {
      if (!at.frame && scene.textures.exists(at.texture)) scene.textures.remove(at.texture);
      a.frames.delete(name);
    }
}
