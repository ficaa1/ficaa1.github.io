// Istanbul, 2025: the ferry window and the entrances. The page works without this; with it, the frames of the crossing
// take turns in one window and a time picks one. Runs on the first load and again after the site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-dump="istanbul-2025"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const $ = s => main.querySelector(s), $$ = s => [...main.querySelectorAll(s)];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- The ferry: one window, the frames of the crossing in turn. Choosing a time stops the turning.
  const win = $('.window'), panes = $$('.pane'), times = $$('.times button'), cap = $('.ferry .cap');
  let at = 0, turning = !still, seen = false;
  function pane(k) {
    at = (k + panes.length) % panes.length;
    panes.forEach((p, j) => {
      p.classList.toggle('on', j === at);
      const a = p.querySelector('a');
      if (a) a.tabIndex = j === at ? 0 : -1;
    });
    times.forEach((b, j) => b.setAttribute('aria-pressed', String(j === at)));
    cap.textContent = panes[at].querySelector('.meta').textContent;
  }
  pane(0);
  $('.times').hidden = false; cap.hidden = false;
  times.forEach((b, j) => b.addEventListener('click', () => { turning = false; pane(j); }));
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; }).observe(win);
  const timer = setInterval(() => {
    if (!main.isConnected) return clearInterval(timer);
    if (turning && seen && !document.hidden) pane(at + 1);
  }, 5200);

  // ---- Entrances: each part rises once as it arrives, a few at a time.
  if (still || !('IntersectionObserver' in window)) return;
  const parts = $$('.opening h1, .opening .when, .opening .gear, .cover, .day > h2, .sign, .shot, .window, .times');
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
