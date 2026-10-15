// Montenegro, 2024: the evening clock and the entrances. The page works without this; with it, the clock beside the
// last evening shows the time of the frame in view. Runs on the first load and again after the site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-dump="montenegro-2024"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const $$ = s => [...main.querySelectorAll(s)];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window)) return main.removeAttribute('data-js');

  // ---- The clock: the time of the row crossing the middle of the screen.
  const t = main.querySelector('.clock .t'), rows = $$('.dusk .row');
  function show(time) {
    if (t.textContent === time) return;
    t.textContent = time;
    if (!still) { t.classList.remove('tick'); void t.offsetWidth; t.classList.add('tick'); }
  }
  show(rows[0].dataset.t);
  const middle = new IntersectionObserver(es => {
    es.filter(e => e.isIntersecting).forEach(e => show(e.target.dataset.t));
  }, { rootMargin: '-45% 0px -45% 0px' });
  rows.forEach(r => middle.observe(r));

  // ---- Entrances: each part rises once as it arrives, a few at a time.
  if (still) return;
  const parts = $$('.opening h1, .facts p, .index li, .date .num, .date .label, .drop h2, .stage .num, .shot, .stop h3, .clock');
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
