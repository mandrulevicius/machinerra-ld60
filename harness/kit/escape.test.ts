import { afterEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { onEscape, runEscape } from './escape';

const open: { shutdown(): void }[] = [];
afterEach(() => open.splice(0).forEach((s) => s.shutdown())); // the stack is module state

const scene = () => {
  const e = new EventEmitter();
  const s = { events: { once: e.once.bind(e), off: e.off.bind(e) }, shutdown: () => e.emit('shutdown') } as any;
  open.push(s);
  return s;
};

describe('escape stack', () => {
  it('runs the newest handler first and stops at the first that consumes', () => {
    const s = scene();
    const log: string[] = [];
    onEscape(s, () => (log.push('old'), true));
    onEscape(s, () => (log.push('new'), true));
    expect(runEscape()).toBe(true);
    expect(log).toEqual(['new']);
  });

  it('passes on to older handlers, then to the kit (false), when a handler does not consume', () => {
    const s = scene();
    const log: string[] = [];
    onEscape(s, () => (log.push('old'), false));
    onEscape(s, () => void log.push('new'));
    expect(runEscape()).toBe(false);
    expect(log).toEqual(['new', 'old']);
  });

  it('unregisters on the returned function and on scene shutdown', () => {
    const a = scene();
    const b = scene();
    let n = 0;
    const off = onEscape(a, () => (n++, true));
    onEscape(b, () => (n += 10, true));
    b.shutdown();
    expect(runEscape()).toBe(true);
    expect(n).toBe(1);
    off();
    expect(runEscape()).toBe(false);
  });
});
