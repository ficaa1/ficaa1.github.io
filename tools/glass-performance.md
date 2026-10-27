# Photo glass performance

The photo panes now share a WebGL renderer (`site/photos/glass.js`). It uploads the
film once per video frame, blurs it in two passes at half the canvas resolution,
then draws each visible pane with separate red, green and blue samples at its rim.
Scissor rectangles limit shading to visible pane bounds. Text, emblems, photographs,
focus, hover and highlights remain HTML/CSS. The selected site settings explicitly
cap the canvas at 1280 pixels on its long edge; display DPR does not multiply its
resolution. Automatic resolution remains available in the playground (1280 pixels
on hardware, 640 with a recognized software renderer), and was used for the
historical benchmarks below. This approximates the original lens rather than reproducing
its SVG gradient stops and blur pixel for pixel.

There is no continuous animation loop while the film is paused. Scroll/resize
updates geometry on demand. Scrolling a paused film reuses its textures. Navigation
disposes callbacks, observers and GPU resources; context loss restores CSS blur.
The panes' entrance slides briefly refresh geometry each frame, including a final
measurement on completion or cancellation. CSS translation changes positions
without notifying ResizeObserver; caching a rectangle mid-slide previously left
the glass up to 24 pixels below its pane until scrolling refreshed it. Run
`tools/glass-geometry-check.js` as a browser expression on Photos with glass enabled
and Montenegro visible to check that a mid-entrance measurement settles correctly
without scrolling, and that paused rendering returns to idle.
Low power mode, disabled videos and reduced motion skip WebGL. Unsupported WebGL,
missing video-frame callbacks or failed CORS also retain the original film and CSS
blur. Music's small SVG seek-bar lenses are unchanged.

## Reproduce the comparison

Serve `site/` with `python3 tools/serve.py 8766 site`, open `/photos.html` in Chromium,
enable videos, turn off low power mode, and wait for the film. Disable browser Energy
Saver, keep viewport/zoom/refresh rate fixed, and close unrelated GPU-heavy work.
In DevTools Console:

```js
await import('/photos/glass-benchmark.mjs');
const measurement = await photoGlassBenchmark.run();
copy(JSON.stringify(measurement, null, 2));
```

The default is three rounds of seven variants, alternating their order, with a
one-second warm-up and four-second sample per variant. Every variant seeks to the
same video position. Keep the tab visible and do not scroll or resize. The script
checks the actual computed backdrop filters before accepting each sample and
restores glass/video settings afterward. It does not change localStorage. Results
are retained in `photoGlassBenchmark.results` even if a later variant fails.

Modes are `off` (ordinary CSS blur), `svg` (original RGB lens), `single` (one
displacement), `no-blur`, `one-pane` (SVG on one pane, CSS blur on the others),
`paused` (original SVG with paused film), and `webgl` (the new renderer).
For an individual Performance trace, use:

```js
await photoGlassBenchmark.run({ rounds: 1, duration: 10000, modes: ['svg'] });
```

Change the mode to `webgl` for the corresponding trace. Disable DevTools screenshot
capture. These measurements describe requestAnimationFrame callback cadence, not
GPU execution time or the number of video frames actually presented. Inspect the
trace's compositor/presentation events alongside them.

## Captured results, 2026-10-27

`tools/glass-results.json` contains two alternating rounds on Chrome 154, SwiftShader
software rendering, 1280 × 800 CSS pixels, DPR 2, using the local 1920-pixel film.
Each sample lasted four seconds after warm-up:

| Variant | Callback cadence, round 1 | Round 2 |
| --- | ---: | ---: |
| CSS blur | 49.8/s | 57.8/s |
| Original SVG lens | 16.7/s | 16.5/s |
| Single displacement | 28.6/s | 27.2/s |
| SVG without blur | 19.8/s | 17.6/s |
| SVG on one pane | 21.6/s | 20.4/s |
| Original SVG, paused film | 60.0/s | 60.0/s |
| WebGL, 640-pixel software cap | 23.6/s | 30.4/s |

Removing RGB splitting has the largest improvement among the SVG simplifications.
WebGL retains colored refraction and improves callback cadence here, with noticeable
run-to-run variation. Full-resolution WebGL was slower on SwiftShader; lowering the
film resolution is material to this result. These are not RTX 4080 results and do
not establish a hardware GPU speedup. Repeat on the target browser/GPU before
claiming one. These benchmark results do not measure production performance.

Browser checks passed for desktop/mobile layout, zero idle draws/uploads with a
paused film, scrolling without uploading the paused film again, context-loss
fallback, disposal on in-place navigation, and the isolated production page build.

## Public video CORS

The bucket CORS rule was saved by the user on 2026-10-27. HEAD responses for
both 960- and 1920-pixel films return the correct `Access-Control-Allow-Origin`
for both website origins. A browser test loaded the public 1920-pixel film with
anonymous CORS and the local renderer injected into an agent-owned tab on the
website origin: video playing, `.lands.glass-ready`, all seven backdrop filters
`none`, and WebGL error zero. This was a session-only test, not a deployment.

After the user's URL purge, one cached 1920-pixel range response still omitted
CORS. The generated page now uses `?v=glass-1` for both film sources to avoid
responses cached before the policy existed. HEAD and repeated range GET requests
passed for both video sizes and both website origins, including cache HITs.
A browser test from the website origin loaded each exact versioned URL and verified
playing anonymous-CORS video, `.lands.glass-ready`, all seven backdrop filters
`none`, and WebGL error zero. No further dashboard changes are required.

`tools/photos-cors.json` records the website GET/HEAD rule. Preserve the existing
localhost rule when editing it. Publishing uses the existing Pages workflow on
`main`; hardware GPU performance remains unmeasured.

```sh
curl -I -H 'Origin: https://www.filipbiljic.com' \
  https://photos.filipbiljic.com/broll-pixelsort-1920.mp4?v=glass-1
```

Expect `Access-Control-Allow-Origin: https://www.filipbiljic.com`. Reload the page
afterward. `.lands.glass-ready` and `backdrop-filter: none` on every `.land` confirm
the renderer successfully drew its first frame. For local benchmarking on an origin outside the policy, use same-origin video
copies; do not disable browser web security.

Reference: https://developers.cloudflare.com/r2/buckets/cors/
