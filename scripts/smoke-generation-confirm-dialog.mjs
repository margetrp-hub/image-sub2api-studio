import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotPath = 'output/playwright/generation-confirm-dialog.png';
const layoutKey = 'image-sub2api-studio:workbench-layout:v7';
const sessionKey = 'image-sub2api-studio:current-session:v1';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

async function installRoutes(page) {
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
  await page.route('**/studio-api/generation-jobs**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, jobs: [] })
  }));
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
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await installRoutes(page);
  await page.addInitScript(({ layoutKey, sessionKey }) => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.setItem(layoutKey, JSON.stringify({
      prompt: false,
      references: true,
      parameters: true,
      parametersRail: false,
      bottomComposer: true,
      composerParameters: false,
      composerFolded: false,
      flowMode: 'canvas'
    }));
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: 'generation-confirm-smoke-session',
      mode: 'image',
      status: 'idle',
      message: '',
      progress: { stage: 'idle', percent: 0, completed: 0, total: 1 },
      prompt: 'Subject: clean product poster\nScene: white studio desk\nComposition: centered product, calm spacing',
      model: 'gpt-image-2',
      assistantMessages: [],
      promptSuggestion: null,
      generationQueue: [],
      canvasNodes: []
    }));
  }, { layoutKey, sessionKey });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.bottomComposerBar.isExpandedComposer', { timeout: 15000 });
  await page.locator('.composerGenerateAction').click();
  await page.waitForSelector('.generationConfirmDialog', { timeout: 8000 });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(() => {
    function rect(selector) {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return null;
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
        text: node.textContent.trim().slice(0, 1000)
      };
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dialog: rect('.generationConfirmDialog'),
      checklist: rect('.generationConfirmChecklist'),
      prompt: rect('.generationConfirmPrompt'),
      summary: rect('.generationConfirmSummary'),
      primary: rect('.generationConfirmPrimary'),
      adjust: rect('.generationConfirmAdjust'),
      body: document.body.innerText.slice(0, 1800)
    };
  });

  assert(result.dialog, 'generation confirm dialog is not visible.', result);
  assert(result.dialog.width >= 560, 'generation confirm dialog is too narrow on desktop.', result);
  assert(result.dialog.right <= result.viewport.width + 1 && result.dialog.bottom <= result.viewport.height + 1, 'generation confirm dialog escaped viewport.', result);
  for (const key of ['checklist', 'prompt', 'summary', 'primary', 'adjust']) {
    assert(result[key], `generation confirm ${key} section is not visible.`, result);
  }
  assert(/调用路径|输出规格|参考与队列/.test(result.checklist.text), 'generation confirm checklist labels are missing.', result);
  assert(/Subject: clean product poster/.test(result.prompt.text), 'generation confirm prompt preview is missing.', result);
  assert(/gpt-image-2|\/v1\/images\/generations/.test(result.summary.text), 'generation confirm model or route summary is missing.', result);
  assert(/确认生成|生成/.test(result.primary.text), 'generation confirm primary action is unclear.', result);

  console.log(JSON.stringify({ ok: true, screenshotPath, result }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
