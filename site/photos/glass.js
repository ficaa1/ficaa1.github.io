// The photo panes all look at the same film. Blur it once, then sample its red, green and blue at
// slightly different positions for each rim. No per-pane SVG backdrop filters or per-frame layout.
(() => {
  function init() {
    const root = document.querySelector('.lands');
    const video = root?.querySelector('.reel video');
    if (!video || !document.documentElement.matches('[data-glass]:not([data-lite]):not([data-still])') ||
        (matchMedia('(prefers-reduced-motion: reduce)').matches && !root.hasAttribute('data-glass-preview')) || root.glassCleanup) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'glass-film';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return;
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : '';
    const resolutionLimit = /swiftshader|llvmpipe|software/i.test(renderer) ? 640 : 1280;
    const defaults = Object.freeze({ blur: .018, refraction: .065, dispersion: .011, bendWidth: .13,
      rimWidth: .255, saturation: 1, brightness: .88, opacity: 1, resolution: 1280 });
    const limits = { blur: [0, .12], refraction: [0, .5], dispersion: [0, .15], bendWidth: [.02, .45],
      rimWidth: [.01, .5], saturation: [0, 2], brightness: [.2, 1.5], opacity: [0, 1], resolution: [0, 2560] };
    const settings = { ...defaults };
    const controller = new AbortController();
    const options = { signal: controller.signal, passive: true };
    const textures = [], buffers = [], programs = [], shaders = [], targets = [];
    let stopped = false, active = false, frame = 0, tick = 0, dirty = true;
    let width = 0, height = 0, refresh = true, upload = true, schedule = () => {};
    let renders = 0, uploads = 0;
    const panes = [...root.querySelectorAll('.land')];
    const rects = new Float32Array(panes.length * 4);
    const radii = new Float32Array(panes.length);
    const vertex = `attribute vec2 position; varying vec2 uv;
      void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`;
    function program(fragment) {
      const p = gl.createProgram(); programs.push(p);
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const s = gl.createShader(type); shaders.push(s);
        gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }
    function texture() {
      const t = gl.createTexture(); textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function cleanup() {
      if (stopped) return;
      stopped = true; controller.abort(); observer.disconnect(); resizeObserver.disconnect();
      video.cancelVideoFrameCallback?.(frame); cancelAnimationFrame(tick);
      root.classList.remove('glass-ready'); canvas.remove();
      textures.forEach(t => gl.deleteTexture(t)); buffers.forEach(b => gl.deleteBuffer(b));
      targets.forEach(t => gl.deleteFramebuffer(t)); programs.forEach(p => gl.deleteProgram(p));
      shaders.forEach(s => gl.deleteShader(s));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      delete root.glassCleanup; delete root.glass;
    }
    // Site navigation replaces <main> without reloading the document.
    const observer = new MutationObserver(() => { if (!root.isConnected) cleanup(); });
    observer.observe(document.querySelector('main').parentNode, { childList: true });
    const resizeObserver = new ResizeObserver(() => { dirty = true; schedule(); });
    root.glassCleanup = cleanup;
    // The private playground adjusts uniforms through this interface; the site keeps these defaults.
    root.glass = {
      defaults,
      get settings() { return { ...settings }; },
      get info() { return { renderer, width: canvas.width, height: canvas.height, renders, uploads, active }; },
      update(patch) {
        dirty = true; // Also pick up CSS geometry changes made by the playground.
        for (const key of Object.keys(defaults)) {
          if (!Number.isFinite(patch?.[key])) continue;
          const value = Math.min(limits[key][1], Math.max(limits[key][0], patch[key]));
          if (value === settings[key]) continue;
          settings[key] = value;
          if (key === 'blur') refresh = true;
        }
        schedule();
        return { ...settings };
      },
    };
    try {
      const blur = program(`precision mediump float; varying vec2 uv;
        uniform sampler2D image; uniform vec2 stepSize; uniform vec2 crop;
        vec3 sampleAt(vec2 p) { return texture2D(image, (p - .5) * crop + .5).rgb; }
        void main() {
          vec3 c = sampleAt(uv) * .227027;
          c += (sampleAt(uv + stepSize * 1.384615) + sampleAt(uv - stepSize * 1.384615)) * .316216;
          c += (sampleAt(uv + stepSize * 3.230769) + sampleAt(uv - stepSize * 3.230769)) * .070270;
          gl_FragColor = vec4(c, 1.);
        }`);
      const composite = program(`precision highp float; varying vec2 uv;
        uniform sampler2D film; uniform sampler2D frost; uniform vec2 crop; uniform vec2 view;
        uniform vec4 pane; uniform float radius;
        uniform float refraction; uniform float dispersion; uniform float bendWidth; uniform float rimWidth;
        uniform float saturation; uniform float brightness; uniform float opacity;
        vec3 sampleAt(vec2 p) { return texture2D(film, (p - .5) * crop + .5).rgb; }
        void main() {
          vec2 point = vec2(uv.x, 1. - uv.y) * view;
          vec4 r = pane; vec2 local = point - r.xy;
          vec2 q = abs(local - r.zw * .5) - r.zw * .5 + radius;
          float distance = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
          vec2 p = local / r.zw;
          vec2 bend = .5 * (1. - smoothstep(vec2(0.), vec2(bendWidth), p))
                    - .5 * smoothstep(vec2(1. - bendWidth), vec2(1.), p);
          bend *= r.zw / view * vec2(1., -1.);
          vec2 edge = 1. - smoothstep(vec2(0.), vec2(rimWidth), min(p, 1. - p));
          float rim = 1. - (1. - edge.x) * (1. - edge.y);
          vec3 bent = vec3(sampleAt(uv + bend * (refraction + dispersion)).r,
                           sampleAt(uv + bend * refraction).g, sampleAt(uv + bend * (refraction - dispersion)).b);
          vec3 glass = mix(texture2D(frost, uv).rgb, bent, rim);
          glass = mix(vec3(dot(glass, vec3(.2126, .7152, .0722))), glass, saturation) * brightness;
          gl_FragColor = vec4(glass, clamp(-distance, 0., 1.) * opacity);
        }`);
      const source = texture(), horizontal = texture(), vertical = texture();
      const fbos = [horizontal, vertical].map(t => {
        const f = gl.createFramebuffer(); targets.push(f); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f;
      });
      const buffer = gl.createBuffer(); buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const uniform = (p, name) => gl.getUniformLocation(p, name);
      const b = Object.fromEntries(['image', 'stepSize', 'crop'].map(n => [n, uniform(blur, n)]));
      const optics = ['refraction', 'dispersion', 'bendWidth', 'rimWidth', 'saturation', 'brightness', 'opacity'];
      const c = Object.fromEntries(['film', 'frost', 'crop', 'view', 'pane', 'radius', ...optics].map(n => [n, uniform(composite, n)]));
      // CSS translate does not trigger ResizeObserver. Follow the entrance slide
      // while it runs, then take a final measurement even if the film is paused.
      const entrances = new Set();
      const geometryChanged = () => { dirty = true; schedule(); };
      function trackEntrance(pane) {
        for (const animation of pane.getAnimations()) {
          if (animation.animationName !== 'ld-rise' || entrances.has(animation)) continue;
          entrances.add(animation);
          const settled = () => { entrances.delete(animation); geometryChanged(); };
          animation.finished.then(settled, settled);
        }
        geometryChanged();
      }
      function use(p) {
        gl.useProgram(p); const a = gl.getAttribLocation(p, 'position');
        gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      }
      function layout() {
        const initial = width === 0;
        // Fixed elements exclude classic scrollbar space; innerWidth includes it.
        // Use the film's displayed box for both projection and object-fit cropping.
        const view = video.parentElement.getBoundingClientRect();
        const viewChanged = width !== view.width || height !== view.height;
        width = view.width; height = view.height;
        // Only the film is downsampled; all text, emblems and highlights retain the display's resolution.
        const scale = Math.min(1, (settings.resolution || resolutionLimit) / Math.max(width, height));
        const nextWidth = Math.max(2, Math.round(width * scale)), nextHeight = Math.max(2, Math.round(height * scale));
        const resized = initial || canvas.width !== nextWidth || canvas.height !== nextHeight;
        if (resized) {
          canvas.width = nextWidth; canvas.height = nextHeight;
        }
        for (let i = 0; i < panes.length; i++) {
          const r = panes[i].getBoundingClientRect(); rects.set([r.x - view.x, r.y - view.y, r.width, r.height], i * 4);
          radii[i] = parseFloat(getComputedStyle(panes[i]).borderTopLeftRadius);
        }
        if (resized) {
          for (const t of [horizontal, vertical]) {
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width >> 1, canvas.height >> 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          }
          for (const f of fbos) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, f);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Glass framebuffer unavailable');
          }
          refresh = true;
        }
        if (viewChanged) refresh = true;
        dirty = false;
      }
      function render() {
        if (stopped || document.hidden || !root.isConnected || video.readyState < 2) return;
        try {
          const moving = [...entrances].some(a => a.playState === 'running');
          if (moving) { dirty = true; schedule(); }
          if (dirty) layout();
          const aspect = width / height, filmAspect = video.videoWidth / video.videoHeight;
          const crop = aspect > filmAspect ? [1, filmAspect / aspect] : [aspect / filmAspect, 1];
          if (upload || refresh) {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source);
            if (upload) {
              gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
              upload = false; uploads++;
            }
          }
          if (refresh) {
            use(blur); gl.uniform1i(b.image, 0); gl.uniform2fv(b.crop, crop);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0]); gl.viewport(0, 0, canvas.width >> 1, canvas.height >> 1);
            gl.uniform2f(b.stepSize, rects[2] * settings.blur / width * .6, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindTexture(gl.TEXTURE_2D, horizontal); gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1]);
            gl.uniform2f(b.crop, 1, 1); gl.uniform2f(b.stepSize, 0, rects[3] * settings.blur / height * .6);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); refresh = false;
          }
          use(composite); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source); gl.uniform1i(c.film, 0);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, vertical); gl.uniform1i(c.frost, 1);
          gl.uniform2fv(c.crop, crop); gl.uniform2f(c.view, width, height);
          for (const name of optics) gl.uniform1f(c[name], settings[name]);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.SCISSOR_TEST);
          for (let i = 0; i < panes.length; i++) {
            const r = rects.subarray(i * 4, i * 4 + 4);
            const x = Math.max(0, Math.floor(r[0] * canvas.width / width));
            const y = Math.max(0, Math.floor((height - r[1] - r[3]) * canvas.height / height));
            const right = Math.min(canvas.width, Math.ceil((r[0] + r[2]) * canvas.width / width));
            const top = Math.min(canvas.height, Math.ceil((height - r[1]) * canvas.height / height));
            if (right <= x || top <= y) continue;
            gl.scissor(x, y, right - x, top - y);
            gl.uniform4fv(c.pane, r); gl.uniform1f(c.radius, radii[i]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
          gl.disable(gl.SCISSOR_TEST);
          renders++;
          if (!active && gl.getError() !== gl.NO_ERROR) throw new Error('Glass frame failed');
          if (!active) { video.parentElement.append(canvas); root.classList.add('glass-ready'); active = true; }
        } catch { cleanup(); } // A CORS failure leaves the original video and ordinary CSS blur visible.
      }
      function nextFrame() {
        if (stopped) return;
        upload = refresh = true;
        render();
        if (!stopped) frame = video.requestVideoFrameCallback(nextFrame);
      }
      schedule = () => {
        if (stopped || tick) return;
        tick = requestAnimationFrame(() => { tick = 0; render(); });
      };
      root.addEventListener('animationstart', event => {
        if (event.animationName === 'ld-rise' && panes.includes(event.target)) panes.forEach(trackEntrance);
      }, options);
      panes.forEach(trackEntrance);
      for (const event of ['loadeddata', 'seeked']) video.addEventListener(event, () => { upload = refresh = true; schedule(); }, options);
      video.addEventListener('play', schedule, options);
      addEventListener('scroll', () => { dirty = true; schedule(); }, options);
      addEventListener('resize', () => { dirty = true; schedule(); }, options);
      document.addEventListener('visibilitychange', schedule, options);
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cleanup(); }, { signal: controller.signal });
      resizeObserver.observe(root);
      resizeObserver.observe(video.parentElement);
      if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(nextFrame);
      else { cleanup(); return; }
      render();
    } catch { cleanup(); }
  }
  const video = document.querySelector('.lands .reel video');
  if (video?.dataset.on) init();
  else document.addEventListener('photos-video-ready', init, { once: true });
})();
