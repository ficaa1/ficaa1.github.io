// Saves a JPEG that carries an HDR gain map (Lightroom's HDR export: a primary image, then a gain map image, indexed by
// MPF) again at a lower quality and optionally a smaller size, keeping its HDR. Both images are re-encoded; each one's
// metadata segments (Exif, ICC, the hdrgm XMP) are kept as they were, and the MPF index is rewritten for the new sizes.
//   node tools/gainmap.mjs <in.jpg> <out.jpg> [quality=90] [long-edge]
// The primary is encoded 4:2:0 like any other JPEG on the site; the gain map 4:4:4, since each channel is its own gain.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let jpeg;
async function codec() {
  if (jpeg) return jpeg;
  globalThis.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height, colorSpace: 'srgb' }); } };
  const require = createRequire(import.meta.url);
  const wasm = p => WebAssembly.compile(readFileSync(require.resolve(p)));
  const dec = await import('@jsquash/jpeg/decode.js'), enc = await import('@jsquash/jpeg/encode.js');
  const rs = await import('@jsquash/resize');
  await dec.init(await wasm('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'));
  await enc.init(await wasm('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'));
  await rs.initResize(await wasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'));
  return jpeg = { decode: dec.default, encode: enc.default, resize: rs.default };
}

// The segments before the scan: [{ marker, start, end }], `end` excluding. Stops at the first table or frame segment.
function head(b) {
  const out = [];
  for (let i = 2; ;) {
    const marker = b[i + 1], end = i + 2 + b.readUInt16BE(i + 2);
    if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) return { meta: out, body: i };
    out.push({ marker, start: i, end });
    i = end;
  }
}

// The MPF segment's TIFF header offset in `b` and its little-endianness, plus where its entry table sits.
function mpf(b) {
  const s = head(b).meta.find(s => s.marker === 0xe2 && b.toString('latin1', s.start + 4, s.start + 8) === 'MPF\0');
  if (!s) return null;
  const t = s.start + 8, le = b.toString('latin1', t, t + 2) === 'II';
  const u16 = o => le ? b.readUInt16LE(o) : b.readUInt16BE(o), u32 = o => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
  const ifd = t + u32(t + 4);
  for (let k = 0; k < u16(ifd); k++) {
    const e = ifd + 2 + 12 * k;
    if (u16(e) === 0xb002) return { t, le, table: t + u32(e + 8), count: u32(e + 4) / 16 };
  }
  return null;
}

// Re-encodes one image, keeping `b`'s own metadata segments ahead of the new tables and scan.
async function again(b, quality, chroma_subsample, dimensions) {
  const { decode, encode, resize } = await codec();
  // Leave pixels in their stored orientation: the original Exif orientation is kept below.
  let image = await decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), { preserveOrientation: false });
  if (dimensions && (image.width !== dimensions.width || image.height !== dimensions.height))
    image = await resize(image, { ...dimensions, method: 'lanczos3', linearRGB: false });
  const fresh = Buffer.from(await encode(image,
    { quality, progressive: true, chroma_subsample, auto_subsample: false }));
  // JFIF (APP0) and Adobe (APP14) say how the new scan stores colour, so those come from the new encode.
  const own = s => s.marker === 0xe0 || s.marker === 0xee, old = head(b), now = head(fresh);
  return Buffer.concat([b.subarray(0, 2), ...now.meta.filter(own).map(s => fresh.subarray(s.start, s.end)),
    ...old.meta.filter(s => !own(s)).map(s => b.subarray(s.start, s.end)), fresh.subarray(now.body)]);
}

export function jpegSize(b) {
  for (let i = 2; i + 9 < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    if (marker === 0xda || len < 2) break;
    i += len + 2;
  }
  throw new Error('no JPEG frame');
}

export const fit = ({ width, height }, edge) => {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

export async function encodeJpeg(image, quality = 90) {
  return Buffer.from(await (await codec()).encode(image, { quality, progressive: true }));
}

// A plain JPEG keeps its original bytes when it already fits. Re-encoding keeps its Exif and ICC too.
export async function resizeJpeg(b, quality = 90, edge = 4000) {
  const size = jpegSize(b), dimensions = fit(size, edge);
  if (size.width === dimensions.width && size.height === dimensions.height && b.length <= 12e6) return b;
  return again(b, quality, 2, dimensions);
}

export function splitGainmap(b) {
  const m = mpf(b);
  if (!m || m.count !== 2) throw new Error('expected two MPF images');
  const r32 = o => m.le ? b.readUInt32LE(o) : b.readUInt32BE(o);
  const s1 = r32(m.table + 4), s2 = r32(m.table + 16 + 4), o2 = r32(m.table + 16 + 8);
  if (s1 > b.length || m.t + o2 < s1 || m.t + o2 + s2 > b.length) throw new Error('invalid MPF offsets');
  const images = [b.subarray(0, s1), b.subarray(m.t + o2, m.t + o2 + s2)];
  for (const image of images) if (image.readUInt16BE(0) !== 0xffd8 || image.readUInt16BE(image.length - 2) !== 0xffd9)
    throw new Error('invalid MPF JPEG');
  return images;
}

export async function requantize(b, quality = 90, edge) {
  const [original, map] = splitGainmap(b), dimensions = edge ? fit(jpegSize(original), edge) : undefined;
  const primary = await again(original, quality, 2, dimensions);
  const gain = await again(map, quality, 1, dimensions && {
    width: Math.max(1, Math.round(dimensions.width / 2)), height: Math.max(1, Math.round(dimensions.height / 2)) });
  // Find the MPF table again after attaching the metadata; only the image sizes and gain map offset change.
  const n = mpf(primary), w32 = (o, v) => n.le ? primary.writeUInt32LE(v, o) : primary.writeUInt32BE(v, o);
  w32(n.table + 4, primary.length);
  w32(n.table + 16 + 4, gain.length);
  w32(n.table + 16 + 8, primary.length - n.t);
  return Buffer.concat([primary, gain]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, out, q, edge] = process.argv.slice(2);
  const b = readFileSync(src), r = await requantize(b, q ? +q : 90, edge ? +edge : undefined);
  writeFileSync(out, r);
  console.log(`${src}: ${(b.length / 1048576).toFixed(1)} MB -> ${(r.length / 1048576).toFixed(1)} MB`);
}
