// Photos, the front page: the film behind the squares plays while the page is showing, and never with reduced motion;
// without this the first frame stands still. Runs on the first load and again after the site swaps pages in place.
(() => {
  const v = document.querySelector('.lands .reel video');
  if (!v || v.dataset.on || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  v.dataset.on = '1';
  const play = () => { if (!document.hidden) v.play().catch(() => {}); };
  const seen = () => {
    if (!v.isConnected) { document.removeEventListener('visibilitychange', seen); return; }
    if (document.hidden) v.pause(); else play();
  };
  document.addEventListener('visibilitychange', seen);
  play();
})();
