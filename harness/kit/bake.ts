/**
 * Bake procedural art into a texture so lights can touch it. Phaser lights affect only Image, Sprite, TileSprite and Mesh2D;
 * a Graphics (or Shape) set lit does not show at all (lab Lit probe). Whatever an agent draws with Graphics becomes an
 * Image here, and `kit(this).lights` lights every Image by default.
 *
 *   const rock = bake(this, (g) => { g.fillStyle(0xffffff); g.fillCircle(40, 40, 36); }, 80, 80).setPosition(x, y);
 *   bake(this, existingGraphics, 80, 80);                       // consumes it (destroyed); the image sits where it was
 *   bake(this, draw, 80, 80, { key: 'rock' });                  // named: drawn once, reused on later calls and scene restarts
 *   bake(this, draw, 80, 80, { material: 'metal', wear: 0.5 }); // with a material (normals.ts); wear, seed, emissive as in material()
 *
 * The drawing is clipped to 0..w x 0..h (a Graphics at x, y covers x..x+w, y..y+h). Phaser's Graphics.generateTexture draws on
 * a 2D canvas: fills, strokes, arcs and paths work, gradients do not. The Image has origin 0,0 so a drop-in keeps its place;
 * `.setOrigin(0.5)` to centre. Bake once, not per frame: each bake is a canvas of w x h. Without a `key` the texture is the
 * image's own and is removed when the image is destroyed; a keyed texture stays.
 */
import Phaser from 'phaser';
import { material } from './normals';
import type { MaterialOpts, MaterialSpec } from './material';

let count = 0;

export function bake(
  scene: Phaser.Scene,
  src: Phaser.GameObjects.Graphics | ((g: Phaser.GameObjects.Graphics) => void),
  w: number,
  h: number,
  opts: { key?: string; material?: MaterialSpec } & MaterialOpts = {},
): Phaser.GameObjects.Image {
  const own = opts.key === undefined;
  const key = opts.key ?? `bake:${count++}`;
  let x = 0;
  let y = 0;
  if (!scene.textures.exists(key)) {
    const g = typeof src === 'function' ? scene.make.graphics({}, false) : src;
    if (typeof src === 'function') src(g);
    else {
      x = g.x;
      y = g.y;
    }
    g.generateTexture(key, Math.ceil(w), Math.ceil(h));
    g.destroy();
  } else if (typeof src !== 'function') {
    x = src.x;
    y = src.y;
    src.destroy();
  }
  const img = scene.add.image(x, y, key).setOrigin(0, 0);
  if (opts.material) material(img, opts.material, opts);
  if (own) img.once(Phaser.GameObjects.Events.DESTROY, () => scene.textures.exists(key) && scene.textures.remove(key));
  return img;
}
