#!/usr/bin/env node
/**
 * Renders Famara's raster brand assets from the master logo, `tools/brand/famara-logo.png`: the
 * illustrated mark stacked over the "famara" lettering, drawn on pure black.
 *
 *   assets/images/icon.png           1024×1024, opaque: the mark on black (App Store / iOS icon)
 *   assets/images/splash-icon.png    1024×1024, transparent: the mark alone (launch screen)
 *   assets/images/favicon.png        48×48: the mark on a black rounded tile (web)
 *   assets/images/wordmark.png       white lettering on transparent, tinted in the app
 *
 * Usage: npm run brand:assets
 */
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = path.join(root, 'tools', 'brand', 'famara-logo.png');
const outDir = path.join(root, 'assets', 'images');

/** Below this brightness (max of R, G, B) a pixel is the black canvas. */
const CANVAS_MAX = 18;
/** Above this brightness a pixel belongs to the artwork when finding its bounds. */
const INK_MIN = 40;
/** Rendered height of the lettering in `wordmark.png`, comfortably above 3x of header use. */
const WORDMARK_HEIGHT = 120;

/** Max filter over a square window, done as two 1-D passes. */
function maxFilter(values, width, height, radius) {
  const rows = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let k = Math.max(0, x - radius); k <= Math.min(width - 1, x + radius); k++) {
        m = Math.max(m, values[y * width + k]);
      }
      rows[y * width + x] = m;
    }
  }
  const out = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let k = Math.max(0, y - radius); k <= Math.min(height - 1, y + radius); k++) {
        m = Math.max(m, rows[k * width + x]);
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

/**
 * Lifts the artwork off its black canvas. Interior pixels stay fully opaque; only pixels next to
 * the canvas get partial alpha, recovered from how far their anti-aliasing was darkened by black.
 */
function unmatte({ data, width, height }) {
  const count = width * height;
  const bright = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    bright[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  }
  const canvas = bright.map((v) => (v < CANVAS_MAX ? 1 : 0));
  const nearCanvas = maxFilter(canvas, width, height, 3);
  const interior = bright.map((v, i) => (nearCanvas[i] ? 0 : v));
  const reference = maxFilter(interior, width, height, 5);

  const rgba = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i++) {
    let alpha = 1;
    if (bright[i] < 10) alpha = 0;
    else if (nearCanvas[i]) alpha = Math.min(1, bright[i] / Math.max(reference[i], 60));
    for (let c = 0; c < 3; c++) {
      rgba[i * 4 + c] = alpha > 0 ? Math.min(255, Math.round(data[i * 3 + c] / alpha)) : 0;
    }
    rgba[i * 4 + 3] = Math.round(alpha * 255);
  }
  return { rgba, bright };
}

/** Splits the logo into its two horizontal bands (mark, then lettering) and boxes each one. */
function findBands(bright, width, height) {
  const inkRows = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bright[y * width + x] > INK_MIN) {
        inkRows.push(y);
        break;
      }
    }
  }
  const bands = [];
  for (const y of inkRows) {
    const last = bands.at(-1);
    if (last && y === last.bottom + 1) last.bottom = y;
    else bands.push({ top: y, bottom: y });
  }
  if (bands.length !== 2) {
    throw new Error(`Expected the mark above the lettering (2 bands), found ${bands.length}`);
  }
  return bands.map(({ top, bottom }) => {
    let left = width;
    let right = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = 0; x < width; x++) {
        if (bright[y * width + x] > INK_MIN) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    const pad = 4;
    return {
      left: Math.max(0, left - pad),
      top: Math.max(0, top - pad),
      width: Math.min(width, right + pad + 1) - Math.max(0, left - pad),
      height: Math.min(height, bottom + pad + 1) - Math.max(0, top - pad),
    };
  });
}

const raw = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = raw.info;
const { rgba, bright } = unmatte({ data: raw.data, width, height });
const [markBox, wordBox] = findBands(bright, width, height);
const cutout = () => sharp(rgba, { raw: { width, height, channels: 4 } });

const mark = await cutout().extract(markBox).png().toBuffer();
const lettering = await cutout().extract(wordBox).extractChannel('alpha').toBuffer();

/** The mark scaled to fit `fraction` of a `size` square and centred on `background`. */
async function markOn(size, fraction, background) {
  const fit = Math.round(size * fraction);
  const art = await sharp(mark)
    .resize(fit, fit, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } }).composite([
    { input: art, gravity: 'centre' },
  ]);
}

const black = { r: 0, g: 0, b: 0, alpha: 1 };
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

await mkdir(outDir, { recursive: true });

const write = async (file, image) => {
  const target = path.join(outDir, file);
  await image.png({ compressionLevel: 9 }).toFile(target);
  console.log(`wrote ${path.relative(root, target)}`);
};

await write(
  'icon.png',
  sharp(await (await markOn(1024, 0.68, black)).png().toBuffer()).removeAlpha(),
);
await write('splash-icon.png', await markOn(1024, 0.86, clear));

const favicon = await (await markOn(48, 0.8, black)).png().toBuffer();
const tileMask = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="11" fill="#fff"/></svg>',
);
await write('favicon.png', sharp(favicon).composite([{ input: tileMask, blend: 'dest-in' }]));

// White glyphs whose alpha is the lettering; the app tints it with the text colour.
const wordWidth = Math.round((wordBox.width * WORDMARK_HEIGHT) / wordBox.height);
const white = await sharp({
  create: { width: wordBox.width, height: wordBox.height, channels: 3, background: '#ffffff' },
})
  .joinChannel(lettering, { raw: { width: wordBox.width, height: wordBox.height, channels: 1 } })
  .png()
  .toBuffer();
await write('wordmark.png', sharp(white).resize(wordWidth, WORDMARK_HEIGHT));
console.log(`wordmark aspect (width / height): ${wordWidth} / ${WORDMARK_HEIGHT}`);
