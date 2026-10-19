import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';

const resolve = () => resolveConfig({ configFile: 'vite.config.ts' }, 'serve');

describe('mirrorPlugin', () => {
  const saved = process.env.OPTIMIZER_MIRROR;
  afterEach(() => {
    if (saved === undefined) delete process.env.OPTIMIZER_MIRROR;
    else process.env.OPTIMIZER_MIRROR = saved;
  });

  it('with OPTIMIZER_MIRROR set: no watcher, no ws, cacheDir from the env', async () => {
    process.env.OPTIMIZER_MIRROR = 'mirror-cache-scratch';
    const c = await resolve();
    expect(c.server.watch).toBeNull();
    expect(c.server.ws).toBe(false);
    expect(c.cacheDir).toMatch(/mirror-cache-scratch$/);
  });

  it('without it: capture globs still ignored, ws on, default cacheDir', async () => {
    delete process.env.OPTIMIZER_MIRROR;
    const c = await resolve();
    expect(c.server.watch).not.toBeNull();
    expect((c.server.watch as { ignored: string[] }).ignored).toContain('**/games/*/capture/**');
    expect(c.server.ws).not.toBe(false);
    expect(c.cacheDir).not.toMatch(/mirror-cache-scratch$/);
  });
});
