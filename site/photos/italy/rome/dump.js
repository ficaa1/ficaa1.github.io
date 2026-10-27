// Rome, 2025: the films and the entrances. The page works without this. Runs on the first load and again after the
// site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-dump="rome-2025"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const still = (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('[data-lite],[data-still]'));

  // The films: no controls with script; each plays while it is on screen, and never with reduced motion.
  const loops = [...main.querySelectorAll('video.loop')];
  loops.forEach(v => { v.controls = still; });
  if (still || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) e.target.play().catch(() => { e.target.controls = true; });
    else e.target.pause();
  }), { rootMargin: '10% 0px' });
  loops.forEach(v => io.observe(v));

  // Each part rises once as it arrives, a few at a time; the second frame of a step a little after the first.
  const parts = [...main.querySelectorAll('.index li, .facts p, .cover, .head h2, .where, .f')];
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
