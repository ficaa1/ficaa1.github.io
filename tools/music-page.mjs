// Writes site/music.html from site/music.json; tools/music.mjs runs it after normalising the URLs.
// Every song is a sleeve on the wall. Songs with art show it; the rest get a sleeve drawn from their waveform bars
// (wave.p) set in lines like a page of text, the way the player draws them, in a flat colour from Ableton's clip palette.
// The cursed songs are bare records in the back room: the same bars set round the record as grooves.
// A song's length is wave.d, or "d" on songs with art (ffprobe on plex).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '../site');
const songs = JSON.parse(readFileSync(join(site, 'music.json'), 'utf8'));

// Sleeve and strip colours, from Ableton Live's clip colours, by audio file. Songs with art take the colour nearest their picture.
const COLOUR = {
  'babel-320.mp3': '#ff94a6', 'obaveze.flac': '#cc9927', 'consent.flac': '#bad074', 'house.mp3': '#ffa529', 'blowback.flac': '#85a5c2',
  'tech2.mp3': '#5480e4', 'reggae-320.mp3': '#f7f47c', 'zumzumzum.flac': '#3c3c3c', 'im-on-fire-320.mp3': '#236384', 'jam.mp3': '#e2675a',
  'jpp.flac': '#d3ad71', 'swarm3.mp3': '#25ffa8', 'gotovo.flac': '#3dc300', 'predugerecenice.mp3': '#8bc5ff', 'utrnulaminoga.mp3': '#ff3636',
  'the-firm.mp3': '#a9a9a9', 'creativeshit.flac': '#00bfaf', 'choir3.flac': '#cdf1f8', 'sivo-sunce.flac': '#99836a', 'phrygysynth.flac': '#d0d0d0',
  'shesopretty.flac': '#e553a0', 'untitledmiddleguitar.flac': '#a6be00', 'levouvo3.flac': '#af3333', 'pocetak.mp3': '#10a4ee',
  // The back room: coloured vinyl.
  'sidjinpin.mp3': '#bffb00', 'drugs.mp3': '#ff39d4', 'nextstempjungle.mp3': '#ffa529', 'spooky.mp3': '#19e9ff', 'oke4.mp3': '#fff034',
};
// A song added later without a colour above takes the next one from this list.
const SPARE = ['#ff94a6', '#ffa529', '#f7f47c', '#25ffa8', '#8bc5ff', '#e2675a', '#bad074', '#10a4ee', '#ffa374', '#00bfaf'];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mmss = t => (t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '');
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const inkFor = c => (contrast(c, '#0a0a0a') >= contrast(c, '#ffffff') ? '#0a0a0a' : '#ffffff');

// The rough width of a title in League Spartan Bold, in ems, so long one-word titles can shrink to fit their sleeve.
function ems(t) {
  let w = 0;
  for (const ch of t) {
    if (' '.includes(ch)) w += 0.24;
    else if ("ilj'.,()!".includes(ch)) w += 0.27;
    else if ('ftrI'.includes(ch)) w += 0.36;
    else if ('mw'.includes(ch)) w += 0.82;
    else if ('MW'.includes(ch)) w += 0.88;
    else if (/[A-Z]/.test(ch)) w += 0.64;
    else if (/[0-9]/.test(ch)) w += 0.58;
    else w += 0.55;
  }
  return Math.round(w * 100) / 100;
}

// The player's own scaling: bars stretched between the quiet (5th percentile) and loud (98th) end of the song.
function heights(p) {
  const o = [...p].sort((a, b) => a - b), lo = o[Math.floor(o.length * 0.05)], hi = o[Math.floor(o.length * 0.98)] || 1;
  return p.map(a => 0.12 + 0.88 * Math.min(1, Math.max(0, (a - lo) / (hi - lo || 1))) ** 1.6);
}

// Sleeve: 10 lines of 48 bars, 584 units square, a 52 unit margin. Every bar is its own "M x y v h" so the page's
// script can take the first n of them for the part already heard.
const SL = { size: 584, pad: 52, col: 10, row: 48, cols: 48, rows: 10, bar: 6 };
function sleevePath(p) {
  const h = heights(p);
  return h.map((v, k) => {
    const c = k % SL.cols, r = Math.floor(k / SL.cols);
    const len = Math.max(2, 2 * Math.round((SL.row * 0.82 * v) / 2));
    const x = SL.pad + c * SL.col + SL.bar / 2, y = SL.pad + r * SL.row + SL.row / 2 - len / 2;
    return `M${x} ${y}v${len}`;
  }).join('');
}

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
let spare = 0;
songs.forEach((s, n) => {
  const colour = COLOUR[s.src.split('/').pop()] || SPARE[spare++ % SPARE.length];
  const d = (s.wave && s.wave.d) || s.d || 0;
  const after = s.artist && s.artist !== 'Filip Biljić' ? s.artist.replace(/^Filip Biljić,\s*/, '') : '';
  const item = { s, n, colour, ink: inkFor(colour), d, after };
  (s.section === 'cursed' ? cursed : main).push(item);
});

function sleeve({ s, n, colour, ink, d, after }, k) {
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
  return `<li class="sleeve" style="${vars}"><a href="${esc(s.src)}" data-song="${n}">${face}<span class="tag"><span class="title">${esc(s.title)}</span>${credit}${facts}</span></a></li>`;
}

function record({ s, n, colour, ink, d }) {
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
  return `<li class="record" style="${vars}"><a href="${esc(s.src)}" data-song="${n}">${disc}<span class="name">${esc(s.title)}</span><span class="meta"><span class="state">${esc(s.year || '')}</span><span class="time" data-d="${Math.round(d * 100) / 100}">${mmss(d)}</span></span></a></li>`;
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
