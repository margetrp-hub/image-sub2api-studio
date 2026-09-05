import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/history-windowing.png`;
const INITIAL_VISIBLE = 12;
const TOTAL_SESSIONS = 20;

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="${color}"/><text x="160" y="176" fill="white" font-family="Arial" font-size="40" text-anchor="middle">${label}</text></svg>`)}`;
}

function historyRecords() {
  const base = Date.now();
  return Array.from({ length: TOTAL_SESSIONS }, (_, index) => ({
    id: `window-record-${index + 1}`,
    sessionId: `window-session-${index + 1}`,
    mode: 'image',
    model: 'gpt-image-2',
    createdAt: new Date(base - index * 1000).toISOString(),
    prompt: `Subject: windowed history item ${index + 1}`,
    generationPrompt: `Subject: windowed history item ${index + 1}`,
    resultUrls: [svgDataUrl(`#${index + 1}`, index % 2 ? '#7c5cff' : '#1f766e')],
    displayResultUrls: [svgDataUrl(`#${index + 1}`, index % 2 ? '#7c5cff' : '#1f766e')],
    size: '1024x1024',
    quality: 'high'
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

  await page.addInitScript((records) => {
    localStorage.setItem('image-sub2api-studio:history:v2:guest', JSON.stringify(records));
    localStorage.setItem('image-sub2api-studio:session:v1', JSON.stringify({
      sessionId: 'desk-windowing-smoke',
      prompt: '',
      canvasNodes: [],
      generationQueue: [],
      assistantMessages: []
    }));
  }, historyRecords());

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.querySelector('[data-workspace="history"]')?.click();
  });
  await page.waitForTimeout(600);

  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll('.historyOpen').length,
    hasLoadMore: Boolean(document.querySelector('.historyGalleryGrid .galleryLoadMore')),
    body: document.body.innerText.slice(0, 1200)
  }));
  assert(initial.cards === INITIAL_VISIBLE, `Expected ${INITIAL_VISIBLE} initial history cards, got ${initial.cards}.`, initial);
  assert(initial.hasLoadMore, 'Expected local history load-more button to be visible.', initial);

  await page.locator('.historyGalleryGrid .galleryLoadMore').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const expanded = await page.evaluate((totalSessions) => ({
    cards: document.querySelectorAll('.historyOpen').length,
    hasLastPrompt: document.body.innerText.includes(`windowed history item ${totalSessions}`)
  }), TOTAL_SESSIONS);
  assert(expanded.cards === TOTAL_SESSIONS, `Expected ${TOTAL_SESSIONS} history cards after local expansion, got ${expanded.cards}.`, expanded);
  assert(expanded.hasLastPrompt, 'Expected the final local history item to render after expansion.', expanded);

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
