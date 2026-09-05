import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/history-indexeddb-recovery.png`;

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="${color}"/><text x="320" y="330" fill="white" font-family="Arial" font-size="72" text-anchor="middle">${label}</text></svg>`)}`;
}

function historyRecords() {
  const now = new Date().toISOString();
  return [
    {
      id: 'idb-record-a',
      scope: 'guest',
      sessionId: 'idb-session-one',
      mode: 'image',
      model: 'gpt-image-2',
      createdAt: now,
      prompt: 'Subject: quiet product desk\n\nLight: soft window light',
      generationPrompt: 'Subject: quiet product desk\n\nLight: soft window light',
      resultUrls: [svgDataUrl('#1', '#1f766e')],
      displayResultUrls: [svgDataUrl('#1', '#1f766e')],
      size: '1024x1024',
      quality: 'high'
    },
    {
      id: 'idb-record-b',
      scope: 'guest',
      sessionId: 'idb-session-one',
      mode: 'image',
      model: 'gpt-image-2',
      createdAt: new Date(Date.now() - 1000).toISOString(),
      prompt: 'Subject: quiet product desk\n\nChange: add translucent control panel',
      generationPrompt: 'Subject: quiet product desk\n\nChange: add translucent control panel',
      resultUrls: [svgDataUrl('#2', '#7c5cff')],
      displayResultUrls: [svgDataUrl('#2', '#7c5cff')],
      size: '1024x1024',
      quality: 'high'
    }
  ];
}

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

async function seedIndexedDb(page, records) {
  await page.evaluate(async (items) => {
    localStorage.removeItem('image-sub2api-studio:history:v2:guest');
    localStorage.removeItem('ohlaoo-studio:history:v2:guest');
    localStorage.removeItem('image-sub2api-studio:history:v1');
    localStorage.removeItem('ohlaoo-studio:history:v1');
    localStorage.setItem('image-sub2api-studio:session:v1', JSON.stringify({
      sessionId: 'desk-idb-smoke',
      prompt: '',
      canvasNodes: [],
      generationQueue: [],
      assistantMessages: []
    }));

    await new Promise((resolve, reject) => {
      const request = indexedDB.open('image-sub2api-studio', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains('studio_history')
          ? request.transaction.objectStore('studio_history')
          : db.createObjectStore('studio_history', { keyPath: 'id' });
        if (!store.indexNames.contains('byScopeCreatedAt')) {
          store.createIndex('byScopeCreatedAt', ['scope', 'createdAt'], { unique: false });
        }
        if (!store.indexNames.contains('byScope')) {
          store.createIndex('byScope', 'scope', { unique: false });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('studio_history', 'readwrite');
        const store = tx.objectStore('studio_history');
        const index = store.index('byScope');
        const cursorRequest = index.openCursor(IDBKeyRange.only('guest'));
        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
            return;
          }
          for (const item of items) store.put(item);
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IDB seed aborted'));
      };
    });
  }, records);
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
  const studioUrl = new URL('studio.html', baseUrl).toString();

  await page.goto(new URL('favicon.svg', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await seedIndexedDb(page, historyRecords());
  await page.goto(studioUrl, { waitUntil: 'networkidle' });

  await page.evaluate(() => {
    document.querySelector('[data-workspace="history"]')?.click();
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    return {
      historyCards: document.querySelectorAll('.historyOpen').length,
      localHistory: localStorage.getItem('image-sub2api-studio:history:v2:guest'),
      hasPrompt1: bodyText.includes('soft window light'),
      hasPrompt2: bodyText.includes('translucent control panel')
    };
  });

  assert(result.historyCards === 1, `Expected one grouped IndexedDB history card, got ${result.historyCards}.`, result);

  await page.locator('.historyOpen').first().click();
  await page.waitForTimeout(500);
  const detail = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    return {
      hasPrompt1: bodyText.includes('soft window light'),
      hasPrompt2: bodyText.includes('translucent control panel')
    };
  });
  assert(detail.hasPrompt1 && detail.hasPrompt2, 'Expected IndexedDB history detail to show both prompts.', detail);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    result,
    detail
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
