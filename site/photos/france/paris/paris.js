// Paris: the train on the map, which runs the ride as the stops go by beside it, and the entrances. The page works
// without this: the map and its stops are links and the key lists the ride. Runs on the first load and again after the
// site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-place="paris"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const still = (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('[data-lite],[data-still]'));
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  // ---- The ride. Each stop in the key has a point on line 1 (its own, or the one where the ride changed line); the
  // train sits at the stop in the middle of the screen and runs between stops as the page scrolls.
  const route = main.querySelector('#route'), train = main.querySelector('.net .train');
  const items = [...main.querySelectorAll('.ride-key li[data-at]')].filter(li => li.dataset.at);
  const stns = new Map([...main.querySelectorAll('.net .stn')].map(a => [a.dataset.key, a]));
  const tracks = [...main.querySelectorAll('.net .track[data-line]')];
  let ride = null;
  if (route && train && items.length) {
    const total = route.getTotalLength(), N = 600, pts = [];
    for (let i = 0; i <= N; i++) { const p = route.getPointAtLength(total * i / N); pts.push([p.x, p.y, total * i / N]); }
    const along = ([x, y]) => pts.reduce((b, p) => ((p[0] - x) ** 2 + (p[1] - y) ** 2 < b.d ? { d: (p[0] - x) ** 2 + (p[1] - y) ** 2, l: p[2] } : b), { d: Infinity, l: 0 }).l;
    const at = items.map(li => along(li.dataset.at.split(',').map(Number)));
    const map = main.querySelector('.ride .map');
    let cur = -1;
    ride = () => {
      // The reading line: the middle of the screen, or on a phone the middle of what the map leaves.
      const top = innerWidth < 900 ? map.getBoundingClientRect().bottom : 0, line = top + (innerHeight - top) / 2;
      const mids = items.map(li => { const r = li.getBoundingClientRect(); return r.top + r.height / 2; });
      let i = mids.findLastIndex(m => m <= line);
      let len, on;
      if (i < 0) { len = at[0]; on = 0; }
      else if (i >= items.length - 1) { len = at.at(-1); on = items.length - 1; }
      else {
        const f = clamp((line - mids[i]) / (mids[i + 1] - mids[i]));
        len = at[i] + (at[i + 1] - at[i]) * f; on = f < 0.5 ? i : i + 1;
      }
      const p = route.getPointAtLength(len);
      train.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      if (on === cur) return;
      cur = on;
      const li = items[on];
      items.forEach(x => x.classList.toggle('on', x === li));
      stns.forEach((a, k) => a.classList.toggle('on', k === li.dataset.key));
      tracks.forEach(t => t.classList.toggle('lit', t.dataset.line === li.dataset.line));
    };
  }

  let queued = false;
  const frame = () => { queued = false; ride && ride(); };
  // The site swaps pages in place: once this page has gone, stop listening.
  const ask = () => {
    if (!main.isConnected) { ['scroll', 'resize', 'load'].forEach(t => removeEventListener(t, ask)); return; }
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  addEventListener('load', ask);
  frame();

  // ---- The loops: no controls with script; each plays while it is on screen, and never with reduced motion.
  const loops = [...main.querySelectorAll('video.loop')];
  loops.forEach(v => { v.controls = still; });
  if (!still && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) e.target.play().catch(() => { e.target.controls = true; });
      else e.target.pause();
    }), { rootMargin: '10% 0px' });
    loops.forEach(v => io.observe(v));
  }

  // ---- A plan wider than the screen opens with its station in view, a third of the way in.
  const place = () => main.querySelectorAll('.stop > .plan').forEach(ol => {
    const here = ol.querySelector('.here');
    if (here && ol.scrollWidth > ol.clientWidth) ol.scrollLeft += here.getBoundingClientRect().left - ol.getBoundingClientRect().left - ol.clientWidth / 3;
  });
  place();
  addEventListener('load', place, { once: true });

  if (still || !('IntersectionObserver' in window)) return;
  // ---- Each part rises once as it arrives, a few at a time; the stops of a plan one after another down the line.
  main.querySelectorAll('.plan').forEach(ol => ol.querySelectorAll('li').forEach((li, i) => li.style.setProperty('--d', i * 28 + 'ms')));
  const parts = [...main.querySelectorAll('.opening .facts p, .opening .places li, .plan li, .ride-key li, .stop .wall .plate, .stop .wall .lines, .stop .dates, .day .date, .day .span, .shot, .corr .big, .corr .w, .corr .say .ln, .corr .dir, .terminus p')];
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      if (!e.target.matches('.plan li')) e.target.style.setProperty('--d', (k++ % 6) * 80 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
