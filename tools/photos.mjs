// The Photos pages. Each photo dump is its own hand-designed page, site/photos/<dump-id>/index.html, with its own
// dump.css and its pictures beside it. This tool never writes a dump page whole: it only fills the markers a page
// chooses to include, and leaves everything outside them alone. The one standardised piece is the switcher:
// photos.html (the archive box, every dump newest first) and the tabs and "next" stub on each dump page.
//
//   node tools/photos.mjs <id> --new[=kit|blank]   start a dump page (from the contact-sheet kit, or nearly empty)
//   node tools/photos.mjs <id> [--fetch]           convert that dump's missing pictures, fill its markers,
//                                                  and refresh the switcher on every page
//   node tools/photos.mjs [--fetch]                the same for every dump
//   node tools/photos.mjs <id> --upload            copy that dump's pictures to R2 (rclone remote r2:), then check them
//   PHOTOS_BASE=https://photos.filipbiljic.com node tools/photos.mjs   pages that load pictures from R2 (commit these)
// Run image work niced: nice -n 19 ionice -c3 node tools/photos.mjs <id> --fetch.  PHOTOS.md has the whole procedure.
//
// Markers a page may include (each is <!-- name:start --><!-- name:end -->, filled on every build):
//   meta              <title>, description and share image, in <head>
//   tabs              the switcher between dumps                       (standard)
//   next              the "next in the box" stub                        (standard)
//   stamp             the small picture on the back-of-print footer
//   sheet             the paper contact sheet: title, facts, every roll  (kit)
//   rolls             only the rolls of film, for a page with its own title (kit)
//   prints            every printed frame as a full-screen print        (kit)
//   print:<file>      one print figure, with caption and camera settings (kit)
//   picture:<file>    one bare picture (JXL + JPEG), opening the viewer; options: sizes=60vw link=no
//   days              one tile per day the dump was shot, each frame a mark; day:<YYYY-MM-DD> for one tile
//   archive           (photos.html only) the box itself
//
// Pictures: each printed frame gets a JXL and a JPEG at 1000 and 2000 px plus a 400 px JPEG, in site/photos/<id>/.
// Those copies are gitignored: they are for previewing here and for uploading. Their sizes are kept in photos.json
// ("web"), so pages can be rebuilt on a machine that does not have them.
// Originals can be JPEG XL or JPEG, found in photos-src-local/<id>/ (fetched with --fetch, gitignored) or photos-src/.
// --fetch reads each missing original from plex: a JPEG is scaled to 2000 px there with ffmpeg and streamed back,
// a JPEG XL comes whole (nothing on plex decodes it). Camera settings come from the original's first 256 KB and are
// kept in photos.json, so pages rebuild without the originals. A 7000 px JPEG XL takes about 1 GB to decode;
// files are done one at a time.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { exif, settings } from './exif.mjs';

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
const dir = id => join(site, 'photos', id);
const pagePath = id => join(dir(id), 'index.html');

const listPath = join(site, 'photos.json');
const dumps = JSON.parse(readFileSync(listPath, 'utf8'));
if (ONLY && !dumps.some(d => d.id === ONLY)) { console.error(`${ONLY}: not in site/photos.json. Add {"id", "title", "folder"} and run node tools/library.mjs ${ONLY}`); process.exit(1); }
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
const decode = async file => { const c = await codecs(), b = readFileSync(file).buffer; return /\.jxl$/i.test(file) ? c.decodeJxl(b) : c.decodeJpeg(b); };
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
    if (!p.original || !dump.folder) continue;
    if (!p.settings) p.settings = settings(exif(plex.head(dump.folder, p.original)));
    if (original(dump, p)) continue;
    const to = join(SOURCES[0], dump.id);
    mkdirSync(to, { recursive: true });
    const jpeg = /\.jpe?g$/i.test(p.original);
    const data = jpeg ? plex.resizedJpeg(dump.folder, p.original, WIDTHS.at(-1)) : plex.whole(dump.folder, p.original);
    writeFileSync(join(to, `${p.file}.${jpeg ? 'jpg' : 'jxl'}`), data);
    console.log(`fetched ${dump.folder}/${p.original} (${(data.length / 1048576).toFixed(1)} MB)`);
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
  if (!existsSync(join(out, `${p.file}-${WIDTHS[0]}.jpg`))) continue;
  if (!existsSync(join(out, `${p.file}-${THUMB}.jpg`))) {
    const { encodeJpeg } = await codecs();
    const small = await shrink(await decode(join(out, `${p.file}-${WIDTHS[0]}.jpg`)), THUMB);
    writeFileSync(join(out, `${p.file}-${THUMB}.jpg`), Buffer.from(await encodeJpeg(small, { quality: 78, progressive: true })));
  }
  // What the pages need to know about the copies, kept so they can be built without them.
  const size = f => { const { width, height } = jpegSize(join(out, f)); return [width, height]; };
  p.web = { [WIDTHS[0]]: size(`${p.file}-${WIDTHS[0]}.jpg`), [THUMB]: size(`${p.file}-${THUMB}.jpg`),
    bytes: Object.fromEntries(WIDTHS.flatMap(w => ['jpg', 'jxl'].map(e => [`${w}.${e}`, statSync(join(out, `${p.file}-${w}.${e}`)).size]))) };
}
writeFileSync(listPath, JSON.stringify(dumps, null, 2) + '\n');

