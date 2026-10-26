// What the music page, the song pages (song-pages.mjs) and their banners (song-cards.mjs) know about each song in
// site/music.json: its colour from Ableton's clip palette and the ink that reads on it, its length, its address, and
// the bars of its waveform the way the player draws them.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const site = join(dirname(fileURLToPath(import.meta.url)), '../site');

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

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const mmss = t => (t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '');
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const inkFor = c => (contrast(c, '#0a0a0a') >= contrast(c, '#ffffff') ? '#0a0a0a' : '#ffffff');

// A song's address under songs/: its title in lowercase ASCII with hyphens. tools/music.mjs keeps it in music.json as
// "slug" once given, so a renamed song keeps its address.
export const slugOf = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'dj').replace(/['’]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';

// The rough width of a title in League Spartan Bold, in ems, so long one-word titles can shrink to fit their sleeve.
export function ems(t) {
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
export function heights(p) {
  const o = [...p].sort((a, b) => a - b), lo = o[Math.floor(o.length * 0.05)], hi = o[Math.floor(o.length * 0.98)] || 1;
  return p.map(a => 0.12 + 0.88 * Math.min(1, Math.max(0, (a - lo) / (hi - lo || 1))) ** 1.6);
}

// Sleeve: 10 lines of 48 bars, 584 units square, a 52 unit margin. Every bar is its own "M x y v h" so the page's
// script can take the first n of them for the part already heard.
export const SL = { size: 584, pad: 52, col: 10, row: 48, cols: 48, rows: 10, bar: 6 };
export function sleevePath(p) {
  const h = heights(p);
  return h.map((v, k) => {
    const c = k % SL.cols, r = Math.floor(k / SL.cols);
    const len = Math.max(2, 2 * Math.round((SL.row * 0.82 * v) / 2));
    const x = SL.pad + c * SL.col + SL.bar / 2, y = SL.pad + r * SL.row + SL.row / 2 - len / 2;
    return `M${x} ${y}v${len}`;
  }).join('');
}

// Every song in running order, with what each page needs.
export function load() {
  const songs = JSON.parse(readFileSync(join(site, 'music.json'), 'utf8'));
  let spare = 0;
  return songs.map((s, n) => {
    const colour = COLOUR[s.src.split('/').pop()] || SPARE[spare++ % SPARE.length];
    const after = s.artist && s.artist !== 'Filip Biljić' ? s.artist.replace(/^Filip Biljić,\s*/, '') : '';
    return {
      s, n, colour, ink: inkFor(colour), after, cursed: s.section === 'cursed',
      d: (s.wave && s.wave.d) || s.d || 0, slug: s.slug || slugOf(s.title),
    };
  });
}
