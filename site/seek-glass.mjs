import { glassDefaults, glassBlur, glassComposite } from './glass-material.mjs?v=b143f734';

// The track and thumb share one video upload and one narrow canvas. Their HTML
// owns seeking, progress, transitions and highlights; this module only draws glass.
const mounted = new WeakSet();
const mediaURL = src => {
  const url = new URL(src, location.href);
  if (url.origin !== location.origin) url.searchParams.set('v', 'seek-glass-1');
  return url.href;
};

export function mountSeekGlass(main) {
  if (!main?.isConnected || mounted.has(main) || !document.documentElement.matches('[data-glass]:not([data-lite])')) return;
  mounted.add(main);
  const controller = new AbortController(), options = { signal: controller.signal, passive: true };
  const faces = [...main.querySelectorAll('.face:has(.glass)')];
  const states = faces.map(face => createSurface(face, options));
  const update = () => states.forEach(s => s.update());
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states[faces.indexOf(entry.target)]; state.visible = entry.isIntersecting; state.update();
    }
  });
  faces.forEach(face => observer.observe(face));
  document.addEventListener('player', update, options);
  document.addEventListener('visibilitychange', update, options);
  const removal = new MutationObserver(() => {
    if (main.isConnected) return;
    controller.abort(); observer.disconnect(); removal.disconnect(); states.forEach(s => s.dispose());
  });
  removal.observe(main.parentNode, { childList: true });
  update();
}