// ---- Upload: one dump's copies to R2, keyed <id>/<file>, the same layout as site/photos/. Never deletes anything there.
if (UPLOAD) {
  if (!ONLY) { console.error('--upload needs a dump id: node tools/photos.mjs <id> --upload'); process.exit(1); }
  const { execFileSync } = await import('node:child_process');
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
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const words = n => NUMBERS[n] || String(n);
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
const hasPage = dump => existsSync(pagePath(dump.id));
const visible = dumps.filter(d => !d.hidden).sort((a, b) => (b.to || '').localeCompare(a.to || '') || a.title.localeCompare(b.title));
const open = visible.filter(hasPage);
const href = (dump, depth) => depth ? `${'../'.repeat(depth - 1)}${dump.id}/` : `photos/${dump.id}/`;
const home = depth => `${'../'.repeat(depth)}photos.html`;
const counted = dump => {
  const n = printed(dump).length;
  return `${plural(dump.frames, 'frame')}${dump.rolls.length > 1 ? ` in ${words(dump.rolls.length)} rolls` : ''}, ${n ? `${words(n)} printed` : 'none printed yet'}`;
};
const photo = (dump, file) => dump.photos.find(p => p.file === file && printed(dump).includes(p));
const bytes = (dump, p) => p.web.bytes;
const sized = (p, w) => { const [width, height] = p.web[w]; return { width, height }; };

// ---- Kit: a strip of film, one cell per frame, the printed ones as pictures circled in red.
function strip(dump, roll, r, depth, link) {
  const marks = new Map(printed(dump).map(p => [locate(dump, p), p]).filter(([at]) => at.r === r).map(([at, p]) => [at.i, p]));
  return roll.labels.map((label, i) => {
    const p = marks.get(i);
    if (!p) return `<li><span class="slot"></span><span class="n">${esc(label)}</span></li>`;
    const to = link ? `${href(dump, depth)}#${p.file}` : `#${p.file}`;
    const { width, height } = sized(p, THUMB);
    return `<li class="printed"><a href="${esc(to)}" aria-label="Frame ${esc(label)}${roll.name ? ` of ${esc(roll.name)}` : ''}: ${esc(p.caption)}"><img src="${media(depth, dump.id, `${p.file}-${THUMB}.jpg`)}" width="${width}" height="${height}" alt="" loading="lazy"></a><span class="n">${esc(label)}</span></li>`;
  }).join('');
}
const rollsOf = (dump, depth) => dump.rolls.map((roll, r) => `${dump.rolls.length > 1 || roll.name ? `<h2 class="roll-name">${esc(roll.name || dump.title)} <span>${plural(roll.files.length, 'frame')}${roll.taken && roll.taken[0] ? `, ${(({ d, m }) => `${d} ${m}`)(day(roll.taken.filter(Boolean).sort()[0]))}` : ''}</span></h2>\n` : ''}<ol class="roll">
${strip(dump, roll, r, depth, false)}
</ol>`).join('\n');
function sheet(dump, depth) {
  const gear = [...new Set(printed(dump).map(p => [camera(p.settings), lens(p.settings)].filter(Boolean).join(', ')))].filter(Boolean).join('; ');
  return `<article class="contact" aria-label="Contact sheet for ${esc(dump.title)}, ${esc(year(dump))}">
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
function print(dump, p, depth, { lazy = true, lead = false } = {}) {
  const { width, height } = sized(p, WIDTHS[0]);
  const at = locate(dump, p);
  const frame = lead
    ? `<a href="${href(dump, depth)}">${esc(dump.title)}, ${esc(months(dump.from, dump.to))}</a>.`
    : `${esc(at.label)}${at.roll && at.roll.name && dump.rolls.length > 1 ? ` of ${esc(at.roll.name)}` : ''}.`;
  return `<figure class="print${height > width ? ' tall' : ''}" id="${esc(p.file)}" data-dump="${esc(`${dump.title}, ${year(dump)}`)}" data-bytes="${esc(JSON.stringify(bytes(dump, p)))}">
<a href="${media(depth, dump.id, `${p.file}-${WIDTHS.at(-1)}.jpg`)}" class="open"><span class="load">${picture(dump, p, depth, { lazy })}</span></a>
<figcaption><span class="frame">${frame}</span> ${esc(p.caption)} <span class="exif">${exifLine(p)}</span></figcaption>
</figure>`;
}
// A bare picture for a page's own composition; it still opens the viewer and still names the frame.
const bare = (dump, p, depth, o) => o.link === 'no' ? picture(dump, p, depth, { sizes: o.sizes, lazy: o.lazy !== 'no' })
  : `<a class="open" id="${esc(p.file)}" href="${media(depth, dump.id, `${p.file}-${WIDTHS.at(-1)}.jpg`)}" data-view data-dump="${esc(`${dump.title}, ${year(dump)}`)}" data-caption="${esc(`${p.caption} ${exifLine(p)}`)}" data-bytes="${esc(JSON.stringify(bytes(dump, p)))}">${picture(dump, p, depth, { sizes: o.sizes, lazy: o.lazy !== 'no' })}</a>`;

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
    const n = frames.filter(f => f.printed).length;
    const date = k === 'undated' ? '<span class="d">?</span> <span class="m">no date</span>' : (({ d, m }) => `<span class="d">${d}</span> <span class="m">${m}</span>`)(day(k));
    return `<li class="day" id="day-${k}"><p class="date">${date}</p><p class="count">${plural(frames.length, 'frame')}${n ? `, ${words(n)} printed` : ''}</p><span class="marks" aria-hidden="true">${frames.map(f => f.printed ? `<i class="printed"></i>` : '<i></i>').join('')}</span></li>`;
  }).join('\n');
}

// ---- Standard: the switcher. The box's tabs, the pulled-out one in paper; dumps without a page yet are listed, not linked.
function tabs(current, depth) {
  const items = visible.map(d => {
    const marks = printed(d).map(p => {
      const at = locate(d, p);
      const before = d.rolls.slice(0, Math.max(0, at.r)).reduce((n, r) => n + r.files.length, 0);
      return `<i style="--at:${((before + at.i + 0.5) / d.frames * 100).toFixed(1)}%"></i>`;
    }).join('');
    const inner = `<span class="place">${esc(d.title)}</span> <span class="yr">${esc(year(d))}</span> <span class="n">${d.frames}<span class="vh"> frames</span></span><span class="bar" style="--w:${Math.min(1, d.frames / 80).toFixed(3)}" aria-hidden="true">${marks}</span>`;
    if (d === current) return `<li class="here"><a href="${href(d, depth)}" aria-current="page">${inner}</a></li>`;
    return hasPage(d) ? `<li><a href="${href(d, depth)}">${inner}</a></li>` : `<li class="sealed"><span title="Not printed yet">${inner}</span></li>`;
  }).join('\n');
  return `<div class="tabs" role="navigation" aria-label="Photo dumps">
<p class="all"><a href="${home(depth)}">All ${words(visible.length)} dumps</a></p>
<ol>
${items}
</ol>
</div>`;
}
function next(dump, depth) {
  const i = open.indexOf(dump), n = open[(i + 1) % open.length];
  return `${n && n !== dump ? `<p class="next">Next in the box: <a href="${href(n, depth)}">${esc(n.title)}, ${esc(months(n.from, n.to))}</a>, ${esc(counted(n))}.</p>\n` : ''}<p><a href="${home(depth)}">All ${words(visible.length)} dumps</a>, newest first.</p>`;
}
function meta(dump) {
  const title = `${dump.title}, ${year(dump)}`;
  const p = printed(dump)[0];
  const image = p ? (absolute ? '' : ORIGIN) + media(0, dump.id, `${p.file}-1000.jpg`) : '';
  return `<title>${esc(title)} - Photos - Filip Biljic</title>
<meta name="description" content="${esc(`${title}: ${counted(dump)}. Photographs by Filip Biljic.`)}">
<meta property="og:title" content="${esc(title)}">${image ? `\n<meta property="og:image" content="${esc(image)}">` : ''}`;
}
const stamp = (dump, depth) => { const p = dump && printed(dump)[0]; return p ? `<img class="stamp" src="${media(depth, dump.id, `${p.file}-${THUMB}.jpg`)}" width="400" height="${sized(p, THUMB).height}" alt="" loading="lazy">` : ''; };

// ---- Standard: the archive box (photos.html). Every dump as a sleeve, grouped by year, newest first.
function sleeve(dump) {
  const place = `<span class="place">${esc(dump.title)}</span> <span class="when">${esc(months(dump.from, dump.to))}</span> <span class="count">${esc(counted(dump))}</span>`;
  const strips = dump.rolls.map((roll, r) => `<div class="strip">${roll.name ? `<p class="edge">${esc(roll.name)}</p>` : ''}<ol aria-label="${esc(`${roll.name || dump.title}, ${plural(roll.files.length, 'frame')}`)}">${strip(dump, roll, r, 0, hasPage(dump))}</ol></div>`).join('');
  return `<li class="sleeve${hasPage(dump) ? '' : ' sealed'}">${hasPage(dump) ? `<a class="label" href="${href(dump, 0)}">${place}</a>` : `<p class="label">${place}</p>`}<div class="strips">${strips}</div></li>`;
}
function archive() {
  const years = [...new Set(visible.map(d => (d.to || d.from || '').slice(0, 4)))];
  const leads = open.filter(d => printed(d).length).slice(0, 4);
  return `<section class="set archive" id="dumps">
<div class="field">
<article class="contact box" aria-label="Every photo dump">
<h1 class="title"><span>Photos,</span> <span>?? to today</span></h1>
${years.map(y => `<section class="shelf" aria-label="${y}">
<h2 class="year">${y}</h2>
<ol class="sleeves">
${visible.filter(d => (d.to || d.from || '').startsWith(y)).map(sleeve).join('\n')}
</ol>
</section>`).join('\n')}
</article>
</div>
<div class="prints">
${leads.map((d, n) => print(d, printed(d)[0], 0, { lazy: n > 0, lead: true })).join('\n')}
</div>
</section>`;
}

// ---- Markers. <!-- name[:arg][ key=value ...]:start --> ... <!-- name[:arg]:end -->
const MARKER = /<!-- ([a-z]+)((?::[\w.-]+)?)((?: [a-z]+=[^\s>]+)*):start -->[\s\S]*?<!-- \1\2:end -->/g;
function fill(html, make, where) {
  return html.replace(MARKER, (all, name, arg, opts) => {
    const o = Object.fromEntries(opts.trim().split(/\s+/).filter(Boolean).map(kv => kv.split('=')));
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
function fillPage(html, dump, full, where) {
  // A refresh leaves every marker but the switcher's exactly as it was.
  const parts = dumpParts(dump, full);
  return html.replace(MARKER, (all, name, arg, opts) => {
    const o = Object.fromEntries(opts.trim().split(/\s+/).filter(Boolean).map(kv => kv.split('=')));
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
    .replace(/<!-- archive:start -->[\s\S]*<!-- archive:end -->/, '')
    .replace(/\s(href|src)="(?![a-z]+:|#|\/)([^"]*)"/gi, (m, a, u) => ` ${a}="${'../'.repeat(DEPTH)}${u}"`)
    .replace('<b>Photos</b>', `<a href="${home(DEPTH)}">Photos</a>`)
    .replace(/<main>[\s\S]*<\/main>/, () => `<main data-dump="${dump.id}">\n<link rel="stylesheet" href="dump.css">\n${fromKit(`${kit}.html`).trim()}\n</main>`);
  mkdirSync(dir(dump.id), { recursive: true });
  writeFileSync(pagePath(dump.id), chrome);
  if (!existsSync(join(dir(dump.id), 'dump.css'))) writeFileSync(join(dir(dump.id), 'dump.css'), fromKit('dump.css'));
  open.push(dump); open.sort((a, b) => visible.indexOf(a) - visible.indexOf(b));
  console.log(`started ${pagePath(dump.id)} and dump.css from the ${kit}`);
}

// ---- 3. Fill: this dump's page in full, the switcher on every page, and the archive box.
for (const dump of open) {
  const path = pagePath(dump.id);
  writeFileSync(path, fillPage(readFileSync(path, 'utf8'), dump, mine(dump), path));
}
const lead = open.find(d => printed(d).length);
writeFileSync(indexPath, fill(readFileSync(indexPath, 'utf8'), name => name === 'archive' ? archive() : name === 'stamp' ? stamp(lead, 0) : null, indexPath));
for (const dump of visible) if (printed(dump).length && !hasPage(dump)) console.log(`${dump.id}: has prints but no page; start one with node tools/photos.mjs ${dump.id} --new`);
console.log(`photos.html: ${visible.length} dumps, ${open.length} with a page${ONLY ? `; filled ${ONLY}` : ''}; pictures from ${absolute ? MEDIA : `site/${MEDIA} (local preview; set PHOTOS_BASE before committing)`}`);
