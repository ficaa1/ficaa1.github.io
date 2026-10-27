// Run this expression in the browser on Photos with liquid glass enabled.
// It starts the real renderer during the real entrance animation, then finishes
// that animation without a scroll or resize. A stale shader rectangle must fail.
(async () => {
  const root = document.querySelector('.lands');
  if (!root?.glass) throw new Error('Open Photos with liquid glass enabled first.');
  const panes = [...root.querySelectorAll('.land')];
  const pane = root.querySelector('[data-land="montenegro"]');
  const video = root.querySelector('video');
  const wasPaused = video.paused;
  const animationStyles = panes.map(p => p.style.animation);
  const rendererURL = [...document.scripts].find(s => /\/photos\/glass\.js/.test(s.src)).src;
  const original = WebGLRenderingContext.prototype.uniform4fv;
  const records = [];
  const wait = () => new Promise(resolve => setTimeout(resolve, 120));
  const read = () => {
    const actual = pane.getBoundingClientRect();
    const drawn = records.filter(r => Math.abs(r[0] - actual.x) < .5 && Math.abs(r[1] - actual.y) < 60).at(-1);
    if (!drawn) throw new Error('Montenegro must be visible in the viewport.');
    return { actualY: actual.y, shaderY: drawn[1], offset: drawn[1] - actual.y };
  };
  try {
    video.pause(); root.glassCleanup();
    panes.forEach(p => { p.style.animation = 'none'; });
    void root.offsetHeight;
    panes.forEach((p, i) => { p.style.animation = animationStyles[i]; });
    const entrances = panes.flatMap(p => p.getAnimations().filter(a => a.animationName === 'ld-rise'));
    if (!entrances.length) throw new Error('Entrance animations must be enabled.');
    entrances.forEach(a => { a.pause(); a.currentTime = 0; });
    WebGLRenderingContext.prototype.uniform4fv = function (location, values) {
      if (values.length === 4) records.push([...values]);
      return original.call(this, location, values);
    };
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = rendererURL;
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = reject; document.head.append(script);
    });
    // Let the initial ResizeObserver notification and pending video callback settle
    // while the pane is held at its entrance position.
    await new Promise(resolve => setTimeout(resolve, 200));
    const initial = read();
    entrances.forEach(a => a.finish());
    await wait();
    const settled = read();
    const beforeIdle = root.glass.info;
    await wait();
    const afterIdle = root.glass.info;
    const result = { initial, settled, idleDraws: afterIdle.renders - beforeIdle.renders,
      extraUploads: afterIdle.uploads - beforeIdle.uploads };
    if (Math.abs(initial.offset) > .5 || Math.abs(settled.offset) > .5 || result.idleDraws || result.extraUploads) {
      throw new Error('Glass geometry regression: ' + JSON.stringify(result));
    }
    return result;
  } finally {
    WebGLRenderingContext.prototype.uniform4fv = original;
    panes.forEach((p, i) => { p.style.animation = animationStyles[i]; });
    if (!wasPaused) video.play().catch(() => {});
  }
})()
