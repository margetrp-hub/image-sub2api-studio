import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/template-windowing.png`;
const INITIAL_VISIBLE = 12;
const TOTAL_ITEMS = 20;

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="${color}"/><text x="160" y="176" fill="white" font-family="Arial" font-size="40" text-anchor="middle">${label}</text></svg>`)}`;
}

function templateCases() {
  return Array.from({ length: TOTAL_ITEMS }, (_, index) => ({
    id: `template-window-${index + 1}`,
    title: `Template window idea ${index + 1}`,
    category: 'Windowing Test',
    styles: ['Clean UI'],
    scenes: ['Workbench'],
    promptPreview: `Create a focused template scene ${index + 1}`,
    image: svgDataUrl(`#${index + 1}`, index % 2 ? '#f59e0b' : '#0f766e'),
    thumbnail: index === 0 ? '/missing-template-thumb.webp' : svgDataUrl(`#${index + 1}`, index % 2 ? '#f59e0b' : '#0f766e'),
    sourceName: index === 1 ? '\u7eff\u4f69\u94fe\u7a3fra' : 'smoke'
  }));
}

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function overlap(a, b) {
  if (!a || !b) return 0;
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return x * y;
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
          categories: ['Windowing Test'],
          styles: ['Clean UI'],
          scenes: ['Workbench'],
          cases: items,
          videoInspirations: []
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
  }, templateCases());

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.locator('[data-workspace="inspiration"]').click();
  await page.locator('.galleryCategoryFilter select').selectOption('Windowing Test');
  await page.waitForFunction((count) => document.querySelectorAll('.caseTile').length === count, INITIAL_VISIBLE);
  await page.waitForFunction(() => document.querySelector('.caseTile img')?.getAttribute('src')?.startsWith('data:image/svg+xml'));

  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll('.caseTile').length,
    selectedCategory: document.querySelector('.galleryCategoryFilter select')?.value || '',
    hasLoadMore: Boolean(document.querySelector('.inspirationCanvasGrid .galleryLoadMore')),
    body: document.body.innerText.slice(0, 1000),
    firstImageSrc: document.querySelector('.caseTile img')?.getAttribute('src') || '',
    hasGarbledSource: document.body.innerText.includes('\u7eff\u4f69\u94fe\u7a3fra')
  }));
  assert(initial.cards === INITIAL_VISIBLE, `Expected ${INITIAL_VISIBLE} initial template cards, got ${initial.cards}.`, initial);
  assert(initial.selectedCategory === 'Windowing Test', 'Template category filter did not select the fixture category.', initial);
  assert(initial.hasLoadMore, 'Expected template load-more button to be visible.', initial);
  assert(initial.firstImageSrc.startsWith('data:image/svg+xml'), 'Missing thumbnail should fall back to the visible card original image only.', initial);
  assert(!initial.hasGarbledSource, 'Garbled source metadata should not be displayed on inspiration cards.', initial);

  await page.locator('.inspirationCanvasGrid .galleryLoadMore').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const expanded = await page.evaluate((totalItems) => ({
    cards: document.querySelectorAll('.caseTile').length,
    hasLastItem: document.body.innerText.includes(`Template window idea ${totalItems}`),
    cardGeometry: Array.from(document.querySelectorAll('.inspirationCanvasGrid .caseTile')).slice(0, 8).map((card) => {
      function rect(selector) {
        const node = card.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          right: box.right,
          bottom: box.bottom,
          text: node.textContent.trim().slice(0, 60)
        };
      }
      const cardBox = card.getBoundingClientRect();
      return {
        card: {
          x: cardBox.x,
          y: cardBox.y,
          width: cardBox.width,
          height: cardBox.height,
          right: cardBox.right,
          bottom: cardBox.bottom
        },
        media: rect('.caseMedia'),
        badge: rect('.caseTileMain > span'),
        title: rect('.caseTileMain > strong'),
        source: rect('.caseTileMain > em'),
        actions: rect('.caseTileActions')
      };
    })
  }), TOTAL_ITEMS);
  assert(expanded.cards === TOTAL_ITEMS, `Expected ${TOTAL_ITEMS} template cards after local expansion, got ${expanded.cards}.`, expanded);
  assert(expanded.hasLastItem, 'Expected the final template item to render after expansion.', expanded);
  assert(expanded.cardGeometry.length > 0, 'Expected template card geometry to be inspectable.', expanded);
  for (const [index, item] of expanded.cardGeometry.entries()) {
    assert(item.media?.width >= 120 && item.media?.height >= 90, `Template card ${index + 1} media is too small.`, item);
    assert(item.title?.width >= 120 && item.title?.height >= 14, `Template card ${index + 1} title is not readable.`, item);
    assert(overlap(item.media, item.title) <= 4, `Template card ${index + 1} title overlaps media.`, item);
    assert(overlap(item.badge, item.title) <= 4, `Template card ${index + 1} badge overlaps title.`, item);
    assert(overlap(item.actions, item.title) <= 4, `Template card ${index + 1} actions overlap title.`, item);
  }

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
