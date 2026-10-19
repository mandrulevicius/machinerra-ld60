// Harness pages (components sink, mockups, compare, embed): Esc goes up to the hub, like their "← Hub" link.
// Not while a text field has focus (Esc belongs to the field), nor when the key is the embedded game's: focus in its iframe, or a game that consumed it.
(function () {
  const hub = new URL('../games/index.html#harness', document.currentScript.src).href;
  const TEXT = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'IFRAME' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable || (a.tagName === 'INPUT' && TEXT.has(a.type)))) return;
    location.href = hub;
  });
})();
