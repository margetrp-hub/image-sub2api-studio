import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/language-english.png`;

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

  await page.addInitScript(() => {
    const session = {
      sessionId: 'language-en-session',
      mode: 'image',
      status: 'idle',
      prompt: 'English i18n smoke prompt',
      model: 'gpt-image-2',
      generationQueue: [
        {
          id: 'language-unknown-1',
          status: 'unknown',
          prompt: 'English queue prompt',
          summary: 'English queue prompt',
          model: 'gpt-image-2',
          size: '1024x1024',
          quality: 'high',
          count: 1,
          remote: true,
          restorable: false
        },
        {
          id: 'language-failed-1',
          status: 'failed',
          prompt: 'English failed queue prompt',
          summary: 'ORIGIN_NOT_ALLOWED',
          model: 'gpt-image-2',
          size: '1024x1024',
          quality: 'high',
          count: 1,
          remote: true,
          restorable: false,
          error: {
            status: 403,
            message: 'ORIGIN_NOT_ALLOWED'
          }
        }
      ],
      assistantMessages: [
        {
          id: 'language-user-1',
          role: 'user',
          content: 'Please make the prompt cleaner.',
          pending: false,
          failed: false
        }
      ],
      promptSuggestion: {
        subject: 'Keep the object and its silhouette.',
        scene: 'Use a quiet desk background.',
        composition: 'Center composition with soft negative space.',
        finalPrompt: 'Subject: quiet ceramic object\n\nScene: soft paper background\n\nLight: gentle morning light'
      },
      canvasNodes: []
    };
    localStorage.setItem('image-sub2api-studio-language', 'en');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify(session));
  });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.creationDesk', { timeout: 8000 });
  await page.waitForTimeout(800);

  const singleModeText = await page.locator('.singleGenerationWorkspace').innerText();
  const singleModeCjkMatches = [...singleModeText.matchAll(/[\u4e00-\u9fff]+/g)].map((match) => match[0]);
  assert(singleModeCjkMatches.length === 0, 'English single-generation mode still shows CJK text.', {
    singleModeCjkMatches,
    singleModeText
  });

  await page.getByRole('button', { name: /^Canvas$/ }).click();
  await page.waitForSelector('.canvasGenerationPreview', { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(() => {
    const body = document.body.innerText;
    const title = document.title;
    const rail = document.querySelector('.templateRail')?.innerText || '';
    const composer = document.querySelector('.bottomComposerBar')?.innerText || '';
    const params = document.querySelector('.composerParamShelf')?.innerText || '';
    const paramButtonLabels = [
      ...document.querySelectorAll('.composerParamShelf button, .composerParamShelf label, .composerGenerateAction')
    ]
      .map((button) => button.getAttribute('aria-label') || button.getAttribute('title') || button.innerText || '')
      .filter(Boolean);
    const queueButtonLabels = [...document.querySelectorAll('.canvasQueueItem button')]
      .map((button) => button.getAttribute('aria-label') || button.getAttribute('title') || button.innerText || '')
      .filter(Boolean);
    const pseudoTargets = [
      '.promptTools',
      '.bottomComposerBar',
      '.bottomComposerToggle',
      '.paramRailHead',
      '.settingsDialog .settingsGroup:first-of-type > span',
      '.settingsDialog .providerSettingsGroup > span'
    ];
    const pseudoText = pseudoTargets.flatMap((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [];
      return ['::before', '::after'].map((pseudo) => {
        const content = getComputedStyle(element, pseudo).content;
        return content && content !== 'none' && content !== 'normal'
          ? `${selector}${pseudo}:${content.replace(/^"|"$/g, '')}`
          : '';
      }).filter(Boolean);
    });
    const summaryPieces = [...document.querySelectorAll('.composerParamSummary span, .composerParamSummary em, .composerParamSummary strong')].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        text: element.innerText,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      };
    });
    const summaryOverlaps = [];
    for (let i = 0; i < summaryPieces.length; i += 1) {
      for (let j = i + 1; j < summaryPieces.length; j += 1) {
        const a = summaryPieces[i];
        const b = summaryPieces[j];
        const overlap = !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);
        if (overlap) summaryOverlaps.push([a.text, b.text]);
      }
    }
    return {
      title,
      rail,
      composer,
      params,
      paramButtonLabels,
      queueButtonLabels,
      pseudoText,
      summaryPieces,
      summaryOverlaps,
      body: body.slice(0, 2400)
    };
  });

  const forbiddenCoreLabels = [
    '创作工作台',
    '工作台',
    '当前会话',
    '新建会话',
    '历史图库',
    '灵感库',
    '项目',
    '还没有项目',
    '生成队列',
    '参考图',
    '生成结果',
    '当前参数',
    '图片创作',
    '视频创作',
    '提示词优化'
  ];
  const found = forbiddenCoreLabels.filter((label) => result.body.includes(label));
  assert(found.length === 0, 'English mode still shows core Chinese UI labels.', { found, result });
  const coreUiText = [result.rail, result.composer, result.params].join('\n');
  const cjkMatches = [...coreUiText.matchAll(/[\u4e00-\u9fff]+/g)].map((match) => match[0]);
  assert(cjkMatches.length === 0, 'English mode still shows CJK text in core UI regions.', { cjkMatches, result });
  const pseudoCjkMatches = result.pseudoText.flatMap((item) => [...item.matchAll(/[\u4e00-\u9fff]+/g)].map((match) => ({ item, text: match[0] })));
  assert(pseudoCjkMatches.length === 0, 'English mode still shows CJK text in CSS pseudo labels.', { pseudoCjkMatches, result });
  assert(result.summaryOverlaps.length === 0, 'English parameter summary labels overlap visually.', result);
  assert(result.title === 'Image Agent Studio', 'English mode did not set the document title.', result);
  assert(result.body.includes('New session'), 'English mode did not render the sidebar action in English.', result);
  assert(
    result.body.includes('Generation queue') || result.body.includes('Generation panel'),
    'English mode did not render the queue panel label in English.',
    result
  );
  assert(result.body.includes('Result unknown'), 'English mode did not render queue status in English.', result);
  assert(result.queueButtonLabels.includes('View error details'), 'English mode did not localize the compact error action.', result);
  await page.locator('.canvasQueueItem.failed .canvasQueueErrorSummary').click();
  await page.waitForSelector('.studioErrorDialog');
  const errorDetails = await page.locator('.studioErrorDialog').innerText();
  assert(errorDetails.includes('The Studio service rejected this request'), 'English mode did not localize queue error explanations in the details dialog.', { errorDetails });
  assert(!/[\u4e00-\u9fff]/.test(errorDetails), 'English error dialog still shows CJK UI text.', { errorDetails });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.studioErrorDialog', { state: 'detached' });
  assert(result.body.includes('Prompt') && result.body.includes('AI suggestion'), 'English mode did not localize the right prompt workspace title/source.', result);
  assert(result.body.includes('Subject') && result.body.includes('Scene'), 'English mode did not render the prompt workspace sections.', result);
  assert(result.body.includes('Generate this'), 'English mode did not localize the prompt suggestion generate action.', result);
  assert(result.queueButtonLabels.includes('Dismiss queue notice'), 'English queue dismiss button is missing an English aria/title label.', result);
  assert(!result.queueButtonLabels.some((label) => /[\u4e00-\u9fff]/.test(label)), 'English queue buttons still expose CJK aria/title labels.', result);
  const paramLabelText = [result.params, ...result.paramButtonLabels].join('\n');
  assert(
    paramLabelText.includes('Text to image') && paramLabelText.includes('gpt-image-2') && paramLabelText.includes('Medium') && paramLabelText.includes('1 images') && paramLabelText.includes('Generate'),
    'English mode did not expose current bottom generation parameters in English.',
    result
  );
  for (const label of ['Text to image', 'Generate']) {
    assert(paramLabelText.includes(label), 'English bottom parameter area is missing expected labels.', { label, result });
  }

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    errorDetails,
    result
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
