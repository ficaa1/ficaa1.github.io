// Italy: the entrances, on the country's page and its places'. The pages work without this. Runs on the first load and
// again after the site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-country="italy"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  if ((matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('[data-lite],[data-still]')) || !('IntersectionObserver' in window)) return;
  const parts = [...main.querySelectorAll('.title .arms, .title h1, .facts, .places li, .intro .cover, .road li, .date, .leave .sign, .shot, .boot, .door, .avenue li, .plinth')];
  // Each part rises once as it arrives, a few at a time; a sign on the way out is crossed out after it lands.
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
