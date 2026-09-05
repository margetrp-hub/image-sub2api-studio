import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/inspiration-windowing.png`;
const INITIAL_VISIBLE = 12;
const TOTAL_ITEMS = 20;

function videoInspirations() {
  return Array.from({ length: TOTAL_ITEMS }, (_, index) => ({
    id: `video-window-${index + 1}`,
    kind: 'video-inspiration',
    title: `Video flow idea ${index + 1}`,
    intent: 'camera move',
    summary: `Windowed video inspiration ${index + 1}`,
    prompt: `Create a clean video scene ${index + 1}`,
    videoAspect: '16:9',
    videoDuration: 5,
    videoMotion: 'slow-pan'
  }));
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

  await page.addInitScript((items) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.endsWith('/cases.json') || url.endsWith('cases.json')) {
        return new Response(JSON.stringify({
          categories: [],
          styles: [],
          scenes: [],
          cases: [],
          videoInspirations: items
        }), {
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
  }, videoInspirations());

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.querySelector('[data-workspace="inspiration"]')?.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelectorAll('.galleryKindSwitch button')[1]?.click();
  });
  await page.waitForTimeout(500);

  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll('.videoInspirationTile').length,
    hasLoadMore: Boolean(document.querySelector('.inspirationCanvasGrid .galleryLoadMore')),
    body: document.body.innerText.slice(0, 1000)
  }));
  assert(initial.cards === INITIAL_VISIBLE, `Expected ${INITIAL_VISIBLE} initial video inspiration cards, got ${initial.cards}.`, initial);
  assert(initial.hasLoadMore, 'Expected video inspiration load-more button to be visible.', initial);

  await page.locator('.inspirationCanvasGrid .galleryLoadMore').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const expanded = await page.evaluate((totalItems) => ({
    cards: document.querySelectorAll('.videoInspirationTile').length,
    hasLastItem: document.body.innerText.includes(`Video flow idea ${totalItems}`)
  }), TOTAL_ITEMS);
  assert(expanded.cards === TOTAL_ITEMS, `Expected ${TOTAL_ITEMS} video inspiration cards after local expansion, got ${expanded.cards}.`, expanded);
  assert(expanded.hasLastItem, 'Expected the final video inspiration item to render after expansion.', expanded);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    initial,
    expanded
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
