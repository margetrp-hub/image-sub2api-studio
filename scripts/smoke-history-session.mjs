import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const beforePath = `${screenshotDir}/history-session-before-open.png`;
const afterPath = `${screenshotDir}/history-session-after-open.png`;

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="${color}"/><text x="320" y="330" fill="white" font-family="Arial" font-size="72" text-anchor="middle">${label}</text></svg>`)}`;
}

function historyRecords() {
  const now = new Date().toISOString();
  return [
    {
      id: 'smoke-record-a',
      sessionId: 'smoke-session-one',
      mode: 'image',
      model: 'gpt-image-2',
      createdAt: now,
      prompt: 'Subject: glass studio in a mountain valley\n\nLight: soft morning light',
      generationPrompt: 'Subject: glass studio in a mountain valley\n\nLight: soft morning light',
      resultUrls: [svgDataUrl('#1', '#3366cc')],
      displayResultUrls: [svgDataUrl('#1', '#3366cc')],
      size: '1024x1024',
      quality: 'high'
    },
    {
      id: 'smoke-record-b',
      sessionId: 'smoke-session-one',
      mode: 'image',
      model: 'gpt-image-2',
      createdAt: new Date(Date.now() - 1000).toISOString(),
      prompt: 'Subject: glass studio in a mountain valley\n\nChange: add warm light strips and a human silhouette',
      generationPrompt: 'Subject: glass studio in a mountain valley\n\nChange: add warm light strips and a human silhouette',
      resultUrls: [svgDataUrl('#2', '#cc6633')],
      displayResultUrls: [svgDataUrl('#2', '#cc6633')],
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
      sessionId: 'desk-smoke',
      prompt: '',
      canvasNodes: [],
      generationQueue: [],
      assistantMessages: []
    }));
  }, historyRecords());

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.screenshot({ path: beforePath, fullPage: true });

  await page.getByRole('button', { name: /历史图库/ }).first().click();
  await page.waitForTimeout(500);

  const historyButtons = await page.locator('.historyOpen').count();
  assert(historyButtons === 1, `Expected one grouped history card, got ${historyButtons}.`, {
    body: (await page.locator('body').innerText()).slice(0, 700)
  });

  await page.locator('.historyOpen').first().click();
  await page.waitForTimeout(500);

  const detailResult = await page.evaluate(() => {
    const prompts = [...document.querySelectorAll('.historyPromptItem')].map((node) => node.innerText);
    const bodyText = document.body.innerText;
    return {
      prompts,
      bodyHasPrompt1: bodyText.includes('soft morning light'),
      bodyHasPrompt2: bodyText.includes('warm light strips')
    };
  });
  assert(
    detailResult.bodyHasPrompt1 && detailResult.bodyHasPrompt2,
    'Expected history detail to render both per-image prompts.',
    detailResult
  );

  await page.locator('.historyWorkspaceHero .primaryAction').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /无限画布/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: afterPath, fullPage: true });

  const canvasResult = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.canvasNode')].map((node) => node.innerText);
    const nodeText = nodes.join('\n');
    return {
      nodes,
      nodeHasPrompt1: nodeText.includes('Lig') || nodeText.includes('soft'),
      nodeHasPrompt2: nodeText.includes('Cha') || nodeText.includes('warm')
    };
  });
  assert(
    canvasResult.nodes.length >= 2 && canvasResult.nodeHasPrompt1 && canvasResult.nodeHasPrompt2,
    'Expected canvas to restore distinct per-image prompts.',
    canvasResult
  );

  console.log(JSON.stringify({
    ok: true,
    beforePath,
    afterPath,
    detailResult,
    canvasResult
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
