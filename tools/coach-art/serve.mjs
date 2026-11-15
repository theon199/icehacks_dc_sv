/**
 * Renders the cooking-coach mount illustrations.
 *
 * Run `node tools/coach-art/serve.mjs`, open http://127.0.0.1:8770 in a desktop browser and click
 * "Render". The page draws the 3D cabinet scene for each setup step and posts the PNGs back here;
 * they are written to `assets/coach/`. The app ships the PNGs, never the 3D engine.
 */
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', '..', 'assets', 'coach');
const PORT = 8770;
const NAME = /^mount-step-[1-4](-dark)?\.png$/;
const MAX_BYTES = 8_000_000;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(await readFile(path.join(here, 'index.html')));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = url.searchParams.get('name') ?? '';
    if (!NAME.test(name)) {
      res.writeHead(400).end('bad name');
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        res.writeHead(413).end('too large');
        return;
      }
      chunks.push(chunk);
    }
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, name), Buffer.concat(chunks));
    res.writeHead(204).end();
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`coach art renderer on http://127.0.0.1:${PORT}\n`);
});
