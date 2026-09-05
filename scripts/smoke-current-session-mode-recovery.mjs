import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
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
}

async function runScenario(browser, baseUrl, scenario) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await installRoutes(page);
  await page.addInitScript(({ sessionKey, session }) => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    if (session.scopedOnly) {
      localStorage.removeItem(sessionKey);
      localStorage.setItem(`${sessionKey}:active`, session.sessionId);
      localStorage.setItem(`${sessionKey}:${session.sessionId}`, JSON.stringify(session));
    } else {
      localStorage.setItem(sessionKey, JSON.stringify(session));
    }
  }, { sessionKey, session: scenario.session });

  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));
  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.creationDesk', { timeout: 10000 }).catch(async (error) => {
    const body = await page.evaluate(() => document.body.innerText).catch(() => '');
    throw new Error(`${scenario.name}: creation desk did not mount. ${error.message}\n${JSON.stringify({ body, consoleMessages }, null, 2)}`);
  });
  await page.waitForTimeout(500);
  if (scenario.session.canvasNodes?.length || scenario.session.mode === 'mask') {
    await page.getByRole('button', { name: /无限画布/ }).click();
    await page.waitForTimeout(400);
  }
  await page.locator('.composerParamSummary').click().catch(() => {});
  await page.waitForTimeout(200);
  const screenshotPath = `${screenshotDir}/current-session-mode-${scenario.name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(() => ({
    body: document.body.innerText,
    deskClassName: document.querySelector('.creationDesk')?.className || '',
    workspaceNav: [...document.querySelectorAll('.sidePrimaryNav button')].map((button) => ({
      text: button.innerText,
      active: button.classList.contains('active')
    })),
    composerSummary: document.querySelector('.composerParamSummary')?.innerText || '',
    parameterSelects: [...document.querySelectorAll('.composerParamField select, .controlField select, .paramDrawer select, .singleField select')].map((select) => ({
      value: select.value,
      text: select.selectedOptions?.[0]?.innerText || ''
    })),
    modeButtons: [...document.querySelectorAll('.composerModeSegment button, .composerModeSegment.singleMode')].map((node) => node.innerText),
    storedMode: (() => {
      const storageKey = 'image-sub2api-studio:current-session:v1';
      const activeId = localStorage.getItem(`${storageKey}:active`);
      return JSON.parse(localStorage.getItem(activeId ? `${storageKey}:${activeId}` : storageKey) || '{}')?.mode || '';
    })()
  }));

  for (const text of scenario.mustInclude) {
    assert(result.body.includes(text), `${scenario.name}: restored page did not include "${text}".`, { screenshotPath, result });
  }
  for (const text of scenario.mustNotInclude || []) {
    assert(!result.body.includes(text), `${scenario.name}: restored page should not include "${text}".`, { screenshotPath, result });
  }
  if (scenario.expectedSelectValue) {
    assert(
      result.parameterSelects.some((select) => select.value === scenario.expectedSelectValue || select.text === scenario.expectedSelectValue),
      `${scenario.name}: restored parameter select did not keep "${scenario.expectedSelectValue}".`,
      { screenshotPath, result }
    );
  }
  assert(result.storedMode === scenario.session.mode, `${scenario.name}: stored mode changed unexpectedly.`, { screenshotPath, result });

  await page.close();
  return { name: scenario.name, screenshotPath, result };
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
  const scenarios = [
    {
      name: 'local-scoped',
      session: {
        scopedOnly: true,
        sessionId: 'mode-recovery-local-scoped-session',
        mode: 'image',
        status: 'idle',
        prompt: 'Restore a scoped local manual-key session after refresh.',
        model: 'gpt-image-2',
        generationQueue: [],
        assistantMessages: [],
        canvasNodes: [
          {
            id: 'local-scoped-node-1',
            canvasIndex: 1,
            kind: 'image',
            url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22220%22%3E%3Crect width=%22320%22 height=%22220%22 fill=%22%230f766e%22/%3E%3Ctext x=%22160%22 y=%22122%22 fill=%22white%22 font-size=%2238%22 text-anchor=%22middle%22%3ELOCAL%3C/text%3E%3C/svg%3E',
            prompt: 'Restore a scoped local manual-key session after refresh.'
          }
        ]
      },
      mustInclude: ['Restore a scoped local manual-key', '#1', '1 节点'],
      mustNotInclude: ['/v1/images/edits']
    },
    {
      name: 'mask',
      session: {
        sessionId: 'mode-recovery-mask-session',
        mode: 'mask',
        status: 'idle',
        prompt: 'Restore a mask editing session without falling back to text-to-image.',
        model: 'gpt-image-2',
        generationQueue: [],
        assistantMessages: [],
        canvasNodes: []
      },
      mustInclude: ['Mask', '透明区 = 要重绘'],
      mustNotInclude: ['/v1/images/generations']
    },
    {
      name: 'video',
      session: {
        sessionId: 'mode-recovery-video-session',
        mode: 'video',
        status: 'idle',
        prompt: 'Restore a video creation session.',
        model: 'gpt-image-2',
        parameters: {
          videoModel: 'veo3',
          videoAspect: '16:9',
          videoDuration: 8,
          videoFps: 24,
          videoMotion: 'pan',
          videoStyle: 'cinematic',
          videoQuality: 'high'
        },
        generationQueue: [],
        assistantMessages: [],
        canvasNodes: []
      },
      mustInclude: ['视频创作'],
      mustNotInclude: ['文生图'],
      expectedSelectValue: 'veo3'
    }
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(browser, baseUrl, scenario));
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
