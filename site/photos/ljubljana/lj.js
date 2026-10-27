// Ljubljana: the hour of each day and the entrances. The page works without this; with it, the mark on a day's rule
// for the frame in view lights up. Runs on the first load and again after the site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-country="ljubljana"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const $$ = (s, root = main) => [...root.querySelectorAll(s)];
  const still = (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-lite'));
  if (!('IntersectionObserver' in window)) return main.removeAttribute('data-js');

  // ---- The hour: the mark of the frame crossing the middle of the screen.
  for (const day of $$('.day')) {
    const marks = new Map($$('.rule a', day).map(a => [a.getAttribute('href').slice(1), a.parentElement]));
    const middle = new IntersectionObserver(es => {
      for (const e of es.filter(e => e.isIntersecting)) {
        const a = e.target.querySelector('.open');
        if (!a || !marks.has(a.id)) continue;
        marks.forEach(li => li.classList.remove('on'));
        marks.get(a.id).classList.add('on');
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    $$('.shot', day).forEach(s => middle.observe(s));
  }

  // ---- Entrances: each part rises once as it arrives, a few at a time.
  if (still) return;
  const parts = $$('.arms, .half .cover, .half .when, .openers li, .half .gear, .date .num, .date h2, .hour, .shot');
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
