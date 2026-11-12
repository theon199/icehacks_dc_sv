#!/usr/bin/env node
/**
 * Renders Famara's raster brand assets from the vector mark:
 *   assets/images/icon.png           1024×1024, opaque (App Store / iOS icon)
 *   assets/images/splash-icon.png    1024×1024, transparent (launch screen)
 *   assets/images/favicon.png        48×48 (web)
 *
 * Usage: npm run brand:assets  (requires Node 22.18+ for TypeScript imports)
 */
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { brandColors } from '../../src/ui/brandColors.ts';
import { MARK_VIEWBOX, markGeometry, markTile } from '../../src/ui/brand/markGeometry.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'assets', 'images');

/** Visual centre of the mark's artwork inside its viewBox (the leaves sit above the bowl). */
const ART_CENTER_Y = 57.5;

function markShapes(colors) {
  const { rim } = markGeometry;
  return [
    `<path d="${markGeometry.leafSmall}" fill="${colors.leafSmall}"/>`,
    `<path d="${markGeometry.leafLarge}" fill="${colors.leafLarge}"/>`,
    `<path d="${markGeometry.leafVein}" stroke="${colors.vein}" stroke-width="2.2" stroke-linecap="round" fill="none" opacity="0.55"/>`,
    `<rect x="${rim.x}" y="${rim.y}" width="${rim.width}" height="${rim.height}" rx="${rim.rx}" fill="${colors.bowl}"/>`,
    `<path d="${markGeometry.bowl}" fill="${colors.bowl}"/>`,
  ].join('');
}

/**
 * Builds an SVG of `size` px with the mark scaled to `scale` of the canvas and centred.
 * `background` is 'none', 'square' (opaque gradient) or 'tile' (rounded square).
 */
function svg({ size, scale, colors, background }) {
  const markSize = size * scale;
  const k = markSize / MARK_VIEWBOX;
  const tx = (size - markSize) / 2;
  const ty = size / 2 - ART_CENTER_Y * k;
  const defs = `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${brandColors.basil}"/>
      <stop offset="1" stop-color="${brandColors.basilDeep}"/>
    </linearGradient>
  </defs>`;
  let bg = '';
  if (background === 'square') bg = `<rect width="${size}" height="${size}" fill="url(#bg)"/>`;
  if (background === 'tile') {
    const r = (markTile.radius / MARK_VIEWBOX) * size;
    bg = `<rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${defs}${bg}
  <g transform="translate(${tx} ${ty}) scale(${k})">${markShapes(colors)}</g>
</svg>`;
}

const onBasil = {
  bowl: brandColors.cream,
  leafLarge: brandColors.saffron,
  leafSmall: brandColors.basilLight,
  vein: brandColors.basilDeep,
};
const onLight = {
  bowl: brandColors.basil,
  leafLarge: brandColors.saffron,
  leafSmall: brandColors.basilLight,
  vein: brandColors.basilDeep,
};

const outputs = [
  {
    file: 'icon.png',
    size: 1024,
    svg: svg({ size: 1024, scale: 0.66, colors: onBasil, background: 'square' }),
    opaque: true,
  },
  {
    file: 'splash-icon.png',
    size: 1024,
    svg: svg({ size: 1024, scale: 0.9, colors: onLight, background: 'none' }),
  },
  {
    file: 'favicon.png',
    size: 48,
    svg: svg({ size: 48, scale: 0.78, colors: onBasil, background: 'tile' }),
  },
];

await mkdir(outDir, { recursive: true });
for (const output of outputs) {
  // Rasterise at high density, then downsample to the exact size for smooth edges.
  let image = sharp(Buffer.from(output.svg), { density: 288 }).resize(output.size, output.size);
  if (output.opaque) image = image.flatten({ background: brandColors.basil }).removeAlpha();
  const target = path.join(outDir, output.file);
  await image.png({ compressionLevel: 9 }).toFile(target);
  console.log(`wrote ${path.relative(root, target)}`);
}
