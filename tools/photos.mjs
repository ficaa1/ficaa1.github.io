// Turns the JPEG XL originals in photos-src/ into web copies in site/photos/, then writes the
// sets listed in site/photos.json into photos.html. Each photo gets a JXL and a JPEG at two widths,
// plus a small one for the contact sheet; the page serves JXL where the browser can show it, and
// works without JavaScript. Camera settings are read from each original's Exif and kept in
// photos.json, so the page can be rebuilt without the originals.
// Usage: npm install && nice -n 19 node tools/photos.mjs photos-src site
// Decoding a 7000 px original takes about 1 GB of memory; files are done one at a time.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';
import { exif, settings } from './exif.mjs';

globalThis.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height, colorSpace: 'srgb' }); } };

const require = createRequire(import.meta.url);
const wasm = p => WebAssembly.compile(readFileSync(require.resolve(p)));
const { default: decodeJxl, init: initJxlDec } = await import('@jsquash/jxl/decode.js');
const { default: encodeJxl, init: initJxlEnc } = await import('@jsquash/jxl/encode.js');
const { default: decodeJpeg, init: initJpegDec } = await import('@jsquash/jpeg/decode.js');
const { default: encodeJpeg, init: initJpeg } = await import('@jsquash/jpeg/encode.js');
const { default: resize, initResize } = await import('@jsquash/resize');
await initJxlDec(await wasm('@jsquash/jxl/codec/dec/jxl_dec.wasm'));
await initJxlEnc(await wasm('@jsquash/jxl/codec/enc/jxl_enc.wasm'));
await initJpegDec(await wasm('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'));
await initJpeg(await wasm('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'));
await initResize(await wasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'));

const WIDTHS = [1000, 2000];
const THUMB = 400;
const [src = 'photos-src', site = 'site'] = process.argv.slice(2);
const out = join(site, 'photos');
mkdirSync(out, { recursive: true });
const shrink = async (img, w) => w >= img.width ? img : resize(img, { width: w, height: Math.round(img.height * w / img.width), method: 'lanczos3' });

for (const file of existsSync(src) ? readdirSync(src).filter(f => f.endsWith('.jxl')).sort() : []) {
  const name = basename(file, '.jxl');
  if (!existsSync(join(out, `${name}-${WIDTHS.at(-1)}.jpg`))) {
    const full = await decodeJxl(readFileSync(join(src, file)).buffer);
    for (const w of WIDTHS) {
      const img = await shrink(full, w);
      writeFileSync(join(out, `${name}-${w}.jpg`), Buffer.from(await encodeJpeg(img, { quality: 82, progressive: true })));
      writeFileSync(join(out, `${name}-${w}.jxl`), Buffer.from(await encodeJxl(img, { quality: 80, effort: 7, progressive: true })));
    }
    console.log(`${name}: ${full.width}x${full.height}`);
  }
  if (!existsSync(join(out, `${name}-${THUMB}.jpg`))) {
    const small = await shrink(await decodeJpeg(readFileSync(join(out, `${name}-${WIDTHS[0]}.jpg`)).buffer), THUMB);
    writeFileSync(join(out, `${name}-${THUMB}.jpg`), Buffer.from(await encodeJpeg(small, { quality: 78, progressive: true })));
  }
}

// ---- The page. Sizes and dimensions are read from the files; photos.json holds the words and the camera settings.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function jpegSize(file) {
  const b = readFileSync(file);
  for (let i = 2; i < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
}
const bytes = f => statSync(join(out, f)).size;
const MODELS = { 'ILCE-7CM2': 'α7C II', 'ILCE-7C': 'α7C', 'ILCE-7M4': 'α7 IV', 'ILCE-7M3': 'α7 III' };
const camera = s => s && s.camera ? s.camera.replace(/(\S+)$/, m => MODELS[m] || m) : '';
const lens = s => s && s.lens ? s.lens.replace(/(\d)mm/, '$1 mm') : '';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = t => { const [y, m, d] = t.slice(0, 10).split('-'); return { y, m: MONTHS[m - 1], d: +d }; };
function days(photos) {
  const ds = [...new Set(photos.map(p => p.settings && p.settings.taken && p.settings.taken.slice(0, 10)).filter(Boolean))].sort().map(day);
  if (!ds.length) return '';
  const a = ds[0], b = ds.at(-1);
  if (ds.length === 1) return `${a.d} ${a.m} ${a.y}`;
  return a.m === b.m && a.y === b.y ? `${a.d} and ${b.d} ${a.m} ${a.y}`.replace(' and ', ds.length > 2 ? ' to ' : ' and ') : `${a.d} ${a.m} to ${b.d} ${b.m} ${b.y}`;
}
const words = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] || String(n);

