/**
 * Look parity and baked-ground checks (P51), run in the Claude app pane on a fresh page booted with `?scene=Play&seed=42&biome=city`
 * (front the tab first: a hidden pane does not load the scene):
 *   const { shots, seamShots, contextLoss } = await import('/games/proto-ld60-machinerra/tools/render-shots.js');
 *   await shots('before');   // -> games/proto-ld60-machinerra/capture/<tag>-<view>.png (git-ignored), canvas only
 * Compare the stills of two tags: `node games/proto-ld60-machinerra/tools/png-diff.cjs before after`. Lights and fire move with the
 * wall clock, so two runs of the same code already differ in a few per cent of the pixels: that is the floor to read a diff against.
 * Long runs time the call out: start them without `await` and poll.
 */

/** The WebGL context lost and given back with rubble on screen: the baked ground must come back (stills `<tag>-ctx-pre` and `-post`; compare them). */
export async function contextLoss(tag, at = [2048, 1024]) {
  const s = __game.scene('Play'), c = s.sim.controller, gl = s.game.renderer.gl, lose = gl.getExtension('WEBGL_lose_context');
  await __game.cmd('god');
  await __game.cmd('timescale 0');
  c.x = at[0];
  c.y = at[1] + 60;
  await __game.cmd('prop scatter 300 wall 1 8');
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      c.x = at[0];
      c.y = at[1] + 60;
      __game.step(1);
    }
  };
  await __game.cmd('time 07:00');
  await settle();
  const pre = await __game.capture.shot(`${tag}-ctx-pre`, { ui: false });
  lose.loseContext();
  await new Promise((r) => setTimeout(r, 300));
  const lost = gl.isContextLost();
  lose.restoreContext();
  await new Promise((r) => setTimeout(r, 800));
  await __game.cmd('time 07:00');
  await settle();
  const post = await __game.capture.shot(`${tag}-ctx-post`, { ui: false });
  await __game.cmd('timescale 1');
  return { pre, post, lost, ground: s.debugState().ground };
}

/**
 * Chunk seams: a field of rubble over the corner where four 1024 px chunks meet ((2048, 1024) by default), shot at zoom 0.6, 1 and 1.5
 * with the camera on the corner. Run it on a fresh page, once per tag.
 */
export async function seamShots(tag, at = [2048, 1024]) {
  const s = __game.scene('Play'), c = s.sim.controller;
  await __game.cmd('god');
  await __game.cmd('timescale 0');
  c.x = at[0];
  c.y = at[1] + 60;
  await __game.cmd('prop scatter 500 wall 1 7');
  const out = {};
  for (const zoom of [0.6, 1, 1.5]) {
    s.cmd.want = zoom;
    s.cmd.zoom = zoom;
    await __game.cmd('time 07:00');
    for (let i = 0; i < 100; i++) {
      c.x = at[0];
      c.y = at[1] + 60;
      __game.step(1);
    }
    out[`z${zoom}`] = await __game.capture.shot(`${tag}-seam-z${zoom}`, { ui: false });
  }
  await __game.cmd('timescale 1');
  return out;
}

/**
 * The same stills before and after a change: a mixed stress patch round the first ruin with six pieces (walls, debris and one of
 * every kind, some of them rubble), then everything within 5 tiles broken; at zoom 1, 0.6 and 1.5 and at evening, the clock pinned.
 */
export async function shots(tag, at = [2000, 944]) {
  const s = __game.scene('Play'), c = s.sim.controller, cam = s.cameras.main;
  const wait = (n) => __game.step(n);
  await __game.cmd('god');
  c.x = at[0];
  c.y = at[1] + 60;
  for (const [n, kind] of [[260, 'wall'], [80, 'debris'], [30, 'crate'], [14, 'barrel'], [6, 'tank'], [6, 'car'], [4, 'tower'], [6, 'transformer'], [8, 'propane'], [6, 'vending'], [4, 'ball'], [4, 'sign']]) await __game.cmd(`prop scatter ${n} ${kind} ${kind === 'wall' || kind === 'debris' ? 0.15 : 0.1} 14`);
  wait(30);
  const out = {};
  const frame = async (name, zoom, time = '07:00') => {
    // The sun turns with the clock, and the clock runs while the page loads: pin it, then hold the mission still.
    await __game.cmd('timescale 0');
    await __game.cmd(`time ${time}`);
    s.cmd.want = zoom;
    s.cmd.zoom = zoom;
    // The camera and the zoom ease toward their goals (liftview, commandmode): enough steps that they sit exactly on them.
    for (let i = 0; i < 100; i++) {
      c.x = at[0];
      c.y = at[1] + 60;
      wait(1);
    }
    out[name] = await __game.capture.shot(`${tag}-${name}`, { ui: false });
  };
  await frame('a-standing', 1);
  await __game.cmd('timescale 1');
  await __game.cmd('prop break 5');
  wait(240);
  await frame('b-broken', 1);
  await frame('c-wide', 0.6);
  await frame('d-close', 1.5);
  await frame('e-evening', 1, 'evening');
  await __game.cmd('timescale 1');
  return out;
}
