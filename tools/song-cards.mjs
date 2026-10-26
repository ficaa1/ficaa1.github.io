// The banner for each song's link (1200×630): its name on its colour, as large as reads well, with its picture inside
// the letters (or its waveform's bars, for a song without a picture), and "Filip Biljić · 2019 · 2:42" under it.
// Each is saved as site/music/cards/<slug>-<hash8>.jpg (git-ignored; the hash is of the JPEG's bytes, so a changed banner
// gets a new name), uploaded once to R2 under music/cards/, and recorded in tools/song-cards.json, which song-pages.mjs
// reads for og:image. A banner is only drawn again when what goes into it changes. The same browser measures, for the
// pages too (tools/song-measures.json), each title's width in League Spartan and how light each picture is on average.
// tools/music.mjs runs this. On its own (heavy: a browser, then uploads one at a time):
//   nice -n 19 ionice -c3 node tools/song-cards.mjs [--no-upload] [--force] [slug ...]
// Needs Playwright: `playwright` from node_modules, or PLAYWRIGHT=/path/to/node_modules/playwright.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setPriority } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, load, esc, mmss, heights } from './songs.mjs';

const MANIFEST = fileURLToPath(new URL('./song-cards.json', import.meta.url));
const DIR = join(site, 'music/cards');
const BUCKET = 'r2:filipbiljic-photos/music/cards/';
const PUBLIC = 'https://photos.filipbiljic.com/music/cards/';
// Raise when the banner's design changes, so every banner is drawn again.
const DESIGN = 2;

const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } };
const lines = o => `{\n${Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}`;
const save = (f, o) => writeFileSync(f, lines(o) + '\n');

function chromium() {
  const req = createRequire(import.meta.url);
  for (const p of [process.env.PLAYWRIGHT, 'playwright', '/home/hermes/.npm/_npx/e41f203b7505f1fb/node_modules/playwright']) {
    if (!p) continue;
    try { return req(p).chromium; } catch {}
  }
  throw new Error('Playwright not found; set PLAYWRIGHT to its folder.');
}

// The bars of a song without a picture, 10 lines of 48 in the song's colour on its ink, stretched over the letters.
function barsSvg(p, c, k) {
  const h = heights(p);
  const d = h.map((v, n) => { const len = 8.2 * v; return `M${(n % 48) * 10 + 2.25} ${Math.floor(n / 48) * 10 + 5 - len / 2}h5.5v${len.toFixed(2)}h-5.5z`; }).join('');
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 100" preserveAspectRatio="none"><rect width="480" height="100" fill="${k}"/><path fill="${c}" d="${d}"/></svg>`)}`;
}

function card(x, font) {
  // The facts sit close under the letters' baseline, or under their tails when the name has any.
  const fs = Math.min(1000 / x.w, 400), drop = /[gjpqy]/.test(x.title) ? 0.05 : 0.24;
  const fill = x.pic ? `url("${esc(x.pic)}") 50% 40% / cover no-repeat` : x.bars ? `url("${x.bars}") 0 0 / 100% 100% no-repeat` : 'none';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "League Spartan"; font-weight: 700; src: url(data:font/woff2;base64,${font}) format("woff2"); }
