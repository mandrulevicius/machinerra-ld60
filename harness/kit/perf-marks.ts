/** Named frame sections for `optimizer browser perf`. Off, each call is one flag check; on, `perfEnd` emits `performance.measure('perf:' + name)` and clears its entries, so the buffer stays flat while the trace keeps the event. */
let on = false;
const names = new Map<string, { start: string; measure: string }>();

export function setPerfMarks(value: boolean) {
  on = value;
}

export function perfMarksOn() {
  return on;
}

export function perfStart(name: string) {
  if (!on) return;
  let n = names.get(name);
  if (n === undefined) names.set(name, (n = { start: `perf:${name}:s`, measure: `perf:${name}` }));
  performance.mark(n.start);
}

export function perfEnd(name: string) {
  if (!on) return;
  const n = names.get(name);
  if (n === undefined) return;
  performance.measure(n.measure, n.start);
  performance.clearMarks(n.start);
  performance.clearMeasures(n.measure);
}
