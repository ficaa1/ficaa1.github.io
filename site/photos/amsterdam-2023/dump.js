// Amsterdam, 2023: the stage whose sky and clock keep the time of the frame in view and whose windows light as the
// evening comes; the boat ride, whose clock follows the frame in view; the 24th, entered through its numerals; and
// the loops, which play only while on screen. The page works without this. Runs on the first load and again after the
// site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-dump="amsterdam-2023"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const still = (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-lite'));
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const MIN = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  const set = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  if (!still) main.classList.add('moving');

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

  // ---- Entrances: each part rises in once, as it arrives.
  const ins = [...main.querySelectorAll('[data-in]')];
  if (!still && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      let k = 0;
      es.filter(e => e.isIntersecting).forEach(e => {
        e.target.style.setProperty('--d', (k++ % 4) * 80 + 'ms');
        e.target.classList.add('in'); io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    ins.forEach(el => io.observe(el));
  } else ins.forEach(el => el.classList.add('in'));

  // ---- The stage. The sky by the hour, the share of windows lit, sampled from his frames and the sun on 23 December
  // 2023 (also used for the 22nd) (down at 16:30, civil dusk over at 17:11).
  const SKY = [
    ['13:46', [185, 185, 185], 0], ['16:06', [185, 185, 185], 0], ['16:07', [226, 202, 189], 0],
    ['16:22', [226, 202, 189], 0.03], ['16:28', [233, 174, 138], 0.12], ['16:33', [233, 174, 138], 0.35],
    ['16:37', [182, 138, 126], 0.5], ['16:57', [60, 85, 118], 0.72], ['17:11', [40, 72, 110], 0.88],
    ['17:13', [29, 51, 82], 0.92], ['17:48', [14, 17, 18], 1],
  ].map(([t, c, l]) => [MIN(t), c, l]);
  const sky = m => {
    const j = SKY.findIndex(([k]) => k >= m), i = clamp(j < 0 ? SKY.length - 1 : j, 1, SKY.length - 1);
    const [k0, c0, l0] = SKY[i - 1], [k1, c1, l1] = SKY[i], f = clamp((m - k0) / Math.max(1, k1 - k0));
    return { c: c0.map((v, j) => Math.round(v + (c1[j] - v) * f)), lit: l0 + (l1 - l0) * f };
  };
  // The time at the middle of the screen, read off the frames on either side of it.
  const timeAt = (els, line, axis = 'y') => {
    const pts = els.map(el => { const r = el.getBoundingClientRect(); return [axis === 'y' ? r.top + r.height / 2 : r.left + r.width / 2, MIN(el.dataset.t)]; });
    if (!pts.length) return null;
    if (line <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [a, ta] = pts[i - 1], [b, tb] = pts[i];
      if (line <= b) return ta + (tb - ta) * clamp((line - a) / Math.max(1, b - a));
    }
    return pts[pts.length - 1][1];
  };
  const stages = [...main.querySelectorAll('.split')].map(split => {
    const st = split.querySelector('.stage');
    return { split, st, clock: st.querySelector('.clock'), wins: [...st.querySelectorAll('.wins rect')].map(r => [r, +r.style.getPropertyValue('--k')]),
      els: [...split.querySelectorAll('.col [data-t]')], lit: -1, from: MIN(st.dataset.from) };
  });
  // The clock's ink on a sky: the house's dark while it holds 3:1, else the lamp while that does, else white.
  const lum = c => c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((a, v, j) => a + v * [0.2126, 0.7152, 0.0722][j], 0);
  const HOUSE = lum([18, 19, 20]), LAMP = lum([223, 164, 84]);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const ink = c => { const L = lum(c); return ratio(L, HOUSE) >= 3 ? 'house' : ratio(L, LAMP) >= 3 ? 'dark' : 'dim'; };
  const paintStage = s => {
    const r = s.split.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    // On a phone the stage is a strip at the top, so read the time just under it.
    const line = innerWidth < 900 ? s.st.getBoundingClientRect().bottom + innerHeight * 0.25 : innerHeight * 0.5;
    const m = timeAt(s.els, line) ?? s.from, { c, lit } = sky(m);
    s.st.style.setProperty('--sky', `rgb(${c.join(' ')})`);
    const k = ink(c);
    s.st.classList.toggle('dark', k === 'dark'); s.st.classList.toggle('dim', k === 'dim');
    set(s.clock, fmt(m));
    const L = Math.round(lit * 40) / 40;
    if (L !== s.lit) { s.lit = L; s.wins.forEach(([w, k]) => w.classList.toggle('on', k < L)); }
  };

  // ---- The ride: its clock follows the frame in the middle of the screen.
  const ride = main.querySelector('.ride'), rideClock = ride && ride.querySelector('.clock');
  const rideEls = ride ? [...ride.querySelectorAll('.track > li')] : [];
  const paintRide = () => {
    if (!ride) return;
    const r = ride.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const line = innerWidth < 900 ? ride.querySelector('.head').getBoundingClientRect().bottom + innerHeight * 0.25 : innerHeight * 0.5;
    const m = timeAt(rideEls, line);
    if (m != null) set(rideClock, fmt(m));
  };

  // ---- The 24th: the mirror room plays inside the numerals; scrolling goes through a stroke of the 4 into the room.
  // The numerals' outlines (svg.word) are written into one SVG mask on the video, set where the page lays them out (a
  // blend mode over video fails in Safari). As a vector the mask is drawn afresh at every size, so the edges stay sharp
  // however far the zoom grows it, about the point deepest inside the 4's strokes.
  const zoom = main.querySelector('.d24 .zoom'), knock = zoom && zoom.querySelector('.knock'), room = zoom && zoom.querySelector('.room');
  let origin = null;
  const drawMask = () => {
    const sv = knock && knock.querySelector('svg.word');
    if (!sv || !room) return;
    const box = room.getBoundingClientRect(), W = Math.round(box.width), H = Math.round(box.height);
    if (!W || !H) return;
    const r = sv.getBoundingClientRect(), vb = sv.viewBox.baseVal;
    const m = new DOMMatrix().translate(r.left - box.left + r.width / 2, r.top - box.top + r.height / 2)
      .scale(r.width / vb.width, r.height / vb.height).translate(-vb.x - vb.width / 2, -vb.y - vb.height / 2);
    const tf = `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(n => +n.toFixed(5)).join(' ')})`;
    const four = new Path2D();
    let shapes = '';
    sv.querySelectorAll('path').forEach(pa => {
      const d = pa.getAttribute('d');
      shapes += `<path transform="${tf}" d="${d}"/>`;
      if (pa.dataset.i === '1') four.addPath(new Path2D(d), m);
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${shapes}</svg>`;
    room.style.webkitMaskImage = room.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    zoom.classList.add('masked');
    // The deepest point inside the 4: the inked pixel farthest from an edge in all four directions, found on a plain
    // 1x drawing of its outline.
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fill(four);
    const px = cx.getImageData(0, 0, W, H).data, ink = (x, y) => px[(y * W + x) * 4 + 3] > 128;
    const g = sv.querySelector('path[data-i="1"]').getBoundingClientRect();
    const x0 = Math.max(1, Math.floor(g.left - box.left)), x1 = Math.min(W - 2, Math.ceil(g.right - box.left));
    const y0 = Math.max(1, Math.floor(g.top - box.top)), y1 = Math.min(H - 2, Math.ceil(g.bottom - box.top));
    let best = null;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      if (!ink(x, y)) continue;
      let l = 0, rr = 0, u = 0, d = 0;
      while (x - l > 0 && ink(x - l, y)) l++;
      while (x + rr < W - 1 && ink(x + rr, y)) rr++;
      while (y - u > 0 && ink(x, y - u)) u++;
      while (y + d < H - 1 && ink(x, y + d)) d++;
      const depth = Math.min(l, rr, u, d);
      if (!best || depth > best.depth) best = { x, y, depth };
    }
    origin = best;
  };
  const paintZoom = () => {
    if (!zoom || still || !origin) return;
    const r = zoom.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight));
    const s = 1 + (2.2 * Math.max(innerWidth, innerHeight) / Math.max(4, origin.depth)) * p ** 2.4;
    const box = room.getBoundingClientRect();
    room.style.webkitMaskSize = room.style.maskSize = `${box.width * s}px ${box.height * s}px`;
    room.style.webkitMaskPosition = room.style.maskPosition = `${origin.x * (1 - s)}px ${origin.y * (1 - s)}px`;
    // Once through the stroke, the whole room.
    zoom.classList.toggle('through', p > 0.82);
  };

  let tick = 0;
  const frame = () => { tick = 0; if (!main.isConnected) return off(); stages.forEach(paintStage); paintRide(); paintZoom(); };
  const ask = () => { if (!tick) tick = requestAnimationFrame(frame); };
  const resize = () => { drawMask(); ask(); };
  const off = () => { removeEventListener('scroll', ask); removeEventListener('resize', resize); };
  if (zoom && !still) zoom.classList.add('deep');
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { if (main.isConnected) resize(); });
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', resize);
  addEventListener('load', resize);
  ask();
})();
