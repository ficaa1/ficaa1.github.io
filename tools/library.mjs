// Reads the photo library on plex and brings each dump's contact sheet in site/photos.json up to date:
// which frames exist, grouped into rolls, with their labels and dates. Run it after exporting more frames;
// then run tools/photos.mjs to rebuild the pages. Read only on plex.
//
// A dump in photos.json names its library folder ("folder": "Rim edited 2025"). Everything a person wrote
// (title, note, the printed frames and their captions) is kept; only "rolls", "frames", "from" and "to" are rewritten.
// Each roll keeps its files in order, their labels, and the time each was taken (from the Exif in its first 256 KB).
//
// Rolls and labels:
//   Lightroom exports named "Name (N of M).ext" become one roll per Name, each frame labelled N.
//   A virtual copy, "Name (N of M)-2.ext", sits beside it as NA, the way film edge numbers mark half frames.
//   Everything else (camera numbers like DSC08192-Edit.jpg) is one roll in file order, labelled 1, 2, 3...
//   The same frame exported twice in different formats (DSC03738.jpg and DSC03738.JXL) counts once.
// Usage: node tools/library.mjs [dump-id ...]   (no id: every dump; env PLEX_HOST, PLEX_PORT, PLEX_PHOTOS override the defaults)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { list, head } from './plex.mjs';
import { exif, settings } from './exif.mjs';

const IMAGE = /\.(jpe?g|jxl|png|tiff?|heic|avif)$/i;
const NUMBERED = /^(.*?)\s*\((\d+) of (\d+)\)(?:-(\d+))?$/;
const PREFER = ['jpg', 'jpeg', 'jxl', 'png', 'tif', 'tiff', 'heic', 'avif']; // jpg first: plex can resize it
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

// Groups a folder listing into rolls. Pure, so it can be tested without plex.
export function rolls(files, folder = '') {
  const byStem = new Map();
  for (const f of files.filter(f => IMAGE.test(f))) {
    const stem = f.replace(/\.[^.]+$/, ''), key = stem.toLowerCase();
    const ext = f.split('.').pop().toLowerCase();
    const had = byStem.get(key);
    if (!had || PREFER.indexOf(ext) < PREFER.indexOf(had.ext)) byStem.set(key, { file: f, stem, ext });
  }
  const groups = new Map();
  for (const { file, stem } of byStem.values()) {
    const m = stem.match(NUMBERED);
    const key = m ? m[1] : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m ? { file, n: +m[2], of: +m[3], copy: m[4] ? +m[4] - 1 : 0 } : { file });
  }
  // A roll's name is its export name less the words it shares with the folder: "Rim day 2" in "Rim edited 2025" is "Day 2".
  const shared = new Set(folder.toLowerCase().split(/[\s_-]+/).filter(Boolean));
  const short = key => {
    const words = key.split(/[\s_-]+/).filter(Boolean);
    while (words.length && shared.has(words[0].toLowerCase())) words.shift();
    return words.join(' ').replace(/^part\s*(\d+)/i, 'Part $1').replace(/^./, c => c.toUpperCase());
  };
  return [...groups].map(([key, frames]) => {
    if (key) frames.sort((a, b) => a.n - b.n || a.copy - b.copy);
    else frames.sort((a, b) => natural(a.file, b.file));
    const labels = frames.map((f, i) => key ? f.n + (f.copy ? String.fromCharCode(64 + f.copy) : '') : String(i + 1));
    const name = key ? short(key) || (groups.size > 1 ? key : '') : '';
    return { key, name, files: frames.map(f => f.file), labels };
  });
}

// "2025-04-30 17:02" from the first bytes of a file on plex.
const taken = (folder, file) => {
  try { return settings(exif(head(folder, file))).taken || null; } catch { return null; }
};

// Updates the dumps named in `ids` (all of them when empty). Each frame's time is read once and remembered by file name,
// so a re-sync only reads the frames that are new.
export function sync(ids = [], site = 'site', log = console.log) {
  const path = join(site, 'photos.json');
  const dumps = JSON.parse(readFileSync(path, 'utf8'));
  for (const id of ids) if (!dumps.some(d => d.id === id)) log(`${id}: not in photos.json; add {"id", "title", "folder"} first`);
  for (const dump of dumps) {
    if (!dump.folder || (ids.length && !ids.includes(dump.id))) continue;
    let files;
    try { files = list(dump.folder); } catch { log(`${dump.id}: could not list "${dump.folder}" on plex; left as it was`); continue; }
    const known = new Map((dump.rolls || []).flatMap(r => r.files.map((f, i) => [f, Array.isArray(r.taken) && r.taken.length === r.files.length ? r.taken[i] : undefined])));
    let read = 0;
    const next = rolls(files, dump.folder).map(r => {
      r.taken = r.files.map(f => known.get(f) !== undefined ? known.get(f) : (read++, taken(dump.folder, f)));
      return r;
    });
    const first = r => r.taken.filter(Boolean).sort()[0] || '9';
    next.sort((a, b) => first(a).localeCompare(first(b)) || natural(a.key, b.key));
    // Camera-number rolls are named after the numbers they span; a lone roll needs no name.
    for (const r of next) if (!r.key) {
      const nums = r.files.map(f => (f.match(/[a-z_]*\d{4,}/i) || [])[0]).filter(Boolean);
      r.name = next.length > 1 && nums.length ? `${nums[0]} to ${nums.at(-1)}` : '';
    }
    const dates = next.flatMap(r => r.taken).filter(Boolean).sort();
    const was = dump.frames;
    dump.rolls = next;
    dump.frames = next.reduce((n, r) => n + r.files.length, 0);
    dump.from = dates[0] ? dates[0].slice(0, 10) : dump.from;
    dump.to = dates.at(-1) ? dates.at(-1).slice(0, 10) : dump.to;
    for (const p of dump.photos || []) if (p.original && !next.some(r => r.files.includes(p.original))) log(`${dump.id}: printed frame "${p.original}" is no longer in the folder`);
    log(`${dump.id}: ${dump.frames} frames in ${next.length} roll${next.length === 1 ? '' : 's'}${was && was !== dump.frames ? ` (was ${was})` : ''}, ${dump.from} to ${dump.to}; read the time of ${read}`);
  }
  writeFileSync(path, JSON.stringify(dumps, null, 2) + '\n');
  return dumps;
}

if (import.meta.url === `file://${process.argv[1]}`) sync(process.argv.slice(2));
