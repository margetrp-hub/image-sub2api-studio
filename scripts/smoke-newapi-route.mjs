import { chromium } from 'playwright';
import { createServer } from 'vite';
import { clickGenerate, fillGenerationPrompt } from './smoke-ui-helpers.mjs';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/newapi-route.png`;
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const fakeBaseUrl = 'https://newapi-playground-smoke.example/v1';
const fakeSecret = 'test-key-newapi-route-smoke-session-only';

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
    models: [],
    usage: [],
    generations: [],
    responses: [],
    jobs: []
  };

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
      body: JSON.stringify({ ok: false, error: 'QUEUE_DISABLED_FOR_NEWAPI_ROUTE_SMOKE' })
    });
  });
  await page.route(`${fakeBaseUrl}/models`, (route) => {
    requests.models.push({ method: route.request().method(), url: route.request().url() });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'list',
        data: [
          { id: 'gpt-image-2', object: 'model', capabilities: ['image_generation'] },
          { id: 'gpt-5.5', object: 'model' }
        ]
      })
    });
  });
  await page.route(`${fakeBaseUrl}/usage`, (route) => {
    requests.usage.push({ method: route.request().method(), url: route.request().url() });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 0, requests: 0 })
    });
  });
  await page.route(`${fakeBaseUrl}/images/generations`, (route) => {
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
          revised_prompt: 'newapi route smoke image'
        }]
      })
    });
  });
  await page.route(`${fakeBaseUrl}/responses`, (route) => {
    requests.responses.push({
      method: route.request().method(),
      url: route.request().url()
    });
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
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    localStorage.setItem('image-sub2api-studio:draft:v1', JSON.stringify({
      count: 1
    }));
    sessionStorage.setItem(manualSecretKey, fakeSecret);
  }, { providerSettingsKey, manualSecretKey, fakeBaseUrl, fakeSecret });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 12000 });
  await fillGenerationPrompt(page, 'NewAPI route smoke image, clean product-style square icon.');
  await clickGenerate(page);
  await page.locator('.generationConfirmPrimary').click();
  await page.waitForFunction(() => document.querySelectorAll('.resultGrid img, .canvasNode img').length >= 1, null, { timeout: 12000 });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(({ providerSettingsKey, manualSecretKey, fakeSecret }) => ({
    body: document.body.innerText.slice(0, 1800),
    persistedSettings: localStorage.getItem(providerSettingsKey) || '',
    sessionSecret: sessionStorage.getItem(manualSecretKey) || '',
    hasSecretInDom: document.body.innerText.includes(fakeSecret),
    canvasNodes: document.querySelectorAll('.canvasNode').length,
    resultImages: document.querySelectorAll('.resultGrid img, .canvasNode img').length
  }), { providerSettingsKey, manualSecretKey, fakeSecret });

  const createdJobRequest = requests.jobs.find((request) => request.method === 'POST');
  assert(requests.models.length >= 1, 'NewAPI provider did not attempt /v1/models model sync.', { requests, result });
  assert(createdJobRequest?.body?.gatewayBaseUrl === fakeBaseUrl, 'Server job did not receive the NewAPI gateway base URL.', { requests, result });
  assert(createdJobRequest?.body?.request?.providerId === 'newapi-compatible', 'Server job did not preserve the NewAPI provider id.', { requests, result });
  assert(createdJobRequest?.body?.request?.providerFamily === 'newapi-compatible', 'Server job did not preserve the NewAPI provider family.', { requests, result });
  assert(createdJobRequest?.body?.request?.route === 'generations', 'NewAPI text-to-image should use the generations route by default.', { requests, result });
  assert(requests.generations.length === 1, 'NewAPI text-to-image should call /v1/images/generations once for one image.', { requests, result });
  assert(requests.generations[0].body?.model === 'gpt-image-2', 'NewAPI route did not use gpt-image-2 for the images payload.', { requests, result });
  assert(requests.responses.length === 0, 'NewAPI default generation must not call /v1/responses.', { requests, result });
  assert(!result.persistedSettings.includes(fakeSecret), 'Manual NewAPI key leaked into localStorage during generation.', result);
  assert(!JSON.stringify(requests).includes(fakeSecret), 'Manual NewAPI key leaked into smoke request evidence.', { requests, result });
  assert(result.sessionSecret === fakeSecret, 'Manual NewAPI key was not retained in sessionStorage for the current session.', result);
  assert(!result.hasSecretInDom, 'Manual NewAPI key leaked into visible page text.', result);
  assert(result.resultImages >= 1, 'Successful NewAPI-compatible generation did not render a result image.', result);

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
