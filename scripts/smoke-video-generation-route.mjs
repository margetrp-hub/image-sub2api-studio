import { chromium } from 'playwright';
import { createServer } from 'vite';
import { clickGenerate, fillGenerationPrompt } from './smoke-ui-helpers.mjs';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/video-generation-route.png`;
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const fakeBaseUrl = 'https://video-route-smoke.example/v1';
const fakeSecret = 'test-key-video-route-smoke-session-only';

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
  const browserErrors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() });
  });
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });

  const requests = {
    modelSync: [],
    models: [],
    videoCreates: [],
    videoPolls: [],
    imageGenerations: [],
    responses: []
  };

  await page.route('**/studio-api/library**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, categories: [], styles: [], scenes: [], cases: [], videoInspirations: [] })
  }));
  await page.route('**/studio-api/history**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, records: [], total: 0, nextOffset: null })
  }));
  await page.route('**/studio-api/session**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, session: null })
  }));
  await page.route('**/studio-api/generation-jobs**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, jobs: [] })
  }));
  await page.route('**/studio-api/model-sync', (route) => {
    const body = route.request().postDataJSON();
    requests.modelSync.push({ method: route.request().method(), gatewayBaseUrl: body.gatewayBaseUrl, providerType: body.providerType });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, models: [
        { id: 'gpt-image-2', capabilities: ['image_generation'] },
        { id: 'veo3', capabilities: ['video_generation'] },
        { id: 'gpt-5.5' }
      ] })
    });
  });
  await page.route('**/api/v1/models', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ object: 'list', data: [] })
  }));
  await page.route(`${fakeBaseUrl}/models`, (route) => {
    requests.models.push({ method: route.request().method(), url: route.request().url() });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'list',
        data: [
          { id: 'gpt-image-2', object: 'model', capabilities: ['image_generation'] },
          { id: 'veo3', object: 'model', capabilities: ['video_generation'] },
          { id: 'gpt-5.5', object: 'model' }
        ]
      })
    });
  });
  await page.route(`${fakeBaseUrl}/usage`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ total: 0, requests: 0 })
  }));
  await page.route(`${fakeBaseUrl}/video/generations`, (route) => {
    requests.videoCreates.push({
      method: route.request().method(),
      url: route.request().url(),
      body: route.request().postDataJSON()
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        task_id: 'video-route-smoke-task',
        status: 'completed',
        video_url: 'https://video-route-smoke.example/output.mp4',
        progress: 100
      })
    });
  });
  await page.route(`${fakeBaseUrl}/video/generations/*`, (route) => {
    requests.videoPolls.push({ method: route.request().method(), url: route.request().url() });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        task_id: 'video-route-smoke-task',
        status: 'completed',
        video_url: 'https://video-route-smoke.example/output.mp4',
        progress: 100
      })
    });
  });
  await page.route('https://video-route-smoke.example/output.mp4', (route) => route.fulfill({
    status: 200,
    contentType: 'video/mp4',
    body: ''
  }));
  await page.route(`${fakeBaseUrl}/images/generations`, (route) => {
    requests.imageGenerations.push({ method: route.request().method(), url: route.request().url() });
    return route.abort();
  });
  await page.route(`${fakeBaseUrl}/responses`, (route) => {
    requests.responses.push({ method: route.request().method(), url: route.request().url() });
    return route.abort();
  });

  await page.addInitScript(({ providerSettingsKey, manualSecretKey, fakeBaseUrl, fakeSecret }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('image-sub2api-studio-language', 'en');
    localStorage.setItem(providerSettingsKey, JSON.stringify({
      providerId: 'newapi-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: fakeBaseUrl,
      route: 'auto',
      imageGenerationModel: 'gpt-image-2',
      imageEditModel: 'gpt-image-2',
      videoModel: 'veo3',
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    sessionStorage.setItem(manualSecretKey, fakeSecret);
  }, { providerSettingsKey, manualSecretKey, fakeBaseUrl, fakeSecret });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 12000 });
  await page.locator('.workbenchModeSwitch button').filter({ hasText: 'Video' }).first().click();
  const videoOptions = await page.locator('.singleParamsGrid select').allTextContents();
  const videoOptionText = videoOptions.join('\n');
  for (const label of ['Auto', 'Push in', 'Pull out', 'Orbit', 'Pan', 'Static', 'Cinematic', 'Product ad', 'Realistic', 'Animation']) {
    assert(videoOptionText.includes(label), `Video parameter label was not translated: ${label}`, { videoOptions });
  }
  assert(!/[\u3400-\u9fff]/.test(videoOptionText), 'English video options must not contain Chinese UI labels.', { videoOptions });
  await fillGenerationPrompt(page, 'Five second product video, slow push-in camera, clean studio light, no captions.');
  await clickGenerate(page);
  await page.locator('.generationConfirmPrimary').click();
  await page.waitForFunction(() => (
    document.querySelectorAll('.resultGrid video, .canvasNode video').length >= 1
    || /failed|error|No video models|视频模型|未开放视频/i.test(document.body.innerText)
  ), null, { timeout: 12000 }).catch(() => {});
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(({ providerSettingsKey, manualSecretKey, fakeSecret }) => ({
    body: document.body.innerText.slice(0, 1800),
    persistedSettings: localStorage.getItem(providerSettingsKey) || '',
    sessionSecret: sessionStorage.getItem(manualSecretKey) || '',
    hasSecretInDom: document.body.innerText.includes(fakeSecret),
    canvasVideos: document.querySelectorAll('.canvasNode video').length,
    resultVideos: document.querySelectorAll('.resultGrid video, .canvasNode video').length,
    routeLabel: document.body.innerText.includes('/v1/video/generations')
  }), { providerSettingsKey, manualSecretKey, fakeSecret });
  result.browserErrors = browserErrors;
  result.failedRequests = failedRequests;

  assert(requests.modelSync.length >= 1, 'Video provider did not use the model-sync service bridge.', { requests, result });
  assert(requests.modelSync.every((request) => request.method === 'POST' && request.gatewayBaseUrl === fakeBaseUrl && request.providerType === 'newapi-compatible'), 'Model sync did not preserve the configured provider.', { requests, result });
  assert(requests.models.length === 0, 'A healthy model-sync bridge must not trigger a direct fallback.', { requests, result });
  assert(requests.videoCreates.length === 1, 'Video generation should create exactly one task.', { requests, result });
  assert(requests.videoCreates[0].url === `${fakeBaseUrl}/video/generations`, 'Video generation did not use /v1/video/generations.', { requests, result });
  assert(requests.videoCreates[0].body?.model === 'veo3', 'Video task did not use the configured video model.', { requests, result });
  assert(requests.videoCreates[0].body?.duration === 5, 'Video task did not preserve the selected duration.', { requests, result });
  assert(requests.videoCreates[0].body?.width === 1280 && requests.videoCreates[0].body?.height === 720, 'Video task did not send concrete dimensions for 16:9.', { requests, result });
  assert(requests.videoCreates[0].body?.metadata?.camera_motion, 'Video task did not include motion metadata for compatible gateways.', { requests, result });
  assert(requests.imageGenerations.length === 0, 'Video generation must not call /v1/images/generations.', { requests, result });
  assert(requests.responses.length === 0, 'Video generation must not call /v1/responses.', { requests, result });
  assert(result.resultVideos >= 1, 'Successful video generation did not render a video result.', result);
  assert(result.routeLabel, 'Video confirmation/status did not expose the concrete video route.', result);
  assert(!result.persistedSettings.includes(fakeSecret), 'Manual API key leaked into localStorage during video generation.', result);
  assert(result.sessionSecret === fakeSecret, 'Manual API key was not retained in sessionStorage.', result);
  assert(!result.hasSecretInDom, 'Manual API key leaked into visible page text.', result);
  assert(browserErrors.length === 0, 'Video route produced unexpected browser errors or warnings.', result);
  assert(failedRequests.length === 0, 'Video route had unexpected failed network requests.', result);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    requests,
    result
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
