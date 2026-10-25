// The music page follows the shared player (site.js): the song that is on gets the part already heard marked on its sleeve,
// like text selected on a page, its record turns and its loop runs while it plays. Runs again on every visit to the page.
(() => {
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const items = [...document.querySelectorAll('main [data-song]')].map(a => ({ a, li: a.closest('li'), n: +a.dataset.song }));
  if (!items.length) return;
  const wallGeo = (document.querySelector('ol.wall')?.dataset.geo || '52 10 48 48 6').split(' ').map(Number);
  const recGeo = (document.querySelector('ol.records')?.dataset.geo || '300 272 16 48').split(' ').map(Number);
  let on = null, lastK = -2;

  // Each drawn bar is its own "M…" in the path, so the first k of them are the part heard.
  const parts = el => el._parts || (el._parts = (el.getAttribute('d') || '').split('M').slice(1).map(p => 'M' + p));

  // A sleeve's video loop runs while its song plays and holds its frame when paused; still pictures for reduced motion.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function loop(it, playing) {
    const v = it.li.querySelector('video.loop');
    if (!v) return;
    if (!playing || still.matches) { v.pause(); return; }
    if (!v.src) { v.src = v.dataset.src; v.addEventListener('playing', () => v.classList.add('on'), { once: true }); }
    v.play().catch(() => {});
  }

  function reset(it) {
    loop(it, false);
    it.li.querySelector('video.loop')?.classList.remove('on');
    it.li.classList.remove('is-on', 'is-playing');
    it.li.querySelectorAll('.heard, .at, .cursor').forEach(p => p.setAttribute('d', ''));
    it.li.querySelectorAll('.band').forEach(b => (b.tagName === 'g' ? (b.innerHTML = '') : b.setAttribute('d', '')));
    const st = it.li.querySelector('.state'), tm = it.li.querySelector('.time');
    if (st && st.dataset.year !== undefined) st.textContent = st.dataset.year;
    if (tm) tm.textContent = tm.dataset.d > 0 ? mmss(+tm.dataset.d) : '';
  }

  function sleeve(it, k, n) {
    const svg = it.li.querySelector('svg');
    if (!svg) return;
    const [pad, col, row, cols] = svg.dataset.geo ? svg.dataset.geo.split(' ').map(Number) : wallGeo;
    const ink = svg.querySelector('.ink'), r = Math.floor(k / cols), c = k % cols;
    if (ink) {
      const all = parts(ink);
      svg.querySelector('.heard').setAttribute('d', all.slice(0, k).join(''));
      svg.querySelector('.at').setAttribute('d', k < n ? all[k] : '');
    }
    // The selection: whole lines above, and the line being played up to the bar playing now.
    const ex = pad ? 4 : 0, x0 = pad - ex, w = cols * col + ex, f = v => Math.round(v * 10) / 10;
    let d = r > 0 ? `M${f(x0)} ${f(pad)}h${f(w)}v${f(r * row)}h${f(-w)}z` : '';
    if (k < n) d += `M${f(x0)} ${f(pad + r * row)}h${f(c * col + col + ex)}v${f(row)}h${f(-(c * col + col + ex))}z`;
    svg.querySelector('.band').setAttribute('d', d);
    const cur = svg.querySelector('.cursor');
    if (cur) cur.setAttribute('d', k < n ? `M${f(c * col)} ${f(r * row)}h${f(col)}v${f(row)}h${f(-col)}z` : '');
  }

  function record(it, k, n) {
    const [cx, r0, step, cols] = recGeo, inks = [...it.li.querySelectorAll('.ink')], heard = it.li.querySelectorAll('.heard');
    if (!inks.length) return;
    const ring = Math.floor(k / cols), j = k % cols;
    inks.forEach((ink, r) => heard[r].setAttribute('d', r < ring ? ink.getAttribute('d') : r === ring ? parts(ink).slice(0, j).join('') : ''));
    const at = it.li.querySelector('.at');
    if (k < n && inks[ring]) { at.setAttribute('d', parts(inks[ring])[j]); at.setAttribute('stroke-width', inks[ring].getAttribute('stroke-width')); }
    else at.setAttribute('d', '');
    // The selection follows the grooves: whole rings outside, and an arc of the ring playing now.
    const pt = (rho, deg) => { const a = (deg * Math.PI) / 180; return `${(cx + rho * Math.cos(a)).toFixed(1)} ${(cx + rho * Math.sin(a)).toFixed(1)}`; };
    let g = '';
    for (let r = 0; r < Math.min(ring, inks.length); r++) {
      const rho = r0 - r * step;
      g += `<path d="M${pt(rho, -90)}A${rho} ${rho} 0 1 1 ${pt(rho, 90)}A${rho} ${rho} 0 1 1 ${pt(rho, -90)}"/>`;
    }
    if (k < n) {
      const rho = r0 - ring * step, end = -90 + ((j + 1) * 360) / cols;
      g += `<path d="M${pt(rho, -90)}A${rho} ${rho} 0 ${end + 90 > 180 ? 1 : 0} 1 ${pt(rho, end)}"/>`;
    }
    it.li.querySelector('.band').innerHTML = g;
  }

  function update({ i, playing, t, d }) {
    if (!items[0].a.isConnected) return;
    const it = items.find(x => x.n === i);
    // A song is "on" once it has started. The player's first song is selected from the start, which is not the same.
    const active = it && (playing || t > 0);
    if (on && on !== it) { reset(on); on = null; lastK = -2; }
    if (!active) { if (it) reset(it); on = null; return; }
    on = it;
    const tm = it.li.querySelector('.time'), st = it.li.querySelector('.state');
    const len = d > 0 ? d : +tm.dataset.d || 0;
    it.li.classList.add('is-on');
    it.li.classList.toggle('is-playing', !!playing);
    loop(it, playing);
    if (st.dataset.year === undefined) st.dataset.year = st.textContent;
    st.textContent = playing ? 'Playing' : 'Paused';
    tm.textContent = len ? `${mmss(t)} / ${mmss(len)}` : mmss(t);
    const n = 480, k = len ? Math.min(n, Math.floor((t / len) * n)) : 0;
    if (k === lastK) return;
    lastK = k;
    if (it.li.classList.contains('record')) record(it, k, n); else sleeve(it, k, n);
  }

  // One listener for the whole visit; each run of this script points it at the page now showing.
  window.musicUpdate = update;
  if (!window.musicListening) {
    window.musicListening = true;
    document.addEventListener('player', e => window.musicUpdate && window.musicUpdate(e.detail));
  }
  document.dispatchEvent(new Event('player-ask'));
})();
