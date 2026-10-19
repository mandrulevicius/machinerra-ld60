// The game's own pictures for the mockups, live from its code: item icons (src/gearart.ts), parts, relics and pickups drawn by the
// art makers (src/art.ts, relicart.ts, biomeart.ts, spiderart.ts, traitart.ts, dungeonfoeart.ts) into a stand-in scene that only
// collects their canvases, the painted crew, foes and the Communicator (art/), and the soft counters' icons (src/counters.ts).
// Glyphs with no game art (damage types, stats, materials) are game-icons.net placeholders in icons/ (`npm run icons`).
import { iconUrl } from '../src/gearart.ts';
import { iconSvg } from '../src/counters.ts';

const store = {};
const any = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : any), apply: () => any, construct: () => any });
const textures = {
  exists: (k) => k in store,
  createCanvas: (k, w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    store[k] = cv;
    return { getContext: () => cv.getContext('2d'), refresh() {}, getSourceImage: () => cv };
  },
  get: () => any,
  addCanvas: () => any,
};
const scene = new Proxy({ textures }, { get: (t, k) => (k in t ? t[k] : any) });

const MAKERS = [['art.ts', 'makeArt'], ['relicart.ts', 'makeRelicArt'], ['biomeart.ts', 'makeBiomeArt'], ['spiderart.ts', 'makeSpiderArt'], ['spiderart.ts', 'makeSpiderParts'], ['traitart.ts', 'makeTraitArt'], ['dungeonfoeart.ts', 'makeDungeonFoeArt']];
const mods = {
  'art.ts': () => import('../src/art.ts'), 'relicart.ts': () => import('../src/relicart.ts'), 'biomeart.ts': () => import('../src/biomeart.ts'),
  'spiderart.ts': () => import('../src/spiderart.ts'), 'traitart.ts': () => import('../src/traitart.ts'), 'dungeonfoeart.ts': () => import('../src/dungeonfoeart.ts'),
};

/** Runs the game's art makers once; a maker that stops part way (makeArt reaches for a texture the stand-in lacks) keeps what it drew. */
export async function loadArt() {
  for (const [file, fn] of MAKERS) {
    try {
      const t0 = performance.now();
      const m = await mods[file]();
      m[fn]?.(scene);
      console.info(`mock art: ${fn} ${Math.round(performance.now() - t0)} ms`);
    } catch (e) {
      console.info(`mock art: ${file} ${fn} stopped: ${e.message}`);
    }
  }
}

const urls = {};
/** A code-drawn texture as a data URL, by its game key (`part-boar-tusk`, `relic-toaster`, `scrapgob`). */
export const tex = (k) => (urls[k] ||= store[k]?.toDataURL() ?? ''); // an empty one is not kept: asked before the makers ran
/** An item's icon (the inventory's own). */
export const item = (id) => iconUrl(id);
/** Painted art (art/, Laimonas's and the house style's). */
export const crew = (role) => `../art/crew/${role}.png`;
export const foe = (k) => `../art/foe/${k}.png`;
export const HERO = '../art/communicator/hero.png';
export const PORTRAIT = '../art/communicator/portrait.png';
export const counter = (id, px = 14) => iconSvg(id, px);

const raw = import.meta.glob('./icons/*.svg', { query: '?raw', import: 'default', eager: true });
/** A glyph by its icons/ file name, inline, filled with the text colour. */
export function glyph(name, cls = '') {
  const svg = raw[`./icons/${name}.svg`] ?? '';
  return `<span class="g ${cls}">${svg.replace(/fill="#000"/g, 'fill="currentColor"')}</span>`;
}
