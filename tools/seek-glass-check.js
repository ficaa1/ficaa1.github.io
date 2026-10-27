// Run as a browser expression on a song page or Music with liquid glass enabled
// and audio paused. Exercise the real progress handlers and inspect rendered pixels.
(async () => {
  const main = document.querySelector('main');
  const face = main.querySelector('.face:has(.glass)');
  const i = +(main.querySelector('[data-song-page]')?.dataset.songPage || face.closest('[data-song]').dataset.song);
  const owner = face.closest('li') || main;
  const d = +owner.querySelector('.time[data-d]').dataset.d;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const update = t => document.dispatchEvent(new CustomEvent('player', { detail: { i, playing: false, t, d } }));
  document.dispatchEvent(new CustomEvent('player-select', { detail: { i } }));
  face.scrollIntoView({ block: 'center' }); update(d * .4);
  const deadline = performance.now() + 8000;
  while (!face.seekGlass?.info.active && performance.now() < deadline) await wait(50);
  if (!face.seekGlass?.info.active) throw new Error('The seek glass did not activate.');
  await wait(1000);
  const canvas = face.querySelector('.seek-glass-film'), track = face.querySelector('.glass'), knob = track.querySelector('.knob');
  const gl = canvas.getContext('webgl'), draw = gl.drawArrays;
  let edge, calls = 0, sought;
  const onSeek = e => { sought = e.detail.t; };
  try {
    gl.drawArrays = function (...args) {
      draw.apply(this, args);
      if (gl.getParameter(gl.FRAMEBUFFER_BINDING) || ++calls % 2) return;
      const box = canvas.getBoundingClientRect(), k = knob.getBoundingClientRect(), css = getComputedStyle(knob, '::before');
      const left = k.x + parseFloat(css.left), top = k.y + parseFloat(css.top);
      const w = parseFloat(css.width), h = parseFloat(css.height);
      // A row above the track contains only the rounded thumb.
      const py = Math.floor((1 - (top + 6 - box.y) / box.height) * canvas.height);
      const y = box.bottom - (py + .5) * box.height / canvas.height;
      const pixels = new Uint8Array(canvas.width * 4), xs = [];
      gl.readPixels(0, py, canvas.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (let x = 0; x < canvas.width; x++) if (pixels[x * 4 + 3] >= 128) xs.push(box.x + (x + .5) * box.width / canvas.width);
      const radius = h / 2, inset = radius - Math.sqrt(radius ** 2 - (y - top - radius) ** 2);
      edge = { leftError: xs[0] - (left + inset), rightError: xs.at(-1) - (left + w - inset),
        tolerance: 2 * box.width / canvas.width };
    };
    const before = face.seekGlass.info;
    update(d * .6); await wait(1000);
    const after = face.seekGlass.info;
    await wait(200);
    const idle = face.seekGlass.info;
    const filters = [getComputedStyle(track).backdropFilter, getComputedStyle(knob, '::before').backdropFilter];
    const error = gl.getError();
    document.addEventListener('player-seek', onSeek);
    const r = track.getBoundingClientRect();
    track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1,
      clientX: r.left + r.width * .75, clientY: r.top + r.height / 2 }));
    const result = { edge, idleDraws: idle.renders - after.renders, idleUploads: idle.uploads - after.uploads,
      progressUploads: after.uploads - before.uploads, sought, expectedSeek: d * .75,
      filters, error };
    if (!edge || !Number.isFinite(edge.leftError) || Math.max(Math.abs(edge.leftError), Math.abs(edge.rightError)) > edge.tolerance ||
        result.idleDraws || result.idleUploads || (face.querySelector('img') && result.progressUploads) || Math.abs(sought - result.expectedSeek) > .1 ||
        !result.filters.every(f => f === 'none') || result.error) throw new Error('Seek glass regression: ' + JSON.stringify(result));
    return result;
  } finally { gl.drawArrays = draw; document.removeEventListener('player-seek', onSeek); }
})()
