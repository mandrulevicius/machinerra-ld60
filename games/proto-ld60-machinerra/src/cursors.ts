/**
 * Themed mouse cursors, brass on soot iron, drawn in code into small CSS cursor images: the sight (aiming the weapons),
 * the command frame (command mode) and the gear (something usable or orderable under the mouse). Each is a dark outline
 * under a brass stroke so it reads on sand, on soot and on the night.
 * `commandmode.ts` sets them only while `sim.phase === 'mission'`; the hub shows the system pointer (`Hub.create` resets it).
 */
export type CursorKind = 'aim' | 'command' | 'use';

const SOOT = '#14100c';
const BRASS = '#c8963c';
const BRASS_HI = '#ffd98a';
const AMBER = '#ffb640';
const N = 40;
const C = N / 2;

/** Stroke a path twice: a fat soot line, then the brass one over it. */
function stroke(c: CanvasRenderingContext2D, color: string, w: number, draw: () => void) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  draw();
  c.strokeStyle = SOOT;
  c.lineWidth = w + 3;
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = w;
  c.stroke();
}

const painters: Record<CursorKind, (c: CanvasRenderingContext2D) => void> = {
  // A gun sight: a ring with four ticks and a gap at the centre, a bright pin in the middle.
  aim(c) {
    stroke(c, BRASS, 2, () => c.arc(C, C, 10, 0, Math.PI * 2));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      stroke(c, BRASS, 2, () => {
        c.moveTo(C + Math.cos(a) * 6, C + Math.sin(a) * 6);
        c.lineTo(C + Math.cos(a) * 16, C + Math.sin(a) * 16);
      });
    }
    c.fillStyle = BRASS_HI;
    c.beginPath();
    c.arc(C, C, 1.6, 0, Math.PI * 2);
    c.fill();
  },
  // A survey frame: four corner brackets round a diamond, in amber so it never passes for the sight.
  command(c) {
    const r = 13, l = 7;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      stroke(c, AMBER, 2.4, () => {
        c.moveTo(C + sx * r, C + sy * (r - l));
        c.lineTo(C + sx * r, C + sy * r);
        c.lineTo(C + sx * (r - l), C + sy * r);
      });
    }
    stroke(c, BRASS_HI, 1.6, () => {
      c.moveTo(C, C - 4.5);
      c.lineTo(C + 4.5, C);
      c.lineTo(C, C + 4.5);
      c.lineTo(C - 4.5, C);
      c.closePath();
    });
  },
  // A cog: eight teeth, a hole in the hub.
  use(c) {
    const teeth = 8, rIn = 8, rOut = 12.5;
    c.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i * Math.PI * 2) / teeth;
      for (const [da, r] of [[-0.26, rIn], [-0.15, rOut], [0.15, rOut], [0.26, rIn]]) c.lineTo(C + Math.cos(a + da) * r, C + Math.sin(a + da) * r);
    }
    c.closePath();
    c.fillStyle = BRASS;
    c.fill();
    c.strokeStyle = SOOT;
    c.lineWidth = 2.4;
    c.lineJoin = 'round';
    c.stroke();
    c.beginPath();
    c.arc(C, C, 3.4, 0, Math.PI * 2);
    c.fillStyle = SOOT;
    c.fill();
    c.beginPath();
    c.arc(C - 1.5, C - 1.5, 5.4, Math.PI * 1.1, Math.PI * 1.7);
    c.strokeStyle = BRASS_HI;
    c.lineWidth = 1.4;
    c.stroke();
  },
};

const cache = new Map<CursorKind, string>();

/** The CSS `cursor` value for a kind (drawn once). The hotspot is the middle of the image. */
export function cursorCss(kind: CursorKind): string {
  let css = cache.get(kind);
  if (css) return css;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  painters[kind](c);
  css = `url(${cv.toDataURL('image/png')}) ${C} ${C}, ${kind === 'use' ? 'pointer' : 'crosshair'}`;
  cache.set(kind, css);
  return css;
}
