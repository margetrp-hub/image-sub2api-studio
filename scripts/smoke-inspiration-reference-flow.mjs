import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const previewScreenshotPath = `${screenshotDir}/inspiration-reference-preview.png`;
const referenceScreenshotPath = `${screenshotDir}/inspiration-reference-selected.png`;

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${color}"/><text x="320" y="196" fill="white" font-family="Arial" font-size="52" text-anchor="middle">${label}</text></svg>`)}`;
}

const fullImage = '/images/reference-flow-full.png';
const thumbImage = '/images/thumbs/reference-flow-full.webp';

function libraryPayload() {
  return {
    categories: ['Products & e-commerce'],
    styles: [],
    scenes: [],
    cases: [{
      id: 101,
      title: 'Reference flow product',
      category: 'Products & e-commerce',
      sourceLabel: 'Smoke',
      promptPreview: 'A product reference that should be previewed before use.',
      prompt: 'Use this product image as a reference and create a clean commerce render.',
      image: fullImage,
      thumbnail: thumbImage,
      imageAlt: 'Reference flow product image'
    }],
    videoInspirations: []
  };
}

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
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
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  await page.addInitScript((payload) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.endsWith('/cases.json') || url.endsWith('cases.json')) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.endsWith('/inspirations.json') || url.endsWith('inspirations.json')) {
        return new Response(JSON.stringify({
          sources: [],
          sourceCounts: [],
          categories: [],
          cases: [],
          errors: []
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(input, init);
    };
  }, libraryPayload());

  await page.route('**/images/reference-flow-full.png', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: decodeURIComponent(svgDataUrl('FULL', '#2454a6').split(',')[1])
  }));
  await page.route('**/images/thumbs/reference-flow-full.webp', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: decodeURIComponent(svgDataUrl('THUMB', '#0f8b6f').split(',')[1])
  }));

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.locator('[data-workspace="inspiration"]').first().click();
  await page.waitForSelector('.caseTile', { timeout: 8000 });

  await page.locator('.caseTileMain').first().click();
  await page.waitForSelector('.lightboxOverlay .lightboxImageStage img', { timeout: 8000 });
  await page.screenshot({ path: previewScreenshotPath, fullPage: true });

  const previewResult = await page.evaluate(() => ({
    hasLightbox: Boolean(document.querySelector('.lightboxOverlay')),
    overlayPosition: document.querySelector('.lightboxOverlay') ? getComputedStyle(document.querySelector('.lightboxOverlay')).position : '',
    activeWorkspace: document.querySelector('.sidePrimaryNav [data-workspace="inspiration"]')?.classList.contains('active'),
    hasReferencePanelSelection: Boolean(document.querySelector('.referenceSidePanel.isOpen .libraryReferencePreview')),
    lightboxImageSrc: document.querySelector('.lightboxOverlay .lightboxImageStage img')?.getAttribute('src') || '',
    body: document.body.innerText.slice(0, 1400)
  }));
  assert(previewResult.hasLightbox, 'Clicking an inspiration card should first open the preview lightbox.', previewResult);
  assert(previewResult.overlayPosition === 'fixed', 'Inspiration preview should be an independent viewport overlay.', previewResult);
  assert(previewResult.activeWorkspace, 'Previewing an inspiration card should stay in the inspiration workspace.', previewResult);
  assert(!previewResult.hasReferencePanelSelection, 'Previewing should not immediately add the inspiration image to the right reference rail.', previewResult);
  assert(previewResult.lightboxImageSrc.includes('/images/reference-flow-full.png'), 'Preview lightbox should use the full-size inspiration image.', previewResult);

  await page.locator('.lightboxOverlay .iconButton').first().click();
  await page.waitForSelector('.lightboxOverlay', { state: 'detached', timeout: 8000 });
  await page.locator('.caseTile .appendMiniButton').first().click();
  await page.waitForSelector('.creationDesk', { timeout: 8000 });
  if (await page.locator('.creationDesk.singleFlowMode').count()) {
    await page.locator('.workflowModeSwitch button').nth(1).click();
    await page.waitForSelector('.creationDesk.canvasFlowMode', { timeout: 8000 });
  }
  await page.waitForSelector('.creationDesk .libraryReferencePreview img', { timeout: 8000 });
  await page.screenshot({ path: referenceScreenshotPath, fullPage: true });

  const referenceResult = await page.evaluate(() => ({
    hasDesk: Boolean(document.querySelector('.creationDesk')),
    hasLibraryReference: Boolean(document.querySelector('.referenceSidePanel.isOpen .libraryReferencePreview')),
    referenceThumbSrc: document.querySelector('.creationDesk .libraryReferencePreview img')?.getAttribute('src') || '',
    referenceText: document.querySelector('.referenceSidePanel')?.innerText || ''
  }));
  assert(referenceResult.hasDesk, 'Using an inspiration should open the creation desk.', referenceResult);
  assert(referenceResult.hasLibraryReference, 'Using an inspiration should add it to the right reference rail.', referenceResult);
  assert(referenceResult.referenceThumbSrc.includes('/images/thumbs/reference-flow-full.webp'), 'Right reference rail should render the thumbnail URL by default.', referenceResult);

  console.log(JSON.stringify({
    ok: true,
    previewScreenshotPath,
    referenceScreenshotPath,
    previewResult,
    referenceResult
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
