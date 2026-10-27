// Photos, the front page: the film behind the squares plays while the page is showing, and never with reduced motion;
// without this the first frame stands still. Runs on the first load and again after the site swaps pages in place.
(() => {
  let v = document.querySelector('.lands .reel video');
  if (!v || v.dataset.on || (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('[data-lite],[data-still]'))) return;
  v.dataset.on = '1';
  // A film that came in with a page swapped in place was made in another document, and Safari on the iPhone neither
  // shows its poster nor plays it; a copy made here does both. The sound is off in script too, or autoplay is refused.
  if (document.readyState === 'complete') {
    const c = v.cloneNode(true);
    v.replaceWith(c); v = c;
  }
  v.muted = true;
  // The page asks for nothing ahead (preload none), and on the iPhone play() alone can leave the film waiting with
  // nothing fetched. Asking for it outright starts it, and it is asked again if a few seconds go by with nothing.
  v.preload = 'auto';
  v.load();
  setTimeout(() => { if (v.isConnected && v.readyState === 0) { v.load(); play(); } }, 3000);
  const play = () => { if (!document.hidden) v.play().catch(() => {}); };
  const seen = () => {
    if (!v.isConnected) { document.removeEventListener('visibilitychange', seen); return; }
    if (document.hidden) v.pause(); else play();
  };
  document.addEventListener('visibilitychange', seen);
  play();
})();

// On a phone, where nothing is pointed at, the squares a little above the middle of the screen show their picture (.lit, lands.css).
(() => {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('lit', e.isIntersecting)), { rootMargin: '-25% 0px -55% 0px' });
  document.querySelectorAll('.lands .land:has(.glimpse)').forEach(l => io.observe(l));
})();
