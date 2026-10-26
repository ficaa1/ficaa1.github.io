// Compare a 4000 px copy against its resized original. JXL is checked in native colour and after screen tone mapping;
// gain-map JPEGs are split with MPF and each resized image is compared separately. PSNR uses the full sample range.
//   node tools/verify-large-photo.mjs <original.jxl|jpg> <4000.jxl|jpg>
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { libjxl, colourInfo, resizePpm, readPpm } from './large-photo.mjs';
import { splitGainmap, jpegSize, fit } from './gainmap.mjs';

let jpeg;
async function codecs() {
  if (jpeg) return jpeg;
  globalThis.ImageData ??= class { constructor(data, width, height) { Object.assign(this, { data, width, height, colorSpace: 'srgb' }); } };
  const require = createRequire(import.meta.url), wasm = p => WebAssembly.compile(readFileSync(require.resolve(p)));
  const dec = await import('@jsquash/jpeg/decode.js'), rs = await import('@jsquash/resize');
  await dec.init(await wasm('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'));
  await rs.initResize(await wasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'));
  return jpeg = {
    decode: b => dec.default(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), { preserveOrientation: false }),
    resize: rs.default,
  };
}

function pqNits(sample) {
  const v = (sample / 65535) ** (1 / (2523 / 32));
  return 10000 * (Math.max(v - 3424 / 4096, 0) / (2413 / 128 - 2392 / 128 * v)) ** (1 / (2610 / 16384));
}
const psnr = (peak, squared, count) => 10 * Math.log10(peak ** 2 / (squared / count));
function ppmStats(a, b, hdr) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('PPM size mismatch');
  let squared = 0, maxA = 0, maxB = 0, highA = 0, highB = 0, highSquared = 0;
  for (let i = 0; i < a.pixels.length; i += 2) {
    const av = a.pixels.readUInt16BE(i), bv = b.pixels.readUInt16BE(i);
    squared += (av - bv) ** 2;
    maxA = Math.max(maxA, av); maxB = Math.max(maxB, bv);
    // PQ 38000/65535 is about 201 nits, close to the screen tone-mapping target of 203.
    if (hdr && av > 38000) { highA++; highSquared += (av - bv) ** 2; }
    if (hdr && bv > 38000) highB++;
  }
  return { psnr: psnr(65535, squared, a.pixels.length / 2), ...(hdr ? {
    maxNitsReference: pqNits(maxA), maxNitsOutput: pqNits(maxB),
    samplesAboveApprox203NitsReference: highA, samplesAboveApprox203NitsOutput: highB,
    highlightPsnr: psnr(65535, highSquared, highA),
  } : {}) };
}

export function verifyJxl(src, out) {
  const tmp = mkdtempSync(join(tmpdir(), 'verify-photo-'));
  try {
    const a = colourInfo(src), b = colourInfo(out);
    if (a.colour !== b.colour || a.nits !== b.nits) throw new Error('JXL colour encoding changed');
    libjxl('djxl', [src, join(tmp, 'source.xmp')]);
    const hdrEdit = readFileSync(join(tmp, 'source.xmp')).includes('crs:HDREditMode="1"');
    const result = { colour: a.colour, nits: a.nits };
    for (const mode of ['native', 'screen']) {
      const options = ['--num_threads=1', '--bits_per_sample=16',
        `--color_space=${mode === 'native' ? a.colour : 'RGB_D65_SRG_Per_SRG'}`,
        ...(mode === 'screen' && hdrEdit ? ['--display_nits=203'] : [])];
      libjxl('djxl', [src, join(tmp, 'a.ppm'), ...options]);
      resizePpm(join(tmp, 'a.ppm'), join(tmp, 'reference.ppm'));
      libjxl('djxl', [out, join(tmp, 'b.ppm'), ...options]);
      result[mode] = ppmStats(readPpm(join(tmp, 'reference.ppm')), readPpm(join(tmp, 'b.ppm')), mode === 'native' && a.colour.endsWith('PeQ'));
    }
    for (const ext of ['exif', 'xmp']) {
      libjxl('djxl', [src, join(tmp, `a.${ext}`)]); libjxl('djxl', [out, join(tmp, `b.${ext}`)]);
      if (!readFileSync(join(tmp, `a.${ext}`)).equals(readFileSync(join(tmp, `b.${ext}`)))) throw new Error(`JXL ${ext} changed`);
    }
    return result;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function imagePsnr(a, b) {
  let squared = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) squared += (a.data[i] - b.data[i]) ** 2;
  return psnr(255, squared, a.width * a.height * 3);
}
function sampling(b) {
  for (let i = 2; i + 10 < b.length; i += 2 + b.readUInt16BE(i + 2)) {
    if ([0xc0, 0xc1, 0xc2].includes(b[i + 1]))
      return Array.from({ length: b[i + 9] }, (_, c) => b[i + 11 + 3 * c]);
    if (b[i + 1] === 0xda) break;
  }
  throw new Error('no JPEG sampling factors');
}
export async function verifyGain(src, out) {
  const original = splitGainmap(src), result = splitGainmap(out), dimensions = fit(jpegSize(original[0]), 4000);
  const { decode, resize } = await codecs(), metrics = [];
  for (let i = 0; i < 2; i++) {
    const target = i ? { width: Math.round(dimensions.width / 2), height: Math.round(dimensions.height / 2) } : dimensions;
    const actual = jpegSize(result[i]);
    if (actual.width !== target.width || actual.height !== target.height) throw new Error('gain-map dimensions changed');
    if (i === 1 && sampling(result[i]).some(v => v !== 0x11)) throw new Error('gain map is not 4:4:4');
    let reference = await decode(original[i]);
    if (reference.width !== target.width || reference.height !== target.height)
      reference = await resize(reference, { ...target, method: 'lanczos3', linearRGB: false });
    metrics.push({ dimensions: target, psnr: imagePsnr(reference, await decode(result[i])) });
  }
  return metrics;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, out] = process.argv.slice(2);
  console.log(JSON.stringify(/\.jxl$/i.test(src) ? verifyJxl(src, out) : await verifyGain(readFileSync(src), readFileSync(out)), null, 2));
}
