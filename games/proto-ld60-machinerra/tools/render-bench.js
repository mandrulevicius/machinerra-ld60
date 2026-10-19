/**
 * Render-budget bench (P51). In the Claude app pane, on a land booted with `?scene=Play&seed=42&biome=city`:
 *   const { bench } = await import('/games/proto-ld60-machinerra/tools/render-bench.js');
 *   await __game.cmd('prop scatter 2000');   // the stress land: props across the whole land, 12% rubble
 *   await bench({ label: 'after, 2000' });
 * The camera loops over the land at a robot's pace (the controller is moved, so everything follows); `game.step` is timed
 * with the GPU drained first, so `cpu` is JS plus command submission. `view` is PropView.update alone (and `shadow` ShadowView's).
 * Objects and draw calls do not depend on the machine's load; the times do, so run it alone and compare runs back to back.
 */
export async function bench({ label = '', frames = 240, settle = 40, px = 4, zoom = 1 } = {}) {
  const s = __game.scene('Play'), game = s.game, r = game.renderer, gl = r.gl, buf = new Uint8Array(4);
  const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const hook = (name) => {
    const v = s.views.find((x) => x.constructor.name === name);
    if (!v) return () => 0;
    const acc = v.__p51 ?? (v.__p51 = { t: 0 });
    if (!acc.on) {
      acc.on = true;
      const orig = v.update.bind(v);
      v.update = (...a) => {
        const t = performance.now();
        orig(...a);
        acc.t += performance.now() - t;
      };
    }
    return () => {
      const t = acc.t;
      acc.t = 0;
      return t;
    };
  };
  const view = hook('PropView'), shadow = hook('ShadowView');
  
  if (!gl.__p51) {
    gl.__p51 = true;
    gl.__n = 0;
    for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const o = gl[f].bind(gl);
      gl[f] = (...a) => (gl.__n++, o(...a));
    }
  }
  const W = s.sim.W * 32, H = s.sim.H * 32, c = s.sim.controller, cam = s.cameras.main;
  s.cmd.want = zoom;
  s.cmd.zoom = zoom;
  let t = performance.now(), cpu = 0, vsum = 0, ssum = 0;
  const d0 = gl.__n;
  let n = 0, worst = 0;
  const startX = c.x, startY = c.y;
  for (let f = -settle; f < frames; f++) {
    // a loop over the land: ~4 px a frame, a robot's walking pace at 60 fps is ~2.5
    const k = (f + settle) * px;
    c.x = Math.min(W - 200, Math.max(200, W / 2 + W * 0.33 * Math.sin(k * 0.0016 * 4)));
    c.y = Math.min(H - 200, Math.max(200, H / 2 + H * 0.33 * Math.sin(k * 0.0023 * 4 + 1)));
    cam.centerOn(c.x, c.y);
    drain();
    const t0 = performance.now();
    game.step((t += 1000 / 60), 1000 / 60);
    const dt = performance.now() - t0;
    const v = view(), sh = shadow();
    if (f >= 0) {
      cpu += dt;
      vsum += v;
      ssum += sh;
      worst = Math.max(worst, dt);
      n++;
    }
  }
  drain();
  c.x = startX;
  c.y = startY;
  const kids = s.children.list;
  const out = {
    label,
    listed: s.sim.props.list.length,
    objects: kids.length,
    visible: kids.reduce((a, o) => a + (o.visible ? 1 : 0), 0),
    drawsPerFrame: +((gl.__n - d0) / (frames + settle)).toFixed(1),
    cpuMs: +(cpu / n).toFixed(2),
    worstMs: +worst.toFixed(1),
    propViewMs: +(vsum / n).toFixed(3),
    shadowViewMs: +(ssum / n).toFixed(3),
    ...(s.views.find((x) => x.constructor.name === 'PropView')?.debug?.() ?? {}),
  };
  return out;
}
