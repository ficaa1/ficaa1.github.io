// Writes site/music.html from site/music.json; tools/music.mjs runs it after normalising the URLs.
// Every song is a sleeve on the wall. Songs with art show it; the rest get a sleeve drawn from their waveform bars
// (wave.p) set in lines like a page of text, the way the player draws them, in a flat colour from Ableton's clip palette.
// The cursed songs are bare records in the back room: the same bars set round the record as grooves.
// A song's length is wave.d, or "d" on songs with art (ffprobe on plex).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { site, load, esc, mmss, ems, heights, SL, sleevePath } from './songs.mjs';

// Record: the same 480 bars as 10 grooves of 48, outside in, starting at the top and going clockwise.
const RC = { size: 600, c: 300, r0: 272, step: 16, cols: 48, rows: 10, label: 104 };
const ringR = r => RC.r0 - r * RC.step;
const ringW = r => Math.round(ringR(r) * ((2 * Math.PI) / RC.cols) * 0.46 * 10) / 10;
function recordPaths(p) {
  const h = heights(p), rings = Array.from({ length: RC.rows }, () => '');
  h.forEach((v, k) => {
    const r = Math.floor(k / RC.cols), j = k % RC.cols, rho = ringR(r), half = (RC.step * 0.86 * v) / 2;
    const a = ((-90 + (j + 0.5) * (360 / RC.cols)) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const f = n => Math.round(n);
    rings[r] += `M${f(RC.c + (rho - half) * cos)} ${f(RC.c + (rho - half) * sin)}L${f(RC.c + (rho + half) * cos)} ${f(RC.c + (rho + half) * sin)}`;
  });
  return rings;
}

const main = [], cursed = [];
for (const it of load()) (it.cursed ? cursed : main).push(it);

function sleeve({ s, n, colour, ink, d, after, slug }, k) {
  const vars = `--c:${colour};--k:${ink};--w:${ems(s.title)}${s.ar ? `;--ar:${s.ar}` : ''}`;
  const facts = `<span class="meta"><span class="state">${esc(s.year || '')}</span><span class="time" data-d="${Math.round(d * 100) / 100}">${mmss(d)}</span></span>`;
  const credit = after ? `<span class="after">${esc(after)}</span>` : '';
  let face;
  if (s.cover) {
    const lazy = k > 7 ? ' loading="lazy"' : '';
    const srcset = s.thumb ? ` srcset="${esc(s.thumb)} 640w, ${esc(s.cover)} 1000w" sizes="(max-width: 700px) 46vw, (max-width: 1100px) 31vw, 23vw"` : '';
    // A loop is only fetched once its song plays (music.js); until then the sleeve is its first frame, the cover. While the
    // song is on, the sleeve opens out to the picture's whole shape (coverFull) and the whole clip (loopFull).
    const full = s.coverFull ? ` data-full="${esc(s.coverFull)}"` : '';
    const clip = s.loopFull || s.loop;
    const loop = clip ? `<video class="loop" data-src="${esc(clip)}" muted playsinline loop preload="none" disablepictureinpicture aria-hidden="true"></video>` : '';
    // The part heard, on a strip of glass over the picture; pressing or dragging on it moves the song along.
    const glass = `<span class="glass" aria-hidden="true"><span class="fill"></span><span class="knob"></span></span>`;
    face = `<span class="face art"><img src="${esc(s.cover)}"${srcset}${full} width="1000" height="1000" alt=""${lazy} decoding="async">${loop}${glass}</span>`;
  } else if (s.wave && s.wave.p) {
    face = `<span class="face drawn"><svg viewBox="0 0 ${SL.size} ${SL.size}" aria-hidden="true" focusable="false"><path class="band" d=""/><path class="ink" d="${sleevePath(s.wave.p)}"/><path class="heard" d=""/><path class="at" d=""/></svg></span>`;
  } else {
    face = `<span class="face drawn bare"></span>`;
  }
  // The face plays the song; the tag under it is the way to the song's own page.
  return `<li class="sleeve" style="${vars}"><a href="${esc(s.src)}" data-song="${n}" aria-label="Play ${esc(s.title)}">${face}</a><a class="tag" href="songs/${slug}.html"><span class="title">${esc(s.title)}</span>${credit}${facts}</a></li>`;
}

function record({ s, n, colour, ink, d, slug }) {
  const vars = `--c:${colour};--k:${ink};--w:${ems(s.title)}`;
  let grooves = '';
  if (s.wave && s.wave.p) {
    const rings = recordPaths(s.wave.p);
    grooves = `<g class="band"></g>` +
      rings.map((path, r) => `<path class="ink" data-r="${ringR(r)}" stroke-width="${ringW(r)}" d="${path}"/>`).join('') +
      rings.map((_, r) => `<path class="heard" stroke-width="${ringW(r)}" d=""/>`).join('') +
      `<path class="at" d=""/>`;
  }
  const disc = `<svg class="disc" viewBox="0 0 ${RC.size} ${RC.size}" aria-hidden="true" focusable="false"><circle class="vinyl" cx="${RC.c}" cy="${RC.c}" r="296"/>${grooves}<circle class="label" cx="${RC.c}" cy="${RC.c}" r="${RC.label}"/><circle class="hole" cx="${RC.c}" cy="${RC.c}" r="9"/></svg>`;
  // A record with a loop plays it inside the letters of its name while the song plays (music.js cuts them out); for
  // reduced motion the letters hold its still.
  const clip = s.loopFull || s.loop;
  const loop = clip ? `<video class="loop" data-src="${esc(clip)}"${s.coverFull || s.cover ? ` data-still="${esc(s.coverFull || s.cover)}"` : ''} muted playsinline loop preload="none" disablepictureinpicture aria-hidden="true"></video>` : '';
  // The record plays the song; its name is the way to the song's own page.
  return `<li class="record" style="${vars}"><a href="${esc(s.src)}" data-song="${n}" aria-label="Play ${esc(s.title)}">${disc}</a><a class="page" href="songs/${slug}.html"><span class="name">${esc(s.title)}${loop}</span><span class="meta"><span class="state">${esc(s.year || '')}</span><span class="time" data-d="${Math.round(d * 100) / 100}">${mmss(d)}</span></span></a></li>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Music - Filip Biljić</title>
<link rel="stylesheet" href="site.css">
<link rel="preload" href="league-spartan-700.woff2" as="font" type="font/woff2" crossorigin>
</head>
<body class="music">
<nav><a href="index.html">Welcome</a> | <a href="blog.html">Blog</a> | <a href="cv.html">CV</a> | <a href="contact.html">Contact</a> | <a href="photos.html">Photos</a> | <b>Music</b></nav>
<main>
<link rel="stylesheet" href="music.css">
<header class="front">
<h1>Music</h1>
<p class="lead">Some of the songs im least embarassed to share</p>
</header>
<ol class="tracklist wall" data-geo="${SL.pad} ${SL.col} ${SL.row} ${SL.cols} ${SL.bar}">
${main.map(sleeve).join('\n')}
</ol>
<h2 class="backroom" id="cursed">the cursed stuff</h2>
<ol class="tracklist records" start="${cursed.length ? cursed[0].n + 1 : 1}" aria-labelledby="cursed" data-geo="${RC.c} ${RC.r0} ${RC.step} ${RC.cols}">
${cursed.map(record).join('\n')}
</ol>
<script src="music.js"></script>
</main>
<footer>
<div id="trace"><p>Filip Biljić, Paris.</p></div>
</footer>
<script src="site.js"></script>
</body>
</html>
`;
writeFileSync(join(site, 'music.html'), html);
console.log(`music.html: ${main.length} sleeves, ${cursed.length} records, ${(html.length / 1024).toFixed(0)} KB`);
