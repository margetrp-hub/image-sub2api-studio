import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { sanitizeCommunityPrompt } from './studio-service/communityPrompts.js';

const image = (label, color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${color}"/><text x="30" y="80" font-size="28" fill="white">${label}</text></svg>`)}`;
const records = [
  { id: 'modal-a', sessionId: 'modal-session', mode: 'image', model: 'model-a', createdAt: '2026-09-05T10:00:00Z', prompt: 'FIRST: a red product with soft lighting.', generationPrompt: 'FIRST: a red product with soft lighting.', resultUrls: [image('First', '#1f766e')], size: '1024x1024', quality: 'high' },
  { id: 'modal-b', sessionId: 'modal-session', mode: 'image', model: 'model-b', createdAt: '2026-09-05T10:01:00Z', prompt: 'SECOND: a blue landscape with mountains.', generationPrompt: 'SECOND: a blue landscape with mountains.', resultUrls: [image('Second', '#426699')], size: '1536x1024', quality: 'medium' }
];
const longPrompt = 'Subject: A detailed product photograph. Keep edges clear and materials realistic.\n\n'.repeat(40);
const promptCase = { id: 'modal-prompt', title: 'Long prompt', category: 'Audit', prompt: longPrompt, promptPreview: longPrompt, imageUnavailable: true };
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
let browser;

async function installFixtures(page, { history = records, session = null, authenticated = true } = {}) {
  await page.addInitScript(({ history, promptCase, session, authenticated }) => {
    if (authenticated) localStorage.setItem('sub2api-studio:session:v1', JSON.stringify({ accessToken: 'modal-smoke-token', user: { id: 'modal-user', username: 'modal' } }));
    localStorage.setItem('image-sub2api-studio:history:v2:guest', JSON.stringify(history));
    if (session) {
      localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify(session));
      localStorage.setItem('image-sub2api-studio:workbench-layout:v7', JSON.stringify({ prompt: false, references: false, parameters: true, parametersRail: false, bottomComposer: true, composerParameters: false, flowMode: 'canvas' }));
    }
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('cases.json')) return Promise.resolve(new Response(JSON.stringify({ categories: ['Audit'], styles: [], scenes: [], cases: [promptCase], videoInspirations: [] })));
      if (url.endsWith('inspirations.json')) return Promise.resolve(new Response(JSON.stringify({ cases: [], categories: [], sources: [] })));
      return original(input, init);
    };
    window.__modalCopies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => window.__modalCopies.push(value) } });
  }, { history, promptCase, session, authenticated });
  await page.route('**/studio-api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    let payload = { ok: true };
    if (path.endsWith('/history')) payload = { ok: true, records: history, total: history.length, nextOffset: null };
    if (path.endsWith('/library')) payload = { ok: true, categories: ['Audit'], styles: [], scenes: [], cases: [promptCase] };
    if (path.endsWith('/session')) payload = { ok: true, session: null };
    if (path.includes('/generation-jobs')) payload = { ok: true, jobs: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
}

async function checkBounds(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} escaped viewport: ${JSON.stringify(box)}`);
  return box;
}

try {
  const storedVideo = sanitizeCommunityPrompt({ prompt: records[0].prompt, generationPrompt: records[0].generationPrompt, image: '/studio-api/history/video/result.webm', generation: { mode: 'video', duration: '5', fps: '24', model: 'video-model' } });
  assert.equal(storedVideo.generation.mode, 'video');
  assert.equal(storedVideo.generation.duration, '5');
  assert.equal(storedVideo.image, '/studio-api/history/video/result.webm');
  await fs.mkdir('output/playwright', { recursive: true });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installFixtures(page);
  await page.goto(new URL('studio.html', base).href, { waitUntil: 'networkidle' });
  await page.locator('[data-workspace="history"]').click();
  await page.locator('.historyOpen').first().click();
  await page.locator('.historyPromptToggle').first().click();
  await page.waitForSelector('.promptOnlyLightboxPanel');
  assert.equal(await page.locator('.historyPromptExpanded').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('.resultPreviewButton').first().click();
  await page.waitForSelector('.lightboxPanel');
  const assertSelectedRecord = async () => {
    const source = await page.locator('.lightboxImageStage img').getAttribute('src');
    const record = records.find((item) => item.resultUrls[0] === source);
    assert(record);
    const text = await page.locator('.lightboxPromptPanel').innerText();
    for (const value of [record.prompt, record.model, record.size, record.quality]) assert(text.includes(value), `Wrong selected metadata: ${value}`);
    return record;
  };
  await assertSelectedRecord();
  await page.locator('.lightboxPromptActions .studioModalCopy').click();
  assert.match(await page.locator('.studioModalCopy').innerText(), /已复制/);
  await page.keyboard.press('ArrowRight');
  const selected = await assertSelectedRecord();
  assert.doesNotMatch(await page.locator('.studioModalCopy').innerText(), /已复制/);
  await page.locator('.lightboxMediaActions button[aria-label="分享到灵感库"]').click();
  await page.waitForSelector('.inspirationUploadPanel');
  assert.equal(await page.locator('.inspirationUploadPanel textarea').first().inputValue(), selected.prompt);
  assert((await page.locator('.inspirationParameterSummary').innerText()).includes(selected.size));
  await page.locator('.inspirationUploadPanel textarea').first().focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.lightboxImageStage img').getAttribute('src'), selected.resultUrls[0]);
  await page.locator('.inspirationUploadPanel button[type="submit"]').focus();
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => Boolean(document.activeElement.closest('.inspirationUploadPanel'))));
  await checkBounds(page, '.inspirationUploadPanel');
  await page.screenshot({ path: 'output/playwright/modal-share-desktop.png' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.inspirationUploadPanel', { state: 'detached' });
  assert.equal(await page.locator('.lightboxPanel').count(), 1, 'Escape must not close the underlying preview');
  await page.setViewportSize({ width: 390, height: 844 });
  const closeBox = await checkBounds(page, '.lightboxPanel .studioModalClose');
  assert(closeBox.width <= 40 && closeBox.height <= 40);
  const controls = await page.locator('.lightboxMediaActions > *').all();
  const controlBoxes = await Promise.all(controls.map((control) => control.boundingBox()));
  for (let i = 1; i < controlBoxes.length; i++) assert(controlBoxes[i].x >= controlBoxes[i - 1].x + controlBoxes[i - 1].width);
  await checkBounds(page, '.lightboxPanel');
  await page.screenshot({ path: 'output/playwright/modal-image-mobile.png' });
  await page.locator('.lightboxMediaActions button[aria-label="分享到灵感库"]').click();
  await checkBounds(page, '.inspirationUploadPanel');
  await checkBounds(page, '.inspirationUploadPanel button[type="submit"]');
  assert(await page.locator('.inspirationSharePreview img').evaluate((element) => element.getBoundingClientRect().height <= 100));
  assert(await page.locator('.inspirationShareBody').evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  await page.screenshot({ path: 'output/playwright/modal-share-mobile.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.locator('[data-workspace="inspiration"]').click();
  await page.locator('.promptCaseMain').first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForSelector('.promptOnlyLightboxPanel');
  assert.equal(await page.locator('.lightboxImageStage').count(), 0);
  const readingBox = await checkBounds(page, '.lightboxPromptPanel > .promptSectionList');
  assert(readingBox.height > 450, `Prompt reading area too small: ${readingBox.height}`);
  await page.locator('.lightboxPromptPanel > .promptSectionList').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await checkBounds(page, '.lightboxUseButton');
  await page.screenshot({ path: 'output/playwright/modal-prompt-mobile.png' });
  await page.locator('.lightboxUseButton').click();
  await page.waitForSelector('.creationDesk textarea');
  assert.equal(await page.locator('.lightboxPanel').count(), 0);
  assert.equal(await page.locator('.creationDesk textarea').first().inputValue(), longPrompt.trim());
  assert.deepEqual(pageErrors, []);
  await page.close();

  const errorPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const summary = 'A recovered generation should remain visible without squeezing the composer. '.repeat(20);
  await installFixtures(errorPage, { authenticated: false, history: [], session: { sessionId: 'modal-error', mode: 'image', status: 'idle', prompt: 'Continue the product.', model: 'gpt-image-2', canvasNodes: [], generationQueue: [{ id: 'modal-error-job', status: 'unknown', prompt: summary, summary, remote: true, restorable: false, count: 1 }] } });
  await errorPage.goto(new URL('studio.html', base).href, { waitUntil: 'networkidle' });
  const rowBefore = await errorPage.locator('.canvasQueueItem').first().boundingBox();
  await errorPage.locator('.canvasQueueErrorSummary').first().click();
  await errorPage.waitForSelector('.studioErrorDialog');
  await checkBounds(errorPage, '.studioErrorDialog');
  assert.equal((await errorPage.locator('.canvasQueueItem').first().boundingBox()).height, rowBefore.height);
  assert((await errorPage.locator('.studioErrorDialog pre').innerText()).includes('recovered generation'));
  await errorPage.locator('.studioErrorDialog .studioModalCopy').click();
  assert((await errorPage.evaluate(() => window.__modalCopies[0])).includes('recovered generation'));
  await errorPage.screenshot({ path: 'output/playwright/modal-error-mobile.png' });
  await errorPage.keyboard.press('Escape');
  await errorPage.waitForSelector('.studioErrorDialog', { state: 'detached' });
  await errorPage.waitForFunction(() => document.activeElement.classList.contains('canvasQueueErrorSummary'));
  await errorPage.close();

  const video = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const videoRecord = { ...records[0], id: 'modal-video', sessionId: 'modal-video', mode: 'video', resultUrls: ['/modal-video.webm', '/modal-video-next.webm'] };
  await installFixtures(video, { history: [videoRecord] });
  // A real browser-encoded clip lets the media element and native controls lay out normally.
  await video.goto(new URL('studio.html', base).href, { waitUntil: 'networkidle' });
  const bytes = await video.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270;
    const stream = canvas.captureStream(10); const chunks = []; const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const result = new Promise((resolve) => { recorder.onstop = async () => resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]); });
    recorder.start();
    const context = canvas.getContext('2d'); context.fillStyle = '#256a73'; context.fillRect(0, 0, 480, 270);
    context.fillStyle = '#fff'; context.font = '28px sans-serif'; context.fillText('Video preview', 150, 145);
    await new Promise((resolve) => setTimeout(resolve, 250)); recorder.stop(); stream.getTracks().forEach((track) => track.stop());
    return result;
  });
  await video.route('**/modal-video*.webm', (route) => route.fulfill({ status: 200, contentType: 'video/webm', body: Buffer.from(bytes) }));
  await video.locator('[data-workspace="history"]').click();
  await video.locator('.historyOpen').first().click();
  await video.locator('.resultPreviewButton').first().click();
  await video.waitForFunction(() => document.querySelector('.videoLightboxPanel video')?.readyState >= 2);
  const panel = await checkBounds(video, '.videoLightboxPanel');
  const stage = await video.locator('.lightboxImageStage').boundingBox();
  assert(stage.width >= panel.width - 4, 'Video should use the full panel width');
  await video.locator('.videoLightboxPanel video').focus();
  await video.keyboard.press('ArrowRight');
  assert.equal(await video.locator('.videoLightboxPanel video').getAttribute('src'), videoRecord.resultUrls[0]);
  await video.screenshot({ path: 'output/playwright/modal-video-desktop.png' });
  await video.setViewportSize({ width: 390, height: 844 });
  await checkBounds(video, '.videoLightboxPanel');
  const nav = await video.locator('.lightboxNavNext').boundingBox();
  const mobileStage = await video.locator('.lightboxImageStage').boundingBox();
  assert(nav.y + nav.height < mobileStage.y + mobileStage.height - 60, 'Navigation overlaps native video controls');
  await video.screenshot({ path: 'output/playwright/modal-video-mobile.png' });
  await video.locator('.lightboxMediaActions button[aria-label="分享到灵感库"]').click();
  await video.waitForSelector('.inspirationSharePreview video');
  assert.equal(await video.locator('.inspirationSharePreview img').count(), 0);
  console.log(JSON.stringify({ ok: true, checks: ['per-result prompt and parameters', 'independent history prompt', 'nested dialog Escape and focus', 'mobile toolbar and share', 'long prompt reading and use', 'error dialog and copy', 'video layout and native keys'] }));
} finally {
  if (browser) await browser.close();
  await server.close();
}
