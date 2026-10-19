import { describe, expect, it } from 'vitest';
import type { ModuleNode } from 'vite';
import { ASSET_URL, declaresScene, isGameSource } from './vite-plugin';
import { plan } from './graph';
import { artGame, audioGame } from './assets-plugin';
import { mapSwap, rebase } from './swapmap';

describe('hot plugin filters', () => {
  it('finds scene modules in game sources only', () => {
    expect(declaresScene('export class Play extends Phaser.Scene {')).toBe(true);
    expect(declaresScene('export default class Lit extends Scene {')).toBe(true);
    expect(declaresScene('class Hud extends BaseScene {')).toBe(true);
    expect(declaresScene('export const rules = {}; // a scene is a Scene')).toBe(false);
    expect(isGameSource('D:/x/games/lab/src/scenes/Lit.ts')).toBe(true);
    expect(isGameSource('D:/x/games/lab/src/rules.test.ts')).toBe(false);
    expect(isGameSource('D:/x/games/lab/dist/assets/a.js')).toBe(false);
    expect(isGameSource('D:/x/harness/kit/title.ts')).toBe(false);
  });

  it('announces loadable files but not capture output, previews, builds or levels', () => {
    for (const ok of ['/games/lab/public/assets/atlas.json', '/games/lab/public/assets/atlas-0.png', '/games/w/public/audio/sfx/hit.ogg', '/games/lab/art/horned-figure.webp'])
      expect(ASSET_URL.test(ok), ok).toBe(true);
    for (const no of ['/games/lab/capture/shot.png', '/games/lab/capture/bugs/b.json', '/games/lab/public/previews/Kit.webp', '/games/lab/dist/a.png', '/games/lab/levels/demo.json', '/games/lab/src/Play.ts'])
      expect(ASSET_URL.test(no), no).toBe(false);
  });
});

describe('assets plugin', () => {
  it('names the game of a source image or sizes.json, not of build output', () => {
    expect(artGame('/games/lab/art/blob/idle-01.png')).toBe('lab');
    expect(artGame('/games/wild-horns/art/sizes.json')).toBe('wild-horns');
    expect(artGame('/games/lab/art/music/a.mp3')).toBe(null);
    expect(artGame('/games/lab/public/assets/atlas-0.png')).toBe(null);
    expect(audioGame('/games/wildhold/audio/sfx/chop.wav')).toBe('wildhold');
    expect(audioGame('/games/proto-x/audio/music/day/1-pads.flac')).toBe('proto-x');
    expect(audioGame('/games/wildhold/public/audio/sfx/chop.ogg')).toBe(null);
    expect(audioGame('/games/lab/art/music/a.mp3')).toBe(null);
  });
});

describe('plan', () => {
  const node = (name: string, o: Partial<ModuleNode> = {}) => ({ id: name, importers: new Set(), acceptedHmrDeps: new Set(), isSelfAccepting: false, ...o }) as unknown as ModuleNode;
  const imports = (importer: ModuleNode, dep: ModuleNode) => dep.importers.add(importer);

  it('ends at the scene modules that import the change', () => {
    const rules = node('rules.ts'), a = node('A.ts', { isSelfAccepting: true }), b = node('B.ts', { isSelfAccepting: true }), main = node('main.ts');
    imports(a, rules); imports(b, rules); imports(main, a); // main sits above a scene: not reached
    const p = plan([rules])!;
    expect([...p.boundaries]).toEqual([a, b]);
    expect(p.chain.has(main)).toBe(false);
  });

  it('is null when any path reaches a module that cannot swap', () => {
    const rules = node('rules.ts'), a = node('A.ts', { isSelfAccepting: true }), main = node('main.ts');
    imports(a, rules); imports(main, rules);
    expect(plan([rules])).toBeNull();
    expect(plan([])).toBeNull();
  });

  it('names the module that ends a path and the one it was reached from', () => {
    const rules = node('rules.ts'), glue = node('glue.ts'), main = node('main.ts');
    imports(glue, rules); imports(main, glue);
    const blockers: [ModuleNode, ModuleNode][] = [];
    expect(plan([rules], blockers)).toBeNull();
    expect(blockers).toEqual([[glue, main]]);
  });
});

