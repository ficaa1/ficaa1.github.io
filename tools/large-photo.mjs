// The viewer's 4000 px copies. Resize JXL samples in their original transfer function at 16 bits, then give cjxl the
// original colour encoding and intensity target. No display_nits is used for the JXL; only the JPEG is tone mapped.
// Requires djxl, cjxl and jxlinfo beside DJXL (or ~/.local/opt/libjxl/usr/bin/djxl).
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fit, resizeJpeg, requantize, encodeJpeg } from './gainmap.mjs';

const DJXL = process.env.DJXL || join(homedir(), '.local/opt/libjxl/usr/bin/djxl');
const env = { ...process.env, LD_LIBRARY_PATH: [join(dirname(DJXL), '../lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
export function libjxl(tool, args, output = false) {
  return execFileSync(join(dirname(DJXL), tool), args, { env, stdio: output ? ['ignore', 'pipe', 'inherit'] : 'ignore', maxBuffer: 4 << 20 });
}

export function colourInfo(file) {
  const text = libjxl('jxlinfo', ['-v', file], true).toString();
  const value = key => text.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];
  const primaries = { sRGB: 'SRG', 'Rec.2100': '202', 'Rec.2020': '202', P3: 'DCI' }[value('Primaries')];
  const transfer = { sRGB: 'SRG', PQ: 'PeQ', HLG: 'HLG', Linear: 'Lin' }[value('Transfer function')];
  const intent = { Perceptual: 'Per', Relative: 'Rel', 'Relative colorimetric': 'Rel', Absolute: 'Abs', Saturation: 'Sat' }[value('Rendering intent')];
  if (value('Color space') !== 'RGB' || value('White point') !== 'D65' || !primaries || !transfer || !intent || !text.includes('Orientation: 1 (Normal)'))
    throw new Error(`unsupported JXL colour encoding or orientation: ${file}`);
  return { colour: `RGB_D65_${primaries}_${intent}_${transfer}`, nits: +(value('Intensity target')?.split(' ')[0] || 255), text };
}

export function readPpm(file) {
  const b = readFileSync(file), m = b.subarray(0, 128).toString('latin1').match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  if (!m || ![255, 65535].includes(+m[3])) throw new Error('expected RGB PPM');
  const size = +m[1] * +m[2] * 3, wide = +m[3] === 65535;
  if (b.length !== m[0].length + size * (wide ? 2 : 1)) throw new Error('wrong PPM length');
  let pixels = b.subarray(m[0].length);
  // djxl can keep an 8-bit source at 8 bits despite --bits_per_sample=16. Expand it before the resize.
  if (!wide) {
    const expanded = Buffer.alloc(size * 2);
    for (let i = 0; i < size; i++) expanded.writeUInt16BE(pixels[i] * 257, i * 2);
    pixels = expanded;
  }
  return { width: +m[1], height: +m[2], pixels };
}

const sinc = x => Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
function weights(from, to) {
  const scale = Math.max(1, from / to), support = scale * 3;
  return Array.from({ length: to }, (_, i) => {
    const center = (i + 0.5) * from / to - 0.5, indices = [], values = [];
    let sum = 0;
    for (let j = Math.ceil(center - support); j <= Math.floor(center + support); j++) {
      const x = (j - center) / scale, w = sinc(x) * sinc(x / 3);
      indices.push(Math.max(0, Math.min(from - 1, j))); values.push(w); sum += w;
    }
    return { indices, values: values.map(w => w / sum) };
  });
}

// Separable Lanczos3. Float intermediates avoid rounding between passes; samples stay in the source's encoding.
export function resizePpm(input, output, edge = 4000) {
  const image = readPpm(input), { width, height } = fit(image, edge);
  if (width === image.width && height === image.height) {
    writeFileSync(output, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n65535\n`), image.pixels])); return;
  }
  const wx = weights(image.width, width), wy = weights(image.height, height);
  const rows = new Float32Array(width * image.height * 3);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < width; x++) {
    const { indices, values } = wx[x], at = (y * width + x) * 3;
    for (let k = 0; k < indices.length; k++) {
      const src = (y * image.width + indices[k]) * 6, w = values[k];
      rows[at] += image.pixels.readUInt16BE(src) * w;
      rows[at + 1] += image.pixels.readUInt16BE(src + 2) * w;
      rows[at + 2] += image.pixels.readUInt16BE(src + 4) * w;
    }
  }
  const pixels = Buffer.alloc(width * height * 6);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let k = 0; k < wy[y].indices.length; k++) v += rows[(wy[y].indices[k] * width + x) * 3 + c] * wy[y].values[k];
    pixels.writeUInt16BE(Math.max(0, Math.min(65535, Math.round(v))), ((y * width + x) * 3 + c) * 2);
  }
  writeFileSync(output, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n65535\n`), pixels]));
}

export async function largeJpeg(data) {
  return data.includes('hdrgm') ? requantize(data, 90, 4000) : resizeJpeg(data, 90, 4000);
}

export async function largeJxl(src, jxl, jpg) {
  if (existsSync(jxl) && existsSync(jpg)) return;
  const tmp = mkdtempSync(join(tmpdir(), 'photo-4000-'));
  try {
    const info = colourInfo(src), raw = join(tmp, 'in.ppm'), small = join(tmp, 'small.ppm');
    if (!existsSync(jxl)) {
      libjxl('djxl', [src, raw, `--color_space=${info.colour}`, '--bits_per_sample=16', '--num_threads=1']);
      resizePpm(raw, small);
      const metadata = [];
      for (const ext of ['exif', 'xmp']) {
        const file = join(tmp, `meta.${ext}`);
        libjxl('djxl', [src, file, '--num_threads=1']);
        if (existsSync(file) && readFileSync(file).length) metadata.push('-x', `${ext}=${file}`);
      }
      const encoded = join(tmp, 'large.jxl');
      libjxl('cjxl', [small, encoded, '-d', '1', '-e', '7', '--num_threads=2', '--compress_boxes=0',
        '-x', `color_space=${info.colour}`, `--intensity_target=${info.nits}`, ...metadata]);
      const result = colourInfo(encoded);
      if (result.colour !== info.colour || result.nits !== info.nits) throw new Error(`JXL colour encoding changed: ${src}`);
      copyFileSync(encoded, jxl);
    }
    if (!existsSync(jpg)) {
      // Detect Lightroom's HDR edit on the original even if its XMP is compressed into a brob box.
      const xmp = join(tmp, 'source.xmp');
      libjxl('djxl', [src, xmp, '--num_threads=1']);
      const hdr = existsSync(xmp) && readFileSync(xmp).includes('crs:HDREditMode="1"');
      libjxl('djxl', [src, raw, '--color_space=RGB_D65_SRG_Per_SRG', '--bits_per_sample=16', '--num_threads=1',
        ...(hdr ? ['--display_nits=203'] : [])]);
      resizePpm(raw, small);
      const image = readPpm(small), data = new Uint8ClampedArray(image.width * image.height * 4);
      for (let i = 0, j = 0; i < data.length; i += 4, j += 6) {
        data[i] = image.pixels.readUInt16BE(j) / 257; data[i + 1] = image.pixels.readUInt16BE(j + 2) / 257;
        data[i + 2] = image.pixels.readUInt16BE(j + 4) / 257; data[i + 3] = 255;
      }
      writeFileSync(jpg, await encodeJpeg({ data, width: image.width, height: image.height }));
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
