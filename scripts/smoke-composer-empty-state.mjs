import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotPath = 'output/playwright/composer-empty-compact-rerun.png';
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

function rectInside(parent, child) {
  if (!parent || !child) return true;
  return child.x >= parent.x - 1
    && child.right <= parent.right + 1
    && child.y >= parent.y - 1
    && child.bottom <= parent.bottom + 1;
}

function viewportInside(viewport, box) {
  if (!box) return true;
  return box.x >= -1
    && box.right <= viewport.width + 1
    && box.y >= -1
    && box.bottom <= viewport.height + 1;
}

async function runScenario(browser, baseUrl, viewport, name) {
  const page = await browser.newPage({ viewport });
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
      sessionId: `composer-empty-${Date.now()}`,
      mode: 'image',
      status: 'idle',
      message: '',
      progress: { stage: 'idle', percent: 0, completed: 0, total: 1 },
      prompt: '',
      model: 'gpt-image-2',
      assistantMessages: [],
      promptSuggestion: null,
      generationQueue: [],
      canvasNodes: []
    }));
  }, { layoutKey, sessionKey });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.bottomComposerBar.isExpandedComposer.noThread', { timeout: 15000 });
  await page.locator('.bottomComposerInput textarea').fill('1:1方图，1024x1024，原创角色插画，干净背景，清晰构图。');
  if (name === 'narrow') {
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }

  const result = await page.evaluate(() => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return null;
      return {
        selector,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
        text: el.textContent?.trim().slice(0, 200) || ''
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      composer: pick('.bottomComposerBar'),
      thread: pick('.composerThread'),
      prompt: pick('.composerPromptRow'),
      input: pick('.bottomComposerInput'),
      textarea: pick('.bottomComposerInput textarea'),
      params: pick('.composerParamShelf'),
      action: pick('.composerActionGroup'),
      generate: pick('.composerGenerateAction'),
      optimize: pick('.composerAssistantAction')
    };
  });

  assert(result.composer, `${name}: composer is not visible.`, result);
  assert(!result.thread, `${name}: empty composer should not render a blank thread panel.`, result);
  assert(result.composer.height >= 320, `${name}: expanded empty composer should grow with the dialog.`, result);
  assert(result.composer.height <= Math.min(470, result.viewport.height - 20), `${name}: expanded empty composer escaped the intended viewport height.`, result);
  assert(viewportInside(result.viewport, result.composer), `${name}: empty composer escaped the viewport.`, result);
  for (const key of ['prompt', 'input', 'textarea', 'params', 'action', 'generate', 'optimize']) {
    assert(result[key], `${name}: ${key} is not visible.`, result);
    assert(rectInside(result.composer, result[key]), `${name}: ${key} escaped the composer.`, result);
    assert(viewportInside(result.viewport, result[key]), `${name}: ${key} escaped the viewport.`, result);
  }
  assert(result.action.y >= result.prompt.y - 1 && result.action.bottom <= result.prompt.bottom + 1, `${name}: action rail is not aligned with the input row.`, result);
  assert(result.prompt.height >= 190 || viewport.height < 560, `${name}: expanded empty prompt row did not grow with the dialog.`, result);
  assert(result.textarea.height >= 190 || viewport.height < 560, `${name}: expanded empty prompt input did not grow with the dialog.`, result);
  assert(result.textarea.width >= 220 || viewport.width < 500, `${name}: prompt textarea became too narrow.`, result);

  await page.close();
  return result;
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
  const scenarios = {
    narrow: await runScenario(browser, baseUrl, { width: 945, height: 520 }, 'narrow'),
    desktop: await runScenario(browser, baseUrl, { width: 1360, height: 900 }, 'desktop')
  };
  console.log(JSON.stringify({ ok: true, screenshotPath, scenarios }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
