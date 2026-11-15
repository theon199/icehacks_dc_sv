/**
 * Renders the cooking-coach mount animations.
 *
 * Run `node tools/coach-art/serve.mjs` (`PORT=8771 node ...` picks another port), then open the
 * printed address in a desktop browser and click "Render", or render without a window:
 *
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --user-data-dir="$(mktemp -d)" --enable-unsafe-swiftshader "http://127.0.0.1:8770/?auto"
 *
 * and stop Chrome once this server prints "all steps written". The page draws every frame of each
 * setup step's 2.8 s loop (25 fps) in the 3D cabinet scene and posts it here as a PNG; once a
 * step's frames are in, sharp encodes them into one looping animated WebP in `assets/coach/`
 * (identical frames are merged, so holds cost nothing). Frame 0 of each loop is the step's
 * finished pose, which the app shows alone when Reduce Motion is on. The app ships the WebPs,
 * never the 3D engine.
 */
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', '..', 'assets', 'coach');
const PORT = Number(process.env.PORT ?? 8770);
const STEPS = 4;
const MAX_FRAMES = 120;
const MAX_FRAME_BYTES = 8_000_000;
/** Frames arrive at 3x the app's card size; 2x keeps each file small and still sharp on a phone. */
const OUTPUT_WIDTH = 686;
const QUALITY = 82;

/** step number -> frames received so far, by index */
const pending = new Map();
let written = 0;

function intParam(url, name, min, max) {
  const raw = url.searchParams.get(name) ?? '';
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_FRAME_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function encode(step, frames, fps) {
  const sized = await Promise.all(
    frames.map((png) => sharp(png).resize({ width: OUTPUT_WIDTH }).png().toBuffer()),
  );
  const delay = Math.round(1000 / fps);
  const looped = await sharp(sized, { join: { animated: true } })
    .webp({
      quality: QUALITY,
      alphaQuality: 90,
      effort: 6,
      smartSubsample: true,
      mixed: true,
      loop: 0,
      delay: sized.map(() => delay),
    })
    .toBuffer();
  const name = `mount-step-${step}.webp`;
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, name), looped);
  return { name, bytes: looped.length, frames: sized.length, ms: delay * sized.length };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(path.join(here, 'index.html')));
    return;
  }
  const served = /^\/out\/(mount-step-[1-4]\.webp)$/.exec(url.pathname);
  if (req.method === 'GET' && served) {
    res.writeHead(200, { 'content-type': 'image/webp' });
    res.end(await readFile(path.join(outDir, served[1])));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/frame') {
    const step = intParam(url, 'step', 1, STEPS);
    const count = intParam(url, 'count', 1, MAX_FRAMES);
    const index = intParam(url, 'index', 0, MAX_FRAMES - 1);
    const fps = intParam(url, 'fps', 1, 60);
    if (step === null || count === null || index === null || index >= count || fps === null) {
      res.writeHead(400).end('bad frame');
      return;
    }
    const body = await readBody(req);
    if (body === null) {
      res.writeHead(413).end('too large');
      return;
    }
    if (index === 0) pending.set(step, []);
    const frames = pending.get(step);
    if (!frames) {
      res.writeHead(409).end('frames must start at 0');
      return;
    }
    frames[index] = body;
    if (frames.filter(Boolean).length < count) {
      res.writeHead(204).end();
      return;
    }
    pending.delete(step);
    const result = await encode(step, frames, fps);
    written += 1;
    process.stdout.write(
      `wrote ${result.name}: ${result.frames} frames, ${result.ms} ms, ${result.bytes} bytes\n`,
    );
    if (written % STEPS === 0) process.stdout.write('all steps written\n');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`coach art renderer on http://127.0.0.1:${PORT}\n`);
});
