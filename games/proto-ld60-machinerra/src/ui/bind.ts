export interface BindTarget {
  textContent: string | null;
  innerHTML: string;
  hidden: boolean | string;
  style: { setProperty(name: string, value: string): void };
  classList: { toggle(name: string, force?: boolean): boolean };
  setAttribute(name: string, value: string): void;
}

export interface Bound<T extends BindTarget = HTMLElement> {
  readonly el: T;
  text(v: string): void;
  html(v: string): void;
  style(prop: string, v: string): void;
  attr(name: string, v: string): void;
  cls(name: string, on: boolean): void;
  hide(on: boolean): void;
}

/** Writes to one element only when the value differs from the last one this binder wrote; whatever else writes the same field must not be bound. */
export function bind<T extends BindTarget>(el: T): Bound<T> {
  let text: string | undefined, html: string | undefined, hidden: boolean | undefined;
  const styles = new Map<string, string>(), attrs = new Map<string, string>(), classes = new Map<string, boolean>();
  return {
    el,
    text(v) {
      if (v === text) return;
      text = v;
      html = undefined;
      el.textContent = v;
    },
    html(v) {
      if (v === html) return;
      html = v;
      text = undefined;
      el.innerHTML = v;
    },
    style(prop, v) {
      if (styles.get(prop) === v) return;
      styles.set(prop, v);
      el.style.setProperty(prop, v);
    },
    attr(name, v) {
      if (attrs.get(name) === v) return;
      attrs.set(name, v);
      el.setAttribute(name, v);
    },
    cls(name, on) {
      if (classes.get(name) === on) return;
      classes.set(name, on);
      el.classList.toggle(name, on);
    },
    hide(on) {
      if (on === hidden) return;
      hidden = on;
      el.hidden = on;
    },
  };
}