describe('mapSwap', () => {
  // Stand-ins for classes: `Root` is Phaser.Scene. `again` makes the class a module evaluation would produce (same name, new identity), optionally on a new base.
  class Root {}
  const sub = (name: string, base: Function) => ({ [name]: class extends (base as typeof Root) {} })[name];
  const again = (c: Function, base: Function = Object.getPrototypeOf(c)) => sub(c.name, base);
  const map = (...classes: Function[]) => new Map(classes.map((c) => [c.name, c]));

  it('replaces a scene whose class changed', () => {
    const Hub = sub('Hub', Root), Hub2 = again(Hub);
    const p = mapSwap([{ key: 'Hub', cls: Hub }], map(Hub2), Root);
    expect([...p.replace]).toEqual([['Hub', Hub2]]);
    expect(p.reparent).toEqual([]);
    expect(p.touched).toEqual(['Hub']);
  });

  it('a changed base and its subclass in the same module are both replaced, with nothing to re-parent', () => {
    const Play = sub('Play', Root), Dungeon = sub('Dungeon', Play);
    const Play2 = again(Play), Dungeon2 = again(Dungeon, Play2);
    const p = mapSwap([{ key: 'Play', cls: Play }, { key: 'Dungeon', cls: Dungeon }], map(Play2, Dungeon2), Root);
    expect(p.replace.get('Play')).toBe(Play2);
    expect(p.replace.get('Dungeon')).toBe(Dungeon2);
    expect(p.reparent).toEqual([]);
    expect(p.touched).toEqual(['Play', 'Dungeon']);
  });

  it('re-parents a scene in another module that extends the changed base', () => {
    const Play = sub('Play', Root), Dungeon = sub('Dungeon', Play), Boss = sub('Boss', Dungeon);
    const Play2 = again(Play);
    const p = mapSwap([{ key: 'Play', cls: Play }, { key: 'Dungeon', cls: Dungeon }, { key: 'Boss', cls: Boss }], map(Play2), Root);
    expect([...p.replace]).toEqual([['Play', Play2]]);
    // Boss reaches Play through Dungeon: only the class directly under it is re-parented, and both scenes restart.
    expect(p.reparent).toEqual([{ key: 'Dungeon', sub: Dungeon, base: Play2 }, { key: 'Boss', sub: Dungeon, base: Play2 }]);
    expect(p.touched).toEqual(['Play', 'Dungeon', 'Boss']);
  });

  it('a base class no scene is registered under is still found through its subclasses', () => {
    const Base = sub('Base', Root), Level = sub('Level', Base);
    const Base2 = again(Base);
    const p = mapSwap([{ key: 'Level', cls: Level }], map(Base2), Root);
    expect(p.replace.size).toBe(0);
    expect(p.reparent).toEqual([{ key: 'Level', sub: Level, base: Base2 }]);
    expect(p.unused).toEqual([]);
  });

  it('leaves alone a class nothing registered is or extends, and an unchanged one', () => {
    const Menu = sub('Menu', Root), Spare = sub('Spare', Root);
    const p = mapSwap([{ key: 'Menu', cls: Menu }], map(Menu, Spare), Root);
    expect(p.touched).toEqual([]);
    expect(p.unused).toEqual(['Spare']);
  });

  it('a rebased class gets the new base through super() and inheritance', () => {
    class Old { who() { return 'old'; } extra() { return 'old'; } }
    class New { who() { return 'new'; } static made = 'new'; constructor(public built = 'new') {} }
    class Sub extends (Old as any) { constructor() { super('x'); } who() { return `sub of ${super.who()}`; } }
    rebase(Sub, New);
    const s = new Sub() as any;
    expect(s.built).toBe('x');
    expect(s.who()).toBe('sub of new');
    expect(s.extra).toBeUndefined();
    expect((Sub as any).made).toBe('new');
  });
});
