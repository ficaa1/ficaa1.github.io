// Belgrade: the entrances; Vidovdan, whose red and clock follow the evening as the page scrolls and whose held moments run
// with the scroll; the sun going down at Sajam; and the flip at Ada. The page works without this. Runs on the first load and
// again after the site swaps pages in place.
(() => {
  const main = document.querySelector('main[data-country="belgrade"]');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  const jobs = [];
  if (!still) main.classList.add('moving');
  // How far a held moment has run: 0 as it pins, 1 as it lets go.
  const run = el => { const r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };

  // ---- Vidovdan.
  const ch = main.querySelector('.vidovdan');
  if (ch) {
    ch.classList.add('live');
    // The red of the evening, the same stops gen.mjs gives each hour: the flags at five, oxblood at nine.
    const HEAT = [[0, [212, 10, 30]], [0.45, [168, 8, 26]], [0.75, [106, 5, 16]], [1, [42, 3, 7]]];
    const T0 = MIN('17:20'), T1 = MIN('21:00');
    const red = t => {
      const h = clamp((t - T0) / (T1 - T0)) ** 1.3, i = Math.max(1, HEAT.findIndex(([k]) => k >= h));
      const [k0, c0] = HEAT[i - 1], [k1, c1] = HEAT[i], f = (h - k0) / (k1 - k0);
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(' ')})`;
    };
    const banner = ch.querySelector('.banner'), shots = [...ch.querySelectorAll('.shot[data-t]')], stages = [...ch.querySelectorAll('.stage')];
    const clocks = [...ch.querySelectorAll('.clock')].map(c => ({ c, from: MIN(c.dataset.from), to: MIN(c.dataset.to) }));
    const zoom = ch.querySelector('.zoom'), silence = ch.querySelector('.silence'), deadline = ch.querySelector('.deadline');
    const strips = silence ? [...silence.querySelectorAll('.strips i')] : [], hush = silence ? [...silence.querySelectorAll('.hush .frame')] : [];
    const set = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
    // The time at the middle of the screen, read off the frames and the moments on either side of it.
    const now = () => {
      const mid = innerHeight / 2, pts = [[banner.getBoundingClientRect().top, T0]];
      for (const s of shots) { const r = s.getBoundingClientRect(); pts.push([r.top + r.height / 2, MIN(s.dataset.t)]); }
      for (const st of stages) {
        const r = st.getBoundingClientRect(), h = Math.min(innerHeight, r.height) / 2;
        pts.push([r.top + h, MIN(st.dataset.t0)], [r.bottom - h, MIN(st.dataset.t1)]);
      }
      pts.sort((a, b) => a[0] - b[0]);
      if (mid <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        const [y1, t1] = pts[i], [y0, t0] = pts[i - 1];
        if (mid < y1) return t0 + (t1 - t0) * (y1 > y0 ? (mid - y0) / (y1 - y0) : 1);
      }
      return pts.at(-1)[1];
    };
    jobs.push(() => {
      const t = now();
      const r = red(t), bar = document.querySelector('body > .pbar');
      ch.style.setProperty('--red', r);
      // The photo bar takes the red too while the chapter is under it.
      if (bar && bar.cur === ch) bar.style.setProperty('--pb-bg', r);
      clocks.forEach(k => set(k.c, fmt(clamp(t, k.from, k.to))));
      if (still) return;
      // The strike wall comes up from the middle of the red to fill the screen, and the red goes black round it.
      if (zoom) {
        const p = run(zoom);
        zoom.style.setProperty('--z', (0.42 + 0.58 * ease(clamp(p / 0.7))).toFixed(4));
        zoom.style.setProperty('--dark', clamp((p - 0.12) / 0.5).toFixed(3));
      }
      // Sixteen minutes, a strip of black for each, and the frames taken in them, each from its minute.
      if (silence) {
        const lit = Math.min(16, Math.floor(run(silence) * 17));
        strips.forEach((s, i) => s.classList.toggle('on', i < lit));
        set(silence.querySelector('.t'), fmt(MIN(silence.dataset.t0) + lit));
        const shown = hush.findLast(f => +f.dataset.m <= lit) || hush[0];
        hush.forEach(f => f.classList.toggle('now', f === shown));
      }
      // The last minutes before nine run out; then nine strikes.
      if (deadline) {
        const p = run(deadline), from = MIN(deadline.dataset.t0), to = MIN(deadline.dataset.t1);
        const out = p >= 0.55;
        set(deadline.querySelector('.t'), out ? fmt(to) : fmt(from + (to - 1 - from) * (p / 0.55)));
        deadline.classList.toggle('out', out);
      }
    });

    // The name comes down letter by letter as the chapter arrives, and the crowd counts up.
    if (!still && 'IntersectionObserver' in window) {
      const k = banner.querySelector('.crowd .k'), to = +k.dataset.to, shown = k.textContent;
      banner.classList.add('armed');
      k.textContent = '0';
      const io = new IntersectionObserver(es => {
        if (!es.some(e => e.isIntersecting)) return;
        io.disconnect();
        banner.classList.add('go');
        setTimeout(() => {
          const t0 = performance.now(), D = 2200;
          const tick = now => {
            const f = clamp((now - t0) / D), v = f >= 1 ? to : Math.round(to * (1 - 2 ** (-10 * f)) / 1000) * 1000;
            k.textContent = f >= 1 ? shown : v.toLocaleString('en-GB');
            if (f < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }, 1800);
      }, { threshold: 0.3 });
      io.observe(banner);
    }
  }

  // ---- Sajam: the sun goes down behind the board while the walk goes by, from above the board as the sign arrives to
  // mostly set as the last frames leave.
  const sajam = main.querySelector('.sajam'), sun = sajam && sajam.querySelector('.sun');
  if (sun && !still) jobs.push(() => {
    const r = sajam.getBoundingClientRect(), p = clamp((innerHeight - r.top) / (r.height + innerHeight * 0.4));
    sun.style.setProperty('--set', (-0.25 + 1.05 * p).toFixed(4));
  });

  // ---- Ada: frames from one spot within a minute turn over one into the next with the scroll.
  if (!still) main.querySelectorAll('.flip').forEach(flip => {
    const leaves = [...flip.querySelectorAll('.leaf')];
    let cur;
    jobs.push(() => {
      const i = Math.min(leaves.length - 1, Math.floor(run(flip) * leaves.length));
      if (i === cur) return;
      cur = i;
      leaves.forEach((l, j) => l.classList.toggle('now', j === i));
    });
  });

  let queued = false;
  const frame = () => { queued = false; jobs.forEach(j => j()); };
  // The site swaps pages in place: once this page has gone, stop listening.
  const ask = () => {
    if (!main.isConnected) { ['scroll', 'resize', 'load'].forEach(t => removeEventListener(t, ask)); return; }
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  addEventListener('load', ask);
  frame();

  if (still || !('IntersectionObserver' in window)) return;
  // Each part rises once as it arrives, a few at a time.
  const parts = [...main.querySelectorAll('.city .spot, .openers li, .key .when, .key .gear, .sajam h2, .sajam .when, .ada h2, .ada .lake, .years li, .day h3, .shot:not(.leaf)')];
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).forEach(e => {
      e.target.style.setProperty('--d', (k++ % 6) * 85 + 'ms');
      e.target.classList.add('in'); rise.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
