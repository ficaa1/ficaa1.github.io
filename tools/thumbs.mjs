// Private, resumable photo picker. All originals stay on plex; only headers and small JPEGs come here.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, symlinkSync, statSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { LIBRARY, head, q, ssh } from './plex.mjs';
import { editedPaths, group } from './edited.mjs';
import { exif, settings } from './exif.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CACHE = resolve(ROOT, 'photos-src-local/thumbs');
const META = resolve(CACHE, 'metadata.json');
const PAGE = resolve(ROOT, 'site/picker');
const RATE = 10 * 1024 * 1024;
export const idFor = p => createHash('sha256').update(`${LIBRARY}/${p}`).digest('hex').slice(0, 24);
const stem = p => p.replace(/\.[^.]+$/, '').toLowerCase();
const jpeg = p => /\.jpe?g$/i.test(p);
const tiff = p => /\.tiff?$/i.test(p);
const available = id => existsSync(resolve(CACHE, `${id}.jpg`)) && statSync(resolve(CACHE, `${id}.jpg`)).size > 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function atomic(path, data) {
  const tmp = `${path}.${process.pid}.tmp`;
  try { writeFileSync(tmp, data); renameSync(tmp, path); }
  finally { if (existsSync(tmp)) unlinkSync(tmp); }
}
function catalogue() {
  const paths = [...new Set(editedPaths())].sort();
  const twins = new Map(paths.filter(jpeg).map(p => [stem(p), idFor(p)]));
  return paths.map(p => ({id: idFor(p), path: `${LIBRARY}/${p}`, relative: p, group: group(p),
    thumb: /\.jxl$/i.test(p) ? null : tiff(p) && twins.has(stem(p)) ? twins.get(stem(p)) : jpeg(p) || tiff(p) ? idFor(p) : null}));
}
function readMeta() { return existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {version: 1, frames: {}}; }

