// The Photos pages. Each photo dump is its own hand-designed page, site/photos/<dump-id>/index.html, with its own
// dump.css and its pictures beside it. This tool never writes a dump page whole: it only fills the markers a page
// chooses to include, and leaves everything outside them alone. The one standardised piece is the switcher:
// photos.html (a square for each country) and the tabs and "next" stub on each dump page.
//
//   node tools/photos.mjs <id> --new[=kit|blank]   start a dump page (from the contact-sheet kit, or nearly empty)
//   node tools/photos.mjs <id> [--fetch]           convert that dump's missing pictures, fill its markers,
//                                                  and refresh the switcher on every page
//   node tools/photos.mjs [--fetch]                the same for every dump
//   node tools/photos.mjs <id> --upload            copy that dump's pictures to R2 (rclone remote r2:), then check them
//   PHOTOS_BASE=https://photos.filipbiljic.com node tools/photos.mjs   pages that load pictures from R2 (commit these)
//   PHOTOS_DONE=1 ...                              leave out the dumps that have no page yet (the published build, on main)
// Run image work niced: nice -n 19 ionice -c3 node tools/photos.mjs <id> --fetch.  PHOTOS.md has the whole procedure.
//
// Markers a page may include (each is <!-- name:start --><!-- name:end -->, filled on every build):
//   meta              <title>, description and share image, in <head>
//   tabs              the switcher between dumps                       (standard)
//   next              the "next" stub                                   (standard)
//   stamp             the small picture on the back-of-print footer
//   sheet             the paper contact sheet: title, facts, every roll  (kit)
//   rolls             only the rolls of film, for a page with its own title (kit)
//   prints            every printed frame as a full-screen print        (kit)
//   print:<file>      one print figure, with caption and camera settings (kit)
//   picture:<file>    one bare picture (JXL + JPEG), opening the viewer; options: sizes=60vw link=no
//                     (a value with spaces goes in double quotes: sizes="(min-width: 900px) 50vw, 100vw")
//   days              one tile per day the dump was shot, each frame a mark; day:<YYYY-MM-DD> for one tile
//   lands             (photos.html only) the squares
//
// Pictures: each printed frame gets a JXL and a JPEG at 1000 and 2000 px plus a 400 px JPEG, in site/photos/<id>/,
// and a copy capped at 4000 px on the long edge for the viewer (<file>-4000.jxl/.jpg; only .jpg for a JPEG original).
// The 4000 px JXL keeps the source's HDR colour encoding and metadata; its JPEG fallback is tone mapped at quality 90.
// JPEG originals keep their metadata and any HDR gain map, with the map resized to half the primary's new dimensions.
// Those copies are gitignored: they are for previewing here and for uploading. Their sizes are kept in photos.json
// ("web"), so pages can be rebuilt on a machine that does not have them.
// Originals can be JPEG XL or JPEG, found in photos-src-local/<id>/ (fetched with --fetch, gitignored) or photos-src/.
// A frame filed in another dump's folder names that folder itself: {"file", "original", "folder": "Rim edited 2025"}.
// --fetch reads each missing original from plex: a JPEG is scaled to 2000 px there with ffmpeg and streamed back
// (and fetched whole as well, for the 4000 px copy),
// a JPEG XL comes whole (nothing on plex decodes it). Camera settings come from the original's first 256 KB and are
// kept in photos.json, so pages rebuild without the originals. A 7000 px JPEG XL takes about 1 GB to decode;
// files are done one at a time.
// A JPEG XL is decoded with libjxl's djxl when it is installed (DJXL, or ~/.local/opt/libjxl/usr/bin/djxl): it reads
// every colour encoding, and tone maps Lightroom's HDR edits to an ordinary screen. The wasm decoder used otherwise
// leaves those nearly black.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { exif, settings } from './exif.mjs';
import { largeJpeg, largeJxl } from './large-photo.mjs';

const args = process.argv.slice(2);
const FETCH = args.includes('--fetch');
const UPLOAD = args.includes('--upload');
const NEW = (args.find(a => a.startsWith('--new')) || '').replace(/^--new=?/, '') || (args.some(a => a.startsWith('--new')) ? 'kit' : '');
const ONLY = args.find(a => !a.startsWith('--')) || '';
const site = process.env.PHOTOS_SITE || 'site';
const SOURCES = ['photos-src-local', 'photos-src'];

