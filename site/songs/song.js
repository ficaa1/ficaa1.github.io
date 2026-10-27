// A song's own page (tools/song-pages.mjs) follows the shared player (site.js). Its name, and the next song's name, are
// cut out of the page so the picture shows through the letters: the mask is the name drawn again on a canvas at the
// screen's own pixels, each letter where the page set it (as music.js knock() does for the back room). Scrolling moves
// the picture inside the letters; while the song plays its clip runs there, or its still drifts. A song without a
// picture has its waveform's bars in the letters instead, and the part heard lights up in them as it plays.
// Runs again on every visit to the page.
(() => {
  const main = document.querySelector('main');
  const front = main && main.querySelector('.front[data-song-page]');
  if (!front) return;
  const N = +front.dataset.songPage;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  // Low power mode (site.js) keeps the stills too.
  const calm = () => still.matches || document.documentElement.matches('[data-lite],[data-still]');
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; // taste-skill-ignore: minutes and seconds
  const name = front.querySelector('.songname'), word = main.querySelector('.rooms .word');
  const times = [...main.querySelectorAll('.time')], state = main.querySelector('.tag .state'), lbl = front.querySelector('.play .lbl');
  const year = state ? state.textContent : '', len0 = +times[0].dataset.d || 0;
  const face = main.querySelector('.face');
  let len = len0, playing = false, lastK = -1, seen = { name: true, face: false }, prog = 0;
  // The part heard on the glass only moves while the picture is in view: off screen there is nothing to see, and an
  // iPhone scrolling below it jumped back on every move.
  const glide = () => { if (face && (seen.face || !('IntersectionObserver' in window))) face.style.setProperty('--p', prog); };

  const loaded = () => !document.fonts || [...document.fonts].some(f => f.family.replace(/"/g, '') === 'League Spartan' && f.status === 'loaded');

  // ---- The size: the name as large as the width allows (one line, or two on a phone for a name of more than one word).
  function fit(el, capVh) {
    const t = el.querySelector('.t');
    if (!t || !t.firstChild) return;
    el.style.fontSize = '';
    el.classList.remove('one');
    const r = document.createRange();
    r.selectNodeContents(t);
    const rects = () => [...r.getClientRects()];
    const widest = () => Math.max(...rects().map(x => x.width));
    const avail = el.clientWidth * 0.985, cap = (capVh * innerHeight) / 100;
    let fs = parseFloat(getComputedStyle(el).fontSize);
    // On one line the name is held there and set to fill it; broken in two, it only ever comes down to fit.
    if (new Set(rects().map(x => Math.round(x.top))).size === 1) {
      el.classList.add('one');
      fs = Math.min(cap, (fs * avail) / widest());
      el.style.fontSize = `${fs}px`;
    }
    for (let k = 0; k < 3 && widest() > avail; k++) el.style.fontSize = `${(fs *= avail / widest())}px`;
  }

  // ---- The cut: draw each letter where the page set it, as a mask for the layer behind the text.
  function cut(el) {
    const t = el.querySelector('.t'), inn = el.querySelector('.inside'), text = t && t.firstChild, img = inn && inn.querySelector('img');
    const bars = inn && inn.querySelector('canvas.bars');
    if (!inn || !text || text.nodeType !== 3 || (!bars && (!img || !img.getAttribute('src')))) return Promise.resolve();
    const cs = getComputedStyle(el), dpr = Math.min(3, devicePixelRatio || 1), box = el.getBoundingClientRect();
    const key = `${cs.fontSize} ${box.width} ${dpr} ${loaded()}`;
    if (inn.dataset.key === key) return Promise.resolve();
    inn.dataset.key = key;
    const range = document.createRange(), glyphs = [];
    let o = 0;
    for (const ch of text.data) {
      range.setStart(text, o); range.setEnd(text, (o += ch.length));
      const r = range.getClientRects()[0];
      if (r && ch.trim()) glyphs.push([ch, r]);
    }
    if (!glyphs.length) return Promise.resolve();
    const em = parseFloat(cs.fontSize), pad = 0.12 * em;
    const x0 = Math.min(...glyphs.map(g => g[1].left)) - pad, y0 = Math.min(...glyphs.map(g => g[1].top)) - pad;
    const w = Math.max(...glyphs.map(g => g[1].right)) + pad - x0, h = Math.max(...glyphs.map(g => g[1].bottom)) + pad - y0;
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    const ascent = ctx.measureText(text.data).fontBoundingBoxAscent || 0.8 * em;
    glyphs.forEach(([ch, r]) => ctx.fillText(ch, r.left - x0, r.top - y0 + ascent));
    Object.assign(inn.style, { left: `${x0 - box.left}px`, top: `${y0 - box.top}px`, width: `${w}px`, height: `${h}px` });
    let ready = Promise.resolve();
    if (bars) {
      // The bars fill the letters' box exactly, at the screen's own pixels.
      Object.assign(inn.firstElementChild.style, { width: `${w}px`, height: `${h}px` });
      inn._tx = inn._ty = 0;
      bars.width = c.width; bars.height = c.height;
      paint(el, el === name ? lastK : -1);
    } else {
      // The picture covers the letters' box; whatever is left over on one axis is how far scrolling can move it.
      const ar = +getComputedStyle(el.closest('[style*="--ar"]')).getPropertyValue('--ar') || img.naturalWidth / img.naturalHeight || 1;
      const mw = Math.max(w, h * ar), mh = mw / ar, media = inn.firstElementChild;
      Object.assign(media.style, { width: `${mw}px`, height: `${mh}px` });
      inn._tx = mw - w; inn._ty = mh - h;
      if (img.decode) ready = img.decode().catch(() => {});
    }
    return Promise.all([new Promise(ok => c.toBlob(ok)), ready]).then(([b]) => {
      if (!b || inn.dataset.key !== key) return;
      if (inn._mask) URL.revokeObjectURL(inn._mask);
      inn._mask = URL.createObjectURL(b);
      inn.style.webkitMaskImage = inn.style.maskImage = `url(${inn._mask})`;
      el.classList.add('cut');
      scan();
    });
  }

  // ---- The bars of a song without a picture, in its colour on its ink, 10 lines of 48 as on its sleeve. While it is
  // on, the part heard is in the full colour, the bar playing now red, and the rest dimmed.
  const hex = v => { const m = /^#?([0-9a-f]{6})$/i.exec(v.trim()); return m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16)) : [128, 128, 128]; };
  function paint(el, k = -1) {
    const bars = el && el.querySelector('canvas.bars');
    if (!bars || !bars.width) return;
    const cs = getComputedStyle(el), c = hex(cs.getPropertyValue('--c')), ink = hex(cs.getPropertyValue('--k'));
    const v = bars._v || (bars._v = (bars.dataset.bars.match(/../g) || []).map(Number));
    const g = bars.getContext('2d'), W = bars.width, H = bars.height, col = W / 48, row = H / 10;
    const rgb = a => `rgb(${a.join(' ')})`, dim = rgb(c.map((x, j) => Math.round(0.45 * x + 0.55 * ink[j])));
    g.fillStyle = rgb(ink);
    g.fillRect(0, 0, W, H);
    v.forEach((a, n) => {
      const len = Math.max(1, row * 0.82 * (a / 99)), x = (n % 48) * col + col * 0.22, y = Math.floor(n / 48) * row + (row - len) / 2;
      g.fillStyle = k < 0 || n < k ? rgb(c) : n === k ? '#ee0000' : dim;
      g.fillRect(x, y, col * 0.56, len);
    });
  }
  // The same on the drawn sleeve under the name.
  const drawn = face && face.querySelector('svg');
  function heard(k) {
    if (!drawn) return;
    const ink = drawn.querySelector('.ink'), all = ink._parts || (ink._parts = ink.getAttribute('d').split('M').slice(1).map(p => 'M' + p));
    drawn.querySelector('.heard').setAttribute('d', k < 0 ? '' : all.slice(0, k).join(''));
    drawn.querySelector('.at').setAttribute('d', k >= 0 && k < all.length ? all[k] : '');
  }

  // ---- Scrolling moves the picture inside the letters: the name from its middle on down as it leaves, the next name
  // from top to bottom as it passes.
  const clamp = v => Math.min(1, Math.max(0, v));
  function at(el, f) {
    const inn = el && el.querySelector('.inside');
    if (!inn || inn._tx == null) return;
    inn.firstElementChild.style.transform = `translate3d(${(-f * inn._tx).toFixed(1)}px, ${(-f * inn._ty).toFixed(1)}px, 0)`;
  }
  function scan() {
    if (!front.isConnected) return;
    if (calm()) { at(name, 0.4); at(word, 0.5); return; }
    const a = name.getBoundingClientRect();
    at(name, 0.4 + 0.6 * clamp(scrollY / (a.top + scrollY + a.height)));
    if (word) { const b = word.getBoundingClientRect(); at(word, clamp((innerHeight - b.top) / (innerHeight + b.height))); }
  }

  function lay() {
    if (!front.isConnected) return;
    fit(name, 62);
    if (word) fit(word, 28);
    cut(name);
    if (word && word.querySelector('img[src], canvas.bars')) cut(word);
    scan();
  }

  // ---- The clip runs inside the letters while the song plays and the name is in view, and in the picture whole while
  // that is; it holds its frame when paused. Reduced motion keeps the stills.
  function clips() {
    [[name, seen.name], [face, seen.face]].forEach(([el, inView]) => {
      const v = el && el.querySelector('video.loop');
      if (!v) return;
      if (!playing || calm() || !inView) { v.pause(); return; }
      if (!v.getAttribute('src')) { v.src = v.dataset.src; v.addEventListener('playing', () => v.classList.add('on')); }
      v.play().catch(() => {});
    });
  }

  function update({ i, playing: p, t, d }) {
    if (!front.isConnected) return;
    const on = i === N && (p || t > 0);
    len = on && d > 0 ? d : len0;
    playing = on && !!p;
    main.classList.toggle('is-on', on);
    main.classList.toggle('is-playing', playing);
    lbl.textContent = playing ? 'Pause' : 'Play';
    times.forEach(tm => (tm.textContent = on ? `${mmss(t)} / ${mmss(len)}` : mmss(len0)));
    if (state) state.textContent = on ? (playing ? 'Playing' : 'Paused') : year;
    prog = on && len ? Math.min(1, t / len) : 0;
    glide();
    const k = on && len ? Math.min(480, Math.floor((t / len) * 480)) : -1;
    if (k !== lastK) { lastK = k; paint(name, k); heard(k); }
    clips();
  }

  // ---- The glass: pressing or dragging on it moves the song along; it is not a click on the picture.
  const glass = face && face.querySelector('.glass');
  if (glass) {
    const scrub = e => {
      const r = glass.getBoundingClientRect();
      if (main.classList.contains('is-on') && len) document.dispatchEvent(new CustomEvent('player-seek', { detail: { t: clamp((e.clientX - r.left) / r.width) * len } }));
    };
    glass.addEventListener('pointerdown', e => { if (e.button) return; e.preventDefault(); try { glass.setPointerCapture(e.pointerId); } catch {} scrub(e); });
    glass.addEventListener('pointermove', e => { if (glass.hasPointerCapture?.(e.pointerId)) scrub(e); });
    glass.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  }

  // ---- Share: the phone's own sheet, or the address copied.
  const share = main.querySelector('.share');
  if (share) {
    share.hidden = false;
    share.addEventListener('click', async () => {
      const url = location.href.split('#')[0], title = name.querySelector('.t').textContent;
      if (navigator.share) { try { await navigator.share({ title, url }); } catch {} return; }
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch {
        const f = Object.assign(document.createElement('textarea'), { value: url });
        f.style.cssText = 'position:fixed;opacity:0'; document.body.append(f); f.select();
        try { ok = document.execCommand('copy'); } catch {}
        f.remove();
      }
      if (!ok) return;
      share.textContent = 'Copied';
      clearTimeout(share._t);
      share._t = setTimeout(() => (share.textContent = 'Share'), 2200);
    });
  }

  // ---- A strip opens into its song: its colour grows from where it is to fill the window while site.js swaps the page
  // in, then lets go. The next page is that same colour, so only the contents are seen to change; the song plays on.
  main.querySelectorAll('ol.rooms a').forEach(a => a.addEventListener('click', e => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || calm() || !Element.prototype.animate) return;
    const li = a.closest('li'), r = li.getBoundingClientRect(), colour = getComputedStyle(li).backgroundColor;
    document.getElementById('door')?.remove();
    const door = document.createElement('div');
    door.id = 'door';
    door.setAttribute('aria-hidden', 'true');
    Object.assign(door.style, { position: 'fixed', inset: '0', zIndex: '20', background: colour, transformOrigin: '0 0', pointerEvents: 'none' });
    document.body.append(door);
    door.animate([{ transform: `translateY(${r.top}px) scaleY(${r.height / innerHeight})` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
    const leave = () => {
      if (!door.isConnected) return;
      door.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 120, fill: 'both' }).finished.then(() => door.remove(), () => door.remove());
    };
    const watch = new MutationObserver(() => { if (!main.isConnected) { watch.disconnect(); setTimeout(leave, 380); } });
    watch.observe(document.body, { childList: true });
    setTimeout(() => { watch.disconnect(); leave(); }, 4000);
  }));

  // ---- What is in view: the parts of each section come up in turn, the next name's picture is fetched as it nears,
  // and the clips know where they can be seen.
  if ('IntersectionObserver' in window) {
    main.classList.add('up-ready');
    let batch = 0;
    const up = new IntersectionObserver(es => {
      es.filter(e => e.isIntersecting).forEach(e => { e.target.style.setProperty('--d', `${(batch++ % 6) * 80}ms`); e.target.classList.add('on'); up.unobserve(e.target); });
      batch = 0;
    }, { rootMargin: '0px 0px -6% 0px' });
    main.querySelectorAll('[data-up]').forEach(el => up.observe(el));
    const near = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      near.unobserve(e.target);
      const img = e.target.querySelector('img[data-src]');
      if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); img.decode?.().then(() => cut(word), () => {}); }
    }), { rootMargin: '600px 0px' });
    if (word) near.observe(word);
    const view = new IntersectionObserver(es => es.forEach(e => { seen[e.target === name ? 'name' : 'face'] = e.isIntersecting; }) || (clips(), glide()));
    view.observe(name);
    if (face) view.observe(face);
  } else if (word) {
    const img = word.querySelector('img[data-src]');
    if (img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
  }

  // One set of listeners for the whole visit; each run of this script points them at the page now showing.
  let queued = false;
  window.songPage = { update, scan: () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; scan(); }); } }, lay };
  if (!window.songPageListening) {
    window.songPageListening = true;
    document.addEventListener('player', e => window.songPage.update(e.detail));
    addEventListener('scroll', () => window.songPage.scan(), { passive: true });
    let w = innerWidth, h = innerHeight;
    // A phone's toolbar changes the height as it scrolls; only a real change of size redraws the letters.
    addEventListener('resize', () => { if (innerWidth === w && Math.abs(innerHeight - h) < 120) return; w = innerWidth; h = innerHeight; requestAnimationFrame(() => window.songPage.lay()); });
  }
  still.addEventListener?.('change', () => { scan(); clips(); });
  // The face is declared in song.css, which may still be on its way: the letters are laid out now, and again once it is in.
  lay();
  if (!loaded()) {
    const again = () => { if (loaded()) { document.fonts.removeEventListener('loadingdone', again); lay(); } };
    document.fonts.addEventListener('loadingdone', again);
    addEventListener('load', again, { once: true });
    main.querySelector('link[href$="song.css"]')?.addEventListener('load', () => document.fonts.load('700 1em "League Spartan"').then(again));
  }
  // The player shows this page's song, unless one is already playing or part heard (site.js decides).
  document.dispatchEvent(new CustomEvent('player-select', { detail: { i: N } }));
  document.dispatchEvent(new Event('player-ask'));
})();