export function page(frames = catalogue(), cache = readMeta()) {
  mkdirSync(CACHE, {recursive: true});
  mkdirSync(PAGE, {recursive: true});
  // SimpleHTTPRequestHandler opens translated paths normally, including symlinks outside site/.
  if (!existsSync(resolve(PAGE, 't'))) symlinkSync('../../photos-src-local/thumbs', resolve(PAGE, 't'), 'dir');
  const groups = new Map();
  for (const f of frames) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group).push(f);
  }
  const sections = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) =>
    `<section><h2>${esc(name)} <small data-count>${rows.length}</small></h2><div class="grid">` + rows.map(f => {
      const date = cache.frames[f.id]?.settings?.taken || '';
      const src = f.thumb && available(f.thumb) ? `t/${f.thumb}.jpg` : '';
      return `<article data-id="${f.id}" data-path="${esc(f.path)}"><button class="tile" aria-pressed="false" aria-label="${esc(f.path)}">` +
        `<span class="image">${src ? `<img src="${src}" alt="" loading="lazy" decoding="async" width="800" height="800">` : ''}</span>` +
        `<span class="name">${esc(basename(f.relative))}</span><time>${esc(date.slice(0, 10))}</time></button>` +
        (src ? `<button class="zoom" aria-label="${esc(basename(f.relative))}" data-src="${src}">↗</button>` : '') + '</article>';
    }).join('') + '</div></section>').join('\n');
  atomic(resolve(PAGE, 'index.html'), String.raw`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>${frames.length}</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:12px 12px 105px;background:#fff;color:#000;font:16px/1.4 "Times New Roman",Times,serif}h2{font-size:18px;font-weight:normal;margin:24px 0 8px;overflow-wrap:anywhere}small,time{color:#555;font-size:12px}small{margin-left:8px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px}article{position:relative;min-width:0}button,input{font:inherit;border-radius:0}button{cursor:pointer}.tile{display:block;width:100%;padding:3px;border:2px solid transparent;background:#f0f0f0;color:#000;text-align:left}.tile[aria-pressed=true]{border-color:#0000ee;background:#e6e6ff}.tile[aria-pressed=true]:after{content:'✓';position:absolute;left:7px;top:7px;background:#0000ee;color:#fff;padding:0 5px}.image{display:flex;aspect-ratio:1;align-items:center;justify-content:center;background:#e8e8e8}.image img{width:100%;height:100%;object-fit:contain}.name{display:block;font-size:13px;overflow-wrap:anywhere;margin-top:4px}time{display:block;min-height:17px}.zoom{position:absolute;right:6px;top:6px;min-width:40px;min-height:40px;border:1px solid #aaa;background:#fffffff0;color:#0000ee;font-size:22px}.bar{position:fixed;z-index:2;bottom:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:10px max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom));background:#fff;border-top:1px solid #aaa}.bar button{min-height:44px;padding:6px 12px;background:#f0f0f0;border:1px solid #999}.bar output{min-width:30px}.bar input{min-width:0;flex:1;max-width:440px;min-height:44px;padding:6px;border:1px solid #999}[hidden]{display:none!important}:focus-visible{outline:3px solid #0000ee;outline-offset:2px}dialog{padding:8px;max-width:96vw;max-height:94vh;border:1px solid #777;background:#fff}dialog::backdrop{background:#000b}dialog img{display:block;max-width:90vw;max-height:80vh;width:auto;height:auto}dialog button{float:right;min-width:44px;min-height:44px;background:#fff;border:1px solid #999;font-size:24px}dialog textarea{display:block;width:80vw;max-width:800px;height:45vh;font:13px monospace}dialog p{margin:0;clear:both;overflow-wrap:anywhere;font-size:13px}@media(max-width:440px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.bar{gap:6px}.bar button{padding:6px 9px}body{padding:8px 8px 100px}}
</style>
<main>${sections}</main>
<div class="bar"><output aria-label="selected" aria-live="polite">0</output><button id="copy">copy</button><button id="clear">clear</button><input id="filter" type="search" aria-label="filter" autocomplete="off"></div>
<dialog id="viewer"><button aria-label="close">×</button><img alt=""><p></p></dialog>
<dialog id="clipboard"><button aria-label="close">×</button><textarea aria-label="copy" readonly></textarea></dialog>
<script>
const key='filip-photo-picker-v1', articles=[...document.querySelectorAll('article')];
const known=new Set(articles.map(a=>a.dataset.id));
let selected=new Set();
try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))selected=new Set(saved.filter(id=>known.has(id)));}catch{}
const output=document.querySelector('output'), copy=document.querySelector('#copy'), clear=document.querySelector('#clear');
function paint(){for(const a of articles)a.querySelector('.tile').setAttribute('aria-pressed',String(selected.has(a.dataset.id)));output.value=selected.size;copy.disabled=clear.disabled=!selected.size;try{localStorage.setItem(key,JSON.stringify([...selected]));}catch{}}
paint();
const viewer=document.querySelector('#viewer'), clipboard=document.querySelector('#clipboard');
for(const a of articles){a.querySelector('.tile').addEventListener('click',()=>{selected.has(a.dataset.id)?selected.delete(a.dataset.id):selected.add(a.dataset.id);paint();});const zoom=a.querySelector('.zoom');if(zoom)zoom.addEventListener('click',()=>{viewer.querySelector('img').src=zoom.dataset.src;viewer.querySelector('p').textContent=a.dataset.path;viewer.showModal();});}
for(const dialog of [viewer,clipboard]){dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});}
clear.onclick=()=>{selected.clear();paint();};
copy.onclick=async()=>{const text=articles.filter(a=>selected.has(a.dataset.id)).map(a=>a.dataset.path).join('\n');try{await navigator.clipboard.writeText(text);}catch{clipboard.showModal();const box=clipboard.querySelector('textarea');box.value=text;box.focus();box.select();document.execCommand('copy');}};
document.querySelector('#filter').addEventListener('input',e=>{const words=e.target.value.toLowerCase().trim().split(/\s+/).filter(Boolean);for(const a of articles)a.hidden=!words.every(w=>a.dataset.path.toLowerCase().includes(w));for(const section of document.querySelectorAll('section')){const count=section.querySelectorAll('article:not([hidden])').length;section.hidden=!count;section.querySelector('[data-count]').textContent=count;}});
for(const img of document.querySelectorAll('.image img'))img.addEventListener('error',()=>{img.closest('article').querySelector('.zoom').hidden=true;img.remove();});
</script></html>`);
  console.log(`page: ${frames.length} files, ${frames.filter(f => f.thumb && available(f.thumb)).length} thumbnails`);
}

export function thumbnail(path, pv = '') {
  const source = q(path);
  const input = pv ? `pv -q -L 10m -B 64k -- ${source}` : `cat -- ${source}`;
  const script = `set -o pipefail; size=$(stat -c %s -- ${source}) || exit; printf '%s\n' "$size"; ${input} | ` +
    `nice -n 19 ionice -c3 ffmpeg -nostdin -hide_banner -loglevel error -threads 1 -filter_threads 1 ${tiff(path) ? '-f image2pipe -c:v tiff -frame_size "$size" ' : ''}-i pipe:0 ` +
    `-vf "scale=w='min(800,iw)':h='min(800,ih)':force_original_aspect_ratio=decrease" -threads 1 -q:v 5 -frames:v 1 -f image2pipe -vcodec mjpeg pipe:1`;
  const data = ssh(`nice -n 19 ionice -c3 bash -c ${q(script)}`, {maxBuffer: 8 << 20});
  const boundary = data.indexOf(10), size = Number(data.subarray(0, boundary).toString());
  if (boundary < 1 || !Number.isSafeInteger(size) || size < 1) throw new Error('Invalid source size');
  const image = data.subarray(boundary + 1);
  if (image.length < 4 || image[0] !== 255 || image[1] !== 216 || image.at(-2) !== 255 || image.at(-1) !== 217) throw new Error('Incomplete JPEG');
  return {image, size};
}