function createSurface(face, options) {
  const track = face.querySelector('.glass'), knob = track.querySelector('.knob');
  const image = face.querySelector('img'), drawing = face.querySelector('svg'), video = face.querySelector('video');
  const state = { visible: false, update, dispose };
  let gpu, stopped = false, failed = false, tick = 0, frame = 0, until = 0;
  let picture, pictureURL = '', source, upload = true, renders = 0, uploads = 0;
  let drawingDirty = true, drawingURL = '';
  let sourceWidth = 0, sourceHeight = 0, sourceCrop = '';
  const resize = new ResizeObserver(schedule);
  resize.observe(face); resize.observe(track);
  face.seekGlass = { settings: glassDefaults,
    get info() { return { active: !!gpu && face.classList.contains('seek-glass-ready'), renders, uploads,
      width: gpu?.canvas.width || 0, height: gpu?.canvas.height || 0 }; } };
  const active = () => !failed && !stopped && state.visible && !document.hidden && !!face.closest('.is-on');
  function schedule() {
    if (tick || !active()) return;
    tick = requestAnimationFrame(() => { tick = 0; render(); });
  }
  function update() {
    if (!active()) { release(); return; }
    // Progress moves the thumb with a 260ms CSS transition; the strip enters in
    // 420ms after a 120ms delay. Follow their measured positions only while moving.
    until = performance.now() + 600; schedule();
  }
  const changed = new MutationObserver(() => { drawingDirty = true; update(); });
  changed.observe(face, { attributes: true, attributeFilter: ['style', 'class'] });
  const owner = face.closest('li') || face.closest('main');
  if (owner !== face) changed.observe(owner, { attributes: true, attributeFilter: ['style', 'class'] });
  if (drawing) changed.observe(drawing, { attributes: true, childList: true, subtree: true });
  face.addEventListener('transitionrun', update, options);
  image?.addEventListener('load', () => { upload = true; schedule(); }, options);
  if (video) {
    const originalURL = video.dataset.src;
    if (originalURL) {
      const playing = !video.paused;
      video.crossOrigin = 'anonymous'; video.dataset.src = mediaURL(originalURL);
      video.addEventListener('error', () => {
        // Keep normal playback if CORS fails; ordinary CSS glass remains usable.
        failed = true; release(); video.removeAttribute('crossorigin');
        video.dataset.src = originalURL; video.src = originalURL;
        if (playing || face.closest('.is-playing')) video.play().catch(() => {});
      }, { ...options, once: true });
      if (video.getAttribute('src')) { video.src = video.dataset.src; if (playing) video.play().catch(() => {}); }
    }
    for (const event of ['loadeddata', 'seeked', 'playing', 'pause', 'emptied']) {
      video.addEventListener(event, () => { upload = true; schedule(); }, options);
    }
  }
  function watchVideo() {
    if (!video?.requestVideoFrameCallback || frame || !active()) return;
    frame = video.requestVideoFrameCallback(() => {
      frame = 0; upload = true; schedule(); watchVideo();
    });
  }
  function release() {
    cancelAnimationFrame(tick); tick = 0;
    if (frame) video.cancelVideoFrameCallback(frame); frame = 0;
    if (face.classList.contains('seek-glass-ready')) face.classList.remove('seek-glass-ready');
    gpu?.dispose(); gpu = null; source = null;
    sourceWidth = sourceHeight = 0; sourceCrop = ''; upload = true;
  }
  function dispose() {
    stopped = true; release(); resize.disconnect(); changed.disconnect(); delete face.seekGlass;
  }
  function render() {
    if (!active()) { release(); return; }
    if (drawing && drawingDirty) {
      const copy = drawing.cloneNode(true);
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copy.setAttribute('width', drawing.viewBox.baseVal.width);
      copy.setAttribute('height', drawing.viewBox.baseVal.height);
      const originals = [drawing, ...drawing.querySelectorAll('*')], clones = [copy, ...copy.querySelectorAll('*')];
      originals.forEach((node, i) => {
        const css = getComputedStyle(node);
        for (const property of ['fill', 'stroke', 'stroke-width']) clones[i].style.setProperty(property, css.getPropertyValue(property));
      });
      const ground = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ground.setAttribute('width', '100%'); ground.setAttribute('height', '100%');
      ground.setAttribute('fill', getComputedStyle(face).backgroundColor); copy.prepend(ground);
      drawingURL = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(copy)); drawingDirty = false;
    }
    const url = image ? mediaURL(image.currentSrc || image.src) : drawingURL;
    if (pictureURL !== url) {
      pictureURL = url; picture = new Image(); picture.crossOrigin = 'anonymous';
      const requested = picture;
      picture.onload = () => { if (picture === requested) { upload = true; schedule(); } };
      picture.onerror = () => { if (picture === requested && !(video?.readyState >= 2)) { failed = true; release(); } };
      picture.src = url;
    }
    const moving = video && video.readyState >= 2 && video.classList.contains('on');
    const next = moving ? video : picture;
    if (!(next instanceof HTMLVideoElement ? next.readyState >= 2 : next?.naturalWidth)) { watchVideo(); return; }
    try {
      if (!gpu) { gpu = createGPU(track); upload = true; }
      const view = face.getBoundingClientRect(), strip = track.getBoundingClientRect();
      const carrier = knob.getBoundingClientRect(), bead = getComputedStyle(knob, '::before');
      const rail = getComputedStyle(knob);
      const sx = carrier.width / parseFloat(rail.width), sy = carrier.height / parseFloat(rail.height);
      const box = gpu.canvas.getBoundingClientRect();
      if (!box.width || !box.height || !view.width || !view.height) return;
      const panes = [[strip.x - view.x, strip.y - view.y, strip.width, strip.height],
        [carrier.x + parseFloat(bead.left) * sx - view.x, carrier.y + parseFloat(bead.top) * sy - view.y,
          parseFloat(bead.width) * sx, parseFloat(bead.height) * sy]];
      const w = next.videoWidth || next.naturalWidth, h = next.videoHeight || next.naturalHeight;
      const contain = getComputedStyle(moving ? video : image || drawing).objectFit === 'contain';
      const scale = (contain ? Math.min : Math.max)(view.width / w, view.height / h);
      const crop = [view.width / (w * scale), view.height / (h * scale)];
      const cropKey = crop.join(',') + contain;
      const fresh = upload || source !== next || sourceWidth !== w || sourceHeight !== h || sourceCrop !== cropKey;
      gpu.draw(next, { view, box, panes, crop, contain, fresh, sourceChanged: upload || source !== next });
      if (upload || source !== next) uploads++;
      source = next; sourceWidth = w; sourceHeight = h; sourceCrop = cropKey; upload = false; renders++;
      if (!face.classList.contains('seek-glass-ready')) face.classList.add('seek-glass-ready');
      watchVideo();
      if (performance.now() < until) schedule();
    } catch { failed = true; release(); }
  }
  return state;
}

