/**
 * Which registered scenes a new module touches (pure, so it is tested without Phaser; `client.ts` applies it).
 * Classes are matched by name, the way the client has always done it.
 */

export type Ctor = Function;

/** A scene as registered: its key and the class it was made from. */
export interface Registered {
  key: string;
  cls: Ctor;
}

export interface SwapPlan {
  /** Registered scenes whose own class is in the new module: they get the new class. */
  replace: Map<string, Ctor>;
  /** Registered scenes whose class (or an ancestor) extends an old version of a class in the new module: `sub` is made to extend `base`. */
  reparent: { key: string; sub: Ctor; base: Ctor }[];
  /** Every scene to restart: the replaced and the re-parented. */
  touched: string[];
  /** Classes of the module that no registered scene is or extends (an unused class, or one `main.ts` has yet to register): nothing to do. */
  unused: string[];
}

/**
 * `found`: the scene classes a changed module now exports, by name. `root` ends the walk up a class chain (`Phaser.Scene`).
 * A scene in another module that extends a changed base class (`Dungeon extends Play`) keeps the old base unless it is
 * re-parented, so it is listed with the new base to hand it.
 */
export function mapSwap(registered: readonly Registered[], found: ReadonlyMap<string, Ctor>, root: Ctor): SwapPlan {
  const replace = new Map<string, Ctor>();
  const reparent: SwapPlan['reparent'] = [];
  const touched = new Set<string>();
  const used = new Set<string>();
  for (const { key, cls } of registered) {
    const fresh = found.get(cls.name);
    if (fresh) used.add(cls.name);
    if (fresh && fresh !== cls) {
      replace.set(key, fresh);
      touched.add(key);
    }
    // Walk up from the class the scene will have; the first old base found is swapped for the new one, whose own chain is the new module's.
    for (let c: Ctor = fresh ?? cls; ; ) {
      const base = Object.getPrototypeOf(c) as Ctor | null;
      if (typeof base !== 'function' || base === root || base === Function.prototype) break;
      const next = found.get(base.name);
      if (next && next !== base) {
        reparent.push({ key, sub: c, base: next });
        touched.add(key);
        used.add(base.name);
        break;
      }
      if (next) used.add(base.name);
      c = base;
    }
  }
  return { replace, reparent, touched: [...touched], unused: [...found.keys()].filter((n) => !used.has(n)) };
}

/** Make `sub` extend `base`: its constructor's `super(...)`, inherited methods and statics all follow the new class. */
export function rebase(sub: Ctor, base: Ctor) {
  Object.setPrototypeOf(sub.prototype, base.prototype);
  Object.setPrototypeOf(sub, base);
}
