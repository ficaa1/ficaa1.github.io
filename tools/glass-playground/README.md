# Liquid glass playground

Build the private preview with `node tools/glass-playground/build.mjs`, then open
`/picker/glass.html` on the local site server (port 8766). The generated files live
under ignored `site/picker/` and are never part of the public site deployment.
Local `site/photos/broll-pixelsort-{960,1920}.mp4` copies are required, along with
`site/photos/broll-pixelsort-poster-960.jpg`.

The preview reads the real panes from `site/photos.html` and uses the same
`site/photos/glass.js` renderer. Each `.lands` root exposes `glass.defaults`,
`glass.settings`, `glass.update(patch)`, and `glass.info` while its context is alive.
Updates are clamped to safe ranges. They redraw paused video without reuploading
the film; only a new video frame, load, or seek marks the source texture dirty.
Default uniform values preserve the public appearance. `resolution: 0` retains
the automatic 1280-pixel hardware / 640-pixel software cap.

The preview saves named presets and the last adjustment under its own localStorage
key. It never changes the public site's low-power, motion, or glass preferences.
Copy link stores a versioned settings object in the fragment; Copy settings exports
the same object. Imported links are validated and clamped. The comparison toggle
temporarily renders the site defaults without overwriting the edited preset.

The updates/s display counts renderer redraws, including changes and scrolling.
It does not measure GPU duration, presentation FPS, or a monitor's refresh rate.
Reduced-motion users start with a paused film and can explicitly play it.
