// Montenegro: the evening clock and the entrances, on the country's page and its places'. The pages work without this;
// with it, the clock beside an evening shows the time of the frame in view. Runs on the first load and again after the
// site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-country="montenegro"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const $$ = (s, root = main) => [...root.querySelectorAll(s)];
  const still = (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-lite'));
  if (!('IntersectionObserver' in window)) return main.removeAttribute('data-js');

  // ---- The clock of each evening: the time of the row crossing the middle of the screen.
  for (const dusk of $$('.dusk')) {
    const t = dusk.querySelector('.clock .t'), rows = $$('.row', dusk);
    if (!t || !rows.length) continue;
    const show = time => {
      if (t.textContent === time) return;
      t.textContent = time;
      if (!still) { t.classList.remove('tick'); void t.offsetWidth; t.classList.add('tick'); }
    };
    show(rows[0].dataset.t);
    const middle = new IntersectionObserver(es => {
      es.filter(e => e.isIntersecting).forEach(e => show(e.target.dataset.t));
    }, { rootMargin: '-45% 0px -45% 0px' });
    rows.forEach(r => middle.observe(r));
  }

  // ---- Entrances: each part rises once as it arrives, a few at a time.
  if (still) return;
  const parts = $$('.facts p, .places li, .month li.on, .date .num, .date .label, .drop > .label, .stage .num, .shot, .augusts h2, .clock');
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
