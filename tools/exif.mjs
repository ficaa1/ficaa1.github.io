// Reads the camera settings from the Exif of a JPEG XL file (its Exif box) or a JPEG (its APP1 segment).
// Takes a path or a Buffer; the first ~256 KB of a file is enough, so originals can be read with `head -c` over ssh.
// No dependencies.
import { readFileSync } from 'node:fs';

const TAGS = { 0x010f: 'make', 0x0110: 'model', 0x829a: 'exposure', 0x829d: 'fnumber', 0x8827: 'iso', 0x9003: 'taken', 0x920a: 'focal', 0xa434: 'lens', 0x8769: 'exifIfd' };

// The TIFF block inside a JPEG's APP1 "Exif" segment.
function jpegTiff(b) {
  for (let i = 2; i + 4 <= b.length && b[i] === 0xff;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xe1 && b.toString('latin1', i + 4, i + 10) === 'Exif\0\0') return b.subarray(i + 10, i + 2 + len);
    i += 2 + len;
  }
  return null;
}

// The TIFF block inside a JPEG XL container's Exif box (after its 4-byte offset).
function jxlTiff(b) {
  for (let i = 0; i + 8 <= b.length;) {
    let len = b.readUInt32BE(i), head = 8;
    const type = b.toString('latin1', i + 4, i + 8);
    if (len === 1) { len = Number(b.readBigUInt64BE(i + 8)); head = 16; }
    if (len === 0) len = b.length - i;
    if (type === 'Exif') { const box = b.subarray(i + head, i + len); return box.subarray(4 + box.readUInt32BE(0)); }
    if (len < head) break;
    i += len;
  }
  return null;
}

export function exif(input) {
  const b = Buffer.isBuffer(input) ? input : readFileSync(input);
  let t = null;
  try { t = b[0] === 0xff && b[1] === 0xd8 ? jpegTiff(b) : jxlTiff(b); } catch { t = null; }
  if (!t || t.length < 8) return {};
  const le = t.toString('latin1', 0, 2) === 'II';
  const u16 = o => le ? t.readUInt16LE(o) : t.readUInt16BE(o);
  const u32 = o => le ? t.readUInt32LE(o) : t.readUInt32BE(o);
  const out = {};
  const ifd = at => {
    for (let n = u16(at), e = at + 2; n--; e += 12) {
      const name = TAGS[u16(e)];
      if (!name) continue;
      const type = u16(e + 2), count = u32(e + 4);
      const ptr = count * ({ 2: 1, 3: 2, 4: 4, 5: 8 }[type] || 1) > 4 ? u32(e + 8) : e + 8;
      if (type === 2) out[name] = t.toString('latin1', ptr, ptr + count).replace(/\0.*$/s, '').trim();
      else if (type === 3) out[name] = u16(ptr);
      else if (type === 4) out[name] = u32(ptr);
      else if (type === 5) out[name] = [u32(ptr), u32(ptr + 4)];
    }
  };
  try {
    ifd(u32(4));
    if (out.exifIfd) ifd(out.exifIfd);
  } catch {} // a header cut short by head -c: keep what was read
  delete out.exifIfd;
  return out;
}

// The four values a print's label carries, written the way a photographer reads them.
export function settings(e) {
  const r = ([a, b] = []) => b ? a / b : undefined;
  const ex = e.exposure && (e.exposure[0] >= e.exposure[1] ? `${r(e.exposure)} s` : `1/${Math.round(e.exposure[1] / e.exposure[0])} s`);
  return {
    aperture: e.fnumber && `f/${+r(e.fnumber).toFixed(1)}`,
    shutter: ex,
    iso: e.iso && `ISO ${e.iso}`,
    focal: e.focal && `${Math.round(r(e.focal))} mm`,
    camera: [e.make, e.model].filter(Boolean).join(' ').replace(/^SONY /i, 'Sony '),
    lens: e.lens,
    taken: e.taken && e.taken.replace(/^(\d{4}):(\d\d):(\d\d) (\d\d:\d\d).*/, '$1-$2-$3 $4'),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) for (const f of process.argv.slice(2)) console.log(f, settings(exif(f)));
