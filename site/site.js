// Everything here is optional: without it the site is six plain HTML pages.
(() => {
  const ROOT = new URL('.', document.currentScript.src);
  const PAGES = { welcome: 'Welcome', blog: 'Blog', cv: 'CV', contact: 'Contact', photos: 'Photos', music: 'Music' };
  const ALL = Object.keys(PAGES).length;
  const kb = n => (n / 1024).toFixed(1) + ' KB';
  const ms = n => Math.max(0, Math.round(n)) + ' ms';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const json = name => fetch(new URL(name, ROOT)).then(r => (r.ok ? r.json() : [])).catch(() => []);

  let clockTimer = 0;
  let softNav = null; // set while a page arrives without a full reload

  // ---- Which pages has this visitor read? Stays in their browser only.
  function markSeen(page) {
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem('fb-seen') || '[]'); } catch {}
    const key = page === 'post' ? 'blog' : page;
    if (PAGES[key] && !seen.includes(key)) seen.push(key);
    try { localStorage.setItem('fb-seen', JSON.stringify(seen)); } catch {}
    return Object.keys(PAGES).filter(k => seen.includes(k));
  }

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

  // ---- The trace: real timings of this page's own request.
  // A full load reads the Navigation Timing entry; a page swapped in without reloading reads its fetch's Resource Timing entry.
  function trace(read) {
    const footer = document.getElementById('trace');
    if (!footer) return;
    const soft = softNav;
    const t = soft ? soft.entry : performance.getEntriesByType('navigation')[0];
    const size = soft ? soft.bytes : t && t.transferSize ? t.transferSize : document.documentElement.outerHTML.length;
    const cached = t && t.transferSize === 0 && t.decodedBodySize > 0;
    const built = soft ? soft.builtAt - (t ? t.responseEnd : soft.start) : t ? (t.domContentLoadedEventEnd || t.responseEnd) - t.responseEnd : 0;
    const total = soft ? soft.builtAt - soft.start : t ? t.loadEventEnd || performance.now() : performance.now();

    const steps = t ? [
      ['Finding the server (DNS)', t.domainLookupEnd - t.domainLookupStart],
      ['Opening a connection', t.secureConnectionStart > 0 ? t.secureConnectionStart - t.connectStart : t.connectEnd - t.connectStart],
      ['Agreeing on encryption (TLS)', t.secureConnectionStart > 0 ? t.connectEnd - t.secureConnectionStart : 0],
      ['Waiting for the first byte', t.responseStart - t.requestStart],
      ['Downloading ' + kb(size), t.responseEnd - t.responseStart],
      [soft ? 'Swapping it into this page' : 'Building the page', built],
    ] : [];
    const max = Math.max(1, ...steps.map(s => s[1]));
    const ref = soft ? soft.from : document.referrer;
    const where = ref
      ? (new URL(ref).host === location.host ? 'another page on this site' : new URL(ref).host)
      : 'a typed address or a bookmark';
    const how = soft
      ? `This page arrived as ${kb(size)} of HTML and was swapped in without reloading the site, which is why the music did not stop. It took ${ms(total)}.`
      : `This page is ${kb(size)} of hand-written HTML${cached ? ', and your browser already had it' : ''}. It took ${ms(total)} to arrive and draw.`;
    const rack = new URL('rack.html', ROOT).href;

    footer.innerHTML = `
      <p>Filip Biljic, Paris. ${how}</p>
      <p>You have read ${read.length} of ${ALL} pages: ${read.map(k => PAGES[k]).join(', ')}.</p>
      <details>
        <summary>How this page reached you</summary>
        <table class="trace">
          ${steps.map(([label, v]) => `<tr><td>${label}</td><td class="bar"><span class="b" style="width:${Math.max(1, (v / max) * 100)}%"></span></td><td class="ms">${ms(v)}</td></tr>`).join('')}
        </table>
        <p style="margin-top:16px">You came from ${where}. Your window is ${innerWidth} by ${innerHeight} pixels. The server answered with protocol ${(t && t.nextHopProtocol) || 'unknown'}. Your browser measured these numbers on this visit; reload and they change.</p>
      </details>
      ${read.length === ALL ? `<p class="unlock">You have read every page, so here is an unlisted one: <a href="${rack}">the rack this site is about</a>.</p>` : ''}
    `;
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

  // ---- Photos: the page is written by tools/photos.mjs and works without script.
  // With script, a picture opens large in a viewer you can step through, and the page says which format your browser chose.
  let viewer;
  function photos() {
    const figs = [...document.querySelectorAll('.print')];
    if (!figs.length) return;
    figs.forEach((fig, n) => fig.querySelector('.open').addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); view(figs, n);
    }));
    const target = figs.find(f => location.hash === '#' + f.id);
    if (target) view(figs, figs.indexOf(target));
    const imgs = figs.map(f => f.querySelector('img'));
    Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })))
      .then(() => formatNote(figs));
  }

  function formatNote(figs) {
    const note = document.getElementById('format');
    if (!note) return;
    let got = 0, other = 0, jxl = 0, n = 0;
    figs.forEach(f => {
      const src = f.querySelector('img').currentSrc;
      const m = src && src.match(/-(\d+)\.(jpg|jxl)$/);
      if (!m) return;
      const sizes = JSON.parse(f.dataset.bytes || '{}');
      got += sizes[`${m[1]}.${m[2]}`] || 0;
      other += sizes[`${m[1]}.${m[2] === 'jxl' ? 'jpg' : 'jxl'}`] || 0;
      if (m[2] === 'jxl') jxl++;
      n++;
    });
    if (!n) return;
    note.textContent = jxl
      ? `Your browser can show JPEG XL, so the ${n} pictures it has loaded came to ${kb(got)}. As ordinary JPEG they would have been ${kb(other)}.`
      : `Your browser cannot show JPEG XL, so these ${n} pictures came as ordinary JPEG, ${kb(got)}. In JPEG XL, which Safari can show, they would be ${kb(other)}.`;
  }

  function view(figs, n) {
    if (!viewer) {
      viewer = document.createElement('dialog');
      viewer.className = 'viewer';
      viewer.innerHTML = `<figure><img alt=""><figcaption><span class="where"></span> <span class="cap"></span></figcaption></figure>
        <p class="keys"><button type="button" data-step="-1">&larr; Previous</button> <button type="button" data-step="1">Next &rarr;</button> <button type="button" data-close>Close</button> <span class="soft mouse">Arrow keys and Esc work too.</span><span class="soft touch">Or tap either side of the picture.</span></p>`;
      document.body.append(viewer);
      viewer.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b && b.dataset.step) viewer.step(+b.dataset.step);
        else if (b || e.target === viewer) viewer.close();
        else if (e.target.tagName === 'IMG') viewer.step(e.offsetX < e.target.clientWidth / 3 ? -1 : 1);
      });
      viewer.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') viewer.step(-1);
        if (e.key === 'ArrowRight') viewer.step(1);
      });
      viewer.addEventListener('close', () => {
        history.replaceState(history.state, '', location.pathname + location.search);
        const f = viewer.figs && viewer.figs[viewer.n];
        if (f && f.isConnected) f.querySelector('.open').focus({ preventScroll: true });
      });
    }
    viewer.figs = figs;
    viewer.step = d => show((viewer.n + d + figs.length) % figs.length);
    const show = i => {
      viewer.n = i;
      const f = viewer.figs[i], src = f.querySelector('img');
      const big = viewer.querySelector('img');
      big.src = (src.currentSrc || src.src).replace(/-\d+\.(jpg|jxl)$/, '-2000.$1');
      big.alt = src.alt;
      viewer.querySelector('.where').textContent = `${f.closest('.set').querySelector('.title').textContent}, ${i + 1} of ${figs.length}.`;
      viewer.querySelector('.cap').textContent = f.querySelector('figcaption').textContent.replace(/^\d+\.\s*/, '');
      history.replaceState(history.state, '', '#' + f.id);
    };
    show(n);
    if (!viewer.open) viewer.showModal();
  }

  // ---- The player. It lives outside the swapped part of the page, so it keeps playing between pages.
  // Songs come from music.json: [{ "title", "artist", "src", "cover" }], paths relative to the site root.
  const player = (() => {
    const el = document.createElement('div');
    el.id = 'player';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Music player');
    el.innerHTML = `
      <span class="cover" aria-hidden="true"></span>
      <button class="play" type="button" aria-label="Play" disabled>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path class="i-play" d="M5 3 L17 10 L5 17 Z"/><g class="i-pause"><rect x="4" y="3" width="4" height="14"/><rect x="12" y="3" width="4" height="14"/></g></svg>
      </button>
      <a class="name" href="${new URL('music.html', ROOT).href}">No songs yet</a>
      <button class="skip" type="button" aria-label="Skip song" title="Skip song" disabled>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3 3 L13 10 L3 17 Z"/><rect x="14" y="3" width="3" height="14"/></svg></button>`;
    const audio = new Audio();
    audio.preload = 'none';
    const $ = s => el.querySelector(s);
    let list = [], i = 0;

    const save = () => { try { sessionStorage.setItem('fb-player', JSON.stringify({ i, t: audio.currentTime || 0 })); } catch {} };
    function show() {
      const s = list[i];
      el.classList.toggle('playing', !audio.paused);
      $('.play').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
      $('.play').disabled = $('.skip').disabled = !s;
      $('.name').textContent = s ? (s.artist ? `${s.title} · ${s.artist}` : s.title) : 'No songs yet';
      $('.cover').style.backgroundImage = s && s.cover ? `url("${new URL(s.cover, ROOT).href}")` : '';
      document.querySelectorAll('.tracklist li').forEach((li, n) => li.classList.toggle('now', n === i && !!s));
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
    audio.addEventListener('timeupdate', () => { if (Math.round(audio.currentTime) % 5 === 0) save(); });
    audio.addEventListener('error', () => { $('.name').textContent = `Could not load ${list[i]?.title || 'this song'}`; });

    document.body.prepend(el);
    json('music.json').then(songs => {
      list = Array.isArray(songs) ? songs.filter(s => s && s.src && s.title) : [];
      try { const st = JSON.parse(sessionStorage.getItem('fb-player') || 'null'); if (st && list[st.i]) { i = st.i; audio.src = new URL(list[i].src, ROOT).href; audio.currentTime = st.t; } } catch {}
      show(); tracklist();
    });

    // The music page lists the same songs; clicking one plays it.
    function tracklist() {
      const ol = document.getElementById('tracklist');
      if (!ol) return;
      ol.innerHTML = list.map((s, n) => `<li><button type="button" data-n="${n}">${esc(s.title)}</button>${s.artist ? ` <span class="soft">${esc(s.artist)}</span>` : ''}</li>`).join('');
      ol.onclick = e => { const b = e.target.closest('button[data-n]'); if (b) load(+b.dataset.n, true); };
      show(); entrances();
    }
    return { tracklist, el };
  })();

  // ---- Page setup, run on the first load and after every swap.
  function init() {
    const page = document.body.dataset.page;
    entrances();
    blog();
    contact();
    photos();
    player.tracklist();
    trace(markSeen(page));
  }

  // ---- Links load the next page in place, so the player is not interrupted. Anything unusual falls back to a normal load.
  async function go(url, push) {
    const start = performance.now();
    let res, text;
    try {
      res = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) throw 0;
      text = await res.text();
    } catch { location.assign(url); return; }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const parts = ['nav', 'main', 'footer'];
    if (!parts.every(p => doc.querySelector(p))) { location.assign(url); return; }

    const from = location.href;
    if (push) history.pushState({}, '', url);
    document.title = doc.title;
    document.body.dataset.page = doc.body.dataset.page || '';
    document.body.className = doc.body.className;
    parts.forEach(p => document.querySelector(p).replaceWith(document.adoptNode(doc.querySelector(p))));
    const hash = new URL(url).hash;
    const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView(); else scrollTo(0, 0);
    const h1 = document.querySelector('main h1');
    if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }

    const entries = performance.getEntriesByName(res.url || url, 'resource');
    softNav = { start, builtAt: performance.now(), entry: entries[entries.length - 1], bytes: text.length, from };
    init();
    softNav = null;
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
