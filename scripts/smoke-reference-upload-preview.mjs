import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/reference-upload-preview.png`;
const lightboxScreenshotPath = `${screenshotDir}/reference-upload-lightbox.png`;
const collapsedScreenshotPath = `${screenshotDir}/reference-upload-collapsed.png`;
const fixtureDir = `${screenshotDir}/fixtures`;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const body = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}

function fixturePng(accent) {
  const width = 320;
  const height = 220;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  const accentRgb = accent === 'blue' ? [37, 99, 235] : [15, 118, 110];
  const darkRgb = [15, 23, 42];
  const lightRgb = [248, 250, 252];

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    pixels[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      const inAccentPanel = x < width * 0.62;
      const inLightBadge = (x - 74) ** 2 + (y - 74) ** 2 < 42 ** 2;
      const inDarkBlock = x > 178 && x < 286 && y > 48 && y < 164;
      const stripe = Math.floor((x + y) / 18) % 2 === 0;
      const color = inLightBadge
        ? lightRgb
        : inDarkBlock
          ? darkRgb
          : inAccentPanel
            ? accentRgb
            : stripe
              ? [226, 232, 240]
              : [203, 213, 225];
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND')
  ]);
}

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

async function writeFixtures() {
  await fs.mkdir(fixtureDir, { recursive: true });
  const files = [
    path.join(fixtureDir, 'reference-product-angle.png'),
    path.join(fixtureDir, 'reference-style-board.png')
  ];
  await Promise.all([
    fs.writeFile(files[0], fixturePng('green')),
    fs.writeFile(files[1], fixturePng('blue'))
  ]);
  return files;
}

const server = await createServer({
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false
  }
});

let browser;

try {
  const files = await writeFixtures();
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  await page.route('**/studio-api/library**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, categories: [], styles: [], scenes: [], cases: [] })
  }));
  await page.route('**/studio-api/history**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, records: [], total: 0, nextOffset: null })
  }));
  await page.route('**/studio-api/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, session: null })
  }));

  await page.addInitScript(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('image-sub2api-studio:current-session:v1');
  });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.creationDesk', { timeout: 8000 });
  await page.getByRole('button', { name: /无限画布/ }).click();
  await page.waitForTimeout(400);
  await page.locator('.referenceSidePanel input[type="file"]').first().setInputFiles(files);
  await page.waitForSelector('.referenceSideBody.hasReferenceItems .sideReferenceThumbs figure', { timeout: 8000 });
  await page.waitForFunction(() => (
    [...document.querySelectorAll('.sideReferenceThumbs img')].length === 2
      && [...document.querySelectorAll('.sideReferenceThumbs img')].every((node) => (
        node.complete && node.naturalWidth > 0 && node.naturalHeight > 0
      ))
  ), null, { timeout: 8000 });
  await page.waitForTimeout(160);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const sideResult = await page.evaluate(() => ({
    cardCount: document.querySelectorAll('.sideReferenceThumbs figure').length,
    visibleFileMetaCount: [...document.querySelectorAll('.referenceFileMeta')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).length,
    visibleRoleControlCount: [...document.querySelectorAll('.sideReferenceThumbs figcaption')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).length,
    images: [...document.querySelectorAll('.sideReferenceThumbs img')].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        objectFit: getComputedStyle(node).objectFit,
        complete: node.complete,
        naturalWidth: node.naturalWidth,
        naturalHeight: node.naturalHeight,
        width: rect.width,
        height: rect.height,
        src: node.currentSrc || node.src
      };
    }),
    panelRect: (() => {
      const panel = document.querySelector('.referenceSidePanel');
      const rect = panel?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null;
    })(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    panelText: document.querySelector('.referenceSidePanel')?.innerText || '',
    uploadText: document.querySelector('.referenceSidePanel .sideUploadDrop')?.innerText || '',
    body: document.body.innerText.slice(0, 1600)
  }));
  assert(sideResult.cardCount === 2, `Expected two uploaded reference cards, got ${sideResult.cardCount}.`, sideResult);
  assert(sideResult.visibleFileMetaCount === 0, 'Reference sidebar should not show filenames or file sizes.', sideResult);
  assert(sideResult.visibleRoleControlCount === 0, 'Reference sidebar should not show role selectors; it is only the uploaded image list.', sideResult);
  assert(sideResult.images.length === 2, 'Reference thumbnails should render image elements for each uploaded file.', sideResult);
  assert(sideResult.images.every((item) => item.objectFit === 'contain'), 'Reference thumbnails should show the whole uploaded image; full inspection happens in the lightbox.', sideResult);
  assert(sideResult.images.every((item) => item.complete && item.naturalWidth > 0 && item.naturalHeight > 0), 'Reference thumbnails did not finish loading real image content.', sideResult);
  assert(sideResult.images.every((item) => item.width > 80 && item.height > 80), 'Reference thumbnails are too small to read as thumbnails.', sideResult);
  assert(sideResult.panelRect?.right >= sideResult.viewport.width - 1, 'Reference panel should be attached to the right edge.', sideResult);
  assert(sideResult.panelRect?.height >= sideResult.viewport.height - 1, 'Reference panel should run full height.', sideResult);
  assert(!sideResult.panelText.includes('reference-product-angle') && !sideResult.panelText.includes('reference-style-board'), 'Reference sidebar should not expose filenames as primary content.', sideResult);
  assert(sideResult.uploadText.includes('继续添加 / 拖入更多'), 'Reference upload drop zone should describe the next action after files are selected.', sideResult);

  await page.locator('.sideReferenceThumbs .referencePreviewButton').first().click();
  await page.waitForSelector('.lightboxOverlay .lightboxImageStage img', { timeout: 8000 });
  await page.screenshot({ path: lightboxScreenshotPath, fullPage: true });
  const lightboxResult = await page.evaluate(() => {
    const image = document.querySelector('.lightboxOverlay .lightboxImageStage img');
    const panel = document.querySelector('.lightboxOverlay .lightboxPanel');
    const imageRect = image?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    return {
      hasLightbox: Boolean(image),
      alt: image?.getAttribute('alt') || '',
      imageRect: imageRect ? { width: imageRect.width, height: imageRect.height } : null,
      complete: image?.complete || false,
      naturalWidth: image?.naturalWidth || 0,
      naturalHeight: image?.naturalHeight || 0,
      panelRect: panelRect ? { width: panelRect.width, height: panelRect.height } : null,
      text: document.querySelector('.lightboxOverlay')?.innerText || ''
    };
  });
  assert(lightboxResult.hasLightbox, 'Clicking a reference thumbnail did not open the full-image preview.', lightboxResult);
  assert(lightboxResult.imageRect?.width > 120 && lightboxResult.imageRect?.height > 120, 'Reference full preview image was too small to inspect.', lightboxResult);
  assert(lightboxResult.complete && lightboxResult.naturalWidth > 0 && lightboxResult.naturalHeight > 0, 'Reference full preview did not load real image content.', lightboxResult);
  assert(lightboxResult.text.includes('查看参考图'), 'Reference lightbox did not identify itself as a reference preview.', lightboxResult);

  await page.locator('.lightboxOverlay .iconButton').first().click();
  await page.waitForSelector('.lightboxOverlay', { state: 'detached', timeout: 8000 });
  await page.locator('.referenceSideHead button').first().click();
  await page.waitForSelector('.referenceSidePanel.isCollapsed', { timeout: 8000 });
  await page.screenshot({ path: collapsedScreenshotPath, fullPage: true });
  const collapsedResult = await page.evaluate(() => {
    const panel = document.querySelector('.referenceSidePanel.isCollapsed');
    const button = document.querySelector('.referenceSideCollapsed');
    const label = button?.querySelector('span');
    const panelRect = panel?.getBoundingClientRect();
    const buttonRect = button?.getBoundingClientRect();
    const labelRect = label?.getBoundingClientRect();
    const labelStyle = label ? getComputedStyle(label) : null;
    return {
      panelRect: panelRect ? { width: panelRect.width, height: panelRect.height, right: panelRect.right } : null,
      buttonRect: buttonRect ? { width: buttonRect.width, height: buttonRect.height } : null,
      labelDisplay: labelStyle?.display || '',
      labelRect: labelRect ? { width: labelRect.width, height: labelRect.height } : null,
      text: panel?.innerText || '',
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });
  assert(collapsedResult.panelRect?.width <= 62, 'Collapsed reference entry should stay as a compact icon button.', collapsedResult);
  assert(collapsedResult.buttonRect?.width <= 52 && collapsedResult.buttonRect?.height <= 52, 'Collapsed reference button should be compact.', collapsedResult);
  assert(collapsedResult.labelDisplay === 'none' || collapsedResult.labelRect?.width === 0, 'Collapsed reference entry should not show vertical title text.', collapsedResult);
  assert(collapsedResult.panelRect?.right >= collapsedResult.viewport.width - 1, 'Collapsed reference entry should stay attached to the right edge.', collapsedResult);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    lightboxScreenshotPath,
    collapsedScreenshotPath,
    sideResult,
    lightboxResult,
    collapsedResult
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
