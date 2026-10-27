// Run as a browser expression on Photos with glass enabled and Ljubljana visible.
// A stable scrollbar gutter reproduces the narrower canvas on desktop browsers
// with classic scrollbars. Measure the rendered alpha edge, not just uniforms.
(async () => {
  const root = document.querySelector('.lands');
  if (!root?.glass) throw new Error('Open Photos with liquid glass enabled first.');
  const video = root.querySelector('video'), canvas = root.querySelector('canvas');
  const pane = root.querySelector('[data-land="ljubljana"]');
  const gl = canvas.getContext('webgl');
  const originalUniform = gl.uniform4fv, originalDraw = gl.drawArrays;
  const gutter = document.documentElement.style.scrollbarGutter;
  const wasPaused = video.paused;
  let rectangle, edge;
  try {
    video.pause();
    document.documentElement.style.scrollbarGutter = 'stable';
    gl.uniform4fv = function (location, values) {
      rectangle = [...values]; return originalUniform.call(this, location, values);
    };
    gl.drawArrays = function (...args) {
      originalDraw.apply(this, args);
      const p = pane.getBoundingClientRect(), c = canvas.getBoundingClientRect();
      if (gl.getParameter(gl.FRAMEBUFFER_BINDING) || !rectangle ||
          Math.abs(rectangle[0] - p.x) > .5 || Math.abs(rectangle[1] - p.y) > .5) return;
      const y = Math.floor((1 - (p.y + p.height / 2 - c.y) / c.height) * canvas.height);
      if (y < 0 || y >= canvas.height) throw new Error('Ljubljana must be visible.');
      const pixels = new Uint8Array(canvas.width * 4);
      gl.readPixels(0, y, canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let last = -1;
      for (let x = 0; x < canvas.width; x++) if (pixels[x * 4 + 3] >= 128) last = x;
      const right = c.x + (last + 1) * c.width / canvas.width;
      edge = { canvasWidth: c.width, innerWidth, actualRight: p.right, renderedRight: right,
        error: right - p.right, tolerance: 2 * c.width / canvas.width };
    };
    root.glass.update({});
    const deadline = performance.now() + 5000;
    while (!edge && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (!edge) throw new Error('No Ljubljana frame was measured.');
    if (Math.abs(edge.error) > edge.tolerance) throw new Error('Glass bounds regression: ' + JSON.stringify(edge));
    return edge;
  } finally {
    gl.uniform4fv = originalUniform; gl.drawArrays = originalDraw;
    document.documentElement.style.scrollbarGutter = gutter;
    root.glass?.update({});
    if (!wasPaused) video.play().catch(() => {});
  }
})()
