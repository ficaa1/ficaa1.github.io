// Paris -> Belgrade: the flight at the end of the Paris page. Each .fz zoom turns the outlines of its sign (the letters
// are paths, made from Hind Bold when the page is built) into an SVG that masks its film, as Amsterdam's 24 does with a
// canvas; scrolling through the pin grows the mask about the deepest point of one stroke until the film fills the
// screen (CDG, the plane), or the other way round, from the full film down to the letters on Belgrade's red (BEG).
// Colour copies of the outlines are drawn on one canvas behind the film: a red and cyan split a few pixels wide and two
// faint echoes outward, spreading and stretching a little with the speed of the scroll. Films play while on screen;
// the landing plays once each time it comes into view. Reduced motion: still, with a button to play each film. Without script the
// letters are white over the films.
(() => {
  const main = document.querySelector('main[data-place="paris"]');
  const fl = main && main.querySelector('.flight');
  if (!fl || fl.hasAttribute('data-js')) return;
  fl.setAttribute('data-js', '');
  const still = (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-lite'));
  const io = 'IntersectionObserver' in window;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  // ---- Films: no controls with script; each plays while it is on screen, and never with reduced motion.
  const films = [...fl.querySelectorAll('.fz video')];
  films.forEach(v => { v.controls = false; });
  // With reduced motion the films stay still in their letters, where their own controls would be cut off; a plain
  // button under each plays it.
  if (still) films.forEach(v => {
    const cap = v.closest('.pin').querySelector('.cap'), b = document.createElement('button');
    if (!cap) return;
    b.type = 'button'; b.className = 'pp'; b.textContent = 'Play';
    b.addEventListener('click', () => (v.paused ? v.play().catch(() => { v.controls = true; }) : v.pause()));
    v.addEventListener('play', () => { b.textContent = 'Pause'; });
    v.addEventListener('pause', () => { b.textContent = 'Play'; });
    cap.append(' ', b);
  });
  if (!still && io) {
    const seen = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) { if (v.ended) v.currentTime = 0; v.play().catch(() => { v.controls = true; }); }
      else v.pause();
    }), { rootMargin: '5% 0px' });
    films.forEach(v => seen.observe(v));
  }

  // ---- The copies: m is the copy's size against the mask, dx the side of the split, o its opacity. Kept quiet: two
  // faint echoes in one tone, and the red and cyan split a few pixels wide, so the letters and the film lead.
  const GHOSTS = [{ m: 1.28, dx: 0, c: '--e2', o: 0.07 }, { m: 1.12, dx: 0, c: '--e1', o: 0.14 },
    { m: 1, dx: -1, c: '--f1', o: 0.55 }, { m: 1, dx: 1, c: '--f2', o: 0.55 }];
  const zooms = [...fl.querySelectorAll('.fz')].map(el => {
    const pin = el.querySelector('.pin'), room = el.querySelector('.room');
    // One canvas for all the coloured copies, redrawn from the outlines each frame, so they stay sharp at any size.
    const gc = document.createElement('canvas');
    gc.className = 'ghosts'; gc.setAttribute('aria-hidden', 'true');
    pin.insertBefore(gc, room);
    return { el, pin, room, gc, gx: null, word: el.querySelector('.word'), code: el.querySelector('.code'), lock: el.querySelector('.lock'), cross: el.querySelector('.cross'), jat: el.querySelector('.jat'), out: el.dataset.dir === 'out', at: +(el.dataset.at || 0), key: '', o: null, c: null, W: 0, H: 0, k: 1, nz: null, eo: null, cols: [], last: '' };
  });
  if (!still) zooms.forEach(z => z.el.classList.add('deep'));

  // ---- The mask: the outlines of the sign (the letters, the arrow's disc, the plane), set where the page lays them
  // out, written into one SVG the size of the film's box. As a vector image it is drawn afresh at every mask size, so the
  // edges stay sharp however far the zoom goes. The same outlines, as Path2D, find the zoom's point and draw the copies.
  const drawMask = z => {
    const box = z.room.getBoundingClientRect(), W = Math.round(box.width), H = Math.round(box.height);
    if (!W || !H || !z.word) return;
    const key = `${W}x${H}`;
    if (key === z.key) return;
    // Measure the sign where the page sets it, not where the last frame moved it.
    z.code.style.transform = '';
    const nz = new Path2D(), eo = new Path2D();
    let shapes = '', target = null;
    z.el.querySelectorAll('.code svg.word, .code svg.mk').forEach(sv => {
      const r = sv.getBoundingClientRect(), vb = sv.viewBox.baseVal, rot = +(sv.dataset.rot || 0);
      const m = new DOMMatrix().translate(r.left - box.left + r.width / 2, r.top - box.top + r.height / 2).rotate(rot)
        .scale(r.width / vb.width, r.height / vb.height).translate(-vb.x - vb.width / 2, -vb.y - vb.height / 2);
      const tf = `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(n => +n.toFixed(5)).join(' ')})`;
      sv.querySelectorAll('path').forEach(pa => {
        const d = pa.getAttribute('d'), odd = pa.getAttribute('fill-rule') === 'evenodd';
        shapes += `<path transform="${tf}"${odd ? ' fill-rule="evenodd"' : ''} d="${d}"/>`;
        (odd ? eo : nz).addPath(new Path2D(d), m);
        if (!target && sv.classList.contains('word') && (pa.dataset.i === undefined || +pa.dataset.i === z.at)) target = pa.getBoundingClientRect();
      });
    });
    if (!target) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${shapes}</svg>`;
    z.room.style.webkitMaskImage = z.room.style.maskImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    // The copies' canvas at the screen's resolution up to 2x: they are faint and redrawn from the outlines every frame,
    // so 2x stays sharp on a 3x phone and costs less than half the pixels. Kept under 16 million pixels for iOS.
    let k = Math.min(2, devicePixelRatio || 1);
    while (k > 1 && W * H * k * k > 16e6) k -= 0.5;
    z.gc.width = Math.round(W * k); z.gc.height = Math.round(H * k);
    z.gx = z.gc.getContext('2d');
    const ink = getComputedStyle(z.el);
    z.cols = GHOSTS.map(g => ink.getPropertyValue(g.c).trim() || '#fff');
    z.nz = nz; z.eo = eo; z.k = k;
    z.el.classList.add('masked');
    z.W = W; z.H = H; z.key = key;
    const lr = (z.lock || z.word).getBoundingClientRect();
    z.c = { x: lr.left - box.left + lr.width / 2, y: lr.top - box.top + lr.height / 2 };
    // The deepest point inside the target stroke: the inked pixel farthest from an edge in all four directions,
    // found on a plain 1x drawing of the outlines.
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fill(nz); cx.fill(eo, 'evenodd');
    const px = cx.getImageData(0, 0, W, H).data, inked = (x, y) => px[(y * W + x) * 4 + 3] > 128;
    const x0 = Math.max(1, Math.floor(target.left - box.left)), x1 = Math.min(W - 2, Math.ceil(target.right - box.left));
    const y0 = Math.max(1, Math.floor(target.top - box.top)), y1 = Math.min(H - 2, Math.ceil(target.bottom - box.top));
    let best = null;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      if (!inked(x, y)) continue;
      let l = 0, r = 0, u = 0, d = 0;
      while (x - l > 0 && inked(x - l, y)) l++;
      while (x + r < W - 1 && inked(x + r, y)) r++;
      while (y - u > 0 && inked(x, y - u)) u++;
      while (y + d < H - 1 && inked(x, y + d)) d++;
      const depth = Math.min(l, r, u, d);
      if (!best || depth > best.depth) best = { x, y, depth };
    }
    z.o = best;
    z.last = '';
  };

  // ---- One frame of one zoom. p runs 0..1 through the pin; q is the travel inside it.
  const paint = (z, v) => {
    if (!z.o) return;
    const r = z.el.getBoundingClientRect();
    if (r.bottom < -40 || r.top > innerHeight + 40) return;
    const p = still ? (z.out ? 1 : 0) : clamp(-r.top / Math.max(1, r.height - innerHeight));
    const K = 2.2 * Math.max(z.W, z.H) / Math.max(4, z.o.depth);
    const q = z.out ? clamp((p - 0.14) / 0.66) : clamp((p - 0.06) / 0.74);
    const t = z.out ? 1 - q : q;                       // 0 at the letters, 1 through them
    const s = 1 + K * t ** 2.4;
    const through = t >= 1;
    if (z.out) z.el.classList.toggle('landed', !still && p > 0.88);
    const sig = `${p.toFixed(4)}|${s.toFixed(3)}|${v.toFixed(3)}|${through}`;
    if (sig === z.last) return;
    z.last = sig;
    z.el.classList.toggle('through', through);
    if (through) return;
    const o = z.o, c = z.c;
    z.room.style.webkitMaskSize = z.room.style.maskSize = `${z.W * s}px ${z.H * s}px`;
    z.room.style.webkitMaskPosition = z.room.style.maskPosition = `${o.x * (1 - s)}px ${o.y * (1 - s)}px`;
    // The white pieces of the sign go with the mask. Leaving Paris the plane crosses the letters as the zoom begins,
    // and the line goes as the letters open; into Belgrade the line, the plane and the JAT logo come in as the letters
    // settle, the plane landing at the end of the line.
    z.code.style.transform = s === 1 ? '' : `translate(${(o.x * (1 - s)).toFixed(1)}px, ${(o.y * (1 - s)).toFixed(1)}px) scale(${s.toFixed(4)})`;
    if (z.cross) {
      const land = clamp((q - 0.62) / 0.38), jx = still ? (z.out ? 1 : 0.5) : z.out ? 0.1 + 0.9 * land : clamp(p / 0.32);
      const jy = z.out && !still ? -0.7 * (1 - land) ** 2 : 0;
      z.cross.style.setProperty('--jx', jx.toFixed(4));
      z.cross.style.setProperty('--jy', jy.toFixed(3));
      z.cross.style.opacity = (z.out ? clamp((q - 0.66) / 0.2) : clamp(1 - t * 3)).toFixed(3);
    }
    if (z.jat) z.jat.style.opacity = (z.out ? clamp((q - 0.7) / 0.25) : 1).toFixed(3);
    // The echoes spread as the travel goes: outward leaving Paris, and closing in on Belgrade until they lie under the
    // letters; a little further with speed. The split is 2 px at rest (a hairline on the landed BEG), up to 4 px more
    // through the travel, and speed adds at most 6 px; the echoes stretch along the scroll by at most 12%.
    const spread = (z.out ? 0.06 : 1) + 3 * t ** 1.4 + 1.5 * v;
    const split = (z.out ? 0.75 : 2) + 4 * t + Math.min(6, 14 * v);
    const stretch = 1 + 0.12 * v;
    const gx = z.gx, k = z.k;
    gx.setTransform(1, 0, 0, 1, 0, 0);
    gx.clearRect(0, 0, z.gc.width, z.gc.height);
    GHOSTS.forEach((g, i) => {
      const m = 1 + (g.m - 1) * spread, mx = s * m, my = s * m * (g.m > 1 ? stretch : 1);
      if (mx > 14) return;
      const tx = o.x + s * (c.x - o.x) - mx * c.x + g.dx * split, ty = o.y + s * (c.y - o.y) - my * c.y;
      gx.setTransform(k * mx, 0, 0, k * my, k * tx, k * ty);
      gx.globalAlpha = g.o; gx.fillStyle = z.cols[i];
      gx.fill(z.nz); gx.fill(z.eo, 'evenodd');
    });
  };

  // ---- The loop: runs while a zoom is near the screen; the scroll's speed is eased so the ghosts settle when it stops.
  let near = new Set(), raf = 0, lastY = scrollY, vel = 0;
  const frame = () => {
    raf = 0;
    if (!main.isConnected) return off();
    const dy = Math.abs(scrollY - lastY); lastY = scrollY;
    vel += (clamp(dy / Math.max(1, innerHeight) * 9) - vel) * 0.18;
    if (vel < 0.002) vel = 0;
    zooms.forEach(z => paint(z, still ? 0 : vel));
    if (!still && (near.size || vel > 0)) raf = requestAnimationFrame(frame);
  };
  const ask = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const resize = () => { zooms.forEach(drawMask); ask(); };
  const off = () => { removeEventListener('scroll', ask); removeEventListener('resize', resize); };
  if (io && !still) {
    const watch = new IntersectionObserver(es => {
      es.forEach(e => (e.isIntersecting ? near.add(e.target) : near.delete(e.target)));
      ask();
    }, { rootMargin: '20% 0px' });
    zooms.forEach(z => watch.observe(z.el));
  }
  // The sign is outlines in em, so it is laid out without waiting for fonts.
  resize();
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', resize);
  addEventListener('load', resize);
})();
