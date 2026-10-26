// Writes every song's own page, site/songs/<slug>.html, from site/music.json; tools/music.mjs runs it after music.html.
// The song's name is set enormous on its colour with its picture inside the letters (songs/song.js cuts them out), or,
// for a song without a picture, the bars of its waveform. Under it the picture whole with the glass strip, then every
// other song in running order as a strip of its own colour, from the next one round, and the music page's blue last.
// song.css and song.js in site/songs/ are written by hand, not here.
import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { site, load, esc, mmss, ems, heights, SL, sleevePath } from './songs.mjs';

const out = join(site, 'songs');
const ORIGIN = 'https://www.filipbiljic.com/songs/';
const read = name => { try { return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8')); } catch { return {}; } };
// Each title's real width in ems at the page's tracking, on one line and broken in two, and how light each picture is
// (song-cards.mjs measures them); the rough estimate when a title has not been measured yet. And each song's banner on R2.
const measures = read('./song-measures.json'), widths = measures.widths || {}, light = measures.light || {}, cards = read('./song-cards.json');
const songs = load();

// The widest line of a title broken in two, which is how a phone sets a title of more than one word.
function twoLines(t) {
  const words = t.split(' ');
  let best = ems(t);
  for (let k = 1; k < words.length; k++) best = Math.min(best, Math.max(ems(words.slice(0, k).join(' ')), ems(words.slice(k).join(' '))));
  return best;
}

const PLAY = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path class="i-play" d="M5 3 L17 10 L5 17 Z"/><g class="i-pause"><rect x="4" y="3" width="4" height="14"/><rect x="12" y="3" width="4" height="14"/></g></svg>';

const info = it => {
  const s = it.s, ar = +(s.ar || 1);
  return {
    ...it, ar, w: widths[s.title]?.w || ems(s.title), w2: widths[s.title]?.w2 || twoLines(s.title),
    pic: s.coverFull || s.cover || '', clip: s.loopFull || s.loop || '', h: Math.round(1000 / ar),
    // The waveform as 480 bar heights of two digits each, for the letters of a song without a picture.
    bars: s.wave && s.wave.p ? heights(s.wave.p).map(v => String(Math.min(99, Math.round(v * 99))).padStart(2, '0')).join('') : '',
  };
};

// The letters: the name as real text, and behind it the picture (and its clip), or the song's bars, that song.js shows
// through them.
function letters(x, big, lazy) {
  let media = '';
  if (x.pic) {
    media = `<img ${lazy ? 'data-src' : 'src'}="${esc(x.pic)}" width="1000" height="${x.h}" alt="" decoding="async">` +
      (x.clip && big ? `<video class="loop" data-src="${esc(x.clip)}" poster="${esc(x.pic)}" muted playsinline loop preload="none" disablepictureinpicture></video>` : '');
  } else if (x.bars) media = `<canvas class="bars" data-bars="${x.bars}"></canvas>`;
  return `<span class="t">${esc(x.s.title)}</span>` + (media ? `<span class="inside" aria-hidden="true"><span class="media">${media}</span></span>` : '');
}

// The way on: every other song in running order from the next one round, each a strip of its own sleeve colour, then
// the music page's own link-blue front. The next song's strip is the tall one, its name with its picture inside.
function strips(n) {
  const rows = [];
  for (let k = 1; k < songs.length; k++) {
    const y = info(songs[(n + k) % songs.length]), s = y.s, len = mmss(y.d);
    const vars = `--c:${y.c};--k:${y.k};--w:${y.w};--w2:${y.w2};--ar:${y.ar}`;
    if (k === 1) {
      rows.push(`<li class="first" style="${vars}"><a href="${y.slug}.html"><span class="x">Next</span><span class="y">${esc(s.year || '')}</span><span class="l">${len}</span><span class="word">${letters(y, false, true)}</span></a></li>`);
      continue;
    }
    const thumb = s.thumb || s.cover;
    const pic = thumb ? `<img src="${esc(thumb)}" width="640" height="640" alt="" loading="lazy" decoding="async">` : '<i></i>';
    rows.push(`<li style="${vars}"><a href="${y.slug}.html">${pic}<span class="st">${esc(s.title)}</span><span class="y">${esc(s.year || '')}</span><span class="l">${len}</span></a></li>`);
  }
  rows.push('<li class="music"><a href="../music.html"><i></i><span class="st">Music</span></a></li>');
  return `<ol class="rooms tracklist" aria-label="Songs">\n${rows.join('\n')}\n</ol>`;
}

function page(it) {
  const x = info(it), s = x.s, n = x.n, by = s.artist || 'Filip Biljić';
  const type = /\.flac$/i.test(s.src) ? 'audio/flac' : 'audio/mpeg';
  const fit = `--w:${x.w};--w2:${x.w2};--ar:${x.ar}`;
  const glass = '<span class="glass"><span class="fill"></span><span class="knob"></span></span>';
  let face = '';
  if (x.pic) {
    face = `<a data-up class="face" href="${esc(s.src)}" data-song="${n}" tabindex="-1" aria-hidden="true"><img src="${esc(x.pic)}" width="1000" height="${x.h}" alt="" loading="lazy" decoding="async">` +
      (x.clip ? `<video class="loop" data-src="${esc(x.clip)}" poster="${esc(x.pic)}" muted playsinline loop preload="none" disablepictureinpicture aria-hidden="true"></video>` : '') + `${glass}</a>`;
  } else if (s.wave && s.wave.p) {
    // Without a picture, the sleeve the music page draws for it: its bars set in lines like a page of text.
    face = `<a data-up class="face drawn" href="${esc(s.src)}" data-song="${n}" tabindex="-1" aria-hidden="true" style="--ar:1"><svg viewBox="0 0 ${SL.size} ${SL.size}" data-geo="${SL.cols}" focusable="false"><path class="ink" d="${sleevePath(s.wave.p)}"/><path class="heard" d=""/><path class="at" d=""/></svg>${glass}</a>`;
  }
  const card = cards[x.slug];
  const image = card ? `<meta property="og:image" content="${esc(card.url)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(s.title)}, ${esc(by)}">
` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)} - Filip Biljić</title>
<meta name="description" content="${esc(by)}, ${esc(s.year || '')}">
<meta name="theme-color" content="${x.colour}">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(by)}, ${esc(s.year || '')}">
<meta property="og:type" content="music.song">
<meta property="og:url" content="${ORIGIN}${x.slug}.html">
${image}<meta property="og:audio" content="${esc(s.src)}">
<meta property="og:audio:type" content="${type}">
<meta property="music:duration" content="${Math.round(x.d)}">
<meta name="twitter:card" content="${card ? 'summary_large_image' : 'summary'}">
<link rel="stylesheet" href="../site.css">
<link rel="preload" href="../league-spartan-700.woff2" as="font" type="font/woff2" crossorigin>
</head>
<body class="song">
<nav><a href="../index.html">Welcome</a> | <a href="../blog.html">Blog</a> | <a href="../cv.html">CV</a> | <a href="../contact.html">Contact</a> | <a href="../photos.html">Photos</a> | <a href="../music.html">Music</a></nav>
<main>
<link rel="stylesheet" href="song.css">
<style>body.song{--c:${x.colour};--k:${x.ink}}</style>
<header class="front" data-song-page="${n}" style="${fit}">
<h1 class="songname">${letters(x, true)}</h1>
<p class="songfacts"><a data-up class="play" href="${esc(s.src)}" data-song="${n}">${PLAY}<span class="lbl">Play</span></a><span data-up class="who">${esc(by)}</span><span data-up class="year">${esc(s.year || '')}</span><span data-up class="time" data-d="${Math.round(x.d * 100) / 100}">${mmss(x.d)}</span></p>
</header>
<section class="whole${face ? '' : ' bare'}" style="${fit}">
<div class="tag">
<h2 data-up>${esc(s.title)}</h2>
<p data-up class="by">${esc(by)}</p>
<p data-up class="meta"><span class="state">${esc(s.year || '')}</span><span class="time" data-d="${Math.round(x.d * 100) / 100}">${mmss(x.d)}</span></p>
<p data-up class="acts"><button class="share" type="button" hidden>Share</button><a class="tomusic" href="../music.html">Music</a></p>
</div>
${face}
</section>
${strips(n)}
<script src="song.js"></script>
</main>
<footer>
<div id="trace"><p>Filip Biljić, Paris.</p></div>
</footer>
<script src="../site.js"></script>
</body>
</html>
`;
}

// Strips and pages take the sleeve's colour and ink under the short names the page uses.
for (const it of songs) { it.c = it.colour; it.k = it.ink; }
mkdirSync(out, { recursive: true });
const made = new Set();
for (const it of songs) {
  writeFileSync(join(out, `${it.slug}.html`), page(it));
  made.add(`${it.slug}.html`);
}
// A song taken off the list takes its page with it.
for (const f of readdirSync(out)) if (f.endsWith('.html') && !made.has(f)) unlinkSync(join(out, f));
console.log(`songs/: ${made.size} pages, ${songs.filter(x => cards[x.slug]).length} with a banner`);