function createGPU(track) {
  const canvas = document.createElement('canvas'); canvas.className = 'seek-glass-film'; canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL unavailable');
  const shaders = [], programs = [], textures = [], fbos = [], buffers = [];
  const dispose = () => {
    canvas.remove(); textures.forEach(t => gl.deleteTexture(t)); fbos.forEach(f => gl.deleteFramebuffer(f));
    programs.forEach(p => gl.deleteProgram(p)); shaders.forEach(s => gl.deleteShader(s)); buffers.forEach(b => gl.deleteBuffer(b));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try {
    const vertex = `attribute vec2 position; uniform vec4 region; varying vec2 uv;
      void main() { uv = region.xy + (position * .5 + .5) * region.zw; gl_Position = vec4(position, 0., 1.); }`;
    // Contained covers can have letterboxing. Sampling beyond the image must see
    // the sleeve's ground, not the texture's clamped outermost row of pixels.
    const material = (text, sampler) => text.replace(/precision (\w+) float;/,
      '$& uniform vec3 ground; uniform float letterbox;').replace(
      `return texture2D(${sampler}, (p - .5) * crop + .5).rgb;`,
      `vec2 q = (p - .5) * crop + .5;
       if (letterbox > .5 && (q.x < 0. || q.x > 1. || q.y < 0. || q.y > 1.)) return ground;
       return texture2D(${sampler}, q).rgb;`);
    function program(fragment) {
      const p = gl.createProgram(); programs.push(p);
      for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type); shaders.push(shader); gl.shaderSource(shader, code); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(p, shader);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }
    const blur = program(material(glassBlur, 'image'));
    const lens = program(material(glassComposite, 'film').replace('gl_FragColor =', 'if (distance >= 0.) discard; gl_FragColor ='));
    const texture = () => {
      const t = gl.createTexture(); textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, axis, gl.CLAMP_TO_EDGE);
      for (const filter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, filter, gl.LINEAR);
      return t;
    };
    const source = texture(), horizontal = texture(), frost = texture();
    for (const t of [horizontal, frost]) {
      const f = gl.createFramebuffer(); fbos.push(f); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    }
    const buffer = gl.createBuffer(); buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const uniform = (p, n) => gl.getUniformLocation(p, n);
    const names = ['image', 'stepSize', 'crop', 'region', 'ground', 'letterbox'];
    const b = Object.fromEntries(names.map(n => [n, uniform(blur, n)]));
    const c = Object.fromEntries(['film', 'frost', 'crop', 'region', 'view', 'pane', 'radius', 'ground', 'letterbox',
      'refraction', 'dispersion', 'bendWidth', 'rimWidth', 'saturation', 'brightness', 'opacity'].map(n => [n, uniform(lens, n)]));
    const use = p => { gl.useProgram(p); const a = gl.getAttribLocation(p, 'position'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); };
    let bw = 0, bh = 0;
    canvas.addEventListener('webglcontextlost', () => {
      if (canvas.isConnected) track.closest('.face')?.classList.remove('seek-glass-ready');
    });
    track.append(canvas);
    return { canvas, dispose, draw(media, { view, box, panes, crop, contain, fresh, sourceChanged }) {
      if (gl.isContextLost()) throw new Error('Glass context lost');
      const scale = Math.min(1, glassDefaults.resolution / box.width);
      const cw = Math.max(2, Math.round(box.width * scale)), ch = Math.max(2, Math.round(box.height * scale));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const blurScale = Math.min(1, glassDefaults.resolution / Math.max(view.width, view.height)) / 2;
      const w = Math.max(2, Math.round(view.width * blurScale)), h = Math.max(2, Math.round(view.height * blurScale));
      if (bw !== w || bh !== h) {
        bw = w; bh = h; fresh = true;
        for (const t of [horizontal, frost]) {
          gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        for (const f of fbos) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Glass framebuffer unavailable'); }
      }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source);
      if (sourceChanged) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media); }
      const ground = (getComputedStyle(track.closest('.face')).backgroundColor.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(n => n / 255);
      if (fresh) {
        use(blur); gl.uniform4f(b.region, 0, 0, 1, 1); gl.uniform1i(b.image, 0); gl.uniform2fv(b.crop, crop);
        gl.uniform3fv(b.ground, ground); gl.uniform1f(b.letterbox, +contain);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0]); gl.viewport(0, 0, w, h);
        const radius = Math.min(panes[0][2], panes[0][3]) * glassDefaults.blur * .6;
        gl.uniform2f(b.stepSize, radius / view.width, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindTexture(gl.TEXTURE_2D, horizontal); gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1]);
        gl.uniform2f(b.crop, 1, 1); gl.uniform1f(b.letterbox, 0); gl.uniform2f(b.stepSize, 0, radius / view.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      use(lens); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source); gl.uniform1i(c.film, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, frost); gl.uniform1i(c.frost, 1);
      gl.uniform2fv(c.crop, crop); gl.uniform2f(c.view, view.width, view.height);
      gl.uniform3fv(c.ground, ground); gl.uniform1f(c.letterbox, +contain);
      gl.uniform4f(c.region, (box.x - view.x) / view.width, 1 - (box.bottom - view.y) / view.height, box.width / view.width, box.height / view.height);
      for (const name of ['refraction', 'dispersion', 'bendWidth', 'rimWidth', 'saturation', 'brightness', 'opacity']) gl.uniform1f(c[name], glassDefaults[name]);
      for (const pane of panes) {
        gl.uniform4fv(c.pane, pane); gl.uniform1f(c.radius, Math.min(pane[2], pane[3]) / 2); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Glass frame failed');
    } };
  } catch (error) { dispose(); throw error; }
}
