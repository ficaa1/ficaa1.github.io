// France: the river under the opening. As the page scrolls the map comes down from the whole lower Seine to the quays
// of Paris, then follows the water out to the sea: the barge goes from frame to frame, the stretch it has run turns red,
// and the map draws back as the river leaves the city. Also the years of the board, and the entrances. Without this
// the map stays on the whole lower Seine and the board shows every day. Runs on the first load and after a swap.
(() => {
  const main = document.querySelector('main[data-country="france"]:not([data-place])');
  if (!main || main.hasAttribute('data-js')) return;
  main.setAttribute('data-js', '');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, f) => a + (b - a) * f;

  // ---- The river.
  const svg = main.querySelector('.chart'), ran = svg && svg.querySelector('#ran'), barge = svg && svg.querySelector('.barge');
  const opening = main.querySelector('.river .opening'), floats = [...main.querySelectorAll('.river .float')];
  const pts = svg ? [...svg.querySelectorAll('.pt')] : [];
  let ride = null;
  if (svg && ran && opening && floats.length) {
    const total = ran.getTotalLength();
    ran.style.strokeDasharray = `0 ${total + 1}`;
    // Where the map stands for each part: its centre, the span of the screen's short side, the length of river run.
    const [bx0, by0, bx1, by1] = svg.dataset.box.split(',').map(Number), panel = opening.querySelector('.panel');
    const stops = [{ el: opening, len: 0 },
      ...floats.map(f => ({ el: f, c: f.dataset.c.split(',').map(Number), s: +f.dataset.s, len: +f.dataset.len }))];
    ride = () => {
      const box = svg.getBoundingClientRect(), Wd = box.width, Ht = box.height;
      if (!Wd || !Ht) return;
      // At the opening the river from Paris to the sea fits the part of the map the blue panel leaves free.
      const ph = panel ? panel.offsetHeight : 0, wide = Wd >= 900;
      const fx = wide ? panel.offsetWidth : 0, fy = wide ? 0 : ph, fw = Wd - fx, fh = Ht - fy;
      // Room on the right for the name of Paris, which stands east of the city.
      const lab = 64, u0 = Math.max((bx1 - bx0) / (fw - lab), (by1 - by0) / fh) * 1.08;
      stops[0].s = u0 * Math.min(Wd, Ht);
      stops[0].c = [(bx0 + bx1) / 2 - (fx + (fw - lab) / 2 - Wd / 2) * u0, (by0 + by1) / 2 - (fy + fh / 2 - Ht / 2) * u0];
      const line = innerHeight * 0.55;
      const mids = stops.map(st => { const r = st.el.getBoundingClientRect(); return r.top + Math.min(r.height, innerHeight) * 0.35; });
      let i = mids.findLastIndex(m => m <= line), f = 0;
      if (i < 0) i = 0;
      else if (i < stops.length - 1) f = clamp((line - mids[i]) / (mids[i + 1] - mids[i]));
      const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
      // Between two far places the map draws back to show both, then closes in again.
      const e = f * f * (3 - 2 * f), far = Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]);
      const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), e)) + far * 1.15 * Math.sin(Math.PI * e) * (far > 20 ? 1 : 0.3);
      const cx = lerp(a.c[0], b.c[0], e), cy = lerp(a.c[1], b.c[1], e), len = lerp(a.len, b.len, f);
      const u = s / Math.min(Wd, Ht), w = Wd * u, h = Ht * u;
      svg.setAttribute('viewBox', `${(cx - w / 2).toFixed(3)} ${(cy - h / 2).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}`);
      svg.style.setProperty('--u', u.toFixed(5));
      svg.classList.toggle('close', s < 30);
      ran.style.strokeDasharray = `${len.toFixed(3)} ${total + 1}`;
      const at = Math.min(len, total), p = ran.getPointAtLength(at), q = ran.getPointAtLength(Math.min(at + 0.3, total));
      const p0 = at >= total ? ran.getPointAtLength(total - 0.3) : p, q0 = at >= total ? p : q;
      const deg = Math.atan2(q0.y - p0.y, q0.x - p0.x) * 180 / Math.PI;
      barge.setAttribute('transform', `translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) rotate(${deg.toFixed(1)}) scale(${(u * 1.3).toFixed(5)})`);
      barge.style.opacity = i === 0 && f === 0 ? '0' : '1';
      const cur = f < 0.5 ? i : i + 1;
      pts.forEach((g, k) => { g.classList.toggle('done', len >= +floats[k].dataset.len - 0.01 && cur > 0); g.classList.toggle('on', k + 1 === cur); });
    };
  }

  // ---- The board: one year at a time, or all of them.
  const years = main.querySelector('.board .years');
  if (years) {
    years.hidden = false;
    const rows = [...main.querySelectorAll('.board tbody tr')];
    years.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      years.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      rows.forEach(r => { r.hidden = !!b.dataset.y && r.dataset.y !== b.dataset.y; });
    });
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

  if (still || !('IntersectionObserver' in window)) return;
  // ---- Each part rises once as it arrives, a few at a time.
  const parts = [...main.querySelectorAll('.float, .door .lines, .door h2, .door .leopards, .door .when, .door .stops, .door .pic, .board h2, .board .years, .board tbody tr')];
  const rise = new IntersectionObserver(es => {
    let k = 0;
    es.filter(x => x.isIntersecting).forEach(x => {
      x.target.style.setProperty('--d', (k++ % 8) * (x.target.matches('tr') ? 45 : 80) + 'ms');
      x.target.classList.add('in'); rise.unobserve(x.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  parts.forEach(el => { el.classList.add('rise'); rise.observe(el); });
})();
