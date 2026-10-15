// Turns the JPEG XL originals in photos-src/ into web copies in site/photos/, then writes the
// sets listed in site/photos.json into photos.html. Each photo gets a JXL and a JPEG at two widths;
// the page serves JXL where the browser can show it, and works without JavaScript.
// Usage: npm install && node tools/photos.mjs photos-src site
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createRequire } from 'node:module';

globalThis.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height, colorSpace: 'srgb' }); } };

const require = createRequire(import.meta.url);
const wasm = p => WebAssembly.compile(readFileSync(require.resolve(p)));
const { default: decodeJxl, init: initJxlDec } = await import('@jsquash/jxl/decode.js');
const { default: encodeJxl, init: initJxlEnc } = await import('@jsquash/jxl/encode.js');
const { default: encodeJpeg, init: initJpeg } = await import('@jsquash/jpeg/encode.js');
const { default: resize, initResize } = await import('@jsquash/resize');
await initJxlDec(await wasm('@jsquash/jxl/codec/dec/jxl_dec.wasm'));
await initJxlEnc(await wasm('@jsquash/jxl/codec/enc/jxl_enc.wasm'));
await initJpeg(await wasm('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'));
await initResize(await wasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'));

const WIDTHS = [1000, 2000];
const [src = 'photos-src', site = 'site'] = process.argv.slice(2);
const out = join(site, 'photos');
mkdirSync(out, { recursive: true });

for (const file of readdirSync(src).filter(f => f.endsWith('.jxl')).sort()) {
  const name = basename(file, '.jxl');
  if (existsSync(join(out, `${name}-${WIDTHS.at(-1)}.jpg`))) { console.log(`${name}: done already`); continue; }
  const full = await decodeJxl(readFileSync(join(src, file)).buffer);
  for (const w of WIDTHS) {
    const width = Math.min(w, full.width);
    const height = Math.round(full.height * width / full.width);
    const img = width === full.width ? full : await resize(full, { width, height, method: 'lanczos3' });
    writeFileSync(join(out, `${name}-${w}.jpg`), Buffer.from(await encodeJpeg(img, { quality: 82, progressive: true })));
    writeFileSync(join(out, `${name}-${w}.jxl`), Buffer.from(await encodeJxl(img, { quality: 80, effort: 7, progressive: true })));
  }
  console.log(`${name}: ${full.width}x${full.height}`);
}

// ---- The page. Sizes and dimensions are read from the files, so photos.json only holds words.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function jpegSize(file) {
  const b = readFileSync(file);
  for (let i = 2; i < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
}
const bytes = f => statSync(join(out, f)).size;
const sets = JSON.parse(readFileSync(join(site, 'photos.json'), 'utf8'));
const html = sets.map(set => {
  const figures = set.photos.map((p, n) => {
    const { width, height } = jpegSize(join(out, `${p.file}-1000.jpg`));
    const srcset = ext => WIDTHS.map(w => `photos/${p.file}-${w}.${ext} ${w}w`).join(', ');
    return `<figure id="${esc(p.file)}" data-bytes="${esc(JSON.stringify(Object.fromEntries(WIDTHS.flatMap(w => ['jpg', 'jxl'].map(e => [`${w}.${e}`, bytes(`${p.file}-${w}.${e}`)])))))}">
<a href="photos/${esc(p.file)}-${WIDTHS.at(-1)}.jpg" class="open"><span class="load"><picture>
<source type="image/jxl" srcset="${srcset('jxl')}" sizes="(max-width: 1040px) 100vw, 1000px">
<img src="photos/${esc(p.file)}-1000.jpg" srcset="${srcset('jpg')}" sizes="(max-width: 1040px) 100vw, 1000px" width="${width}" height="${height}" alt="${esc(p.alt)}"${n ? ' loading="lazy"' : ''}>
</picture></span></a>
<figcaption><span class="frame">${p.frame}.</span> ${esc(p.caption)}</figcaption>
</figure>`;
  }).join('\n');
  return `<section class="set" id="${esc(set.id)}">
<h2>${esc(set.title)}, ${esc(set.when)}</h2>
<p class="soft">${esc(set.note)}</p>
<div class="gallery">
${figures}
</div>
</section>`;
}).join('\n');
const contents = `<ul class="sets">${sets.map(s => `<li><a href="#${esc(s.id)}">${esc(s.title)}, ${esc(s.when)}</a> <span class="soft">${s.photos.length} photos</span></li>`).join('')}</ul>`;
const page = join(site, 'photos.html');
writeFileSync(page, readFileSync(page, 'utf8').replace(/<!-- photos:start -->[\s\S]*<!-- photos:end -->/, `<!-- photos:start -->\n${contents}\n${html}\n<p class="soft" id="format"></p>\n<!-- photos:end -->`));
console.log(`photos.html: ${sets.length} sets, ${sets.reduce((n, s) => n + s.photos.length, 0)} photos`);