html, body { margin: 0; }
body {
  width: 1200px; height: 630px; overflow: hidden; box-sizing: border-box; padding: 0 100px 12px;
  display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
  background: ${x.c}; color: ${x.k};
}
.name { margin: 0; white-space: nowrap; font: 700 ${fs}px / 0.8 "League Spartan", sans-serif; letter-spacing: -0.045em; }
.name span { display: inline-block; padding: 0.04em 0 0.1em; color: ${x.pic || x.bars ? 'transparent' : x.k}; background: ${fill}; -webkit-background-clip: text; background-clip: text; }
.facts { margin: ${40 - drop * fs}px 0 0 0.06em; font: 48px/1 "Times New Roman", Times, "Liberation Serif", serif; font-variant-numeric: tabular-nums; }
</style></head><body><h1 class="name"><span>${esc(x.title)}</span></h1><p class="facts">${esc(x.facts)}</p></body></html>`;
}

export async function cards({ upload = true, force = false, only = [] } = {}) {
  const songs = load(), measures = read(MANIFEST.replace('song-cards', 'song-measures')), manifest = read(MANIFEST);
  const widths = (measures.widths ||= {}), light = (measures.light ||= {});
  const todo = [];
  for (const it of songs) {
    const s = it.s;
    const x = {
      title: s.title, c: it.colour, k: it.ink, pic: s.coverFull || s.cover || '',
      bars: !(s.coverFull || s.cover) && s.wave && s.wave.p ? barsSvg(s.wave.p, it.colour, it.ink) : '',
      facts: [s.artist || 'Filip Biljić', s.year, mmss(it.d)].filter(Boolean).join(' · '),
    };
    x.key = createHash('sha256').update(JSON.stringify([DESIGN, x])).digest('hex').slice(0, 16);
    if (only.length && !only.includes(it.slug)) continue;
    if (!force && manifest[it.slug]?.key === x.key && widths[s.title] && (!x.pic || light[x.pic] != null)) continue;
    todo.push({ ...x, slug: it.slug });
  }
  if (!todo.length) { console.log('song cards: none changed'); return; }

  // The box is small and shared: this process and the browser it starts run at the lowest CPU and I/O priority.
  try { setPriority(19); } catch {}
  spawnSync('ionice', ['-c3', '-p', String(process.pid)]);
  const font = readFileSync(join(site, 'league-spartan-700.woff2')).toString('base64');
  const browser = await chromium().launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    // Every title's real width in ems at the pages' tracking, on one line (w) and at its best break into two (w2).
    await page.setContent(`<style>@font-face{font-family:LS;font-weight:700;src:url(data:font/woff2;base64,${font}) format("woff2")}
      span{font:700 100px LS;letter-spacing:-0.045em;white-space:pre}</style><span id=s></span>`);
    await page.evaluate(() => document.fonts.load('700 100px LS'));
    Object.assign(widths, await page.evaluate(list => {
      const s = document.getElementById('s'), r = {};
      const em = t => { s.textContent = t; return s.getBoundingClientRect().width / 100; };
      for (const t of list) {
        const words = t.split(' ');
        let w2 = em(t);
        for (let k = 1; k < words.length; k++) w2 = Math.min(w2, Math.max(em(words.slice(0, k).join(' ')), em(words.slice(k).join(' '))));
        r[t] = { w: Math.round(em(t) * 1000) / 1000, w2: Math.round(w2 * 1000) / 1000 };
      }
      return r;
    }, songs.map(it => it.s.title)));
    // How light each picture is: the mean of its pixels' relative luminance, from a 64 px copy.
    for (const it of songs) {
      const pic = it.s.coverFull || it.s.cover;
      if (!pic || light[pic] != null) continue;
      const bytes = Buffer.from(await (await fetch(pic)).arrayBuffer()).toString('base64');
      light[pic] = await page.evaluate(async src => {
        const img = new Image(); img.src = src; await img.decode();
        const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), g = c.getContext('2d');
        g.drawImage(img, 0, 0, 64, 64);
        const d = g.getImageData(0, 0, 64, 64).data, f = v => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        let sum = 0;
        for (let k = 0; k < d.length; k += 4) sum += 0.2126 * f(d[k]) + 0.7152 * f(d[k + 1]) + 0.0722 * f(d[k + 2]);
        return Math.round((sum / (d.length / 4)) * 1000) / 1000;
      }, `data:image/jpeg;base64,${bytes}`);
    }
    const titles = new Set(songs.map(it => it.s.title)), pics = new Set(songs.map(it => it.s.coverFull || it.s.cover));
    writeFileSync(MANIFEST.replace('song-cards', 'song-measures'), `{\n"widths": ${lines(Object.fromEntries(Object.entries(widths).filter(([t]) => titles.has(t))))},\n"light": ${lines(Object.fromEntries(Object.entries(light).filter(([p]) => pics.has(p))))}\n}\n`);

    mkdirSync(DIR, { recursive: true });
    for (const x of todo) {
      x.w = widths[x.title].w;
      await page.setContent(card(x, font), { waitUntil: 'load' });
      await page.evaluate(src => Promise.all([document.fonts.ready, src && Object.assign(new Image(), { src }).decode()]), x.pic);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 88 });
      const name = `${x.slug}-${createHash('sha256').update(jpg).digest('hex').slice(0, 8)}.jpg`;
      const file = join(DIR, name);
      if (!existsSync(file)) writeFileSync(file, jpg);
      if (manifest[x.slug]?.name === name) { manifest[x.slug].key = x.key; save(MANIFEST, manifest); continue; }
      if (!upload) { console.log(`song cards: drew ${name} (not uploaded)`); continue; }
      // One at a time, never over an object already there.
      const r = spawnSync('nice', ['-n', '19', 'ionice', '-c3', 'rclone', 'copyto', file, BUCKET + name, '--immutable', '--s3-no-check-bucket',
        '--header-upload', 'Content-Type: image/jpeg', '--header-upload', 'Cache-Control: public, max-age=31536000, immutable'], { stdio: ['ignore', 'ignore', 'pipe'] });
      if (r.status !== 0) { console.error(`song cards: upload of ${name} failed: ${String(r.stderr).trim().split('\n').pop()}`); continue; }
      manifest[x.slug] = { key: x.key, name, url: PUBLIC + name };
      save(MANIFEST, manifest);
      console.log(`song cards: ${name}`);
    }
  } finally { await browser.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  await cards({ upload: !args.includes('--no-upload'), force: args.includes('--force'), only: args.filter(a => !a.startsWith('--')) });
}