const listPath = join(site, 'photos.json');
const sets = JSON.parse(readFileSync(listPath, 'utf8'));
for (const set of sets) for (const p of set.photos) {
  const original = join(src, `${p.file}.jxl`);
  if (existsSync(original)) p.settings = settings(exif(original));
}
writeFileSync(listPath, JSON.stringify(sets, null, 2) + '\n');

const html = sets.map((set, si) => {
  const printed = new Map(set.photos.map(p => [p.frame, p]));
  const gear = [...new Set(set.photos.map(p => [camera(p.settings), lens(p.settings)].filter(Boolean).join(', ')))].filter(Boolean).join('; ');
  const frames = Array.from({ length: set.frames }, (_, i) => {
    const p = printed.get(i + 1);
    if (!p) return `<li><span class="slot"></span><span class="n">${i + 1}</span></li>`;
    return `<li class="printed"><a href="#${esc(p.file)}" aria-label="Frame ${i + 1}: ${esc(p.caption)}"><img src="photos/${esc(p.file)}-${THUMB}.jpg" width="${THUMB}" height="${Math.round(THUMB * 2 / 3)}" alt=""></a><span class="n">${i + 1}</span></li>`;
  }).join('\n');
  const prints = set.photos.map((p, n) => {
    const { width, height } = jpegSize(join(out, `${p.file}-1000.jpg`));
    const srcset = ext => WIDTHS.map(w => `photos/${p.file}-${w}.${ext} ${w}w`).join(', ');
    const sizes = Object.fromEntries(WIDTHS.flatMap(w => ['jpg', 'jxl'].map(e => [`${w}.${e}`, bytes(`${p.file}-${w}.${e}`)])));
    const s = p.settings || {};
    const when = s.taken ? (({ d, m }) => `${d} ${m}, ${s.taken.slice(11)}`)(day(s.taken)) : '';
    return `<figure class="print" id="${esc(p.file)}" data-bytes="${esc(JSON.stringify(sizes))}">
<a href="photos/${esc(p.file)}-${WIDTHS.at(-1)}.jpg" class="open"><span class="load"><picture>
<source type="image/jxl" srcset="${srcset('jxl')}" sizes="100vw">
<img src="photos/${esc(p.file)}-1000.jpg" srcset="${srcset('jpg')}" sizes="100vw" width="${width}" height="${height}" alt="${esc(p.alt)}"${si || n ? ' loading="lazy"' : ''}>
</picture></span></a>
<figcaption><span class="frame">${p.frame}.</span> ${esc(p.caption)} <span class="exif">${[s.aperture, s.shutter, s.iso].filter(Boolean).join(', ')}${when ? `. ${when}` : ''}.</span></figcaption>
</figure>`;
  }).join('\n');
  const heading = si ? 'h2' : 'h1';
  return `<section class="set" id="${esc(set.id)}">
<div class="field">
<article class="contact" aria-label="Contact sheet for ${esc(set.title)}, ${esc(set.when)}">
<${heading} class="title"><span>${esc(set.title)},</span> <span>${esc(set.when)}</span></${heading}>
<p class="facts">${[gear, days(set.photos), `${set.frames} frames, ${words(set.photos.length)} printed`].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('<i aria-hidden="true"></i>')}</p>
<ol class="roll">
${frames}
</ol>
</article>
</div>
<p class="interlock">${esc(set.note)}</p>
<div class="prints">
${prints}
</div>
</section>`;
}).join('\n');
const page = join(site, 'photos.html');
writeFileSync(page, readFileSync(page, 'utf8').replace(/<!-- photos:start -->[\s\S]*<!-- photos:end -->/, `<!-- photos:start -->\n${html}\n<!-- photos:end -->`));
console.log(`photos.html: ${sets.length} sets, ${sets.reduce((n, s) => n + s.photos.length, 0)} photos`);
