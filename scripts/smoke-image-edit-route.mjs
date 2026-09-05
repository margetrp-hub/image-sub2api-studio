import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { clickGenerate, fillGenerationPrompt, uploadReferenceImage } from './smoke-ui-helpers.mjs';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/image-edit-route.png`;
const fixtureDir = `${screenshotDir}/fixtures`;
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const fakeSecret = 'test-key-image-edit-route-smoke-session-only';
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAWElEQVR42u3OQQ0AAAgDMMTrf2YKBhhoKrQydc1wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgOwQ0AAEEp43RAAAAAElFTkSuQmCC';

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
    apiKey: body?.apiKey ? '[session-secret]' : body?.apiKey,
    images: Array.isArray(body?.images) ? body.images.map((item) => ({
      name: item?.name,
      type: item?.type,
      hasDataUrl: typeof item?.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')
    })) : body?.images,
    mask: body?.mask ? {
      name: body.mask.name,
      type: body.mask.type,
      hasDataUrl: typeof body.mask.dataUrl === 'string' && body.mask.dataUrl.startsWith('data:image/')
    } : body?.mask
  };
}

async function writeFixture() {
  await fs.mkdir(fixtureDir, { recursive: true });
  const file = path.join(fixtureDir, 'edit-route-reference.png');
  await fs.writeFile(file, Buffer.from(pngBase64, 'base64'));
  return file;
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
  const fixture = await writeFixture();
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  const requests = {
    generations: [],
    edits: [],
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
      body: JSON.stringify({ ok: false, error: 'QUEUE_DISABLED_FOR_EDIT_ROUTE_SMOKE' })
    });
  });
  await page.route('https://manual-edit-route-smoke.example/v1/images/edits', (route) => {
    requests.edits.push({
      method: route.request().method(),
      url: route.request().url(),
      postData: route.request().postData() || ''
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: [{
          b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
          revised_prompt: 'edit route smoke image'
        }]
      })
    });
  });
  await page.route('https://manual-edit-route-smoke.example/v1/images/generations', (route) => {
    requests.generations.push({ method: route.request().method(), url: route.request().url() });
    return route.abort();
  });
  await page.route('https://manual-edit-route-smoke.example/v1/responses', (route) => {
    requests.responses.push({ method: route.request().method(), url: route.request().url() });
    return route.abort();
  });

  await page.addInitScript(({ providerSettingsKey, manualSecretKey, fakeSecret }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('image-sub2api-studio-language', 'en');
    localStorage.setItem(providerSettingsKey, JSON.stringify({
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: 'https://manual-edit-route-smoke.example/v1',
      route: 'auto',
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    sessionStorage.setItem(manualSecretKey, fakeSecret);
  }, { providerSettingsKey, manualSecretKey, fakeSecret });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 12000 });
  await uploadReferenceImage(page, fixture);
  await page.waitForFunction(() => (
    document.querySelectorAll('.singleReferenceThumbs figure, .referenceSideBody.hasReferenceItems .sideReferenceThumbs figure').length >= 1
  ), null, { timeout: 12000 });
  await fillGenerationPrompt(page, 'Use the uploaded reference image and make the object cleaner with softer lighting.');
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
  assert(createdJobRequest?.body?.request?.route === 'edits', 'Reference edit job must declare edits route.', { requests, result });
  assert(createdJobRequest?.body?.request?.mode === 'edit', 'Reference edit job must preserve edit mode.', { requests, result });
  assert(createdJobRequest?.body?.images?.[0]?.hasDataUrl, 'Reference edit job must include uploaded reference image data.', { requests, result });
  assert(requests.edits.length >= 1, 'Reference edit fallback must call /v1/images/edits.', { requests, result });
  assert(requests.edits[0].postData.includes('model') && requests.edits[0].postData.includes('prompt') && requests.edits[0].postData.includes('image'), 'Edit request must be multipart with model, prompt, and image fields.', { requests, result });
  assert(requests.generations.length === 0, 'Reference edit must not call /v1/images/generations.', { requests, result });
  assert(requests.responses.length === 0, 'Reference edit must not call /v1/responses.', { requests, result });
  assert(!result.persistedSettings.includes(fakeSecret), 'Manual API key leaked into localStorage during edit generation.', result);
  assert(!JSON.stringify(requests).includes(fakeSecret), 'Manual API key leaked into smoke request evidence.', { requests, result });
  assert(result.sessionSecret === fakeSecret, 'Manual API key was not retained in sessionStorage for the current session.', result);
  assert(!result.hasSecretInDom, 'Manual API key leaked into visible page text.', result);
  assert(result.resultImages >= 1, 'Successful edit generation did not render a result image.', result);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    requests: {
      ...requests,
      edits: requests.edits.map((request) => ({
        ...request,
        postData: request.postData.slice(0, 500)
      }))
    },
    result
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
