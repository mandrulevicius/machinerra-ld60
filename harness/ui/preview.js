// Review-page helper: theme switcher, page nav, stage scaling, demo tabs. Not part of the kit.
(function () {
  const base = new URL('.', document.currentScript.src).href;
  const themes = ['greybox', 'clean', 'pixel', 'fantasy']; // greybox = tokens.css defaults; the rest are samples
  const pages = [['kitchen-sink.html', 'Kitchen sink'], ['mockups/title.html', 'Title'], ['mockups/hud.html', 'HUD'], ['mockups/pause.html', 'Game menu'], ['mockups/results.html', 'Results']];
  let theme = new URLSearchParams(location.search).get('theme');
  try { theme = theme || localStorage.getItem('ui-theme'); } catch (e) {}
  if (!themes.includes(theme)) theme = themes[0];
  const root = document.documentElement;
  root.dataset.theme = theme;

  document.head.append(Object.assign(document.createElement('script'), { src: base + '../hub-esc.js' })); // Esc goes up to the hub

  const bar = document.createElement('header');
  bar.className = 'pv-bar';
  const probe = document.body.dataset.probe; // the lab probe for the same feature, if there is one
  bar.innerHTML = `<a href="${base}../../games/index.html#harness">← Hub</a>` + '<label>Theme <select>' + themes.map(t => `<option${t === theme ? ' selected' : ''}>${t}</option>`).join('') + '</select></label>' +
    pages.map(([h, n]) => `<a href="${base}${h}"${location.pathname.endsWith('/' + h) ? ' aria-current="page"' : ''}>${n}</a>`).join('') +
    (probe ? `<a href="${base}../../games/lab/?scene=${probe}" title="The lab probe for this feature">Lab probe: ${probe}</a>` : '');
  document.body.prepend(bar);
  bar.querySelector('select').addEventListener('change', e => {
    root.dataset.theme = e.target.value;
    try { localStorage.setItem('ui-theme', e.target.value); } catch (err) {}
    fit();
  });

  function fit() {
    document.querySelectorAll('.stage').forEach(stage => {
      const wrap = stage.parentElement;
      const s = Math.min(1, (wrap.parentElement.clientWidth - 32) / 1280);
      stage.style.transform = `scale(${s})`;
      wrap.style.width = 1280 * s + 'px';
      wrap.style.height = 720 * s + 'px';
    });
  }
  addEventListener('resize', fit);
  fit();

  document.addEventListener('click', e => {
    const tab = e.target.closest('.ui-tab');
    if (!tab) return;
    const list = tab.closest('.ui-tabs');
    list.querySelectorAll('.ui-tab').forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
  });
})();
