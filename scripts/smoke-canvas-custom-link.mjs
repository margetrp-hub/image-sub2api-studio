import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/canvas-custom-link.png`;

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/><text x="320" y="255" fill="white" font-family="Arial" font-size="76" text-anchor="middle">${label}</text></svg>`)}`;
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

  await page.addInitScript(({ nodeOneUrl, nodeTwoUrl }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('image-sub2api-studio:workbench-layout:v7', JSON.stringify({
      prompt: false,
      references: true,
      parameters: true,
      parametersRail: false,
      bottomComposer: true,
      composerParameters: false,
      composerFolded: false,
      flowMode: 'canvas'
    }));
    localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify({
      sessionId: 'canvas-custom-link-smoke',
      mode: 'image',
      prompt: 'Custom link smoke',
      model: 'gpt-image-2',
      status: 'idle',
      message: '',
      canvasView: { x: 0, y: 0, zoom: 1 },
      selectedCanvasNodeId: 'link-node-1',
      canvasNodes: [
        {
          id: 'link-node-1',
          canvasIndex: 1,
          kind: 'image',
          url: nodeOneUrl,
          prompt: 'First generated image',
          title: 'First image',
          x: -360,
          y: -120,
          width: 320,
          height: 260
        },
        {
          id: 'link-node-2',
          canvasIndex: 2,
          kind: 'image',
          url: nodeTwoUrl,
          prompt: 'Second generated image',
          title: 'Second image',
          x: 160,
          y: -120,
          width: 320,
          height: 260
        }
      ],
      canvasCustomLinks: [],
      generationQueue: [],
      assistantMessages: []
    }));
  }, {
    nodeOneUrl: svgDataUrl('#1', '#1f766e'),
    nodeTwoUrl: svgDataUrl('#2', '#7c5cff')
  });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /无限画布/ }).click();
  await page.waitForSelector('[data-node-id="link-node-1"] .canvasPortOut', { timeout: 8000 });
  await page.waitForSelector('.graphNode[data-node-id="link-node-2"]', { timeout: 8000 });

  const source = await page.locator('[data-node-id="link-node-1"] .canvasPortOut').boundingBox();
  const target = await page.locator('.graphNode[data-node-id="link-node-2"]').boundingBox();
  assert(source && target, 'Could not find canvas link source or target bounds.', { source, target });

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();

  await page.waitForFunction(() => document.querySelectorAll('.canvasLinkGroup.custom').length >= 1, null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const storageKey = 'image-sub2api-studio:current-session:v1';
    const activeId = localStorage.getItem(`${storageKey}:active`);
    const stored = JSON.parse(localStorage.getItem(activeId ? `${storageKey}:${activeId}` : storageKey) || '{}');
    return Array.isArray(stored.canvasCustomLinks) && stored.canvasCustomLinks.length === 1;
  }, null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(() => {
    const storageKey = 'image-sub2api-studio:current-session:v1';
    const activeId = localStorage.getItem(`${storageKey}:active`);
    const stored = JSON.parse(localStorage.getItem(activeId ? `${storageKey}:${activeId}` : storageKey) || '{}');
    return {
      customLinks: stored.canvasCustomLinks || [],
      customEdgeCount: document.querySelectorAll('.canvasLinkGroup.custom').length,
      selectedNodeId: stored.selectedCanvasNodeId || '',
      body: document.body.innerText.slice(0, 900)
    };
  });

  assert(result.customEdgeCount === 1, 'Custom canvas link was not rendered.', result);
  assert(result.customLinks.length === 1, 'Custom canvas link was not saved in the current session.', result);
  assert(result.customLinks[0].fromId === 'link-node-1', 'Custom link source was not preserved.', result);
  assert(result.customLinks[0].toId === 'link-node-2', 'Custom link target was not preserved.', result);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    result
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
