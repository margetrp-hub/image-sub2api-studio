import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/canvas-blob-cleanup.png`;

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

  await page.addInitScript(() => {
    const revoked = [];
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      revoked.push(String(url || ''));
      try {
        originalRevoke(url);
      } catch {
        // Test-created blob URL strings are synthetic; record cleanup even when the browser has no backing object.
      }
    };
    window.__blobCleanupSmoke = { revoked };
    localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify({
      sessionId: 'canvas-blob-cleanup-smoke',
      mode: 'image',
      prompt: 'Blob cleanup smoke',
      model: 'gpt-image-2',
      status: 'idle',
      message: '',
      canvasView: { x: 0, y: 0, zoom: 1 },
      selectedCanvasNodeId: 'blob-node-1',
      results: ['blob:http://127.0.0.1/blob-result-1'],
      canvasNodes: [
        {
          id: 'blob-node-1',
          canvasIndex: 1,
          kind: 'image',
          url: 'blob:http://127.0.0.1/blob-node-1',
          prompt: 'Blob node one',
          title: 'Blob node one',
          x: -180,
          y: -120,
          width: 340,
          height: 280
        },
        {
          id: 'blob-node-2',
          canvasIndex: 2,
          kind: 'image',
          url: 'blob:http://127.0.0.1/blob-node-2',
          prompt: 'Blob node two',
          title: 'Blob node two',
          x: 340,
          y: -120,
          width: 340,
          height: 280
        }
      ],
      canvasCustomLinks: [],
      generationQueue: [],
      assistantMessages: []
    }));
  });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /无限画布/ }).click();
  await page.waitForSelector('[data-node-id="blob-node-1"]', { timeout: 8000 });

  await page.evaluate(() => {
    const deleteButton = document.querySelector('[data-node-id="blob-node-1"] .canvasNodeToolbar button:last-child');
    deleteButton?.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-node-id="blob-node-1"]'), null, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(() => ({
    revoked: window.__blobCleanupSmoke?.revoked || [],
    hasNode1: Boolean(document.querySelector('[data-node-id="blob-node-1"]')),
    hasNode2: Boolean(document.querySelector('[data-node-id="blob-node-2"]')),
    body: document.body.innerText.slice(0, 800)
  }));

  assert(!result.hasNode1, 'Deleted blob canvas node was still rendered.', result);
  assert(result.hasNode2, 'Deleting one blob canvas node removed an unrelated node.', result);
  assert(result.revoked.includes('blob:http://127.0.0.1/blob-node-1'), 'Deleted canvas node blob URL was not revoked.', result);
  assert(!result.revoked.includes('blob:http://127.0.0.1/blob-node-2'), 'Still-rendered canvas node blob URL was revoked too early.', result);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    result
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
