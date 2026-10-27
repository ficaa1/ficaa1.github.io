// Everything here is optional: without it the site is six plain HTML pages.
(() => {
  const ROOT = new URL('.', document.currentScript.src);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const json = name => fetch(new URL(name, ROOT)).then(r => (r.ok ? r.json() : [])).catch(() => []);

  // ---- Low power mode, for TVs and old phones: the switch at the foot of every page. The page scripts treat it as reduced
  // motion (no film, no song loops), site.css stops the animations and the glass blur, and the viewer keeps to the 2000 px
  // pictures. It is kept in localStorage and the page reloads when it is switched.
  // The second switch stops only the motion (films, song loops, animations) and keeps the glass and the big pictures.
  // The third bends the film behind the glass on the photos page (lands.css), which only Chromium can draw, so it is
  // offered only there; it is heavy, and off unless asked for.
  let lite = false, still = false, glass = false;
  try { lite = localStorage.getItem('fb-lite') === '1'; still = localStorage.getItem('fb-still') === '1'; glass = localStorage.getItem('fb-glass') === '1'; } catch {}
  const bends = !!navigator.userAgentData?.brands?.some(b => b.brand === 'Chromium');
  document.documentElement.toggleAttribute('data-lite', lite);
  document.documentElement.toggleAttribute('data-still', still);
  document.documentElement.toggleAttribute('data-glass', glass && bends);
  // With it on, the music's seek bar bends the cover too (music.css, song.css): the strip is a rod of glass, the cover
  // under it pulled in from the top and bottom, and the bead a lens that magnifies what it rides over. Each moves the
  // picture three times, a little less each time, for the red, the green and the blue, as thick glass does.
  if (glass && bends) {
    const ramp = (id, ch, stops, vert) => `<linearGradient id="${id}"${vert ? ' x2="0" y2="1"' : ''}>${stops
      .map(([o, v]) => `<stop offset="${o}" stop-color="rgb(${ch === 'r' ? v : 0},${ch === 'g' ? v : 0},0)"/>`).join('')}</linearGradient>`;
    const map = (x, y) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" preserveAspectRatio="none">${ramp('x', 'r', x)}${ramp('y', 'g', y, true)}<rect width="200" height="200" fill="url(#x)"/><g style="mix-blend-mode:screen"><rect width="200" height="200" fill="url(#y)"/></g></svg>`);
    const flat = [[0, 128], [1, 128]], inward = [[0, 255], [.2, 175], [.5, 128], [.8, 81], [1, 0]];
    const lens = (id, href, [r, g, b]) => `<filter id="${id}" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
<feImage href="${href}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map"/>
${[[r, '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0'], [g, '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0'], [b, '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0']].map(([k, m], i) =>
  `<feDisplacementMap in="SourceGraphic" in2="map" scale="${k}" xChannelSelector="R" yChannelSelector="G" result="d${i}"/><feColorMatrix in="d${i}" values="${m} 0 0 0 1 0" result="c${i}"/>`).join('\n')}
<feBlend in="c0" in2="c1" mode="screen" result="c01"/><feBlend in="c01" in2="c2" mode="screen"/></filter>`;
    const svg = document.createElement('div');
    svg.innerHTML = `<svg aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">${lens('fb-strip', map(flat, inward), [.5, .44, .38])}${lens('fb-bead', map(inward, inward), [.42, .38, .34])}</svg>`;
    document.body.append(svg.firstChild);
  }
  function liteSwitch() {
    const foot = document.querySelector('footer #trace') || document.querySelector('footer');
    if (!foot || foot.querySelector('.lite')) return;
    const p = document.createElement('p');
    for (const [key, on, label] of [['fb-lite', lite, 'Low power mode'], ['fb-still', !still, 'Videos and animations'], bends && ['fb-glass', glass, 'Liquid glass']].filter(Boolean)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lite'; b.setAttribute('aria-pressed', on);
      b.textContent = `${label}: ${on ? 'on' : 'off'}`;
      b.addEventListener('click', () => { try { localStorage.setItem(key, localStorage.getItem(key) === '1' ? '0' : '1'); } catch {} location.reload(); });
      if (p.firstChild) p.append(' · ');
      p.append(b);
    }
    foot.append(p);
  }

  // ---- Focus rings are for the keyboard. A control clicked or tapped stays quiet ([data-quiet]) until it loses focus, even
  // when a key is pressed afterwards (Esc to leave full screen, an arrow in the viewer), which would otherwise ring it in
  // Chrome. Focus put back by script (closing the viewer or the day grid) is quiet too when that was opened with a pointer,
  // or when the last input was one; Esc or an arrow pressed inside does not bring the ring back.
  let byKey = false;
  addEventListener('keydown', () => { byKey = true; }, true);
  addEventListener('pointerdown', () => { byKey = false; }, true);
  function quiet(el) {
    if ('quiet' in el.dataset) return;
    el.dataset.quiet = '';
    el.addEventListener('blur', () => delete el.dataset.quiet, { once: true });
  }
  function refocus(el, opts, tapped) {
    if (tapped || !byKey) quiet(el);
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

  // ---- Contact: a letter that opens in the visitor's own mail program.
  function contact() {
    const letter = document.getElementById('letter');
    if (letter) {
      // The draft is kept for the tab, so it survives a reload or a visit to another page; Ctrl/Cmd+Enter sends it.
      const fields = [...letter.querySelectorAll('select, textarea')];
      let draft = {};
      try { draft = JSON.parse(sessionStorage.getItem('fb-letter')) || {}; } catch {}
      for (const el of fields) {
        if (draft[el.id] != null) el.value = draft[el.id];
        el.addEventListener('input', () => {
          for (const f of fields) draft[f.id] = f.value;
          try { sessionStorage.setItem('fb-letter', JSON.stringify(draft)); } catch {}
        });
      }
      letter.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); letter.requestSubmit(); }
      });
      letter.addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(letter);
        location.href = `mailto:filip@biljicserver.space?subject=${encodeURIComponent(f.get('subject'))}&body=${encodeURIComponent(f.get('body') || '')}`;
      });
    }
    const print = document.getElementById('print');
    if (print) { print.hidden = false; print.addEventListener('click', () => window.print()); }
  }

  // ---- Photos: every page is plain HTML (filled in by tools/photos.mjs) and works without script.
  // With script, any .print or [data-view] opens large in a viewer you can step through, and the box of dumps
  // (the sleeves on photos.html, the tabs on a dump's page) arrives in order.
  let viewer;
  // A picture's 4000 px copy, which the viewer shows in place of the 2000 px one: the JXL on an HDR screen that reads
  // JXL, a JPEG anywhere else or when there is no JXL (a JPEG original has none). Each is fetched and decoded once, from
  // the moment a finger touches the picture; the promise gives its address, or null when there is no such copy.
  const large = new Map();
  let jxl = false;
  function enlarge(f) {
    const img = f && f.querySelector('img'), src = img && (img.currentSrc || img.src);
    if (lite || !src || !/-\d+\.(jpg|jxl)$/.test(src)) return null;
    if (/\.jxl$/.test(src)) jxl = true;
    const base = src.replace(/-\d+\.(jpg|jxl)$/, '-4000.');
    if (!large.has(base)) {
      const exts = jxl && matchMedia('(dynamic-range: high)').matches ? ['jxl', 'jpg'] : ['jpg'];
      const load = ([ext, ...rest]) => {
        if (!ext) return Promise.resolve(null);
        const pre = new Image();
        pre.src = base + ext;
        return pre.decode().then(() => pre.src, () => load(rest));
      };
      large.set(base, load(exts));
    }
    return large.get(base);
  }
  function photos() {
    dumps();
    const figs = [...document.querySelectorAll('main .print, main [data-view]')];
    if (!figs.length) return;
    const trigger = f => f.querySelector('.open') || f;
    figs.forEach((fig, n) => {
      trigger(fig).addEventListener('pointerdown', () => enlarge(fig));
      trigger(fig).addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        e.preventDefault(); view(figs, n);
      });
    });
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
        if (f && f.isConnected) refocus(f, { preventScroll: true }, sheet.tapped);
      });
    }
    sheet.from = from;
    if (!sheet.open) { sheet.tapped = !byKey; sheet.showModal(); }
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
      // The copy leaves behind the page's reveal (.load), whose curtain would stay drawn over the grid.
      pic.querySelectorAll('.load').forEach(w => w.replaceWith(...w.childNodes));
      const img = pic.querySelector('img');
      li.style.setProperty('--r', (+img.getAttribute('width') / +img.getAttribute('height') || 1.5).toFixed(3));
      pic.querySelectorAll('source, img').forEach(x => x.sizes = '(max-width: 640px) 50vw, 30vw');
      a.href = '#' + f.id;
      a.append(pic);
      a.addEventListener('pointerdown', () => enlarge(f));
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
      viewer.setAttribute('aria-label', 'Photo viewer');
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
        if (cell && cell.isConnected) refocus(cell, undefined, viewer.tapped);
        else if (f && f.isConnected) {
          // Back on the page at the picture last shown, wherever the viewer was stepped to.
          const r = f.getBoundingClientRect(), bar = document.querySelector('body > .pbar.on');
          if (r.top < (bar ? bar.offsetHeight : 0) || r.bottom > innerHeight) f.scrollIntoView({ block: 'center' });
          refocus(f.querySelector('.open') || f, { preventScroll: true }, viewer.tapped);
        }
      });
    }
    viewer.figs = figs;
    viewer.back = back || null;
    viewer.step = d => { viewer.dir = d; show((viewer.n + d + figs.length) % figs.length); };
    const show = i => {
      viewer.n = i;
      const f = viewer.figs[i], src = f.querySelector('img');
      const big = viewer.querySelector('img');
      big.src = (src.currentSrc || src.src).replace(/-\d+\.(jpg|jxl)$/, '-2000.$1');
      big.alt = src.alt;
      // Then the 4000 px copy takes its place once it is ready, and the next three pictures the way the viewer is going
      // load theirs, then the one behind: one at a time, stopping as soon as the viewer moves on.
      const ready = enlarge(f);
      if (ready) ready.then(url => {
        if (viewer.n !== i) return;
        if (url) big.src = url;
        const d = viewer.dir || 1, len = viewer.figs.length;
        [d, 2 * d, 3 * d, -d].reduce((before, k) => before.then(() => viewer.n === i && enlarge(viewer.figs[(i + k + 4 * len) % len])), Promise.resolve());
      });
      const set = f.dataset.dump || (f.closest('.set') && f.closest('.set').querySelector('.title') || document.querySelector('main h1') || {}).textContent || '';
      const fc = f.querySelector('figcaption'), label = f.querySelector('figcaption .frame');
      const cap = f.dataset.caption || (fc ? fc.textContent.slice(label ? label.textContent.length : 0) : src.alt);
      viewer.querySelector('.where').textContent = `${set}, ${i + 1} of ${figs.length}.`;
      viewer.querySelector('.cap').textContent = cap.trim();
      history.replaceState(history.state, '', '#' + f.id);
    };
    show(n);
    // The viewer itself takes focus when it opens, not its first button, so no button shows a focus ring on a tap.
    if (!viewer.open) { viewer.tapped = !byKey; viewer.bare(); viewer.showModal(); viewer.focus(); }
  }

  // ---- The player. It lives outside the swapped part of the page, so it keeps playing between pages.
  // Songs come from music.json: [{ "title", "artist", "src", "cover", "coverFull" }], absolute URLs or paths relative to the site root.
  // "cover" is the square thumbnail and "coverFull" the uncropped picture shown when the player opens; both are optional.
  // Without art, the cover is drawn from the song itself, its waveform set in lines like a page of text.
  // Lines not heard yet are link blue, heard ones are visited purple, and the bar playing now is the red of a link being clicked.
  (() => {
    const el = document.createElement('div');
    el.id = 'player';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Music player');
    el.innerHTML = `
      <button class="cover" type="button" aria-expanded="false" aria-controls="player-seek" aria-label="Cover and seek bar"><canvas aria-hidden="true"></canvas><img alt="" aria-hidden="true"><video muted playsinline loop preload="none" disablepictureinpicture aria-hidden="true"></video></button>
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
    const cover = $('.cover'), canvas = $('canvas'), pic = $('.cover img'), clip = $('.cover video'), seek = $('.seek input'), vol = $('.vol'), level = $('.level');
    const still = matchMedia('(prefers-reduced-motion: reduce)'), touch = matchMedia('(hover: none)');
    const calm = () => still.matches || document.documentElement.matches('[data-lite],[data-still]');
    const mmss = t => (t > 0 && isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');
    let list = [], i = 0;

    const save = () => { try { sessionStorage.setItem('fb-player', JSON.stringify({ i, t: audio.currentTime || 0 })); } catch {} };
    function show() {
      const s = list[i];
      el.classList.toggle('playing', !audio.paused);
      $('.play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
      $('.play').disabled = $('.skip').disabled = cover.disabled = !s;
      $('.name').textContent = s ? (s.artist ? `${s.title} · ${s.artist}` : s.title) : 'No songs yet';
      $('.name').href = new URL(s && s.slug ? `songs/${s.slug}.html` : 'music.html', ROOT).href;
      cover.style.backgroundImage = s && s.cover ? `url("${new URL(s.cover, ROOT).href}")` : '';
      cover.classList.toggle('art', !!(s && s.cover));
      if (open()) art(s);
      wave(s, !audio.paused || open()); tick(); draw(); motion(); emit();
    }
    // A song whose cover is a video loop ("loopFull", the whole clip, or "loop", its square) plays it in the cover while the
    // song plays, and holds its frame when paused. The picture stays under it until the video is running.
    function motion() {
      const s = list[i], src = s && !calm() && (s.loopFull || s.loop) ? new URL(s.loopFull || s.loop, ROOT).href : '';
      if (clip.src !== src) { clip.classList.remove('on'); if (src) clip.src = src; else clip.removeAttribute('src'); }
      if (src && !audio.paused) clip.play().catch(() => {}); else clip.pause();
    }
    clip.addEventListener('playing', () => clip.classList.add('on'));
    clip.addEventListener('emptied', () => clip.classList.remove('on'));
    still.addEventListener('change', motion);

    // Any page can drive the player: a button with data-song="<n>" plays that song, or pauses it when it is the one playing.
    // A page can also move the song along with a "player-seek" event, detail { t } in seconds.
    // Each change is announced as a "player" event on document, detail { i, playing, t, d }; a page that arrives later asks
    // for the current one with a "player-ask" event.
    const emit = () => document.dispatchEvent(new CustomEvent('player', { detail: { i, playing: !audio.paused, t: audio.currentTime || 0, d: audio.duration || list[i]?.d || list[i]?.wave?.d || 0 } }));
    document.addEventListener('player-ask', emit);
    document.addEventListener('player-seek', e => { if (audio.src && isFinite(e.detail?.t)) { audio.currentTime = Math.max(0, e.detail.t); tick(); draw(); emit(); save(); } });
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-song]');
      if (!b || el.contains(b)) return;
      e.preventDefault();
      const n = +b.dataset.song;
      if (n === i && audio.src && !audio.paused) audio.pause();
      else if (n === i && audio.src) audio.play().catch(() => {});
      else load(n, true);
    });
    // A song's own page asks with "player-select", detail { i }, for its song to be the one shown, without playing it.
    // A song that is playing, or paused part of the way through, stays.
    let wanted = null;
    function select(n) {
      if (!list.length) { wanted = n; return; }
      if (!list[n] || n === i || !audio.paused || audio.currentTime > 0) return;
      load(n, false);
    }
    document.addEventListener('player-select', e => select(+e.detail?.i));
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
    audio.addEventListener('timeupdate', () => { tick(); draw(); emit(); if (Math.round(audio.currentTime) % 5 === 0) save(); });
    audio.addEventListener('error', () => { $('.name').textContent = `Could not load ${list[i]?.title || 'this song'}`; });

    // ---- The waveform: decoded once at a low sample rate, and the loudness of each bar kept in localStorage for next time.
    // It is only fetched once the visitor plays the song or opens the player; until then the cover is the title set in type.
    const ROWS = 10, COLS = 48, waves = {};
    // A song on another host (R2) can't be read by script, so music.json carries its bars as "wave": { "d", "p" }.
    function wave(s, fetchIt) {
      if (!s || s.cover || waves[s.src]) return;
      if (s.wave && s.wave.p) { waves[s.src] = { ...s.wave }; return; }
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
      if (calm()) return done();
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
    // A click anywhere else closes it, except on a song in the music page, which drives the same player.
    document.addEventListener('click', e => {
      if (el.contains(e.target)) return;
      vol.classList.remove('open');
      if (open() && !e.target.closest('[data-song]')) expand(false);
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

    // ---- While a song plays the player follows the page down: once its own place has scrolled by, it holds on at the
    // bottom of the window. Paused, it stays until the page has moved on half a screen, so it can be started again.
    // Where it sits in the flow of the page (phones), a spot of its height keeps the page from jumping up.
    const spot = document.createElement('div');
    let docked = false, held = null, limit = 0, queued = false;
    function follow() {
      queued = false;
      if (!docked) limit = el.getBoundingClientRect().bottom + scrollY;
      const want = scrollY > limit && (!audio.paused || open() || (held !== null && Math.abs(scrollY - held) < innerHeight / 2));
      if (want === docked) return;
      docked = want;
      if (want) {
        spot.style.height = /^(static|relative)$/.test(getComputedStyle(el).position) ? `${el.offsetHeight}px` : '0';
        el.before(spot);
      } else spot.remove();
      el.classList.toggle('docked', want);
    }
    const later = () => { if (!queued) { queued = true; requestAnimationFrame(follow); } };
    addEventListener('scroll', later, { passive: true });
    addEventListener('resize', () => { if (docked) { docked = false; spot.remove(); el.classList.remove('docked'); } later(); });
    audio.addEventListener('play', () => { held = null; later(); });
    audio.addEventListener('pause', () => { held = scrollY; later(); });

    document.body.prepend(el);
    json('music.json').then(songs => {
      list = Array.isArray(songs) ? songs.filter(s => s && s.src && s.title) : [];
      try { const st = JSON.parse(sessionStorage.getItem('fb-player') || 'null'); if (st && list[st.i]) { i = st.i; audio.src = new URL(list[i].src, ROOT).href; audio.currentTime = st.t; } } catch {}
      // A song's page opened directly asked before this script was listening; its page says which song it is.
      const own = document.querySelector('main [data-song-page]');
      if (wanted === null && own) wanted = +own.dataset.songPage;
      if (wanted !== null) { const n = wanted; wanted = null; select(n); }
      show();
    });
  })();

  // ---- Back to the top: a small button in the bottom right corner, there once the page has been scrolled most of a screen down.
  // Like the player it lives outside the swapped part of the page; it takes focus back to the page's heading.
  (() => {
    const b = document.createElement('button');
    b.id = 'top'; b.type = 'button'; b.title = 'Back to the top'; b.setAttribute('aria-label', 'Back to the top');
    b.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 3 L17 11 H12.5 V17 H7.5 V11 H3 Z"/></svg>';
    b.addEventListener('click', () => {
      scrollTo({ top: 0, behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('[data-lite],[data-still]')) ? 'auto' : 'smooth' });
      const h1 = document.querySelector('main h1');
      if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
    });
    let queued = false;
    const place = () => { queued = false; b.classList.toggle('on', scrollY > innerHeight * 0.6); };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(place); } }, { passive: true });
    document.body.append(b);
    place();
  })();

  // ---- On to the next day: on a photo page with days, a button under the back-to-top one that brings the next day's
  // heading up under the bar. Where a day opens a part of the page with its own opening above it (Paris's stations), the
  // button stops at that opening instead. It is there while a day is still below, and gone on the last.
  const nextDay = (() => {
    const b = document.createElement('button');
    b.id = 'next'; b.type = 'button'; b.title = 'Next day'; b.setAttribute('aria-label', 'Next day');
    b.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 17 L3 9 H7.5 V3 H12.5 V9 H17 Z"/></svg>';
    // Where a part sits on the page, without the lift of its entrance (.rise), which would otherwise send the scroll past it.
    const y = el => { let t = 0; for (; el; el = el.offsetParent) t += el.offsetTop; return t; };
    const below = () => {
      const days = [...document.querySelectorAll('main [data-sheet][id]')], bar = document.querySelector('body > .pbar');
      for (const d of days) {
        // Right under the bar of days, which is fixed over the top.
        const part = d.parentElement.closest('main section'), margin = bar ? bar.offsetHeight : parseFloat(getComputedStyle(d).scrollMarginTop) || 0;
        const opens = part && part.querySelector('[data-sheet][id]') === d && part.querySelectorAll('[data-sheet][id]').length < days.length;
        const at = opens ? part : d;
        if (y(at) - scrollY > margin + 4) return { at, margin };
      }
    };
    b.addEventListener('click', () => {
      const n = below();
      if (!n) return;
      scrollTo({ top: y(n.at) - n.margin, behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('[data-lite],[data-still]')) ? 'auto' : 'smooth' });
      const h = n.at.querySelector('h2, h3');
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    });
    let queued = false;
    const place = () => { queued = false; b.classList.toggle('on', !!below()); };
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(place); } }, { passive: true });
    document.body.append(b);
    return place;
  })();

  // ---- The photo bar. On a photo page, once its own switcher has gone by, a thin bar keeps the way round in view: the
  // dumps, the places of the country, and the days of this page with the one in view marked. It is made from what the
  // page already has (.tabs, .places, [data-sheet]) and takes the page's look: the type of its day numbers, and the
  // ground and ink of the day in view. On a phone the dumps and places fold under a button named for this page.
  const ground = el => {
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const c = getComputedStyle(el).backgroundColor;
      if (c && !/^rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') return c;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const lum = c => {
    const [r, g, b] = (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  function photoBar() {
    document.querySelectorAll('body > .pbar').forEach(b => b.remove());
    document.documentElement.style.removeProperty('--pbar');
    const main = document.querySelector('main'), tabs = main && main.querySelector('.tabs');
    if (!tabs) return;
    // The bar takes its type and colours from the page, so it waits for the page's own stylesheets (linked in <main>).
    const loading = [...main.querySelectorAll('link[rel="stylesheet"]')].filter(l => !l.sheet);
    if (loading.length) {
      Promise.all(loading.map(l => new Promise(r => { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); })))
        .then(() => { if (main.isConnected) photoBar(); });
      return;
    }
    const list = items => items.filter(li => !li.classList.contains('sealed') && li.querySelector('a')).map(li =>
      `<li><a href="${esc(li.querySelector('a').getAttribute('href'))}"${li.classList.contains('here') ? ' aria-current="page"' : ''}>${esc((li.querySelector('.place') || li).textContent.trim())}</a></li>`).join('');
    const places = main.querySelector('.places');
    const parts = [...main.querySelectorAll('[data-sheet]')].filter(p => p.id);
    // Days, with the month (and the year, when the page has more than one) where it changes.
    const when = p => (p.dataset.sheet.match(/\d{1,2} ([A-Z][a-z]+)(?: (\d{4}))?/) || []).slice(1);
    const years = new Set(parts.map(p => when(p)[1]).filter(Boolean));
    let last = '';
    const days = parts.map(p => {
      const [m, y] = when(p), mo = m ? m.slice(0, 3) + (years.size > 1 && y ? ' ' + y : '') : '';
      const head = mo && mo !== last ? `<li class="mo" aria-hidden="true">${esc(mo)}</li>` : '';
      last = mo || last;
      return `${head}<li><a href="#${esc(p.id)}" aria-label="${esc(p.dataset.sheet)}">${esc(p.dataset.sheetTab || (p.dataset.sheet.match(/\d{1,2}/) || [''])[0])}</a></li>`;
    }).join('');
    const here = (places && places.querySelector('.here .place')) || tabs.querySelector('.here .place');
    const bar = document.createElement('div');
    bar.className = 'pbar';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Photo pages and days');
    bar.innerHTML = `<button type="button" class="which" aria-expanded="false">${esc(here ? here.textContent.trim() : 'Photos')}</button>
      <div class="where"><ol class="dumps">${list([...tabs.querySelectorAll('li')])}</ol>${places ? `<ol class="places">${list([...places.querySelectorAll('li')])}</ol>` : ''}</div>
      ${days ? `<ol class="days">${days}</ol>` : ''}`;
    // Type: the page's own day numbers (the first date that opens a day), else its heading; labels in its text face.
    const opener = main.querySelector('[data-sheet-open]'), target = opener && document.getElementById(opener.dataset.sheetOpen);
    const tab = target && (target.dataset.sheetTab || '');
    const num = (opener && [...opener.querySelectorAll('*')].find(e => !e.children.length && e.textContent.trim() === tab)) || opener || main.querySelector('h1') || main;
    const n = getComputedStyle(num);
    bar.style.setProperty('--pb-font', getComputedStyle(main).fontFamily);
    bar.style.setProperty('--pb-num-font', n.fontFamily);
    bar.style.setProperty('--pb-num-weight', n.fontWeight);
    bar.mark = n.color;
    bar.parts = parts;
    bar.top = tabs;
    bar.querySelectorAll('.days a').forEach((a, i) => { a.day = parts[i]; });
    bar.addEventListener('click', e => {
      const b = e.target.closest('.which');
      if (b) { b.setAttribute('aria-expanded', String(bar.classList.toggle('open'))); return; }
      const a = e.target.closest('.days a');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      a.day.scrollIntoView({ behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.matches('[data-lite],[data-still]')) ? 'auto' : 'smooth', block: 'start' });
    });
    document.body.append(bar);
    paint(bar, parts[0] || main.querySelector('h1') || main);
    barUpdate();
  }
  function paint(bar, el) {
    const bg = ground(el), ink = getComputedStyle(el).color;
    bar.style.setProperty('--pb-bg', bg);
    bar.style.setProperty('--pb-ink', ink);
    bar.style.setProperty('--pb-mark', contrast(bar.mark, bg) >= 3 ? bar.mark : ink);
  }
  let barTick = 0;
  function barUpdate() {
    barTick = 0;
    const bar = document.querySelector('body > .pbar');
    if (!bar) return;
    const past = bar.top.getBoundingClientRect().bottom < 0;
    if (past !== bar.classList.contains('on')) {
      bar.classList.toggle('on', past);
      // Things the page keeps stuck to the top move down below the bar (top: calc(... + var(--pbar, 0px))).
      document.documentElement.style.setProperty('--pbar', past ? bar.offsetHeight + 'px' : '0px');
      if (!past) { bar.classList.remove('open'); bar.querySelector('.which').setAttribute('aria-expanded', 'false'); }
    }
    // The day in view: the last whose top has passed a third of the way down the screen.
    const line = innerHeight / 3;
    let cur = null;
    bar.parts.forEach(p => { if (p.getBoundingClientRect().top <= line) cur = p; });
    if (cur === bar.cur) return;
    bar.cur = cur;
    paint(bar, cur || bar.parts[0] || document.querySelector('main'));
    const days = bar.querySelector('.days');
    if (!days) return;
    let on = null;
    days.querySelectorAll('a').forEach(a => { if (a.day === cur) { a.setAttribute('aria-current', 'true'); on = a; } else a.removeAttribute('aria-current'); });
    if (on && days.scrollWidth > days.clientWidth) days.scrollTo({ left: on.offsetLeft - days.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' });
  }
  // The unfolded list folds again on a tap anywhere else or on Esc.
  const fold = () => {
    const bar = document.querySelector('body > .pbar.open');
    if (bar) { bar.classList.remove('open'); bar.querySelector('.which').setAttribute('aria-expanded', 'false'); }
    return bar;
  };
  addEventListener('click', e => { if (!e.target.closest('.pbar')) fold(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && fold()) refocus(document.querySelector('.pbar .which')); });
  addEventListener('scroll', () => { if (!barTick) barTick = requestAnimationFrame(barUpdate); }, { passive: true });
  addEventListener('resize', () => { if (!barTick) barTick = requestAnimationFrame(barUpdate); });

  // ---- Page setup, run on the first load and after every swap.
  function init() {
    entrances();
    blog();
    contact();
    photos();
    sheets();
    photoBar();
    nextDay();
    liteSwitch();
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

    if (push) { keep(); history.pushState({}, '', url); }
    page = location.pathname + location.search;
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
    if (!push && !target) back();
  }

  // Back and Forward return to where the page was left: the place is kept in the history entry as you scroll.
  history.scrollRestoration = 'manual';
  let keeping;
  const keep = () => { clearTimeout(keeping); history.replaceState({ ...history.state, y: scrollY }, ''); };
  addEventListener('scroll', () => { clearTimeout(keeping); keeping = setTimeout(keep, 200); }, { passive: true });
  const back = () => { const y = history.state?.y; if (y) { scrollTo(0, y); requestAnimationFrame(() => scrollTo(0, y)); } };

  // A link to skip the menu and the player, the first thing Tab reaches.
  const skip = document.createElement('a');
  skip.className = 'skip'; skip.href = '#'; skip.textContent = 'Skip to content';
  skip.addEventListener('click', e => {
    e.preventDefault();
    const main = document.querySelector('main');
    if (main) { main.tabIndex = -1; main.focus(); }
  });
  document.body.prepend(skip);

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
  // A link within the page (#s-bir-hakeim) also fires popstate; the browser has already scrolled, so only a change of page loads.
  let page = location.pathname + location.search;
  addEventListener('popstate', () => { if (location.pathname + location.search !== page) go(location.href, false); });

  if (document.readyState === 'complete') { init(); if (!location.hash) back(); }
  else addEventListener('load', () => setTimeout(() => { init(); if (!location.hash) back(); }, 0));
})();
