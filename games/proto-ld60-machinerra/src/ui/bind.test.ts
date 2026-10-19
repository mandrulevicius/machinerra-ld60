import { describe, expect, it } from 'vitest';
import { bind, type BindTarget } from './bind';

function fake() {
  const log: string[] = [];
  const el: BindTarget = {
    textContent: '',
    innerHTML: '',
    hidden: false,
    style: { setProperty: (n, v) => void log.push(`style ${n}=${v}`) },
    classList: { toggle: (n, f) => (log.push(`cls ${n}=${f}`), !!f) },
    setAttribute: (n, v) => void log.push(`attr ${n}=${v}`),
  };
  return { el, log };
}

describe('bind', () => {
  it('writes text, style, attr and class once per change', () => {
    const { el, log } = fake();
    const b = bind(el);
    for (let i = 0; i < 3; i++) {
      b.text('a');
      b.style('width', '5%');
      b.attr('opacity', '1');
      b.cls('on', true);
    }
    expect(log).toEqual(['style width=5%', 'attr opacity=1', 'cls on=true']);
    expect(el.textContent).toBe('a');
    b.text('b');
    b.style('width', '6%');
    b.cls('on', false);
    expect(el.textContent).toBe('b');
    expect(log.slice(3)).toEqual(['style width=6%', 'cls on=false']);
  });

  it('text and html invalidate each other', () => {
    const { el } = fake();
    const b = bind(el);
    b.text('x');
    b.html('<i>y</i>');
    expect(el.innerHTML).toBe('<i>y</i>');
    b.text('x');
    expect(el.textContent).toBe('x');
    b.html('<i>y</i>');
    expect(el.innerHTML).toBe('<i>y</i>');
  });

  it('hide writes on change only', () => {
    const { el } = fake();
    const b = bind(el);
    b.hide(false);
    expect(el.hidden).toBe(false);
    b.hide(true);
    expect(el.hidden).toBe(true);
  });
});
