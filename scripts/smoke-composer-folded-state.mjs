import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotPath = 'output/playwright/composer-folded-state.png';
const layoutKey = 'image-sub2api-studio:workbench-layout:v7';
const sessionKey = 'image-sub2api-studio:current-session:v1';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function inside(parent, child) {
  if (!parent || !child) return false;
  return child.x >= parent.x - 1
    && child.right <= parent.right + 1
    && child.y >= parent.y - 1
    && child.bottom <= parent.bottom + 1;
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

async function runScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1033, height: 535 } });
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
      composerParameters: true,
      composerFolded: false,
      flowMode: 'canvas'
    }));
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: 'composer-folded-smoke-session',
      mode: 'image',
      status: 'idle',
      message: '',
      progress: { stage: 'idle', percent: 0, completed: 0, total: 1 },
      prompt: '1:1方图，1024x1024，原创二次元机甲插画。',
      model: 'gpt-image-2',
      assistantMessages: [
        {
          id: 'fold-user',
          role: 'user',
          content: '把这张图继续优化成更干净的封面。',
          pending: false,
          failed: false
        },
        {
          id: 'fold-assistant',
          role: 'assistant',
          content: '可以沿着当前构图继续衍生，重点优化光线、边缘和文字留白。',
          pending: false,
          failed: false
        }
      ],
      promptSuggestion: null,
      generationQueue: [],
      canvasNodes: [
        {
          id: 'node-1',
          canvasIndex: 1,
          x: 260,
          y: 120,
          width: 220,
          height: 220,
          prompt: 'Cyberpunk portrait poster',
          url: ''
        }
      ]
    }));
  }, { layoutKey, sessionKey });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.bottomComposerBar.isExpandedComposer', { timeout: 15000 });
  await page.locator('.composerFoldTogglePill').click();
  await page.waitForSelector('.bottomComposerBar.isFolded', { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const result = await page.evaluate(() => {
    const pick = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        selector,
        display: style.display,
        visibility: style.visibility,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
        text: node.textContent?.trim().slice(0, 160) || ''
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      composer: pick('.bottomComposerBar.isFolded'),
      head: pick('.bottomComposerBar.isFolded .composerPanelHead'),
      prompt: pick('.bottomComposerBar.isFolded .composerPromptRow'),
      input: pick('.bottomComposerBar.isFolded .bottomComposerInput textarea'),
      actions: pick('.bottomComposerBar.isFolded .composerActionGroup'),
      generate: pick('.bottomComposerBar.isFolded .composerGenerateAction'),
      optimize: pick('.bottomComposerBar.isFolded .composerAssistantAction'),
      thread: pick('.bottomComposerBar.isFolded .composerThread'),
      params: pick('.bottomComposerBar.isFolded .composerParamShelf'),
      liveStatus: pick('.bottomComposerBar.isFolded .composerLiveStatus')
    };
  });

  assert(result.composer, 'folded: composer is not visible.', result);
  assert(result.composer.height <= 88, 'folded: composer is still too tall.', result);
  assert(result.composer.bottom <= result.viewport.height + 1, 'folded: composer bottom escaped the viewport.', result);
  assert(result.composer.width >= 460, 'folded: composer became too narrow with references open.', result);
  for (const key of ['head', 'prompt', 'input', 'actions', 'generate', 'optimize']) {
    assert(result[key], `folded: ${key} is not visible.`, result);
    assert(inside(result.composer, result[key]), `folded: ${key} escaped the composer.`, result);
  }
  for (const key of ['thread', 'params', 'liveStatus']) {
    assert(!result[key] || result[key].display === 'none' || result[key].height <= 0, `folded: ${key} should not occupy folded layout.`, result);
  }
  assert(result.head.width <= 56 && result.head.text.length === 0, 'folded: header still behaves like a title block instead of a compact expand button.', result);
  assert(result.prompt.x - result.composer.x <= 72, 'folded: prompt starts too far right, leaving an empty title area.', result);
  assert(!/创作会话|提示词优化|生成/.test(result.head.text), 'folded: header text leaked into the minimized composer.', result);
  assert(result.input.width >= 360, 'folded: input is not usable.', result);
  assert(result.actions.y >= result.prompt.y - 1 && result.actions.bottom <= result.prompt.bottom + 1, 'folded: actions are not aligned with input row.', result);
  assert(result.generate.width >= 52 && result.optimize.width >= 52, 'folded: action buttons are clipped or too narrow.', result);

  await page.close();
  return result;
}

async function runReopenScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1033, height: 535 } });
  await installRoutes(page);
  await page.addInitScript(({ layoutKey, sessionKey }) => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.setItem(layoutKey, JSON.stringify({
      prompt: false,
      references: true,
      parameters: true,
      parametersRail: false,
      bottomComposer: false,
      composerParameters: false,
      composerFolded: false,
      flowMode: 'canvas'
    }));
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: 'composer-reopen-smoke-session',
      mode: 'image',
      status: 'idle',
      message: '',
      progress: { stage: 'idle', percent: 0, completed: 0, total: 1 },
      prompt: '1:1方图，1024x1024，原创二次元机甲插画。',
      model: 'gpt-image-2',
      assistantMessages: [],
      promptSuggestion: null,
      generationQueue: [],
      canvasNodes: []
    }));
  }, { layoutKey, sessionKey });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.bottomComposerReopenDock', { timeout: 15000 });
  const before = await page.evaluate(() => {
    const dock = document.querySelector('.bottomComposerReopenDock');
    const box = dock?.getBoundingClientRect();
    const center = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    const top = center ? document.elementFromPoint(center.x, center.y) : null;
    return {
      dock: box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom, center } : null,
      topElement: top ? { tag: top.tagName, className: String(top.className || ''), text: top.textContent?.trim().slice(0, 80) || '' } : null
    };
  });
  assert(before.dock, 'reopen: dock is not visible.', before);
  assert(before.topElement?.className?.includes('bottomComposerReopen') || before.topElement?.tag === 'BUTTON', 'reopen: dock is covered by another layer.', before);
  await page.mouse.click(before.dock.center.x, before.dock.center.y);
  await page.waitForSelector('.bottomComposerBar.isExpandedComposer', { timeout: 5000 });
  const after = await page.evaluate((key) => ({
    dockVisible: Boolean(document.querySelector('.bottomComposerReopenDock')),
    expandedVisible: Boolean(document.querySelector('.bottomComposerBar.isExpandedComposer')),
    foldedVisible: Boolean(document.querySelector('.bottomComposerBar.isFolded')),
    layout: localStorage.getItem(key)
  }), layoutKey);
  assert(after.expandedVisible && !after.dockVisible && !after.foldedVisible, 'reopen: clicking dock did not restore the expanded composer.', { before, after });
  await page.close();
  return { before, after };
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
  const result = await runScenario(browser, baseUrl);
  const reopen = await runReopenScenario(browser, baseUrl);
  console.log(JSON.stringify({ ok: true, screenshotPath, result, reopen }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