async function idle() {
  for (;;) {
    const load = Number(ssh('nice -n 19 ionice -c3 cat /proc/loadavg', {maxBuffer: 4096}).toString().split(' ')[0]);
    if (!Number.isFinite(load)) throw new Error('Cannot read plex load');
    if (load <= 3) return;
    console.log(`${new Date().toISOString()} plex load ${load}; waiting 60 s`);
    await sleep(60000);
  }
}
async function pace(bytes, start) { await sleep(Math.max(0, bytes / RATE * 1000 - (performance.now() - start))); }

async function run({limit = Infinity, every = 25} = {}) {
  mkdirSync(CACHE, {recursive: true});
  // flock is held by the parent wrapper until this process exits. A second run must not read NFS concurrently.
  const lock = resolve(CACHE, 'run.lock');
  if (!process.env.THUMBS_LOCKED) {
    const {spawnSync} = await import('node:child_process');
    const result = spawnSync('flock', ['-n', '-E', '75', lock, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      {stdio: 'inherit', env: {...process.env, THUMBS_LOCKED: '1'}});
    if (result.status === 75) console.error('Thumbnail run already active');
    process.exitCode = result.status ?? 1;
    return;
  }
  const pid = resolve(CACHE, 'run.pid');
  atomic(pid, `${process.pid}\n`);
  const frames = catalogue(), cache = readMeta();
  const ordered = [...frames.filter(f => jpeg(f.relative)), ...frames.filter(f => tiff(f.relative) && f.thumb === f.id),
    ...frames.filter(f => !jpeg(f.relative) && !(tiff(f.relative) && f.thumb === f.id))];
  const pv = ssh('nice -n 19 ionice -c3 sh -c "command -v pv || true"', {maxBuffer: 4096}).toString().trim();
  const start = performance.now();
  let bytes = 0, processed = 0, failures = 0;
  console.log(`${new Date().toISOString()} ${frames.length} files; limiter: ${pv ? 'pv -q -L 10m -B 64k' : 'sleep after each file (10 MiB/s average)'}; page every ${every}`);
  try {
    for (const f of ordered) {
      const old = cache.frames[f.id];
      const needsThumb = f.thumb === f.id && !available(f.id);
      if (old?.settings && !needsThumb) continue;
      if (processed >= limit) break;
      await idle();
      const fileStart = performance.now();
      let fileBytes = 0;
      try {
        if (!old?.settings) {
          const h = head(dirname(f.relative) === '.' ? '' : dirname(f.relative), basename(f.relative), 262144);
          fileBytes += h.length;
          cache.frames[f.id] = {...f, settings: settings(exif(h))};
          // Headers also count against the read budget, including files with no thumbnail.
          await pace(fileBytes, fileStart);
          atomic(META, JSON.stringify(cache, null, 2) + '\n');
        }
        if (needsThumb) {
          const {image, size} = thumbnail(f.path, pv);
          fileBytes += size;
          atomic(resolve(CACHE, `${f.id}.jpg`), image);
          cache.frames[f.id] = {...cache.frames[f.id], sourceBytes: size};
          atomic(META, JSON.stringify(cache, null, 2) + '\n');
        }
      } catch (error) {
        failures++;
        console.error(`${new Date().toISOString()} failed ${f.relative}: ${error.message}`);
        // Unknown reads on errors cannot be paced accurately: wait before touching another file.
        await sleep(60000);
      }
      await pace(fileBytes, fileStart);
      bytes += fileBytes; processed++;
      const seconds = (performance.now() - start) / 1000;
      const done = frames.filter(row => row.thumb === row.id && available(row.id)).length;
      console.log(`${new Date().toISOString()} ${done}/${frames.filter(row => row.thumb === row.id).length} thumbnails; ${processed} files this run; ${(bytes / 1048576).toFixed(1)} MiB read; ${(bytes / 1048576 / seconds).toFixed(2)} MiB/s average; ${f.relative}`);
      if (every && processed % every === 0) page(frames, cache);
    }
    page(frames, cache);
    console.log(`${new Date().toISOString()} finished; ${processed} files; ${failures} failures`);
    if (failures) process.exitCode = 1;
  } finally { rmSync(pid, {force: true}); }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--page') return page();
  let limit = Infinity, every = 25;
  for (const arg of args) {
    if (/^--limit=\d+$/.test(arg)) limit = Number(arg.slice(8));
    else if (/^--page-every=\d+$/.test(arg)) every = Number(arg.slice(13));
    else throw new Error('Usage: node tools/thumbs.mjs [--limit=10] [--page-every=25] | --page');
  }
  await run({limit, every});
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
