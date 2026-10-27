// DevTools: await import('/photos/glass-benchmark.mjs'); await photoGlassBenchmark.run();
// Measures animation callback cadence, not GPU execution time or video FPS. Record a Performance
// trace alongside an individual variant when investigating compositor or presentation stalls.
(() => {
  const source = new URL('./glass.js', document.currentScript?.src || import.meta.url);
  const baseline = new URL('./glass-baseline.svg', source);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let running = false;
  const results = [];
  async function renderer() {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = source.href;
      s.onload = () => { s.remove(); resolve(); }; s.onerror = () => { s.remove(); reject(new Error('Could not load glass.js')); };
      document.head.append(s);
    });
  }
  window.photoGlassBenchmark = {
    results,
    async run({ rounds = 3, duration = 4000, modes = ['off', 'svg', 'single', 'no-blur', 'one-pane', 'paused', 'webgl'] } = {}) {
      if (running) throw new Error('A benchmark is already running');
      const root = document.querySelector('.lands'), video = root?.querySelector('.reel video');
      if (!video || video.readyState < 2) throw new Error('Open Photos and wait for the film to load');
      if (document.documentElement.matches('[data-lite],[data-still]') || matchMedia('(prefers-reduced-motion: reduce)').matches)
        throw new Error('Turn off low power mode and reduced motion; enable videos first');
      const response = await fetch(baseline);
      if (!response.ok) throw new Error('Could not load the original SVG filter');
      const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
      if (!svg.querySelector('#ld-lens')) throw new Error('Invalid baseline filter');
      const filter = svg.querySelector('filter').innerHTML;
      const style = document.createElement('style');
      const original = { glass: document.documentElement.hasAttribute('data-glass'), paused: video.paused, time: video.currentTime, size: [innerWidth, innerHeight, devicePixelRatio], scroll: [scrollX, scrollY] };
      const label = document.title;
      running = true;
      try {
        root.append(svg); document.head.append(style); scrollTo(0, 0);
        await document.fonts.ready;
        // Export geometry and renderer information with the results, without retaining the extra context.
        const gl = document.createElement('canvas').getContext('webgl');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        this.environment = { userAgent: navigator.userAgent, viewport: original.size, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', video: video.currentSrc };
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        for (let round = 0; round < rounds; round++) {
          for (const mode of round % 2 ? [...modes].reverse() : modes) {
            if (!['off', 'svg', 'single', 'no-blur', 'one-pane', 'paused', 'webgl'].includes(mode)) throw new Error('Unknown variant: ' + mode);
            root.glassCleanup?.(); svg.querySelector('filter').innerHTML = filter;
            document.documentElement.toggleAttribute('data-glass', mode !== 'off');
            const refraction = 'backdrop-filter:url(#ld-lens) saturate(1.05) brightness(.95);';
            style.textContent = mode === 'off' || mode === 'webgl' ? '' : 'html[data-glass] .lands .land{' + refraction + '}';
            if (mode === 'single') {
              const f = svg.querySelector('filter');
              f.querySelectorAll('feDisplacementMap,feBlend,feColorMatrix:not([result="rim"])').forEach(n => n.remove());
              const n = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
              for (const [k, v] of Object.entries({ in: 'SourceGraphic', in2: 'map', scale: '.17', xChannelSelector: 'R', yChannelSelector: 'G', result: 'bent' })) n.setAttribute(k, v);
              f.insertBefore(n, f.querySelector('[result="rim"]'));
            }
            if (mode === 'no-blur') {
              svg.querySelector('feGaussianBlur').remove();
              svg.querySelector('feComposite[in2="frost"]').setAttribute('in2', 'SourceGraphic');
            }
            if (mode === 'one-pane') style.textContent += 'html[data-glass] .lands .land:not(:first-child){backdrop-filter:blur(13px) saturate(1.05) brightness(.95);}';
            video.pause();
            const startTime = Math.min(10, Math.max(0, video.duration - (duration + 1500) / 1000));
            if (video.currentTime !== startTime) {
              await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { video.removeEventListener('seeked', done); reject(new Error('Video seek timed out')); }, 10000);
                const done = () => { clearTimeout(timer); resolve(); };
                video.addEventListener('seeked', done, { once: true }); video.currentTime = startTime;
              });
            }
            if (mode === 'webgl') await renderer();
            if (mode !== 'paused') await video.play();
            await wait(1000);
            if (mode === 'webgl' && !root.classList.contains('glass-ready')) throw new Error('WebGL inactive: check media CORS, WebGL support and console errors');
            const applied = [...root.querySelectorAll('.land')].map(n => getComputedStyle(n).backdropFilter);
            const expected = mode === 'webgl' ? applied.every(f => f === 'none') : mode === 'off' ? applied.every(f => !f.includes('url(')) : mode === 'one-pane' ? applied[0].includes('url(') && applied.slice(1).every(f => !f.includes('url(')) : applied.every(f => f.includes('url('));
            if (!expected) throw new Error('Unexpected filter configuration for ' + mode + '; reload Photos to clear old CSS');
            const gaps = []; let start, previous;
            await new Promise((resolve, reject) => {
              function frame(t) {
                if (document.hidden || innerWidth !== original.size[0] || innerHeight !== original.size[1] || devicePixelRatio !== original.size[2] || scrollY !== 0) {
                  reject(new Error('Keep the tab visible, at the top, and do not resize or change zoom')); return;
                }
                if (start === undefined) start = t;
                if (previous !== undefined) gaps.push(t - previous);
                previous = t;
                if (t - start >= duration) resolve(); else requestAnimationFrame(frame);
              }
              requestAnimationFrame(frame);
            });
            const sorted = [...gaps].sort((a, b) => a - b), percentile = q => sorted[Math.floor((sorted.length - 1) * q)];
            const entry = { round: round + 1, mode, samples: gaps.length, elapsed: previous - start, fps: 1000 * gaps.length / (previous - start), median: percentile(.5), p95: percentile(.95), max: sorted.at(-1), over50: gaps.filter(v => v > 50).length };
            results.push(entry); console.log('Glass benchmark', entry);
            document.title = `Glass: round ${round + 1}, ${mode}`;
          }
        }
        console.table(results);
        return { environment: this.environment, results };
      } finally {
        running = false;
        root.glassCleanup?.(); style.remove(); svg.remove();
        document.documentElement.toggleAttribute('data-glass', original.glass);
        video.currentTime = original.time; scrollTo(...original.scroll); document.title = label;
        if (original.glass && root.isConnected) await renderer();
        if (original.paused) video.pause(); else await video.play();
      }
    },
  };
})();