// Where the pictures are served from. Unset: site/photos/, relative, for previewing with the local copies.
// PHOTOS_BASE=https://photos.filipbiljic.com: the R2 bucket, for the pages that get committed and published.
// Every image URL on every page is built from this one value.
const MEDIA = (process.env.PHOTOS_BASE || process.env.PHOTOS_MEDIA || 'photos').replace(/\/*$/, '/');
const BUCKET = process.env.PHOTOS_BUCKET || 'r2:filipbiljic-photos';
const PUBLIC = (process.env.PHOTOS_PUBLIC || 'https://photos.filipbiljic.com').replace(/\/*$/, '/');
const absolute = /^([a-z]+:)?\/\//i.test(MEDIA) || MEDIA.startsWith('/');
const media = (depth, ...parts) => (absolute ? '' : '../'.repeat(depth)) + MEDIA + parts.join('/');
const ORIGIN = existsSync('CNAME') ? `https://${readFileSync('CNAME', 'utf8').trim()}/` : '';

const WIDTHS = [1000, 2000];
const THUMB = 400;
const DEPTH = 2; // site/photos/<id>/index.html is two folders below the site root
const depthOf = id => 1 + id.split('/').length; // a place, site/photos/<country>/<place>/index.html, is three
const dir = id => join(site, 'photos', id);
const pagePath = id => join(dir(id), 'index.html');

const listPath = join(site, 'photos.json');
const dumps = JSON.parse(readFileSync(listPath, 'utf8'));
// Countries and places (site/places.json): pages that gather the frames of several dumps. A country names the dumps it
// shelves ("dumps": ["montenegro-2024", "montenegro-2025"]) and stands in for them in the switcher and on photos.html;
// a place sits in a country ("in": "montenegro") and shows the days spent there, from any of its dumps. Both pages are
// made by hand like a dump's; a picture on them names its dump: <!-- picture:montenegro-2025/dsc06009:start -->.
const placesPath = join(site, 'places.json');
const places = existsSync(placesPath) ? JSON.parse(readFileSync(placesPath, 'utf8')) : [];
if (ONLY && !dumps.some(d => d.id === ONLY) && !places.some(c => c.id === ONLY)) { console.error(`${ONLY}: not in site/photos.json or site/places.json. Add {"id", "title", "folder"} and run node tools/library.mjs ${ONLY}`); process.exit(1); }
const mine = d => !ONLY || d.id === ONLY;

// ---- Codecs, loaded only when there is something to encode.
let codec;
async function codecs() {
  if (codec) return codec;
  globalThis.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height, colorSpace: 'srgb' }); } };
  const require = createRequire(import.meta.url);
  const wasm = p => WebAssembly.compile(readFileSync(require.resolve(p)));
  const jxlDec = await import('@jsquash/jxl/decode.js'), jxlEnc = await import('@jsquash/jxl/encode.js');
  const jpgDec = await import('@jsquash/jpeg/decode.js'), jpgEnc = await import('@jsquash/jpeg/encode.js');
  const rs = await import('@jsquash/resize');
  await jxlDec.init(await wasm('@jsquash/jxl/codec/dec/jxl_dec.wasm'));
  await jxlEnc.init(await wasm('@jsquash/jxl/codec/enc/jxl_enc.wasm'));
  await jpgDec.init(await wasm('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'));
  await jpgEnc.init(await wasm('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'));
  await rs.initResize(await wasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'));
  return codec = { decodeJxl: jxlDec.default, encodeJxl: jxlEnc.default, decodeJpeg: jpgDec.default, encodeJpeg: jpgEnc.default, resize: rs.default };
}
const DJXL = process.env.DJXL || join(homedir(), '.local/opt/libjxl/usr/bin/djxl');
// Runs a libjxl tool that sits beside djxl.
const libjxl = (tool, args) => execFileSync(join(dirname(DJXL), tool), args,
  { stdio: 'ignore', env: { ...process.env, LD_LIBRARY_PATH: join(dirname(DJXL), '../lib/x86_64-linux-gnu') } });
// djxl's options for an ordinary screen: sRGB, and an HDR edit tone mapped.
const toScreen = file => ['--color_space=RGB_D65_SRG_Per_SRG', '--num_threads=1',
  ...(readFileSync(file).subarray(0, 262144).includes('crs:HDREditMode="1"') ? ['--display_nits=203'] : [])];
function djxl(file) {
  const tmp = mkdtempSync(join(tmpdir(), 'djxl-')), out = join(tmp, 'x.ppm');
  try {
    libjxl('djxl', [file, out, ...toScreen(file)]);
    // A PPM, 8 or 16 bits a sample (djxl writes the original's depth whatever it is asked).
    const ppm = readFileSync(out), m = ppm.subarray(0, 64).toString('latin1').match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
    const w = +m[1], h = +m[2], max = +m[3], wide = max > 255, rgba = new Uint8ClampedArray(w * h * 4);
    const at = wide ? j => (ppm[j] * 256 + ppm[j + 1]) * 255 / max : j => ppm[j] * 255 / max, step = wide ? 2 : 1;
    for (let i = 0, j = m[0].length; i < rgba.length; i += 4, j += 3 * step) {
      rgba[i] = at(j); rgba[i + 1] = at(j + step); rgba[i + 2] = at(j + 2 * step); rgba[i + 3] = 255;
    }
    return new ImageData(rgba, w, h);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
const decode = async file => {
  const c = await codecs(), b = readFileSync(file).buffer;
  if (!/\.jxl$/i.test(file)) return c.decodeJpeg(b);
  return existsSync(DJXL) ? djxl(file) : c.decodeJxl(b);
};
const shrink = async (img, w) => w >= img.width ? img : (await codecs()).resize(img, { width: w, height: Math.round(img.height * w / img.width), method: 'lanczos3' });

function original(dump, p) {
  for (const d of [join(SOURCES[0], dump.id), ...SOURCES]) for (const ext of ['jxl', 'jpg'])
    if (existsSync(join(d, `${p.file}.${ext}`))) return join(d, `${p.file}.${ext}`);
  return null;
}

// ---- 1. Fetch missing originals from plex.
if (FETCH) {
  const plex = await import('./plex.mjs');
  for (const dump of dumps.filter(mine)) for (const p of dump.photos) {
    const folder = p.folder || dump.folder; // a frame filed in another dump's folder names it: "folder": "Rim edited 2025"
    if (!p.original || !folder) continue;
    if (!p.settings) p.settings = settings(exif(plex.head(folder, p.original)));
    // Fetch a JPEG whole before making its 4000 px copy. Gain maps are resized with their own metadata and MPF index.
    const large = join(dir(dump.id), `${p.file}-4000.jpg`);
    if (/\.jpe?g$/i.test(p.original) && !existsSync(large)) {
      mkdirSync(dir(dump.id), { recursive: true });
      const data = await largeJpeg(plex.whole(folder, p.original));
      writeFileSync(large, data);
      console.log(`fetched ${folder}/${p.original} at 4000 px (${(data.length / 1048576).toFixed(1)} MB)`);
    }
    if (original(dump, p)) continue;
    const to = join(SOURCES[0], dump.id);
    mkdirSync(to, { recursive: true });
    const jpeg = /\.jpe?g$/i.test(p.original);
    const data = jpeg ? plex.resizedJpeg(folder, p.original, WIDTHS.at(-1)) : plex.whole(folder, p.original);
    writeFileSync(join(to, `${p.file}.${jpeg ? 'jpg' : 'jxl'}`), data);
    console.log(`fetched ${folder}/${p.original} (${(data.length / 1048576).toFixed(1)} MB)`);
  }
}

// ---- 2. Convert: the web copies of each printed frame, made once.
for (const dump of dumps.filter(mine)) for (const p of dump.photos) {
  const src = original(dump, p);
  // A JPEG XL original still carries its Exif; a JPEG scaled on plex does not, so its settings came with --fetch.
  if (src && /\.jxl$/i.test(src)) { const s = settings(exif(src)); if (s.taken) p.settings = s; }
  const out = dir(dump.id);
  mkdirSync(out, { recursive: true });
  if (!existsSync(join(out, `${p.file}-${WIDTHS.at(-1)}.jpg`))) {
    if (!src) { console.log(`${dump.id}/${p.file}: ${p.web ? 'no copy here (it is on R2); --fetch to make one for preview' : 'no original here yet; run with --fetch'}`); continue; }
    const { encodeJpeg, encodeJxl } = await codecs();
    const full = await decode(src);
    for (const w of WIDTHS) {
      const img = await shrink(full, w);
      writeFileSync(join(out, `${p.file}-${w}.jpg`), Buffer.from(await encodeJpeg(img, { quality: 82, progressive: true })));
      writeFileSync(join(out, `${p.file}-${w}.jxl`), Buffer.from(await encodeJxl(img, { quality: 80, effort: 7, progressive: true })));
    }
    console.log(`${dump.id}/${p.file}: ${full.width}x${full.height}`);
  }
  // The viewer swaps in the 4000 px copy after the 2000 px one. JXL keeps its original HDR colour encoding;
  // its JPEG fallback is tone mapped. JPEG originals come whole with --fetch so their gain maps and metadata stay.
  if (src && /\.jxl$/i.test(src))
    await largeJxl(src, join(out, `${p.file}-4000.jxl`), join(out, `${p.file}-4000.jpg`));
  if (!existsSync(join(out, `${p.file}-${WIDTHS[0]}.jpg`))) continue;
  if (!existsSync(join(out, `${p.file}-${THUMB}.jpg`))) {
    const { encodeJpeg } = await codecs();
    const small = await shrink(await decode(join(out, `${p.file}-${WIDTHS[0]}.jpg`)), THUMB);
    writeFileSync(join(out, `${p.file}-${THUMB}.jpg`), Buffer.from(await encodeJpeg(small, { quality: 78, progressive: true })));
  }
  // What the pages need to know about the copies, kept so they can be built without them.
  const size = f => { const { width, height } = jpegSize(join(out, f)); return [width, height]; };
  p.web = { [WIDTHS[0]]: size(`${p.file}-${WIDTHS[0]}.jpg`), [THUMB]: size(`${p.file}-${THUMB}.jpg`),
    bytes: Object.fromEntries([...WIDTHS, 4000].flatMap(w => ['jpg', 'jxl'].map(e => [`${w}.${e}`, join(out, `${p.file}-${w}.${e}`)]))
      .filter(([, f]) => existsSync(f)).map(([k, f]) => [k, statSync(f).size])) };
}
writeFileSync(listPath, JSON.stringify(dumps, null, 2) + '\n');

// ---- Upload: one dump's copies to R2, keyed <id>/<file>, the same layout as site/photos/. Never deletes anything there.
if (UPLOAD) {
  if (!ONLY) { console.error('--upload needs a dump id: node tools/photos.mjs <id> --upload'); process.exit(1); }
  const cache = ['--header-upload', 'Cache-Control: public, max-age=31536000, immutable'];
  for (const [ext, type] of [['jpg', 'image/jpeg'], ['jxl', 'image/jxl']])
    execFileSync('rclone', ['copy', dir(ONLY), `${BUCKET}/${ONLY}`, '--include', `*.${ext}`, '--s3-no-check-bucket',
      ...cache, '--header-upload', `Content-Type: ${type}`, '--stats-one-line', '-v'], { stdio: 'inherit' });
  // Check one of each kind the way a browser will get it: a GET (Cloudflare reports HEAD as DYNAMIC), twice, so the second shows HIT.
  const p = dumps.find(d => d.id === ONLY).photos.find(p => p.web);
  if (p) for (const f of [`${p.file}-${WIDTHS[0]}.jxl`, `${p.file}-${WIDTHS[0]}.jpg`]) for (const n of [1, 2]) {
    const r = await fetch(`${PUBLIC}${ONLY}/${f}`);
    await r.arrayBuffer();
    console.log(`${r.status} ${PUBLIC}${ONLY}/${f}  ${r.headers.get('content-type')}  ${r.headers.get('cache-control')}  ${r.headers.get('cf-cache-status')}`);
  }
}

// ---- Words and numbers.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function jpegSize(file) {
  const b = readFileSync(file);
  for (let i = 2; i < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
}
const MODELS = { 'ILCE-7CM2': 'α7C II', 'ILCE-7C': 'α7C', 'ILCE-7M4': 'α7 IV', 'ILCE-7M3': 'α7 III' };
const camera = s => s && s.camera ? s.camera.replace(/(\S+)$/, m => MODELS[m] || m) : '';
const lens = s => s && s.lens ? s.lens.replace(/(\d)mm/, '$1 mm').replace(/\s*\|\s*Art\s*\d+$/, ' Art') : '';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = t => { const [y, m, d] = t.slice(0, 10).split('-'); return { y, m: MONTHS[m - 1], d: +d }; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
function days(from, to) { // "26 and 27 December 2025", "17 to 22 August 2024"
  if (!from) return '';
  const a = day(from), b = day(to || from);
  if (from === to || !to) return `${a.d} ${a.m} ${a.y}`;
  if (a.m === b.m && a.y === b.y) return `${a.d} ${b.d - a.d === 1 ? 'and' : 'to'} ${b.d} ${a.m} ${a.y}`;
  return a.y === b.y ? `${a.d} ${a.m} to ${b.d} ${b.m} ${b.y}` : `${a.d} ${a.m} ${a.y} to ${b.d} ${b.m} ${b.y}`;
}
function months(from, to) { // "December 2025", "April to August 2025"
  if (!from) return '';
  const a = day(from), b = day(to || from);
  if (a.m === b.m && a.y === b.y) return `${a.m} ${a.y}`;
  return a.y === b.y ? `${a.m} to ${b.m} ${a.y}` : `${a.m} ${a.y} to ${b.m} ${b.y}`;
}
const year = d => !d.from ? '' : d.from.slice(0, 4) === (d.to || d.from).slice(0, 4) ? d.from.slice(0, 4) : `${d.from.slice(0, 4)} to ${d.to.slice(0, 4)}`;

// ---- The library, as the pages see it.
function locate(dump, p) {
  for (const [r, roll] of (dump.rolls || []).entries()) {
    const i = roll.files.indexOf(p.original);
    if (i >= 0) return { r, i, roll, label: roll.labels[i], taken: roll.taken && roll.taken[i] };
  }
  return { r: -1, i: -1, roll: null, label: '' };
}
const printed = dump => dump.photos.filter(p => p.web);
const hasPage = e => existsSync(pagePath(e.id));
const byId = new Map(dumps.map(d => [d.id, d]));
const countries = places.filter(c => !c.in);
const countryOf = e => countries.find(c => c.id === e.in || (c.dumps || []).includes(e.id));
const newest = (a, b) => (b.to || '').localeCompare(a.to || '') || a.title.localeCompare(b.title);
const taken = p => (p.settings && p.settings.taken) || '';
// What each country and place page shows: the pictures its markers name, in page order, each once (a cover may repeat a frame).
const PICTURE = /<!-- picture:([\w.-]+)\/([\w.-]+)(?: [^>]*)?:start -->/g;
const shows = new Map(places.filter(hasPage).map(c => [c.id, [...new Set([...readFileSync(pagePath(c.id), 'utf8').matchAll(PICTURE)].map(m => `${m[1]}/${m[2]}`))]
  .map(k => k.split('/')).map(([id, file]) => ({ dump: byId.get(id), file })).filter(x => x.dump)
  .map(({ dump, file }) => ({ dump, p: dump.photos.find(p => p.file === file && p.web) })).filter(x => x.p)]));
// A country spans its dumps; a place spans the frames it shows. Both are named by their years: "2024 and 2025".
const list = words => words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
for (const c of places) {
  const shelved = c.in ? [] : (c.dumps || []).map(id => byId.get(id)).filter(Boolean);
  const dates = c.in ? (shows.get(c.id) || []).map(x => taken(x.p).slice(0, 10)).filter(Boolean).sort() : shelved.flatMap(d => [d.from, d.to]).filter(Boolean).sort();
  Object.assign(c, { shelved, from: dates[0], to: dates.at(-1), frames: c.in ? (shows.get(c.id) || []).length : shelved.reduce((n, d) => n + (d.frames || 0), 0),
    years: list([...new Set(c.in ? (shows.get(c.id) || []).map(x => taken(x.p).slice(0, 4)).filter(Boolean) : shelved.map(year))].sort()) });
}
// The switcher lists dumps and countries; a country takes the place of the dumps it shelves.
// PHOTOS_DONE=1, for the published site: a dump with no page, neither its own nor its country's, is left out as if hidden.
const DONE = !!process.env.PHOTOS_DONE;
const up = d => !d.hidden && (!DONE || hasPage(d) || !!(countryOf(d) && hasPage(countryOf(d))));
const visible = [...dumps.filter(d => up(d) && !countryOf(d)), ...countries.filter(c => !DONE || hasPage(c))].sort(newest);
const listed = dumps.filter(up).sort(newest);
const open = visible.filter(hasPage);
const href = (e, depth) => depth ? `${'../'.repeat(depth - 1)}${e.id}/` : `photos/${e.id}/`;
// Where a frame is shown: the deepest page whose markers name it, else its dump's own page.
const shownAt = new Map();
for (const [id, xs] of shows) for (const { dump, p } of xs) {
  const k = `${dump.id}/${p.file}`;
  if (!shownAt.has(k) || depthOf(id) > depthOf(shownAt.get(k))) shownAt.set(k, id);
}
const pageOf = (dump, p) => { const id = shownAt.get(`${dump.id}/${p.file}`); return id ? places.find(c => c.id === id) : hasPage(dump) ? dump : null; };
const homeOf = dump => hasPage(dump) ? dump : countryOf(dump) && hasPage(countryOf(dump)) ? countryOf(dump) : null;
const when = e => e.years || months(e.from, e.to);
// The viewer's heading for a frame: the place it is shown in and its year, or its dump.
const label = (dump, p) => { const e = pageOf(dump, p); return e && e.in ? `${e.title}, ${taken(p).slice(0, 4)}` : `${dump.title}, ${year(dump)}`; };
const home = depth => `${'../'.repeat(depth)}photos.html`;
const counted = dump => plural(dump.frames, 'frame');
const photo = (dump, file) => dump.photos.find(p => p.file === file && printed(dump).includes(p));
const bytes = (dump, p) => p.web.bytes;
const sized = (p, w) => { const [width, height] = p.web[w]; return { width, height }; };

// ---- Kit: a strip of film, one cell per frame, the printed ones as pictures circled in red.
function strip(dump, roll, r, depth, link, only) {
  const marks = new Map(printed(dump).map(p => [locate(dump, p), p]).filter(([at]) => at.r === r).map(([at, p]) => [at.i, p]));
  return roll.labels.map((label, i) => {
    const p = marks.get(i);
    if (!p) return only ? '' : `<li><span class="slot"></span><span class="n">${esc(label)}</span></li>`;
    const on = link && pageOf(dump, p);
    const to = on ? `${href(on, depth)}#${p.file}` : `#${p.file}`;
    const { width, height } = sized(p, THUMB);
    return `<li class="printed"><a href="${esc(to)}" aria-label="Frame ${esc(label)}${roll.name ? ` of ${esc(roll.name)}` : ''}"><img src="${media(depth, dump.id, `${p.file}-${THUMB}.jpg`)}" width="${width}" height="${height}" alt="" loading="lazy"></a><span class="n">${esc(label)}</span></li>`;
  }).join('');
}
const rollsOf = (dump, depth) => dump.rolls.map((roll, r) => `${dump.rolls.length > 1 || roll.name ? `<h2 class="roll-name">${esc(roll.name || dump.title)} <span>${plural(roll.files.length, 'frame')}${roll.taken && roll.taken[0] ? `, ${(({ d, m }) => `${d} ${m}`)(day(roll.taken.filter(Boolean).sort()[0]))}` : ''}</span></h2>\n` : ''}<ol class="roll">
${strip(dump, roll, r, depth, false)}
</ol>`).join('\n');
function sheet(dump, depth) {
  const gear = [...new Set(printed(dump).map(p => [camera(p.settings), lens(p.settings)].filter(Boolean).join(', ')))].filter(Boolean).join('; ');
  return `<article class="contact" aria-label="${esc(dump.title)}, ${esc(year(dump))}">
<h1 class="title"><span>${esc(dump.title)},</span> <span>${esc(year(dump))}</span></h1>
<p class="facts">${[gear, days(dump.from, dump.to), counted(dump)].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('<i aria-hidden="true"></i>')}</p>
${rollsOf(dump, depth)}
</article>`;
}

// ---- Kit: pictures. Every URL comes from media().
function picture(dump, p, depth, { sizes = '100vw', lazy = true } = {}) {
  const { width, height } = sized(p, WIDTHS[0]);
  const srcset = ext => WIDTHS.map(w => `${media(depth, dump.id, `${p.file}-${w}.${ext}`)} ${w}w`).join(', ');
  return `<picture>
<source type="image/jxl" srcset="${srcset('jxl')}" sizes="${esc(sizes)}">
<img src="${media(depth, dump.id, `${p.file}-1000.jpg`)}" srcset="${srcset('jpg')}" sizes="${esc(sizes)}" width="${width}" height="${height}" alt="${esc(p.alt)}"${lazy ? ' loading="lazy"' : ''}>
</picture>`;
}
const exifLine = p => {
  const s = p.settings || {};
  const when = s.taken ? (({ d, m }) => `${d} ${m}, ${s.taken.slice(11)}`)(day(s.taken)) : '';
  return `${[s.aperture, s.shutter, s.iso].filter(Boolean).join(', ')}${when ? `. ${when}` : ''}.`;
};
// `lead`: the page this print stands for (a dump or a country), named and linked in place of the frame's label.
function print(dump, p, depth, { lazy = true, lead = null } = {}) {
  const { width, height } = sized(p, WIDTHS[0]);
  const at = locate(dump, p);
  const frame = lead
    ? `<a href="${href(lead, depth)}">${esc(lead.title)}, ${esc(when(lead))}</a>.`
    : `${esc(at.label)}${at.roll && at.roll.name && dump.rolls.length > 1 ? ` of ${esc(at.roll.name)}` : ''}.`;
  return `<figure class="print${height > width ? ' tall' : ''}" id="${esc(p.file)}" data-dump="${esc(`${dump.title}, ${year(dump)}`)}" data-bytes="${esc(JSON.stringify(bytes(dump, p)))}">
<a href="${media(depth, dump.id, `${p.file}-${WIDTHS.at(-1)}.jpg`)}" class="open"><span class="load">${picture(dump, p, depth, { lazy })}</span></a>
<figcaption><span class="frame">${frame}</span> ${esc(p.caption)} <span class="exif">${exifLine(p)}</span></figcaption>
</figure>`;
}
// A bare picture for a page's own composition; it still opens the viewer and still names the frame.
const bare = (dump, p, depth, o) => o.link === 'no' ? picture(dump, p, depth, { sizes: o.sizes, lazy: o.lazy !== 'no' })
  : `<a class="open" id="${esc(p.file)}" href="${media(depth, dump.id, `${p.file}-${WIDTHS.at(-1)}.jpg`)}" data-view data-dump="${esc(label(dump, p))}" data-caption="${esc(`${p.caption} ${exifLine(p)}`)}" data-bytes="${esc(JSON.stringify(bytes(dump, p)))}">${picture(dump, p, depth, { sizes: o.sizes, lazy: o.lazy !== 'no' })}</a>`;

// ---- Kit: one tile per day the dump was shot, each frame a mark, the printed ones filled.
function dayTiles(dump, only) {
  const byDay = new Map();
  const marked = new Set(printed(dump).map(p => p.original));
  for (const roll of dump.rolls) roll.files.forEach((f, i) => {
    const t = roll.taken && roll.taken[i], k = t ? t.slice(0, 10) : 'undated';
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push({ t: t || '', printed: marked.has(f), file: (printed(dump).find(p => p.original === f) || {}).file });
  });
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).filter(([k]) => !only || k === only).map(([k, frames]) => {
    frames.sort((a, b) => a.t.localeCompare(b.t));
    const date = k === 'undated' ? '<span class="d">?</span> <span class="m">no date</span>' : (({ d, m }) => `<span class="d">${d}</span> <span class="m">${m}</span>`)(day(k));
    return `<li class="day" id="day-${k}"><p class="date">${date}</p><p class="count">${plural(frames.length, 'frame')}</p><span class="marks" aria-hidden="true">${frames.map(f => f.printed ? `<i class="printed"></i>` : '<i></i>').join('')}</span></li>`;
  }).join('\n');
}

// ---- Standard: the switcher. Dumps without a page yet are listed, not linked; a country stands for its dumps.
const at = (d, p) => { const a = locate(d, p); return d.rolls.slice(0, Math.max(0, a.r)).reduce((n, r) => n + r.files.length, 0) + a.i; };
function marks(e) {
  let before = 0;
  return (e.shelved || [e]).flatMap(d => {
    const ms = printed(d).filter(p => locate(d, p).r >= 0).map(p => `<i style="--at:${((before + at(d, p) + 0.5) / e.frames * 100).toFixed(1)}%"></i>`);
    before += d.frames;
    return ms;
  }).join('');
}
function tabs(current, depth) {
  const items = visible.map(d => {
    const inner = `<span class="place">${esc(d.title)}</span> <span class="yr">${esc(d.shelved ? d.years : year(d))}</span> <span class="n">${d.frames}<span class="vh"> frames</span></span><span class="bar" style="--w:${Math.min(1, d.frames / 80).toFixed(3)}" aria-hidden="true">${marks(d)}</span>`;
    if (d === current) return `<li class="here"><a href="${href(d, depth)}" aria-current="page">${inner}</a></li>`;
    return hasPage(d) ? `<li><a href="${href(d, depth)}">${inner}</a></li>` : `<li class="sealed"><span title="Not up yet">${inner}</span></li>`;
  }).join('\n');
  return `<div class="tabs" role="navigation" aria-label="Photos">
<p class="all"><a href="${home(depth)}">All photos</a></p>
<ol>
${items}
</ol>
</div>`;
}
// A place's way on is the next place in its country (the last goes round to the first), and the country itself. A place
// can name its own way on instead ("next": "belgrade#bg-title"): Paris ends on the flight to Belgrade.
function next(e, depth) {
  const country = e.in && countries.find(c => c.id === e.in);
  const row = country ? places.filter(x => x.in === e.in && hasPage(x)) : open;
  const [to, at] = (e.next || '').split('#');
  const named = to && places.find(x => x.id === to && hasPage(x));
  const i = row.indexOf(e), n = named || row[(i + 1) % row.length];
  const name = x => x.in || named ? esc(x.title) : `${esc(x.title)}, ${esc(when(x))}`;
  return `${n && n !== e ? `<p class="next">Next: <a href="${href(n, depth)}${named && at ? '#' + at : ''}">${name(n)}</a></p>\n` : ''}${country && hasPage(country) ? `<p><a href="${href(country, depth)}">${esc(country.title)}</a></p>\n` : ''}<p><a href="${home(depth)}">All photos</a></p>`;
}
// The places of a country, the one shown marked: <!-- places:start --> on the country's page and on each place's.
function placeList(e, depth) {
  const country = e.in ? countries.find(c => c.id === e.in) : e;
  return `<ol class="places">
${places.filter(x => x.in === country.id).map(x => {
    const inner = `<span class="place">${esc(x.title)}</span> <span class="yr">${esc(x.years)}</span>`;
    if (x === e) return `<li class="here"><a href="${href(x, depth)}" aria-current="page">${inner}</a></li>`;
    return hasPage(x) ? `<li><a href="${href(x, depth)}">${inner}</a></li>` : `<li class="sealed"><span title="Not up yet">${inner}</span></li>`;
  }).join('\n')}
</ol>`;
}
const first = e => e.shelved || e.in ? (shows.get(e.id) || [])[0] : printed(e)[0] && { dump: e, p: printed(e)[0] };
function meta(e) {
  const country = e.in && countries.find(c => c.id === e.in);
  const title = country ? `${e.title}, ${country.title}` : `${e.title}, ${e.shelved ? e.years : year(e)}`;
  const x = first(e);
  const image = x ? (absolute ? '' : ORIGIN) + media(0, x.dump.id, `${x.p.file}-1000.jpg`) : '';
  return `<title>${esc(title)} - Photos - Filip Biljić</title>
<meta name="description" content="${esc(`${title}. Photos by Filip Biljić.`)}">
<meta property="og:title" content="${esc(title)}">${image ? `\n<meta property="og:image" content="${esc(image)}">` : ''}`;
}
const stamp = (e, depth) => { const x = e && first(e); return x ? `<img class="stamp" src="${media(depth, x.dump.id, `${x.p.file}-${THUMB}.jpg`)}" width="400" height="${sized(x.p, THUMB).height}" alt="" loading="lazy">` : ''; };

// ---- Standard: the front of Photos (photos.html). A square of clear glass for each country with a page and for each city
// with no country page, its name as its sign writes it, the whole square its link (site/photos/lands.css); the places of a
// country are reached from the country's page. A "sign" is the name as the page's own sign writes it ("Roma").
const cyrillic = s => /[\u0400-\u04FF]/.test(s) ? ' lang="sr-Cyrl"' : '';
const signOf = x => {
  const s = x.sign || x.title;
  return `<span class="nm"${cyrillic(s)}${x.sign ? ' aria-hidden="true"' : ''}>${s.split(' ').map(w => `<span>${esc(w)}</span>`).join(' ')}</span>${x.sign ? `<span class="vh">${esc(x.title)}</span>` : ''}`;
};
// Behind the squares, Filip's pixel-sorted film, from the Colosseum round to the Colosseum (the loop files are kept off
// git, beside the pictures). lands.css and lands.js carry a hash of their contents, so no browser pairs the page with an
// old copy.
const ver = f => createHash('sha1').update(readFileSync(join(site, 'photos', f))).digest('hex').slice(0, 8);
// The credit the Paris arms on the squares ask for, at the foot of photos.html, inside the back of the print.
const landsCredit = () => `<p class="credit">Arms of Paris after <a href="https://commons.wikimedia.org/wiki/File:Blason_paris_75.svg">Thom.lanaud</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a></p>`;
// A glimpse of each place on its square: the first picture its page opens with, faint under the glass until the square is
// pointed at, or on a phone until it comes near the middle of the screen (lands.js).
// Filip's picks stand in for the page's first picture where he chose one.
const GLIMPSE = { france: 'centre-pompidou-2025/pompidou-3', ljubljana: 'ljubljana-2025-08/hdr-18', italy: 'rome-2025/last-day-2', 'amsterdam-2023': 'amsterdam-2023/dsc03794' };
const glimpse = e => {
  const f = join(site, href(e, 0), 'index.html');
  const m = GLIMPSE[e.id] ? [, media(0, `${GLIMPSE[e.id]}-1000.jpg`)] : existsSync(f) && readFileSync(f, 'utf8').match(/<img[^>]*src="([^"]+-1000\.jpg)"/);
  return m ? `<img class="glimpse" src="${m[1]}" alt="" loading="lazy" decoding="async">\n` : '';
};
// The bending of the glass, "Liquid glass: on" at the foot of the page, in Chromium only (lands.css). A map stretched over each pane: red is how far a point looks left or
// right, green up or down, flat in the middle and steepest at the edges; blue is the rim, where the bending shows. The
// film is moved by the map three times, a little less each time, for the red, the green and the blue of it, put back
// together and kept sharp on the rim; inside the rim it is only frosted.
const ramp = (id, c, dir) => `<linearGradient id="${id}"${dir}>${[[0, 255], [.035, 208], [.09, 156], [.16, 128], [.84, 128], [.91, 100], [.965, 48], [1, 0]]
  .map(([o, v]) => `<stop offset="${o}" stop-color="${c(v)}"/>`).join('')}</linearGradient>`;
const rim = (id, dir) => `<linearGradient id="${id}"${dir}>${[[0, 255], [.05, 190], [.12, 40], [.17, 0], [.83, 0], [.88, 40], [.95, 190], [1, 255]]
  .map(([o, v]) => `<stop offset="${o}" stop-color="rgb(0,0,${v})"/>`).join('')}</linearGradient>`;
const hex = v => v.toString(16).padStart(2, '0');
const lensMap = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" preserveAspectRatio="none">\
${ramp('x', v => `#${hex(v)}0000`, '')}${ramp('y', v => `#00${hex(v)}00`, ' x2="0" y2="1"')}${rim('u', '')}${rim('v', ' x2="0" y2="1"')}\
<rect width="400" height="400" fill="url(#x)"/><g style="mix-blend-mode:screen"><rect width="400" height="400" fill="url(#y)"/></g>\
<g style="mix-blend-mode:screen"><rect width="400" height="400" fill="url(#u)"/></g><g style="mix-blend-mode:screen"><rect width="400" height="400" fill="url(#v)"/></g></svg>`);
const glassLens = `<svg class="lens" aria-hidden="true" focusable="false"><filter id="ld-lens" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
<feImage href="${lensMap}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map"/>
<feGaussianBlur in="SourceGraphic" stdDeviation=".035" edgeMode="duplicate" result="frost"/>
<feDisplacementMap in="SourceGraphic" in2="map" scale=".2" xChannelSelector="R" yChannelSelector="G" result="dr"/>
<feColorMatrix in="dr" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>
<feDisplacementMap in="SourceGraphic" in2="map" scale=".17" xChannelSelector="R" yChannelSelector="G" result="dg"/>
<feColorMatrix in="dg" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>
<feDisplacementMap in="SourceGraphic" in2="map" scale=".14" xChannelSelector="R" yChannelSelector="G" result="db"/>
<feColorMatrix in="db" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>
<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen" result="bent"/>
<feColorMatrix in="map" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0" result="rim"/>
<feComposite in="bent" in2="rim" operator="in" result="edge"/>
<feComposite in="edge" in2="frost" operator="over"/>
</filter></svg>`;
function lands() {
  return `<section class="set lands" aria-labelledby="ph-title">
<link rel="stylesheet" href="photos/lands.css?v=${ver('lands.css')}">
${glassLens}
<div class="reel" aria-hidden="true"><video muted playsinline loop preload="none" width="1920" height="1080" poster="${media(0, 'broll-pixelsort-poster-960.jpg')}">
<source src="${media(0, 'broll-pixelsort-960.mp4')}" type="video/mp4" media="(max-width: 899px)">
<source src="${media(0, 'broll-pixelsort-1920.mp4')}" type="video/mp4">
</video></div>
<h1 class="title" id="ph-title">Photos</h1>
<ol class="squares">
${open.map(e => `<li class="land" data-land="${esc(e.id)}">
${glimpse(e)}<h2 class="name"><a href="${href(e, 0)}">${signOf(e)}</a></h2>
</li>`).join('\n')}
</ol>
<script src="photos/lands.js?v=${ver('lands.js')}" defer></script>
</section>`;
}

// ---- Markers. <!-- name[:arg][ key=value ...]:start --> ... <!-- name[:arg]:end -->; a value may be "in quotes".
const MARKER = /<!-- ([a-z]+)((?::[\w.\/-]+)?)((?: [a-z]+=(?:"[^"]*"|[^\s>"]+))*):start -->[\s\S]*?<!-- \1\2:end -->/g;
const options = opts => Object.fromEntries([...opts.matchAll(/([a-z]+)=(?:"([^"]*)"|(\S+))/g)].map(m => [m[1], m[2] ?? m[3]]));
function fill(html, make, where) {
  return html.replace(MARKER, (all, name, arg, opts) => {
    const o = options(opts);
    const body = make(name, arg.slice(1), o);
    if (body == null) { console.log(`${where}: nothing to put in <!-- ${name}${arg} -->; left as it was`); return all; }
    return `<!-- ${name}${arg}${opts}:start -->\n${body}\n<!-- ${name}${arg}:end -->`;
  });
}
const KEEP = Symbol('keep');
// Everything a dump page can ask for. `full` is false when only the switcher is being refreshed.
function dumpParts(dump, full) {
  return (name, arg, o) => {
    if (name === 'tabs') return tabs(dump, DEPTH);
    if (name === 'next') return next(dump, DEPTH);
    if (!full) return KEEP;
    if (name === 'meta') return meta(dump);
    if (name === 'stamp') return stamp(dump, DEPTH);
    if (name === 'sheet') return sheet(dump, DEPTH);
    if (name === 'rolls') return rollsOf(dump, DEPTH);
    if (name === 'prints') return printed(dump).map((p, n) => print(dump, p, DEPTH, { lazy: n > 0 })).join('\n');
    if (name === 'days') return dayTiles(dump);
    if (name === 'day') return dayTiles(dump, arg) || null;
    const p = arg && photo(dump, arg);
    if (name === 'print') return p ? print(dump, p, DEPTH, { lazy: o.lazy !== 'no' }) : null;
    if (name === 'picture') return p ? bare(dump, p, DEPTH, o) : null;
    return null;
  };
}
// Everything a country's or a place's page can ask for. Its pictures name their dumps: picture:<dump>/<file>.
function placeParts(e, full) {
  const depth = depthOf(e.id), country = e.in ? countries.find(c => c.id === e.in) : e;
  return (name, arg, o) => {
    if (name === 'tabs') return tabs(country, depth);
    if (name === 'next') return next(e, depth);
    if (name === 'places') return placeList(e, depth);
    if (!full) return KEEP;
    if (name === 'meta') return meta(e);
    if (name === 'stamp') return stamp(e, depth) || null;
    const [id, file] = arg.split('/'), dump = byId.get(id), p = dump && file && photo(dump, file);
    if (name === 'picture') return p ? bare(dump, p, depth, o) : null;
    return null;
  };
}
function fillPage(html, parts, where) {
  // A refresh leaves every marker but the switcher's exactly as it was.
  return html.replace(MARKER, (all, name, arg, opts) => {
    const o = options(opts);
    const body = parts(name, arg.slice(1), o);
    if (body === KEEP) return all;
    if (body == null) { console.log(`${where}: nothing to put in <!-- ${name}${arg} -->; left as it was`); return all; }
    return `<!-- ${name}${arg}${opts}:start -->\n${body}\n<!-- ${name}${arg}:end -->`;
  });
}

// ---- A new dump page: the site's head, nav and footer from photos.html one folder down, and a starting <main>.
const indexPath = join(site, 'photos.html');
if (NEW) {
  const dump = dumps.find(d => d.id === ONLY);
  if (!dump) { console.error('--new needs a dump id: node tools/photos.mjs <id> --new'); process.exit(1); }
  if (hasPage(dump)) { console.error(`${pagePath(dump.id)} already exists; it is yours now, edit it by hand`); process.exit(1); }
  const kit = NEW === 'blank' ? 'blank' : 'kit';
  const fromKit = f => readFileSync(new URL(`kit/${f}`, import.meta.url), 'utf8').replaceAll('{{id}}', dump.id).replaceAll('{{title}}', esc(dump.title)).replaceAll('{{year}}', esc(year(dump))).replaceAll('{{note}}', esc(dump.note || ''));
  const chrome = readFileSync(indexPath, 'utf8')
    .replace(/<title>[^<]*<\/title>/, '<!-- meta:start -->\n<!-- meta:end -->')
    .replace(/<!-- lands:start -->[\s\S]*<!-- lands:end -->/, '')
    .replace(/\n?<!-- credit:start -->[\s\S]*<!-- credit:end -->/, '')
    .replace(/\s(href|src)="(?![a-z]+:|#|\/)([^"]*)"/gi, (m, a, u) => ` ${a}="${'../'.repeat(DEPTH)}${u}"`)
    .replace('<b>Photos</b>', `<a href="${home(DEPTH)}">Photos</a>`)
    .replace(/<main>[\s\S]*<\/main>/, () => `<main data-dump="${dump.id}">\n<link rel="stylesheet" href="dump.css">\n${fromKit(`${kit}.html`).trim()}\n</main>`);
  mkdirSync(dir(dump.id), { recursive: true });
  writeFileSync(pagePath(dump.id), chrome);
  if (!existsSync(join(dir(dump.id), 'dump.css'))) writeFileSync(join(dir(dump.id), 'dump.css'), fromKit('dump.css'));
  open.push(dump); open.sort((a, b) => visible.indexOf(a) - visible.indexOf(b));
  console.log(`started ${pagePath(dump.id)} and dump.css from the ${kit}`);
}

// ---- 3. Fill: this dump's page in full, the switcher on every page, and the squares on photos.html. A country's and its places'
// pages are filled in full when one of their dumps (or the country itself) is named, or when none is.
for (const dump of dumps.filter(hasPage)) {
  const path = pagePath(dump.id);
  writeFileSync(path, fillPage(readFileSync(path, 'utf8'), dumpParts(dump, mine(dump)), path));
}
for (const e of places.filter(hasPage)) {
  const path = pagePath(e.id), country = e.in ? countries.find(c => c.id === e.in) : e;
  const full = !ONLY || ONLY === country.id || ONLY === e.id || (country.dumps || []).includes(ONLY);
  writeFileSync(path, fillPage(readFileSync(path, 'utf8'), placeParts(e, full), path));
}
writeFileSync(indexPath, fill(readFileSync(indexPath, 'utf8'), name => name === 'lands' ? lands() : name === 'credit' ? landsCredit() : name === 'stamp' ? stamp(open.find(first), 0) : null, indexPath));
for (const dump of listed) if (printed(dump).length && !homeOf(dump)) console.log(`${dump.id}: has prints but no page; start one with node tools/photos.mjs ${dump.id} --new${countryOf(dump) ? `, or show them on ${countryOf(dump).id}'s pages` : ''}`);
console.log(`photos.html: ${listed.length} dumps, ${open.length} pages in the switcher${places.filter(hasPage).length ? `, ${places.filter(hasPage).length} country and place pages` : ''}${ONLY ? `; filled ${ONLY}` : ''}; pictures from ${absolute ? MEDIA : `site/${MEDIA} (local preview; set PHOTOS_BASE before committing)`}`);
