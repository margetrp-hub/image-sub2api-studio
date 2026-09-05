import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/project-session-grouping.png`;

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="${color}"/><text x="320" y="330" fill="white" font-family="Arial" font-size="72" text-anchor="middle">${label}</text></svg>`)}`;
}

function historyRecords() {
  const now = Date.now();
  return [0, 1, 2].map((index) => ({
    id: `project-record-${index + 1}`,
    sessionId: 'project-session-one',
    mode: 'image',
    model: 'gpt-image-2',
    createdAt: new Date(now - index * 1000).toISOString(),
    prompt: `Subject: grouped project session\n\nStep ${index + 1}: keep the same product and refine composition`,
    generationPrompt: `Subject: grouped project session\n\nStep ${index + 1}: keep the same product and refine composition`,
    resultUrls: [svgDataUrl(`#${index + 1}`, ['#2f6fed', '#11a36a', '#b66a1f'][index])],
    displayResultUrls: [svgDataUrl(`#${index + 1}`, ['#2f6fed', '#11a36a', '#b66a1f'][index])],
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
      sessionId: 'project-current-empty',
      prompt: '',
      canvasNodes: [],
      generationQueue: [],
      assistantMessages: []
    }));
  }, historyRecords());

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.sideProjectList', { timeout: 8000 });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const sidebarResult = await page.evaluate(() => ({
    projectItems: document.querySelectorAll('.sideProjectItem').length,
    projectTexts: [...document.querySelectorAll('.sideProjectItem')].map((node) => node.innerText),
    body: document.body.innerText.slice(0, 1800)
  }));

  assert(sidebarResult.projectItems === 1, `Expected one sidebar project for one session, got ${sidebarResult.projectItems}.`, sidebarResult);
  assert(sidebarResult.projectTexts[0]?.includes('3 张'), 'Expected grouped sidebar project to show three images.', sidebarResult);

  await page.locator('.sideProjectOpen').first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /无限画布/ }).click();
  await page.waitForTimeout(400);

  const canvasResult = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.canvasNode')].map((node) => node.innerText);
    const text = nodes.join('\n');
    const storageKey = 'image-sub2api-studio:current-session:v1';
    const activeSessionId = localStorage.getItem(`${storageKey}:active`) || '';
    const activeSession = JSON.parse(localStorage.getItem(activeSessionId ? `${storageKey}:${activeSessionId}` : storageKey) || '{}');
    return {
      nodeCount: nodes.length,
      hasStep1: text.includes('Step 1'),
      hasStep2: text.includes('Step 2'),
      hasStep3: text.includes('Step 3'),
      nodes,
      activeSessionId,
      storedSessionId: activeSession.sessionId || ''
    };
  });

  assert(
    canvasResult.nodeCount >= 3 && canvasResult.hasStep1 && canvasResult.hasStep2 && canvasResult.hasStep3,
    'Expected one sidebar project to restore all images from the grouped session.',
    canvasResult
  );
  assert(canvasResult.activeSessionId === 'project-session-one' && canvasResult.storedSessionId === 'project-session-one', 'Opening a history project should adopt that project session id for continued generation.', canvasResult);

  const queuePage = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await queuePage.addInitScript(() => {
    localStorage.setItem('image-sub2api-studio:history:v2:guest', JSON.stringify([]));
    localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify({
      sessionId: 'project-current-unknown-queue',
      prompt: '',
      canvasNodes: [],
      generationQueue: [{
        id: 'queue-unknown-project',
        status: 'unknown',
        prompt: 'A recovered task that still needs history verification',
        summary: 'A recovered task that still needs history verification',
        model: 'gpt-image-2',
        count: 1
      }],
      assistantMessages: []
    }));
  });
  await queuePage.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await queuePage.waitForSelector('.sideProjectList', { timeout: 8000 });
  await queuePage.getByRole('button', { name: /无限画布/ }).click();
  await queuePage.waitForTimeout(400);
  const queueProjectResult = await queuePage.evaluate(() => ({
    projectItems: document.querySelectorAll('.sideProjectItem').length,
    projectTexts: [...document.querySelectorAll('.sideProjectItem')].map((node) => node.innerText),
    queueItems: [...document.querySelectorAll('.canvasQueueItem')].map((node) => node.innerText),
    body: document.body.innerText.slice(0, 1800)
  }));
  assert(queueProjectResult.projectItems >= 1, 'Expected an unknown restored queue to keep the current session visible as a sidebar project.', queueProjectResult);
  assert(queueProjectResult.projectTexts.some((text) => text.includes('当前会话') || text.includes('结果未知') || text.includes('队列')), 'Expected sidebar project to expose the current queue session context.', queueProjectResult);
  assert(queueProjectResult.projectTexts.some((text) => text.includes('1 个任务')), 'Expected queue-only current session to be labeled as a task instead of a generated image.', queueProjectResult);
  assert(!queueProjectResult.projectTexts.some((text) => text.includes('1 张')), 'Queue-only current session should not pretend there is one generated image.', queueProjectResult);
  assert(queueProjectResult.queueItems.some((text) => text.includes('结果未知')), 'Expected restored unknown queue item to remain visible on the canvas.', queueProjectResult);
  await queuePage.close();

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    sidebarResult,
    canvasResult,
    queueProjectResult
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
