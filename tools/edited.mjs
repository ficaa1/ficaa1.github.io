// Finds the edited photos in the library on plex, however the folders are arranged. An export from Lightroom says so in
// the file itself (Exif Software, or XMP CreatorTool, "Adobe Photoshop Lightroom..."); a file straight from the camera
// says "ILCE-...". So the edited ones are the files whose writer is an editor.
//
//   node tools/edited.mjs --scan         read every picture's first 128 KB on plex (niced, read only; ~10 min)
//   node tools/edited.mjs                edited photos grouped by folder or shoot, with counts
//   node tools/edited.mjs normandie 2025 only the edited files whose path contains every word (case-insensitive)
//
// The scan is kept in photos-src-local/edited.tsv ("<software>\t<path>"), so searching is instant; scan again after
// exporting more. Nothing is written on plex: the reader goes over ssh as a python -c argument.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LIBRARY, q, ssh } from './plex.mjs';

const INDEX = new URL('../photos-src-local/edited.tsv', import.meta.url);
export const EDITORS = /lightroom|photoshop|capture one|darktable|rawtherapee|dxo|affinity|luminar/i;

const READER = String.raw`
import sys, struct, re
def software(p):
    try:
        with open(p, 'rb') as f: b = f.read(131072)
    except OSError: return '?unreadable'
    i = b.find(b'Exif\0\0')
    t = b[i+6:] if i >= 0 else (b if b[:4] in (b'II*\0', b'MM\0*') else b'')
    if t:
        try:
            e = '<' if t[:2] == b'II' else '>'
            off = struct.unpack(e+'I', t[4:8])[0]
            for k in range(struct.unpack(e+'H', t[off:off+2])[0]):
                tag, typ, cnt, val = struct.unpack(e+'HHII', t[off+2+12*k:off+14+12*k])
                if tag == 0x131:
                    s = t[val:val+cnt] if cnt > 4 else t[off+10+12*k:off+10+12*k+cnt]
                    return s.split(b'\0')[0].decode('latin1').strip() or '?empty'
        except Exception: pass
    x = re.search(rb'(?:xmp:CreatorTool="|<xmp:CreatorTool>)([^"<]{1,80})', b)
    return x.group(1).decode('latin1') if x else '?none'
for line in sys.stdin:
    p = line.rstrip('\n')
    print(software(p) + '\t' + p, flush=True)
`;

// Shared with the private picker, so shoot names and editor matching stay identical.
export const group = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '(top) ' + p.replace(/ \(\d+ of \d+\).*$/, '').replace(/^(\d{4})\d{4}-DSC_.*$/, '$1 DSC_').replace(/\.\w+$/, '');
export function editedPaths() {
  if (!existsSync(INDEX)) throw new Error('No scan yet: run node tools/edited.mjs --scan');
  return readFileSync(INDEX, 'utf8').split('\n').filter(Boolean)
    .map(r => r.split('\t')).filter(([sw]) => EDITORS.test(sw)).map(([, p]) => p.replace(/^\.\//, ''));
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--scan') {
    const find = `cd ${q(LIBRARY)} && find . -path ./.dtrash -prune -o -type f \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.jxl' -o -iname '*.tif' -o -iname '*.png' \\) -print`;
    const out = ssh(`${find} | nice -n 19 ionice -c3 python3 -c ${q(READER)}`, { maxBuffer: 64 << 20 });
    mkdirSync(new URL('.', INDEX), { recursive: true });
    writeFileSync(INDEX, out);
    const rows = out.toString('utf8').split('\n').filter(Boolean);
    console.log(`${rows.length} pictures read, ${rows.filter(r => EDITORS.test(r.split('\t')[0])).length} edited. Saved to photos-src-local/edited.tsv`);
    process.exit(0);
  }

  const edited = editedPaths();

  if (args.length) {
    const words = args.map(w => w.toLowerCase());
    for (const p of edited.filter(p => words.every(w => p.toLowerCase().includes(w))).sort()) console.log(`${LIBRARY}/${p}`);
  } else {
    const groups = new Map();
    for (const p of edited) groups.set(group(p), (groups.get(group(p)) || 0) + 1);
    for (const [g, n] of [...groups].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(5)}  ${g}`);
    console.log(`${String(edited.length).padStart(5)}  edited in all`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
