// The music page follows the shared player (site.js): the song that is on opens out on the wall to its picture's whole
// shape, with the part already heard on a strip of glass over it and its loop running while it plays; a record turns and
// has the part heard selected in its grooves. Runs again on every visit to the page.
(() => {
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const items = [...document.querySelectorAll('main [data-song]')].map(a => ({ a, li: a.closest('li'), n: +a.dataset.song }));
  if (!items.length) return;
  const wallGeo = (document.querySelector('ol.wall')?.dataset.geo || '52 10 48 48 6').split(' ').map(Number);
  const recGeo = (document.querySelector('ol.records')?.dataset.geo || '300 272 16 48').split(' ').map(Number);
  const wall = document.querySelector('ol.wall');
  let on = null, lastK = -2, len = 0;

  // Each drawn bar is its own "M…" in the path, so the first k of them are the part heard.
  const parts = el => el._parts || (el._parts = (el.getAttribute('d') || '').split('M').slice(1).map(p => 'M' + p));

  // A sleeve's video loop runs while its song plays and holds its frame when paused; still pictures for reduced motion.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function loop(it, playing) {
    const v = it.li.querySelector('video.loop');
    if (!v) return;
    if (!playing || still.matches) { v.pause(); return; }
    // It shows from each start, not only the first: coming back to a song plays the loop again from where it held.
    if (!v.src) { v.src = v.dataset.src; v.addEventListener('playing', () => v.classList.add('on')); }
    v.play().catch(() => {});
  }

  // ---- The song that is on opens out: two columns wide, the picture whole in its own shape, and the sleeves around make
  // room. It keeps its row; at the end of a row it takes the column before. A tall or square picture takes two rows.
  let big = null, want = null;
  function place() {
    if (!big || !big.li.isConnected) return;
    const cols = +getComputedStyle(wall).getPropertyValue('--cols') || 4, k = [...wall.children].indexOf(big.li);
    big.li.style.gridColumn = `${Math.max(0, Math.min(k % cols, cols - 2)) + 1} / span ${Math.min(2, cols)}`;
    big.li.style.gridRow = `${Math.floor(k / cols) + 1} / span ${big.li.classList.contains('tall') ? 2 : 1}`;
  }
  function swap(it, whole) {
    const img = it.li.querySelector('.face img');
    if (!img || !img.dataset.full) return;
    if (whole) { img.dataset.srcset = img.getAttribute('srcset') || ''; img.dataset.cover = img.getAttribute('src'); img.removeAttribute('srcset'); img.src = img.dataset.full; }
    else if (img.dataset.cover) { img.src = img.dataset.cover; if (img.dataset.srcset) img.setAttribute('srcset', img.dataset.srcset); delete img.dataset.cover; }
  }
  // The sleeves glide to their new places (a view transition), except for reduced motion.
  function flow(change) {
    if (still.matches || !document.startViewTransition) return change();
    const lis = [...wall.children];
    lis.forEach((li, k) => (li.style.viewTransitionName = `sleeve-${k}`));
    document.startViewTransition(change).finished.finally(() => lis.forEach(li => (li.style.viewTransitionName = '')));
  }
  function grow(it) {
    const target = it && it.li.classList.contains('sleeve') ? it : null;
    if (want === target) return;
    want = target;
    // The whole picture is fetched first, so the sleeve opens with it rather than with its square stretched.
    const img = target && target.li.querySelector('.face img'), full = img && img.dataset.full;
    const ready = full ? new Promise(r => { const p = new Image(); p.src = full; p.decode().then(r, r); setTimeout(r, 800); }) : Promise.resolve();
    ready.then(() => {
      if (want !== target || (target && !target.li.isConnected)) return;
      flow(() => {
        if (big) { swap(big, false); big.li.classList.remove('big', 'tall'); big.li.style.gridColumn = big.li.style.gridRow = ''; }
        big = target;
        if (!big) return;
        big.li.classList.add('big');
        big.li.classList.toggle('tall', (+getComputedStyle(big.li).getPropertyValue('--ar') || 1) < 1.3);
        swap(big, true);
        place();
      });
    });
  }

  // ---- The glass: pressing or dragging on it moves the song along; it is not a click on the sleeve.
  function scrub(e) {
    const g = e.currentTarget, r = g.getBoundingClientRect();
    if (len) document.dispatchEvent(new CustomEvent('player-seek', { detail: { t: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * len } }));
  }
  wall.querySelectorAll('.glass').forEach(g => {
    g.addEventListener('pointerdown', e => { if (e.button) return; e.preventDefault(); try { g.setPointerCapture(e.pointerId); } catch {} scrub(e); });
    g.addEventListener('pointermove', e => { if (g.hasPointerCapture?.(e.pointerId)) scrub(e); });
    g.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  });

  function reset(it) {
    loop(it, false);
    it.li.querySelector('video.loop')?.classList.remove('on');
    it.li.classList.remove('is-on', 'is-playing');
    it.li.style.removeProperty('--p');
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
    if (!active) { if (it) reset(it); on = null; grow(null); return; }
    on = it;
    grow(it);
    const tm = it.li.querySelector('.time'), st = it.li.querySelector('.state');
    len = d > 0 ? d : +tm.dataset.d || 0;
    it.li.style.setProperty('--p', len ? Math.min(1, t / len) : 0);
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
  window.musicPlace = place;
  if (!window.musicListening) {
    window.musicListening = true;
    document.addEventListener('player', e => window.musicUpdate && window.musicUpdate(e.detail));
    addEventListener('resize', () => window.musicPlace && window.musicPlace());
  }
  document.dispatchEvent(new Event('player-ask'));
})();
