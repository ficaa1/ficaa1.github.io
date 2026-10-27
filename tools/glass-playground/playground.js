(() => {
  const $ = id => document.getElementById(id);
  const groups = [
    { title: 'Optics', note: 'Shape the frosted center and the colored rim.', open: true, controls: [
      ['blur', 'Frost / blur', 0, .12, .001, 100, '%'],
      ['refraction', 'Refraction strength', 0, .5, .005, 100, '%'],
      ['dispersion', 'Color splitting', 0, .15, .001, 100, '%'],
      ['bendWidth', 'Bending zone', .02, .45, .005, 100, '%'],
      ['rimWidth', 'Sharp rim width', .01, .5, .005, 100, '%'],
    ] },
    { title: 'Color & transparency', note: 'Adjust the film seen through the panes.', controls: [
      ['saturation', 'Saturation', 0, 2, .01, 100, '%'],
      ['brightness', 'Brightness', .2, 1.5, .01, 100, '%'],
      ['opacity', 'Effect opacity', 0, 1, .01, 100, '%'],
      ['tint', 'White surface tint', 0, .3, .005, 100, '%'],
      ['darkness', 'Background darkness', 0, .8, .01, 100, '%'],
    ] },
    { title: 'Shape & quality', note: 'Lower resolution uses fewer pixels. Text stays sharp.', controls: [
      ['radius', 'Corner radius', -1, 60, 1, 1, 'px'],
    ], resolution: true },
  ];
  const descriptors = groups.flatMap(group => group.controls);
  const storageKey = 'fb-glass-playground-v1';
  let root, video, defaults, settings, looks, saved = [], comparing = false, lookName = 'Current site settings';
  let persistTimer, scrubbing = false, resumeAfterScrub = false;
  const message = (text, error = false) => { $('message').textContent = text; $('message').classList.toggle('error', error); };
  function normalize(input) {
    const result = { ...defaults };
    for (const [key, , min, max] of descriptors) {
      if (Number.isFinite(input?.[key])) result[key] = Math.max(min, Math.min(max, input[key]));
    }
    if ([0, 320, 640, 960, 1280, 1920, 2560].includes(input?.resolution)) result.resolution = input.resolution;
    if (typeof input?.glimpses === 'boolean') result.glimpses = input.glimpses;
    return result;
  }
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ last: settings, saved })); }
      catch { message('This browser could not save the look. Copy its settings or link to keep it.', true); }
    }, 180);
  }
  function populatePresets(selected = 'custom') {
    $('preset').replaceChildren(...Object.entries(looks).map(([key, look]) => new Option(look.name, key)));
    saved.forEach((look, index) => $('preset').add(new Option('Saved · ' + look.name, 'saved:' + index)));
    $('preset').add(new Option('Your adjustments', 'custom'));
    $('preset').value = selected;
  }
  function controls() {
    for (const group of groups) {
      const detail = document.createElement('details'); detail.className = 'group'; detail.open = !!group.open;
      const summary = document.createElement('summary'); summary.textContent = group.title;
      const note = document.createElement('p'); note.textContent = group.note; detail.append(summary, note);
      for (const [key, label, min, max, step] of group.controls) {
        const row = document.createElement('div'); row.className = 'knob';
        const title = document.createElement('label'); title.htmlFor = key; title.append(document.createTextNode(label));
        const output = document.createElement('output'); output.id = key + '-value'; output.htmlFor = key; title.append(output);
        const input = document.createElement('input'); input.id = key; input.type = 'range';
        input.min = min; input.max = max; input.step = step;
        input.addEventListener('input', () => change({ [key]: Number(input.value) }));
        row.append(title, input); detail.append(row);
      }
      if (group.resolution) {
        const row = document.createElement('div'); row.className = 'knob';
        const label = document.createElement('label'); label.htmlFor = 'resolution'; label.textContent = 'Effect resolution';
        const select = document.createElement('select'); select.id = 'resolution'; select.style.width = '100%';
        for (const value of [0, 320, 640, 960, 1280, 1920, 2560]) select.add(new Option(value ? value + ' px · maximum long edge' : 'Auto · current site behavior', value));
        select.addEventListener('change', () => change({ resolution: Number(select.value) }));
        row.append(label, select); detail.append(row);
      }
      $('sliders').append(detail);
    }
  }
  function sync() {
    for (const [key, , , , , scale, unit] of descriptors) {
      $(key).value = settings[key];
      const value = Number((settings[key] * scale).toFixed(1));
      $(key + '-value').value = key === 'radius' && value < 0 ? 'Site default' : value + unit;
      $(key).setAttribute('aria-valuetext', $(key + '-value').value);
    }
    $('resolution').value = settings.resolution;
    $('glimpses').checked = settings.glimpses;
    $('config').value = JSON.stringify({ version: 1, ...settings }, null, 2);
    $('compare').setAttribute('aria-pressed', String(comparing));
    $('compare').textContent = comparing ? 'Back to your look' : 'Compare with site';
    $('look-label').textContent = comparing ? 'Viewing current site settings' : lookName;
    $('settings').disabled = comparing;
    for (const id of ['save', 'copy-settings', 'copy-link']) $(id).disabled = comparing;
  }
  function apply() {
    const actual = comparing ? defaults : settings;
    root.style.setProperty('--preview-tint', actual.tint);
    root.style.setProperty('--preview-darkness', actual.darkness);
    if (actual.radius >= 0) root.style.setProperty('--preview-radius', actual.radius + 'px');
    else root.style.removeProperty('--preview-radius');
    root.toggleAttribute('data-hide-previews', !actual.glimpses);
    if (!root.glass) { message('The renderer stopped. Reload this page to restart it; your settings are kept.', true); return; }
    root.glass.update(actual);
    sync();
  }
  function change(patch) {
    settings = normalize({ ...settings, ...patch }); comparing = false; lookName = 'Your adjustments';
    $('preset').value = 'custom'; apply(); persist();
  }
  async function copy(text, success) {
    try { await navigator.clipboard.writeText(text); message(success); }
    catch { $('config').value = text; $('config').closest('details').open = true; $('config').focus(); $('config').select(); message('Select and copy the text below the settings with Ctrl+C or ⌘C.'); }
  }
  const clock = value => Math.floor((value || 0) / 60) + ':' + String(Math.floor((value || 0) % 60)).padStart(2, '0');
  function playback() {
    $('play').textContent = video.paused ? 'Play film' : 'Pause film';
    $('time').value = clock(video.currentTime) + ' / ' + clock(video.duration);
    if (!scrubbing) $('seek').value = Number.isFinite(video.duration) ? 100 * video.currentTime / video.duration : 0;
  }
  async function start() {
    const response = await fetch('/photos.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the photo page.');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    root = doc.querySelector('.lands');
    if (!root) throw new Error('The photo panes were not found.');
    root.querySelectorAll('script, link').forEach(node => node.remove());
    root.setAttribute('data-glass-preview', '');
    // Keep the real page's artwork and typefaces; only the video uses its local preview copy.
    root.querySelectorAll('img').forEach(img => { img.src = new URL(img.getAttribute('src'), new URL('/photos.html', location.href)); });
    root.querySelectorAll('a').forEach(a => { a.href = new URL(a.getAttribute('href'), new URL('/photos.html', location.href)); });
    root.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
    video = root.querySelector('video');
    video.poster = '/photos/broll-pixelsort-poster-960.jpg'; video.crossOrigin = 'anonymous';
    video.muted = true; video.preload = 'auto';
    video.querySelectorAll('source').forEach(source => { source.src = '/photos/' + new URL(source.getAttribute('src')).pathname.split('/').pop(); });
    $('scene').replaceChildren(document.adoptNode(root));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { done(); reject(new Error('The local preview film did not load.')); }, 15000);
      const done = () => { clearTimeout(timer); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); };
      const ready = () => { done(); resolve(); }, failed = () => { done(); reject(new Error('The local preview film could not be played.')); };
      video.addEventListener('loadeddata', ready); video.addEventListener('error', failed); video.load();
    });
    video.dataset.on = '1';
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = '/photos/glass.js?v=__GLASS_VERSION__';
      script.onload = resolve; script.onerror = () => reject(new Error('Could not load the glass renderer.')); document.head.append(script);
    });
    if (!root.glass?.info.active) throw new Error('WebGL could not start. Check browser hardware acceleration, then reload.');
    defaults = { ...root.glass.defaults, tint: .06, darkness: .38, radius: -1, glimpses: true };
    looks = {
      site: { name: 'Current site settings', settings: defaults },
      subtle: { name: 'Subtle · gentle refraction', settings: { ...defaults, blur: .025, refraction: .09, dispersion: .012, rimWidth: .12 } },
      prism: { name: 'Prism · strong colored edges', settings: { ...defaults, refraction: .3, dispersion: .085, bendWidth: .24, rimWidth: .28, saturation: 1.25 } },
      frosted: { name: 'Frosted · soft and milky', settings: { ...defaults, blur: .08, refraction: .1, dispersion: .015, rimWidth: .1, tint: .14 } },
      clear: { name: 'Clear · an unblurred lens', settings: { ...defaults, blur: 0, refraction: .22, dispersion: .035, rimWidth: .4, tint: .02 } },
    };
    let stored, linked;
    try { stored = JSON.parse(localStorage.getItem(storageKey)); } catch {}
    if (Array.isArray(stored?.saved)) saved = stored.saved.filter(p => typeof p?.name === 'string').map(p => ({ name: p.name.slice(0, 60), settings: normalize(p.settings) }));
    try { linked = JSON.parse(new URLSearchParams(location.hash.slice(1)).get('settings')); } catch { message('This link’s settings were unreadable. Starting with the site defaults.', true); }
    settings = normalize(linked || stored?.last);
    lookName = linked ? 'Look from shared link' : stored?.last ? 'Your last adjustments' : looks.site.name;
    controls(); populatePresets(linked || stored?.last ? 'custom' : 'site');
    $('settings').disabled = false;
    for (const id of ['save', 'reset', 'copy-link', 'copy-settings', 'compare', 'play', 'seek', 'speed']) $(id).disabled = false;
    $('glimpses').addEventListener('change', () => change({ glimpses: $('glimpses').checked }));
    $('preset').addEventListener('change', () => {
      const key = $('preset').value;
      const look = key.startsWith('saved:') ? saved[Number(key.slice(6))] : looks[key];
      if (!look) return;
      settings = normalize(look.settings); lookName = look.name; comparing = false; apply(); persist();
    });
    $('reset').addEventListener('click', () => {
      settings = { ...defaults }; comparing = false; lookName = looks.site.name;
      $('preset').value = 'site'; apply(); persist(); message('All parameters reset to the current site settings.');
    });
    $('compare').addEventListener('click', () => { comparing = !comparing; apply(); });
    $('save').addEventListener('click', () => {
      const name = $('preset-name').value.trim();
      if (!name) { message('Give this look a name first.'); $('preset-name').focus(); return; }
      let index = saved.findIndex(p => p.name === name);
      if (index < 0) index = saved.length;
      saved[index] = { name, settings: { ...settings } }; populatePresets('saved:' + index);
      lookName = name; sync(); persist(); message('Saved “' + name + '” in this browser.');
    });
    $('copy-settings').addEventListener('click', () => copy(JSON.stringify({ version: 1, ...settings }, null, 2), 'Settings copied. Send these to keep this look.'));
    $('copy-link').addEventListener('click', () => {
      const url = new URL(location.href); url.hash = 'settings=' + encodeURIComponent(JSON.stringify({ version: 1, ...settings }));
      history.replaceState(null, '', url); copy(url.href, 'Link copied. It opens this exact look in the private preview.');
    });
    $('play').addEventListener('click', () => { if (video.paused) video.play().catch(() => message('Playback was blocked. Try Play film again.', true)); else video.pause(); });
    $('speed').addEventListener('change', () => { video.playbackRate = Number($('speed').value); });
    $('seek').addEventListener('pointerdown', () => { scrubbing = true; resumeAfterScrub = !video.paused; video.pause(); });
    const endScrub = () => { if (!scrubbing) return; scrubbing = false; if (resumeAfterScrub) video.play().catch(() => {}); };
    addEventListener('pointerup', endScrub); addEventListener('pointercancel', endScrub);
    $('seek').addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = video.duration * Number($('seek').value) / 100; });
    for (const event of ['timeupdate', 'play', 'pause', 'seeked']) video.addEventListener(event, playback);
    let wasPlaying = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { wasPlaying = !video.paused; video.pause(); }
      else if (wasPlaying) video.play().catch(() => {});
    });
    let previous = { renders: 0, time: performance.now() };
    setInterval(() => {
      if (document.hidden) { previous = { renders: root.glass?.info.renders || 0, time: performance.now() }; return; }
      const info = root.glass?.info;
      if (!info) { $('renderer-state').textContent = 'Renderer stopped · reload to retry'; message('WebGL stopped. Reload to restart; your last settings are kept.', true); return; }
      const now = performance.now(), rate = (info.renders - previous.renders) * 1000 / (now - previous.time);
      $('renderer-state').textContent = /swiftshader|llvmpipe|software/i.test(info.renderer) ? 'WebGL · software renderer' : 'WebGL · active';
      $('resolution-state').textContent = info.width + ' × ' + info.height + ' effect pixels';
      $('rate-state').textContent = rate.toFixed(0) + ' updates/s';
      previous = { renders: info.renders, time: now };
    }, 1000);
    apply(); playback();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await video.play().catch(() => message('Press Play film to start the background.'));
    message('Ready. Pause the film to compare changes on the same frame.');
  }
  start().catch(error => { message(error.message, true); $('renderer-state').textContent = 'Preview unavailable'; });
})();
