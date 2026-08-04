/**
 * Renders social-preview.html → social-preview.png at 1280×640.
 *
 * Puppeteer is not a dependency of this repo — the CLI has none, and this only
 * ever runs when the image is being changed. Point PUPPETEER at an install:
 *
 *   node assets/render.mjs
 *   PUPPETEER=/path/to/node_modules/puppeteer node assets/render.mjs
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

const candidates = [
  process.env.PUPPETEER,
  join(here, '..', 'node_modules', 'puppeteer'),
  join(here, '..', '..', 'activitywatch-rize', 'node_modules', 'puppeteer'),
].filter(Boolean);

const found = candidates.find((p) => existsSync(p));
if (!found) {
  console.error(
    'No puppeteer install found. Either `npm i -D puppeteer` here, or:\n' +
      '  PUPPETEER=/path/to/node_modules/puppeteer node assets/render.mjs'
  );
  process.exit(1);
}

// Resolve through the package's own exports map rather than guessing a path —
// puppeteer has moved its entry point between versions more than once.
const { createRequire } = await import('node:module');
const pkgRequire = createRequire(pathToFileURL(join(found, 'package.json')));
const entry = pkgRequire.resolve(pkgRequire('./package.json').exports['.'].import);
const { default: puppeteer } = await import(pathToFileURL(entry).href);

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(here, 'social-preview.html')).href, { waitUntil: 'networkidle0' });
await page.screenshot({ path: join(here, 'social-preview.png') });
await browser.close();

console.log('Wrote assets/social-preview.png (2560×1280, 2× for retina)');
