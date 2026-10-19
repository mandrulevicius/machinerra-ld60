/**
 * The dock's pictures in a running scene: the game's own textures as data URLs, each made once and kept while the scene lives
 * (`getBase64` draws a canvas, so it is not cheap). Item icons are `gearart.ts`'s; crews, the Communicator and his portrait the
 * painted atlas; relics `relicart.ts`'s; parts and the scrap and copper gobs the code-drawn textures.
 */
import type Phaser from 'phaser';
import { iconUrl } from '../gearart';
import { relicTex } from '../relicart';
import type { DockArt } from './dockview';

export function sceneArt(scene: Phaser.Scene): DockArt {
  const kept = new Map<string, string>();
  const tex = (key: string, frame?: string) => {
    const k = frame ? `${key}#${frame}` : key;
    let url = kept.get(k);
    if (url === undefined) {
      url = scene.textures.exists(key) ? scene.textures.getBase64(key, frame) : '';
      kept.set(k, url);
    }
    return url;
  };
  return {
    item: iconUrl,
    crew: (role) => tex('atlas', `crew/${role}`),
    hero: () => tex('atlas', 'communicator/hero'),
    portrait: () => tex('atlas', 'communicator/portrait'),
    relic: (id) => tex(relicTex(id)),
    part: (k) => tex(`part-${k}`),
    scrap: () => tex('scrapgob'),
    copper: () => tex('coppergob'),
  };
}
