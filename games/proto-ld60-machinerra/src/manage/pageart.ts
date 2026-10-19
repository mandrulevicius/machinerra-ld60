/**
 * The game's pictures on a page with no Phaser scene (the kit page): the code-drawn art makers (`art.ts`, `relicart.ts`, ...) run once
 * into a stand-in scene that only keeps their canvases; the painted art comes from `art/` as files. Lifted from the mockups' `art.js`.
 * In the game the dock reads the scene's own textures instead (`dock/sceneart.ts`).
 */
import { iconUrl } from '../gearart';
import { relicTex } from '../relicart';
import type { Art } from './art';

const store: Record<string, HTMLCanvasElement> = {};
// Anything a maker reaches for that the stand-in does not hold answers with itself, so the maker carries on.
const any: unknown = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : any), apply: () => any, construct: () => any as object });
const textures = {
  exists: (k: string) => k in store,
  createCanvas: (k: string, w: number, h: number) => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    store[k] = cv;
    return { getContext: () => cv.getContext('2d'), refresh() {}, getSourceImage: () => cv };
  },
  get: () => any,
  addCanvas: () => any,
};
const scene = new Proxy({ textures } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : any) });

const MAKERS: [() => Promise<Record<string, unknown>>, string][] = [
  [() => import('../art'), 'makeArt'],
  [() => import('../relicart'), 'makeRelicArt'],
];

/** Run the makers once (a maker that stops part way keeps what it drew). */
export async function loadPageArt() {
  for (const [load, fn] of MAKERS) {
    try {
      const m = await load();
      (m[fn] as ((s: unknown) => void) | undefined)?.(scene);
    } catch (e) {
      console.info(`page art: ${fn} stopped: ${(e as Error).message}`);
    }
  }
}

const urls: Record<string, string> = {};
const tex = (k: string) => (urls[k] ||= store[k]?.toDataURL() ?? '');

/** The dock's pictures on a page; `base` is the game folder's URL from the page. */
export function pageArt(base = './'): Art {
  return {
    item: iconUrl,
    crew: (role) => `${base}art/crew/${role}.png`,
    hero: () => `${base}art/communicator/hero.png`,
    portrait: () => `${base}art/communicator/portrait.png`,
    relic: (id) => tex(relicTex(id)),
    part: (k) => tex(`part-${k}`),
    scrap: () => tex('scrapgob'),
    copper: () => tex('coppergob'),
  };
}
