import { chromium } from 'playwright';
import { createServer } from 'vite';
import { clickGenerate, fillGenerationPrompt } from './smoke-ui-helpers.mjs';

const screenshotPath = 'output/playwright/image-generation-route.png';
const idleScreenshotPath = 'output/playwright/single-idle-layout.png';
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const fakeSecret = 'test-key-image-route-smoke-session-only';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function sanitizedJobBody(route) {
  if (route.request().method() !== 'POST') return null;
  const body = route.request().postDataJSON();
  return {
    ...body,
    apiKey: body?.apiKey ? '[session-secret]' : body?.apiKey
  };
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

  const requests = {
    generations: [],
    edits: [],
    responses: [],
    chat: [],
    jobs: [],
    communityPrompts: []
  };

  await page.route('**/studio-api/community-prompts', (route) => {
    const body = route.request().postDataJSON();
    requests.communityPrompts.push(body);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        item: {
          ...body,
          id: 'share-route-smoke',
          kind: 'community-prompt',
          sourceName: 'route-smoke',
          promptPreview: body.prompt,
          reactions: { up: 0, down: 0 },
          copied: 0,
          shared: 0,
          userReaction: ''
        }
      })
    });
  });

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
  await page.route('**/studio-api/generation-jobs**', (route) => {
    requests.jobs.push({
      method: route.request().method(),
      url: route.request().url(),
      body: sanitizedJobBody(route)
    });
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'QUEUE_DISABLED_FOR_ROUTE_SMOKE' })
    });
  });
  await page.route('https://manual-route-smoke.example/v1/images/generations', (route) => {
    requests.generations.push({
      method: route.request().method(),
      url: route.request().url(),
      body: route.request().postDataJSON()
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: [{
          b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
          revised_prompt: 'route smoke image'
        }]
      })
    });
  });
  await page.route('https://manual-route-smoke.example/v1/images/edits', (route) => {
    requests.edits.push({
      method: route.request().method(),
      url: route.request().url()
    });
    return route.abort();
  });
  await page.route('https://manual-route-smoke.example/v1/responses', (route) => {
    requests.responses.push({
      method: route.request().method(),
      url: route.request().url()
    });
    return route.abort();
  });
  await page.route('https://manual-route-smoke.example/v1/chat/completions', (route) => {
    requests.chat.push({
      method: route.request().method(),
      url: route.request().url()
    });
    return route.abort();
  });

  await page.addInitScript(({ providerSettingsKey, manualSecretKey, fakeSecret }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('image-sub2api-studio:theme:v1', 'dark');
    localStorage.setItem('image-sub2api-studio-language', 'en');
    localStorage.setItem('sub2api-studio:session:v1', JSON.stringify({
      accessToken: 'route-smoke-user-token',
      user: { id: 'route-smoke-user', username: 'route-smoke' }
    }));
    localStorage.setItem(providerSettingsKey, JSON.stringify({
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: 'https://manual-route-smoke.example/v1',
      route: 'auto',
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    localStorage.setItem('image-sub2api-studio:draft:v1', JSON.stringify({
      count: 10
    }));
    sessionStorage.setItem(manualSecretKey, fakeSecret);
  }, { providerSettingsKey, manualSecretKey, fakeSecret });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 12000 });
  await page.setViewportSize({ width: 1716, height: 923 });
  const idleLayout = await page.evaluate(() => {
    const shell = document.querySelector('.singleGenerationShell')?.getBoundingClientRect();
    const control = document.querySelector('.singleGenerationControlColumn')?.getBoundingClientRect();
    const result = document.querySelector('.singleLatestResult')?.getBoundingClientRect();
    const status = document.querySelector('.singleStatusPanel')?.getBoundingClientRect();
    return {
      resultBottomGap: shell && result ? shell.bottom - result.bottom : 999,
      controlBottomGap: shell && control ? shell.bottom - control.bottom : 999,
      statusHeight: status?.height || 999
    };
  });
  await page.screenshot({ path: idleScreenshotPath });
  await page.setViewportSize({ width: 1440, height: 980 });
  await fillGenerationPrompt(page, 'A tiny route smoke test image, simple product icon on clean background.');
  await clickGenerate(page);
  await page.locator('.generationConfirmPrimary').click();
  await page.waitForFunction(() => document.querySelector('.resultCarouselPosition')?.textContent?.includes('4 / 4'), null, { timeout: 12000 });
  const carouselBefore = await page.evaluate(() => ({
    figures: document.querySelectorAll('.singleLatestResult .resultGridCarousel figure').length,
    images: document.querySelectorAll('.singleLatestResult .resultGridCarousel img').length,
    alt: document.querySelector('.singleLatestResult .resultGridCarousel img')?.alt || '',
    position: document.querySelector('.singleLatestResult .resultCarouselPosition')?.textContent || '',
    previousDisabled: document.querySelector('.singleLatestResult .resultCarouselPrevious')?.disabled,
    nextDisabled: document.querySelector('.singleLatestResult .resultCarouselNext')?.disabled
  }));
  const singleLayout = await page.evaluate(() => {
    const workspace = document.querySelector('.singleGenerationWorkspace');
    const controlColumn = document.querySelector('.singleGenerationControlColumn');
    const resultSide = document.querySelector('.singleGenerationSide');
    const formPanel = controlColumn?.querySelector(':scope > .singleGenerationFormPanel');
    const statusPanel = controlColumn?.querySelector(':scope > .singleStatusPanel');
    const formRect = formPanel?.getBoundingClientRect();
    const statusRect = statusPanel?.getBoundingClientRect();
    const controlRect = controlColumn?.getBoundingClientRect();
    const providerRect = formPanel?.querySelector('.singleFieldGrid > .singleField:first-child')?.getBoundingClientRect();
    const modelRect = formPanel?.querySelector('.singleFieldGrid > .singleField:nth-child(2)')?.getBoundingClientRect();
    const timingListRect = statusPanel?.querySelector('.generationTimingPanel dl')?.getBoundingClientRect();
    const timingItems = [...(statusPanel?.querySelectorAll('.generationTimingPanel dl > div') || [])];
    const timingLastRect = timingItems.at(-1)?.getBoundingClientRect();
    return {
      statusInControlColumn: Boolean(controlColumn?.querySelector(':scope > .singleStatusPanel')),
      hasTipsPanel: Boolean(controlColumn?.querySelector(':scope > .singleTipsPanel')),
      resultSidePanels: resultSide?.children.length || 0,
      workspaceScrolls: Boolean(workspace && workspace.scrollHeight > workspace.clientHeight + 1),
      controlColumnScrolls: Boolean(controlColumn && controlColumn.scrollHeight > controlColumn.clientHeight + 1),
      formHeight: formRect?.height || 0,
      formScrollHeight: formPanel?.scrollHeight || 0,
      formBottom: formRect?.bottom || 0,
      statusTop: statusRect?.top || 0,
      statusHeight: statusRect?.height || 0,
      formRightGap: controlRect && formRect ? controlRect.right - formRect.right : 999,
      statusRightGap: controlRect && statusRect ? controlRect.right - statusRect.right : 999,
      fieldTopDelta: providerRect && modelRect ? Math.abs(providerRect.top - modelRect.top) : 999,
      timingLastRightGap: timingListRect && timingLastRect ? timingListRect.right - timingLastRect.right : 999,
      batchInputValue: Number(formPanel?.querySelector('input[type="number"]')?.value || 0)
    };
  });
  await page.locator('.singleLatestResult .resultCarouselPrevious').click();
  const carouselAfterPrevious = await page.evaluate(() => ({
    alt: document.querySelector('.singleLatestResult .resultGridCarousel img')?.alt || '',
    position: document.querySelector('.singleLatestResult .resultCarouselPosition')?.textContent || ''
  }));
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.waitForTimeout(100);
  const widescreenLayout = await page.evaluate(() => {
    const workspace = document.querySelector('.singleGenerationWorkspace');
    const controlColumn = document.querySelector('.singleGenerationControlColumn');
    return {
      workspaceScrolls: Boolean(workspace && workspace.scrollHeight > workspace.clientHeight + 1),
      controlColumnScrolls: Boolean(controlColumn && controlColumn.scrollHeight > controlColumn.clientHeight + 1),
      workspaceHeight: workspace?.clientHeight || 0,
      controlColumnHeight: controlColumn?.clientHeight || 0,
      controlColumnScrollHeight: controlColumn?.scrollHeight || 0
    };
  });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(({ providerSettingsKey, manualSecretKey, fakeSecret }) => ({
    body: document.body.innerText.slice(0, 1800),
    persistedSettings: localStorage.getItem(providerSettingsKey) || '',
    sessionSecret: sessionStorage.getItem(manualSecretKey) || '',
    hasSecretInDom: document.body.innerText.includes(fakeSecret),
    canvasNodes: document.querySelectorAll('.canvasNode').length,
    resultImages: document.querySelectorAll('.resultGrid img, .canvasNode img').length,
    composerHasResultStrip: Boolean(document.querySelector('.bottomComposerBar .composerResultStrip')),
    composerHasThread: document.querySelector('.bottomComposerBar')?.classList.contains('hasThread') || false
  }), { providerSettingsKey, manualSecretKey, fakeSecret });

  assert(requests.jobs.length >= 1, 'The page did not try the restorable generation queue before fallback.', { requests, result });
  const createdJobRequests = requests.jobs.filter((request) => request.method === 'POST');
  const batchRequests = createdJobRequests.map((request) => request.body?.request || {});
  assert(createdJobRequests.length === 4, 'A four-image batch should create four independent server jobs.', { requests, result });
  assert(batchRequests.every((request) => request.size === '1024x1024'), 'Server generation jobs did not receive the provider-normalized size.', { requests, result });
  assert(batchRequests.every((request) => request.quality === 'medium'), 'Server generation jobs did not receive the provider-normalized quality.', { requests, result });
  assert(batchRequests.every((request) => request.resolutionTier === '1k'), 'Server generation jobs did not receive the normalized resolution tier.', { requests, result });
  assert(batchRequests.every((request) => request.count === 1 && request.n === 1), 'Each independent batch job must request exactly one image.', { requests, result });
  assert(new Set(batchRequests.map((request) => request.batchId)).size === 1 && batchRequests[0]?.batchId, 'Independent batch jobs should share one batch id.', { requests, result });
  assert(new Set(batchRequests.map((request) => request.batchIndex)).size === 4, 'Independent batch jobs should carry unique batch indexes.', { requests, result });
  assert(new Set(batchRequests.map((request) => request.fingerprint)).size === 4, 'Independent batch jobs should carry unique dedupe fingerprints.', { requests, result });
  assert(requests.generations.length === 4, 'Text-to-image count must be clamped to the provider countRange before dispatch.', { requests, result });
  assert(requests.generations[0].body?.model === 'gpt-image-2', 'Text-to-image did not use the image model in the generations payload.', { requests, result });
  assert(requests.generations.every((request) => request.body?.n === 1), 'Legacy images generation should dispatch one image per upstream request.', { requests, result });
  assert(requests.generations[0].body?.prompt?.includes('Resolution target: 1K'), 'English image requests should append an English resolution hint.', { requests, result });
  assert(!/[\u4e00-\u9fff]/.test(requests.generations[0].body?.prompt || ''), 'English image requests must not append Chinese prompt hints.', { requests, result });
  assert(requests.responses.length === 0, 'Default text-to-image must not call /v1/responses.', { requests, result });
  assert(requests.edits.length === 0, 'Text-to-image without references must not call /v1/images/edits.', { requests, result });
  assert(requests.chat.length === 0, 'Generate action must not call the prompt assistant chat endpoint.', { requests, result });
  assert(!result.persistedSettings.includes(fakeSecret), 'Manual API key leaked into localStorage during generation.', result);
  assert(!JSON.stringify(requests).includes(fakeSecret), 'Manual API key leaked into smoke request evidence.', { requests, result });
  assert(result.sessionSecret === fakeSecret, 'Manual API key was not retained in sessionStorage for the current session.', result);
  assert(!result.hasSecretInDom, 'Manual API key leaked into visible page text.', result);
  assert(result.resultImages >= 1, 'Successful generation did not render a result image.', result);
  assert(carouselBefore.figures === 1 && carouselBefore.images === 1, 'Single-generation mode should render one large result at a time.', carouselBefore);
  assert(carouselBefore.alt.endsWith(' 4') && carouselBefore.position.includes('4 / 4'), 'The result carousel should open on the latest image.', carouselBefore);
  assert(carouselBefore.previousDisabled === false && carouselBefore.nextDisabled === true, 'Latest result navigation controls have the wrong initial state.', carouselBefore);
  assert(carouselAfterPrevious.alt.endsWith(' 3') && carouselAfterPrevious.position.includes('3 / 4'), 'The previous result button did not move to the preceding image.', carouselAfterPrevious);
  assert(singleLayout.statusInControlColumn, 'Generation status should be placed in the left control column.', singleLayout);
  assert(!singleLayout.hasTipsPanel, 'The redundant single-generation tips panel should not consume workspace height.', singleLayout);
  assert(singleLayout.resultSidePanels === 1, 'The right side should contain only the result panel.', singleLayout);
  assert(!singleLayout.workspaceScrolls, 'Desktop single-generation workspace should fit without whole-page vertical scrolling.', singleLayout);
  assert(Math.abs(idleLayout.resultBottomGap) <= 2 && Math.abs(idleLayout.controlBottomGap) <= 2, 'Idle single-generation columns should fill the workspace instead of leaving a blank footer.', idleLayout);
  assert(idleLayout.statusHeight < 100, 'The idle status panel should stay content-sized instead of becoming an empty filler card.', idleLayout);
  assert(!singleLayout.controlColumnScrolls, 'Desktop single-generation controls should fit without an internal scrollbar at the reference viewport.', singleLayout);
  assert(singleLayout.formHeight >= singleLayout.formScrollHeight - 1, 'The single-generation form clipped its own content.', singleLayout);
  assert(singleLayout.statusTop >= singleLayout.formBottom, 'The generation status overlapped the single-generation form.', singleLayout);
  assert(Math.abs(singleLayout.formRightGap) <= 2 && Math.abs(singleLayout.statusRightGap) <= 2, 'Left-column panels should align to the control-column edge.', singleLayout);
  assert(singleLayout.fieldTopDelta <= 1, 'Provider and model controls should start on the same row.', singleLayout);
  assert(singleLayout.timingLastRightGap <= 8, 'Generation timing metrics should fill the final row without a blank tail.', singleLayout);
  assert(singleLayout.batchInputValue === 4, 'The batch control should retain the requested batch size while independent jobs run.', singleLayout);
  assert(!widescreenLayout.workspaceScrolls && !widescreenLayout.controlColumnScrolls, 'Widescreen single-generation mode should fit without vertical scrolling.', widescreenLayout);
  assert(!result.composerHasResultStrip, 'Generation results should stay on canvas/history, not inside the bottom chat composer.', result);
  assert(!result.composerHasThread, 'A successful result alone should not expand the bottom composer thread.', result);

  await page.locator('.singleLatestResult .resultShareButton').click();
  await page.waitForSelector('.inspirationUploadPanel .inspirationSharePreview', { timeout: 8000 });
  const shareDialog = await page.evaluate(() => ({
    preview: Boolean(document.querySelector('.inspirationSharePreview img')),
    parameterText: document.querySelector('.inspirationParameterSummary')?.textContent || '',
    prompt: document.querySelector('.inspirationUploadPanel textarea')?.value || ''
  }));
  await page.locator('.inspirationUploadPanel button[type="submit"]').click();
  await page.waitForFunction(() => document.body.innerText.includes('tiny route smoke test image'), null, { timeout: 8000 });
  const shared = requests.communityPrompts[0];
  assert(shareDialog.preview, 'Result share should preview the generated image before publishing.', shareDialog);
  assert(shareDialog.parameterText.includes('gpt-image-2') && shareDialog.parameterText.includes('1:1'), 'Result share should display model and aspect settings.', shareDialog);
  assert(shareDialog.prompt.includes('tiny route smoke test image'), 'Result share should prefill the original prompt.', shareDialog);
  assert(shared?.image?.startsWith('data:image/png;base64,'), 'Result share should include the generated image.', shared);
  assert(shared?.generation?.model === 'gpt-image-2' && shared?.generation?.aspectRatio === '1:1', 'Result share should submit model and aspect metadata.', shared);
  assert(shared?.generationPrompt?.includes('Resolution target: 1K'), 'Result share should preserve the actual generation prompt.', shared);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    idleScreenshotPath,
    idleLayout,
    shareDialog,
    requests,
    result
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
