// Everything here is optional: without it the site is six plain HTML pages.
(() => {
  const ROOT = new URL('.', document.currentScript.src);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const json = name => fetch(new URL(name, ROOT)).then(r => (r.ok ? r.json() : [])).catch(() => []);

  let clockTimer = 0;

  // ---- Focus rings are for the keyboard. A control clicked or tapped stays quiet ([data-quiet]) until it loses focus, even
  // when a key is pressed afterwards (Esc to leave full screen, an arrow in the viewer), which would otherwise ring it in
  // Chrome. Focus put back by script (closing the viewer or the day grid) is quiet too when the last input was a pointer.
  let byKey = false;
  addEventListener('keydown', () => { byKey = true; }, true);
  addEventListener('pointerdown', () => { byKey = false; }, true);
  function quiet(el) {
    if ('quiet' in el.dataset) return;
    el.dataset.quiet = '';
    el.addEventListener('blur', () => delete el.dataset.quiet, { once: true });
  }
  function refocus(el, opts) {
    if (!byKey) quiet(el);
    el.focus(opts);
  }
  addEventListener('click', e => {
    const el = document.activeElement;
    if (e.detail && el && el !== document.body && el.contains(e.target)) quiet(el);
  }, true);

  // ---- Entrances: each block rises in once; pictures draw top to bottom like a slow modem.
  function entrances() {
    document.querySelectorAll('main figure img').forEach(img => {
      if (img.closest('.load')) return;
      const w = document.createElement('span'); w.className = 'load';
      img.replaceWith(w); w.append(img);
    });
    if (!('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('js');
    let batch = 0;
    const io = new IntersectionObserver(es => {
      es.filter(e => e.isIntersecting).forEach(e => {
        e.target.style.setProperty('--d', (batch++ % 6) * 70 + 'ms');
        e.target.classList.add('in'); io.unobserve(e.target);
      });
      batch = 0;
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('main > :not(.sheet):not(.posts):not(.tracklist):not(.set), .set > .field, .set > .interlock, .print, .roll > li, .back > *, .sheet > :not(.ledger), .ledger > li, .posts > li, .tracklist > li')
      .forEach(el => { el.classList.add('rise'); io.observe(el); });
  }

  // ---- Blog: find, and keyboard like a pager. The key listener is installed once and looks for the field each time.
  function blog() {
    const find = document.getElementById('find');
    if (!find) return;
    const rows = [...document.querySelectorAll('.posts li.post')];
    const years = [...document.querySelectorAll('.posts li.year')];
    const count = document.getElementById('count');
    find.addEventListener('input', () => {
      const q = find.value.trim().toLowerCase();
      let n = 0;
      rows.forEach(r => { const hit = !q || r.textContent.toLowerCase().includes(q); r.hidden = !hit; n += hit; });
      years.forEach(y => { y.hidden = !rows.some(r => r.dataset.year === y.dataset.year && !r.hidden); });
      count.textContent = q ? `${n} of ${rows.length} posts` : `${rows.length} posts`;
    });
  }
  addEventListener('keydown', e => {
    const find = document.getElementById('find');
    if (!find) return;
    if (e.target === find) { if (e.key === 'Escape') find.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
    const links = [...document.querySelectorAll('.posts li.post:not([hidden]) a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === '/') { e.preventDefault(); find.focus(); }
    else if (e.key === 'j') { e.preventDefault(); links[Math.min(links.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'k') { e.preventDefault(); links[Math.max(0, i - 1)]?.focus(); }
  });

  // ---- Contact: Filip's clock, and a letter that opens in the visitor's own mail program.
  function contact() {
    clearInterval(clockTimer);
    const clock = document.getElementById('clock');
    if (clock) {
      const tick = () => {
        const now = new Date();
        const t = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
        const h = +now.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false });
        const state = h < 7 ? 'I am asleep, so expect an answer in the morning'
          : h < 9 ? 'I am probably on my first coffee'
          : h < 19 ? 'I am at work, and I read mail in the evening'
          : h < 23 ? 'this is when I read mail'
          : 'I should be asleep';
        clock.textContent = `It is ${t} in Paris right now; ${state}.`;
      };
      tick(); clockTimer = setInterval(tick, 20000);
    }
    const letter = document.getElementById('letter');
    if (letter) letter.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(letter);
      location.href = `mailto:filip@biljicserver.space?subject=${encodeURIComponent(f.get('subject'))}&body=${encodeURIComponent(f.get('body') || '')}`;
    });
    const print = document.getElementById('print');
    if (print) { print.hidden = false; print.addEventListener('click', () => window.print()); }
  }

  // ---- Photos: every page is plain HTML (filled in by tools/photos.mjs) and works without script.
  // With script, any .print or [data-view] opens large in a viewer you can step through, and the box of dumps
  // (the sleeves on photos.html, the tabs on a dump's page) arrives in order.
  let viewer;
  function photos() {
    dumps();
    const figs = [...document.querySelectorAll('main .print, main [data-view]')];
    if (!figs.length) return;
    const trigger = f => f.querySelector('.open') || f;
    figs.forEach((fig, n) => trigger(fig).addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); view(figs, n);
    }));
    const target = figs.find(f => location.hash === '#' + f.id);
    if (target) view(figs, figs.indexOf(target));
  }

  // ---- Sheets: anything with data-sheet-open="<id>" (a date, say) opens the pictures inside that part of the page
  // ([data-sheet="<its name>"], usually a day) as one large grid. A picture there opens in the viewer; Esc closes the
  // viewer back to the grid, and Esc again closes the grid where the page was left. Without script the links still jump.
  let sheet;
  function sheets() {
    document.querySelectorAll('main [data-sheet-open]').forEach(el => el.addEventListener('click', e => {
      const part = document.getElementById(el.dataset.sheetOpen);
      if (!part || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      openSheet(part, el.closest('a, button') || el);
    }));
  }
  function openSheet(part, from) {
    if (!sheet) {
      sheet = document.createElement('dialog');
      sheet.className = 'daygrid';
      sheet.setAttribute('aria-labelledby', 'sheet-name');
      sheet.innerHTML = `<div class="top"><h2 id="sheet-name" tabindex="-1" autofocus></h2><button type="button" data-close>Close</button></div>
        <ol class="parts" aria-label="Days"></ol><ol class="grid"></ol>`;
      document.body.append(sheet);
      sheet.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b && b.dataset.close !== undefined) sheet.close();
        else if (b && b.dataset.part) fill(document.getElementById(b.dataset.part));
      });
      sheet.addEventListener('close', () => {
        const f = sheet.from;
        if (f && f.isConnected) refocus(f, { preventScroll: true });
      });
    }
    sheet.from = from;
    if (!sheet.open) sheet.showModal();
    fill(part);
  }
  function fill(part) {
    if (!part) return;
    sheet.querySelector('h2').textContent = part.dataset.sheet;
    sheet.querySelector('.parts').innerHTML = [...document.querySelectorAll('main [data-sheet]')].map(p =>
      `<li><button type="button" data-part="${p.id}"${p === part ? ' aria-current="true"' : ''}>${p.dataset.sheetTab || p.dataset.sheet}</button></li>`).join('');
    // The viewer steps through the whole dump, not just this day; Esc comes back to the grid of the day it stopped on.
    const figs = [...part.querySelectorAll('.print, [data-view]')], all = [...document.querySelectorAll('main .print, main [data-view]')];
    const grid = sheet.querySelector('.grid');
    sheet.part = part;
    grid.replaceChildren(...figs.map(f => {
      const li = document.createElement('li'), a = document.createElement('a'), pic = f.querySelector('picture').cloneNode(true);
      const img = pic.querySelector('img');
      li.style.setProperty('--r', (img.width / img.height || 1.5).toFixed(3));
      pic.querySelectorAll('source, img').forEach(x => x.sizes = '(max-width: 640px) 50vw, 30vw');
      a.href = '#' + f.id;
      a.append(pic);
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        e.preventDefault(); view(all, all.indexOf(f), cellFor);
      });
      li.append(a);
      return li;
    }));
    sheet.scrollTop = 0;
  }

  function cellFor(f) {
    const part = f.closest('main [data-sheet]');
    if (part && part !== sheet.part) fill(part);
    return (part && sheet.querySelector(`.grid a[href="#${CSS.escape(f.id)}"]`)) || sheet.querySelector('.grid a');
  }

  // The switcher: sleeves and tabs rise in a few at a time, and on a narrow screen the row of tabs starts at this dump.
  function dumps() {
    const here = document.querySelector('.tabs [aria-current]');
    const row = here && here.closest('ol');
    if (row && row.scrollWidth > row.clientWidth) row.scrollLeft = here.parentElement.offsetLeft - row.offsetLeft - 20;
    const els = [...document.querySelectorAll('main .sleeve, main .tabs li, main .day')];
    if (!els.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => {
      let k = 0;
      es.filter(e => e.isIntersecting).forEach(e => {
        e.target.style.setProperty('--d', (k++ % 8) * 60 + 'ms');
        e.target.classList.add('in'); io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    els.forEach(el => { el.classList.add('rise'); io.observe(el); });
  }

  function view(figs, n, back) {
    if (!viewer) {
      viewer = document.createElement('dialog');
      viewer.className = 'viewer';
      viewer.tabIndex = -1;
      viewer.innerHTML = `<figure><img alt=""><figcaption><p class="line"><span class="where"></span> <span class="cap"></span></p>
        <p class="keys"><button type="button" data-step="-1">&larr; Previous</button> <button type="button" data-step="1">Next &rarr;</button> <button type="button" data-full hidden>Full screen</button> <button type="button" data-close>Close</button></p></figcaption></figure>`;
      document.body.append(viewer);
      // The picture fills the screen and the caption lies over its foot. A tap on either side of the picture steps, a tap
      // in its middle hides or shows the caption; on a phone held sideways it starts hidden.
      const low = matchMedia('(orientation: landscape) and (max-height: 500px)');
      low.addEventListener('change', () => viewer.classList.toggle('bare', low.matches));
      viewer.bare = () => viewer.classList.toggle('bare', low.matches);
      const full = viewer.querySelector('[data-full]');
      full.hidden = !document.fullscreenEnabled;
      document.addEventListener('fullscreenchange', () => { full.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen'; });
      viewer.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b && b.dataset.step) viewer.step(+b.dataset.step);
        // A dialog cannot itself go full screen, so the whole page does, with the viewer still on top.
        else if (b === full) document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
        else if (b || e.target === viewer) viewer.close();
        else if (e.target.tagName === 'IMG') {
          const x = e.offsetX / e.target.clientWidth;
          if (x < 1 / 3) viewer.step(-1); else if (x > 2 / 3) viewer.step(1); else viewer.classList.toggle('bare');
        }
      });
      // Swipe sideways to step, down to close; not while the page is pinched in.
      let t0 = null;
      viewer.addEventListener('touchstart', e => {
        const t = e.touches[0];
        t0 = e.touches.length === 1 && !(window.visualViewport && visualViewport.scale > 1.01) ? { x: t.clientX, y: t.clientY } : null;
      }, { passive: true });
      viewer.addEventListener('touchend', e => {
        if (!t0) return;
        const t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
        t0 = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) viewer.step(dx < 0 ? 1 : -1);
        else if (dy > 80 && dy > Math.abs(dx) * 1.5) viewer.close();
      });
      viewer.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') viewer.step(-1);
        if (e.key === 'ArrowRight') viewer.step(1);
      });
      viewer.addEventListener('close', () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        history.replaceState(history.state, '', location.pathname + location.search);
        // Opened from a sheet: back to the grid, at the picture last shown. Otherwise back to that picture on the page.
        const f = viewer.figs && viewer.figs[viewer.n], cell = f && viewer.back && viewer.back(f);
        if (cell && cell.isConnected) refocus(cell);
        else if (f && f.isConnected) refocus(f.querySelector('.open') || f, { preventScroll: true });
      });
    }
    viewer.figs = figs;
    viewer.back = back || null;
    viewer.step = d => show((viewer.n + d + figs.length) % figs.length);
    const show = i => {
      viewer.n = i;
      const f = viewer.figs[i], src = f.querySelector('img');
      const big = viewer.querySelector('img');
      big.src = (src.currentSrc || src.src).replace(/-\d+\.(jpg|jxl)$/, '-2000.$1');
      big.alt = src.alt;
      const set = f.dataset.dump || (f.closest('.set') && f.closest('.set').querySelector('.title') || document.querySelector('main h1') || {}).textContent || '';
      const fc = f.querySelector('figcaption'), label = f.querySelector('figcaption .frame');
      const cap = f.dataset.caption || (fc ? fc.textContent.slice(label ? label.textContent.length : 0) : src.alt);
      viewer.querySelector('.where').textContent = `${set}, ${i + 1} of ${figs.length}.`;
      viewer.querySelector('.cap').textContent = cap.trim();
      history.replaceState(history.state, '', '#' + f.id);
    };
    show(n);
    // The viewer itself takes focus when it opens, not its first button, so no button shows a focus ring on a tap.
    if (!viewer.open) { viewer.bare(); viewer.showModal(); viewer.focus(); }
  }

  // ---- The player. It lives outside the swapped part of the page, so it keeps playing between pages.
  // Songs come from music.json: [{ "title", "artist", "src", "cover", "coverFull" }], paths relative to the site root.
  // "cover" is the square thumbnail and "coverFull" the uncropped picture shown when the player opens; both are optional.
  // Without art, the cover is drawn from the song itself, its waveform set in lines like a page of text.
  // Lines not heard yet are link blue, heard ones are visited purple, and the bar playing now is the red of a link being clicked.
  const player = (() => {
    const el = document.createElement('div');
    el.id = 'player';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Music player');
    el.innerHTML = `
      <button class="cover" type="button" aria-expanded="false" aria-controls="player-seek" aria-label="Cover and seek bar"><canvas aria-hidden="true"></canvas><img alt="" aria-hidden="true"></button>
      <div class="seek" id="player-seek" hidden>
        <span class="bar" aria-hidden="true"><span class="fill"></span></span>
        <input type="range" min="0" max="0" step="1" value="0" aria-label="Seek">
        <span class="times" aria-hidden="true"><span class="at">0:00</span><span class="len">0:00</span></span>
      </div>
      <button class="play" type="button" aria-label="Play" aria-keyshortcuts="p Space" title="Play or pause (P)" disabled>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path class="i-play" d="M5 3 L17 10 L5 17 Z"/><g class="i-pause"><rect x="4" y="3" width="4" height="14"/><rect x="12" y="3" width="4" height="14"/></g></svg>
      </button>
      <a class="name" href="${new URL('music.html', ROOT).href}">No songs yet</a>
      <span class="vol">
        <button class="mute" type="button" aria-label="Mute" aria-pressed="false" title="Volume">
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path class="spk" d="M2 7 H6 L11 3 V17 L6 13 H2 Z"/><path class="w1" d="M13.5 7.5 Q15 10 13.5 12.5"/><path class="w2" d="M15.5 4.5 Q19 10 15.5 15.5"/><path class="x" d="M13.5 7.5 L18.5 12.5 M18.5 7.5 L13.5 12.5"/></svg></button>
        <input class="level" type="range" min="0" max="100" step="1" aria-label="Volume">
      </span>
      <button class="skip" type="button" aria-label="Skip song" title="Skip song" disabled>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3 3 L13 10 L3 17 Z"/><rect x="14" y="3" width="3" height="14"/></svg></button>`;
    const audio = new Audio();
    audio.preload = 'none';
    const $ = s => el.querySelector(s);
    const cover = $('.cover'), canvas = $('canvas'), pic = $('.cover img'), seek = $('.seek input'), vol = $('.vol'), level = $('.level');
    const still = matchMedia('(prefers-reduced-motion: reduce)'), touch = matchMedia('(hover: none)');
    const mmss = t => (t > 0 && isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');
    let list = [], i = 0;

    const save = () => { try { sessionStorage.setItem('fb-player', JSON.stringify({ i, t: audio.currentTime || 0 })); } catch {} };
    function show() {
      const s = list[i];
      el.classList.toggle('playing', !audio.paused);
      $('.play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
      $('.play').disabled = $('.skip').disabled = cover.disabled = !s;
      $('.name').textContent = s ? (s.artist ? `${s.title} · ${s.artist}` : s.title) : 'No songs yet';
      cover.style.backgroundImage = s && s.cover ? `url("${new URL(s.cover, ROOT).href}")` : '';
      cover.classList.toggle('art', !!(s && s.cover));
      if (open()) art(s);
      document.querySelectorAll('.tracklist li').forEach((li, n) => li.classList.toggle('now', n === i && !!s));
      wave(s, !audio.paused || open()); tick(); draw();
    }
    function load(n, play) {
      if (!list.length) return;
      i = (n + list.length) % list.length;
      audio.src = new URL(list[i].src, ROOT).href;
      if (play) audio.play().catch(() => {});
      save(); show();
    }
    $('.play').addEventListener('click', () => {
      if (!audio.src) load(i, true);
      else if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });
    $('.skip').addEventListener('click', () => load(i + 1, !audio.paused || !audio.src));
    audio.addEventListener('ended', () => load(i + 1, true));
    ['play', 'pause'].forEach(ev => audio.addEventListener(ev, show));
    ['durationchange', 'seeked'].forEach(ev => audio.addEventListener(ev, () => { tick(); draw(); }));
    audio.addEventListener('timeupdate', () => { tick(); draw(); if (Math.round(audio.currentTime) % 5 === 0) save(); });
    audio.addEventListener('error', () => { $('.name').textContent = `Could not load ${list[i]?.title || 'this song'}`; });

    // ---- The waveform: decoded once at a low sample rate, and the loudness of each bar kept in localStorage for next time.
    // It is only fetched once the visitor plays the song or opens the player; until then the cover is the title set in type.
    const ROWS = 10, COLS = 48, waves = {};
    function wave(s, fetchIt) {
      if (!s || s.cover || waves[s.src]) return;
      try { const kept = JSON.parse(localStorage.getItem('fb-wave:' + s.src) || 'null'); if (kept && kept.p) { waves[s.src] = kept; return; } } catch {}
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!fetchIt || !Ctx) return;
      waves[s.src] = 'busy';
      fetch(new URL(s.src, ROOT)).then(r => r.arrayBuffer())
        .then(buf => new Promise((ok, no) => new Ctx(1, 1, 8000).decodeAudioData(buf, ok, no)))
        .then(b => {
          const d = b.getChannelData(0), n = ROWS * COLS, step = Math.floor(d.length / n), rms = [];
          for (let k = 0; k < n; k++) {
            let sum = 0;
            for (let j = k * step; j < (k + 1) * step; j++) sum += d[j] * d[j];
            rms.push(Math.sqrt(sum / step));
          }
          const top = Math.max(...rms) || 1;
          waves[s.src] = { d: b.duration, p: rms.map(v => Math.round((v / top) * 100) / 100) };
          try { localStorage.setItem('fb-wave:' + s.src, JSON.stringify(waves[s.src])); } catch {}
          tick(); draw();
        })
        .catch(() => { waves[s.src] = 'none'; });
    }
    function draw() {
      const s = list[i], size = canvas.clientWidth, dpr = devicePixelRatio || 1;
      if (!size) return;
      if (canvas.width !== Math.round(size * dpr)) canvas.width = canvas.height = Math.round(size * dpr);
      const g = canvas.getContext('2d'), css = getComputedStyle(el), v = name => css.getPropertyValue(name).trim();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      if (!s || s.cover) return;
      const w = waves[s.src], pad = size * 0.09, box = size - 2 * pad;
      if (w && w.p) {
        // Loud masters keep every bar near the top, so the bars are stretched between the quiet and the loud end of this song.
        if (!w.lo) { const o = [...w.p].sort((a, b) => a - b); w.lo = o[Math.floor(o.length * 0.05)]; w.hi = o[Math.floor(o.length * 0.98)] || 1; }
        const n = w.p.length, rowH = box / ROWS, colW = box / COLS, d = audio.duration || w.d;
        const now = audio.currentTime > 0 && d ? Math.min(n - 1, Math.floor((audio.currentTime / d) * n)) : -1;
        w.p.forEach((a, k) => {
          const h = Math.max(1, rowH * 0.82 * (0.12 + 0.88 * Math.min(1, Math.max(0, (a - w.lo) / (w.hi - w.lo || 1))) ** 1.6)), x = pad + (k % COLS) * colW, y = pad + Math.floor(k / COLS) * rowH + (rowH - h) / 2;
          g.fillStyle = k < now ? v('--visited') : k === now ? v('--now') : v('--link');
          g.fillRect(x, y, Math.max(1, colW * 0.55), h);
        });
        return;
      }
      // The title in type: one word to a line, as large as the widest word allows. The thumbnail has room for the initial only.
      const words = size < 80 ? [s.title[0]] : s.title.split(/\s+/);
      g.fillStyle = v('--link');
      g.font = `italic bold 100px ${v('--face')}`;
      const widest = Math.max(...words.map(t => g.measureText(t).width));
      const fs = Math.min((100 * box) / widest, box / words.length / 0.92), lh = fs * 0.92;
      g.font = `italic bold ${fs}px ${v('--face')}`;
      g.textBaseline = 'alphabetic';
      g.textAlign = words.length === 1 ? 'center' : 'left';
      const x = words.length === 1 ? size / 2 : pad, y0 = pad + (box - lh * words.length) / 2 + fs * 0.78;
      words.forEach((t, k) => g.fillText(t, x, y0 + k * lh));
    }
    new ResizeObserver(draw).observe(canvas);

    // ---- Seeking: a real range input, so click, drag and the keyboard all work. Arrows step five seconds.
    function tick() {
      const t = audio.currentTime || 0, d = audio.duration || (waves[list[i]?.src] || {}).d || 0;
      seek.max = Math.floor(d);
      if (!seek.matches(':active')) seek.value = Math.floor(t);
      seek.setAttribute('aria-valuetext', `${mmss(t)} of ${mmss(d)}`);
      $('.at').textContent = mmss(t);
      $('.len').textContent = mmss(d);
      $('.fill').style.transform = `scaleX(${d ? Math.min(1, t / d) : 0})`;
    }
    seek.addEventListener('input', () => {
      if (!audio.src) prime();
      audio.currentTime = +seek.value;
      tick(); draw(); save();
    });
    seek.addEventListener('keydown', e => {
      const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
      if (!step) return;
      e.preventDefault();
      seek.value = Math.min(+seek.max, Math.max(0, +seek.value + step));
      seek.dispatchEvent(new Event('input'));
    });
    // Before the first play nothing has loaded, so opening the player asks for the song's length.
    function prime() {
      if (!audio.src && list[i]) audio.src = new URL(list[i].src, ROOT).href;
      if (audio.preload === 'none') audio.preload = 'metadata';
    }

    // ---- Opening: the thumbnail grows into the full cover, and the panel opens out from where it was.
    let shown = false, moving = null;
    const open = () => shown;
    function setOpen(on) {
      el.classList.toggle('open', on);
      $('.seek').hidden = !on;
      cover.setAttribute('aria-expanded', on);
    }
    // The full picture is fetched when the pointer or focus reaches the cover, and the player waits for it before opening.
    function art(s) {
      if (!s || !s.cover) return Promise.resolve();
      const src = new URL(s.coverFull || s.cover, ROOT).href;
      if (pic.src !== src) pic.src = src;
      return pic.decode().then(() => cover.style.setProperty('--ar', pic.naturalWidth / pic.naturalHeight)).catch(() => {});
    }
    function expand(on) {
      if (on === shown || !list.length) return;
      shown = on;
      if (moving) moving.stop();
      if (!on) return move(false);
      prime(); wave(list[i], true);
      Promise.race([art(list[i]), new Promise(r => setTimeout(r, 800))]).then(() => { if (shown) move(true); });
    }
    function move(on) {
      if (on === el.classList.contains('open')) return;
      // Measure the small layout, then put the big one back before anything paints: both moves run in the open layout.
      const from = cover.getBoundingClientRect();
      setOpen(false);
      const to = cover.getBoundingClientRect();
      setOpen(true);
      if (on) draw();
      const big = on ? cover.getBoundingClientRect() : from, small = on ? from : to, ref = el.getBoundingClientRect();
      const done = () => { moving = null; if (!on) { setOpen(false); draw(); } };
      if (still.matches) return done();
      // A portrait or landscape picture starts as its middle square, the thumbnail's crop, and opens out to its full shape.
      const side = Math.min(big.width, big.height), dx = (big.width - side) / 2, dy = (big.height - side) / 2, k = small.width / side;
      const shut = `inset(${small.top - ref.top}px ${ref.right - small.right}px ${ref.bottom - small.bottom}px ${small.left - ref.left}px)`;
      const shrunk = `translate(${small.left - big.left - dx * k}px, ${small.top - big.top - dy * k}px) scale(${k})`;
      const timing = { duration: on ? 460 : 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
      const frames = (x, y) => (on ? [x, y] : [y, x]);
      const anims = [
        cover.animate(frames({ transform: shrunk, transformOrigin: '0 0', clipPath: `inset(${dy}px ${dx}px)` }, { transform: 'none', transformOrigin: '0 0', clipPath: 'inset(0px 0px)' }), timing),
        el.animate(frames({ clipPath: shut }, { clipPath: 'inset(0px 0px 0px 0px)' }), timing),
      ];
      const m = moving = { stop: () => { anims.forEach(x => x.cancel()); done(); } };
      anims[0].onfinish = () => { if (moving === m) done(); };
    }
    ['pointerenter', 'focus'].forEach(ev => cover.addEventListener(ev, () => art(list[i])));
    cover.addEventListener('click', () => expand(!open()));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (vol.classList.contains('open')) vol.classList.remove('open');
      else if (open()) { expand(false); if (el.contains(document.activeElement)) cover.focus(); }
    });
    // P or Space plays and pauses from anywhere, unless the key is meant for a field or a focused control.
    document.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const space = e.key === ' ';
      if (!space && e.key.toLowerCase() !== 'p') return;
      const t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (space && t.closest('a, button, summary, [tabindex], dialog')) return;
      if ($('.play').disabled) return;
      e.preventDefault();
      $('.play').click();
    });
    // A click anywhere else closes it, except on the music page's tracklist, which drives the same player.
    document.addEventListener('click', e => {
      if (el.contains(e.target)) return;
      vol.classList.remove('open');
      if (open() && !e.target.closest('#tracklist')) expand(false);
    });

    // ---- Volume, remembered across visits. iOS keeps the volume on the hardware buttons, so there only mute is offered.
    let level0 = { v: 0.8, m: false };
    try { level0 = { ...level0, ...JSON.parse(localStorage.getItem('fb-volume') || '{}') }; } catch {}
    const probe = new Audio();
    probe.volume = 0.5;
    el.classList.toggle('fixed-volume', probe.volume !== 0.5);
    function loud(v, m) {
      level0 = { v, m };
      audio.volume = v;
      audio.muted = m || v === 0;
      level.value = Math.round(v * 100);
      level.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`);
      vol.dataset.level = audio.muted ? 'off' : v < 0.5 ? 'low' : 'high';
      $('.mute').setAttribute('aria-pressed', audio.muted);
      try { localStorage.setItem('fb-volume', JSON.stringify(level0)); } catch {}
    }
    loud(level0.v, level0.m);
    level.addEventListener('input', () => loud(level.value / 100, false));
    $('.mute').addEventListener('click', () => {
      // On a touch screen there is no hover, so the first tap opens the slider and the next one mutes.
      if (touch.matches && !vol.classList.contains('open') && !el.classList.contains('fixed-volume')) { vol.classList.add('open'); return; }
      if (audio.muted) loud(level0.v || 0.5, false);
      else loud(level0.v, true);
    });

    document.body.prepend(el);
    json('music.json').then(songs => {
      list = Array.isArray(songs) ? songs.filter(s => s && s.src && s.title) : [];
      try { const st = JSON.parse(sessionStorage.getItem('fb-player') || 'null'); if (st && list[st.i]) { i = st.i; audio.src = new URL(list[i].src, ROOT).href; audio.currentTime = st.t; } } catch {}
      show(); tracklist();
    });

    // The music page lists the same songs; clicking one plays it.
    function tracklist() {
      const ol = document.getElementById('tracklist');
      if (!ol) return show();
      ol.innerHTML = list.map((s, n) => `<li><button type="button" data-n="${n}">${esc(s.title)}</button>${s.artist ? ` <span class="soft">${esc(s.artist)}</span>` : ''}</li>`).join('');
      ol.onclick = e => { const b = e.target.closest('button[data-n]'); if (b) load(+b.dataset.n, true); };
      show(); entrances();
    }
    return { tracklist, el };
  })();

  // ---- Back to the top: a small button in the bottom right corner, there once the page has been scrolled most of a screen down.
  // Like the player it lives outside the swapped part of the page; it takes focus back to the page's heading.
  (() => {
    const b = document.createElement('button');
    b.id = 'top'; b.type = 'button'; b.title = 'Back to the top'; b.setAttribute('aria-label', 'Back to the top');
    b.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 3 L17 11 H12.5 V17 H7.5 V11 H3 Z"/></svg>';
    b.addEventListener('click', () => {
      scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      const h1 = document.querySelector('main h1');
      if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
    });
    let queued = false;
    const place = () => { queued = false; b.classList.toggle('on', scrollY > innerHeight * 0.6); };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(place); } }, { passive: true });
    document.body.append(b);
    place();
  })();

  // ---- Page setup, run on the first load and after every swap.
  function init() {
    entrances();
    blog();
    contact();
    photos();
    sheets();
    player.tracklist();
  }

  // ---- Links load the next page in place, so the player is not interrupted. Anything unusual falls back to a normal load.
  async function go(url, push) {
    let res, text;
    try {
      res = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) throw 0;
      text = await res.text();
    } catch { location.assign(url); return; }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const parts = ['nav', 'main', 'footer'];
    if (!parts.every(p => doc.querySelector(p))) { location.assign(url); return; }

    if (push) history.pushState({}, '', url);
    document.title = doc.title;
    document.body.className = doc.body.className;
    parts.forEach(p => document.querySelector(p).replaceWith(document.adoptNode(doc.querySelector(p))));
    // Scripts in the new <main> arrive parsed but not run; a page that brings its own (a dump's dump.js) gets it run here.
    document.querySelectorAll('main script[src]').forEach(old => { const s = document.createElement('script'); s.src = old.src; old.replaceWith(s); });
    const hash = new URL(url).hash;
    const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView(); else scrollTo(0, 0);
    const h1 = document.querySelector('main h1');
    if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }

    init();
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.href.startsWith(ROOT.href)) return;
    if (!/(\.html|\/)$/.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.hash) return;
    e.preventDefault();
    go(url.href, true);
  });
  addEventListener('popstate', () => go(location.href, false));

  if (document.readyState === 'complete') init();
  else addEventListener('load', () => setTimeout(init, 0));
})();
