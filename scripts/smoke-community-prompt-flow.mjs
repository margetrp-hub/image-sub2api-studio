import { chromium } from 'playwright';
import { createServer } from 'vite';

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
}

const server = await createServer({
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0, strictPort: false }
});

let browser;
try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 920 } });
  let communityItems = [];

  await page.addInitScript(() => {
    localStorage.setItem('sub2api-studio:session:v1', JSON.stringify({
      accessToken: 'community-smoke-token',
      user: { id: 'community-smoke', username: 'smoke' }
    }));
  });

  await page.addInitScript(() => {
    window.__communitySmoke = { clipboard: [] };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value) => {
        window.__communitySmoke.clipboard.push(value);
      }
    } });
  });

  await page.route('**/studio-api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/studio-api/library' && route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          totalCases: communityItems.length,
          categories: ['Community Prompts'],
          styles: [],
          scenes: [],
          promptPresets: [],
          videoInspirations: [],
          cases: communityItems
        })
      });
    }
    if (path === '/studio-api/community-prompts' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const item = {
        id: `share-smoke-${communityItems.length + 1}`,
        kind: 'community-prompt',
        title: body.title,
        category: body.category || 'Community Prompts',
        prompt: body.prompt,
        promptPreview: body.prompt,
        image: body.image || '',
        generation: body.generation || {},
        visibility: body.visibility,
        canWithdraw: body.visibility === 'public' && body.publicationConfirmed === true,
        sourceName: 'User shared',
        reactions: { up: 0, down: 0 },
        copied: 0,
        shared: 0,
        userReaction: ''
      };
      communityItems = [item, ...communityItems];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, item }) });
    }
    if (path.startsWith('/studio-api/community-prompts/') && route.request().method() === 'DELETE') {
      communityItems = communityItems.filter((item) => path !== `/studio-api/community-prompts/${item.id}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (path === '/studio-api/community-prompts/share-smoke-1/reaction' && route.request().method() === 'POST') {
      const { action } = route.request().postDataJSON();
      const item = { ...communityItems[0], reactions: { ...communityItems[0].reactions } };
      if (action === 'up') {
        item.userReaction = item.userReaction === 'up' ? '' : 'up';
        item.reactions.up = item.userReaction === 'up' ? 1 : 0;
      }
      if (action === 'copy') item.copied += 1;
      if (action === 'share') item.shared += 1;
      communityItems[0] = item;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, item }) });
    }
    if (path.endsWith('/auth/me') || path.endsWith('/user/profile')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'community-smoke', username: 'smoke' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.endsWith('/cases.json') || url.endsWith('cases.json')) {
        return new Response(JSON.stringify({ categories: [], styles: [], scenes: [], cases: [], videoInspirations: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.endsWith('/inspirations.json') || url.endsWith('inspirations.json')) {
        return new Response(JSON.stringify({ sources: [], sourceCounts: [], categories: [], cases: [], errors: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(input, init);
    };
  });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.locator('[data-workspace="inspiration"]').first().click();
  await page.locator('.uploadInspirationButton').first().click();
  await page.locator('.inspirationUploadPanel input[type="text"]').first().fill('Smoke shared prompt');
  await page.locator('.inspirationUploadPanel textarea').first().fill('A refined shared prompt for a clean product poster with soft light. Keep the original subject and composition. Resolution: 1K.');
  await page.locator('.inspirationUploadPanel button[type="submit"]').click();
  await page.waitForSelector('.promptOnlyZone .caseTile.promptOnly', { timeout: 8000 });

  const galleryControls = await page.evaluate(() => ({
    title: document.querySelector('.inspirationWorkspace h2')?.textContent?.trim() || '',
    sourceButtons: [...document.querySelectorAll('.gallerySourceSwitch button')].map((button) => button.textContent.trim()),
    categoryOptions: [...document.querySelectorAll('.galleryCategoryFilter option')].map((option) => option.textContent.trim())
  }));
  await page.screenshot({ path: 'output/playwright/inspiration-gallery.png', fullPage: true });
  assert(galleryControls.title === '灵感广场', 'Inspiration gallery should use the concise title.', galleryControls);
  assert(galleryControls.sourceButtons.some((label) => label.startsWith('用户上传')), 'User source filter should render.', galleryControls);
  assert(galleryControls.categoryOptions.length > 1, 'Category filter should include the shared prompt category.', galleryControls);

  await page.locator('.gallerySourceSwitch button').filter({ hasText: '用户上传' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.promptOnlyZone .caseTile.promptOnly').length === 1, null, { timeout: 8000 });
  await page.locator('.promptOnlyZone .promptCaseMain').click();
  await page.waitForSelector('.lightboxOverlay', { timeout: 8000 });
  const promptPreview = await page.evaluate(() => ({
    promptText: document.querySelector('.lightboxPromptPanel')?.innerText || '',
    promptSections: document.querySelectorAll('.lightboxPromptPanel .promptSection').length,
    promptTitles: [...document.querySelectorAll('.lightboxPromptPanel .promptSection > span')].map((item) => item.textContent.trim()),
    firstBody: document.querySelector('.lightboxPromptPanel .promptSection p')?.textContent || ''
  }));
  assert(promptPreview.promptText.includes('A refined shared prompt'), 'Prompt card should open a dedicated prompt preview.', promptPreview);
  assert(promptPreview.promptSections >= 1, 'Prompt preview should render at least one readable section.', promptPreview);
  assert(promptPreview.firstBody.includes('A refined shared prompt'), 'Prompt prose before a resolution hint must remain visible.', promptPreview);
  assert(promptPreview.promptTitles.filter((title) => /分辨率|resolution/i.test(title)).length <= 1, 'Resolution metadata must not replace the full prompt.', promptPreview);
  await page.screenshot({ path: 'output/playwright/inspiration-prompt-preview.png', fullPage: true });
  await page.locator('.lightboxOverlay .iconButton').click();

  await page.locator('.communityPromptStats button').nth(0).click();
  await page.locator('.communityPromptStats button').nth(2).click();
  await page.waitForFunction(() => {
    const copyButton = document.querySelectorAll('.communityPromptStats button')[2];
    return copyButton?.textContent?.includes('1');
  }, null, { timeout: 8000 });

  const result = await page.evaluate(() => ({
    hasUploadButton: Boolean(document.querySelector('.uploadInspirationButton')),
    hasPromptCard: document.body.innerText.includes('Smoke shared prompt'),
    upText: document.querySelector('.communityPromptStats button')?.textContent || '',
    copyText: document.querySelectorAll('.communityPromptStats button')[2]?.textContent || '',
    copied: window.__communitySmoke.clipboard.length,
    body: document.body.innerText.slice(0, 1200)
  }));
  assert(result.hasUploadButton, 'Upload inspiration button should render.', result);
  assert(result.hasPromptCard, 'Created community prompt should render in prompt zone.', result);
  assert(result.upText.includes('1'), 'Upvote should update the card count.', result);
  assert(result.copyText.includes('1'), 'Copy action should update the card count.', result);

  await page.locator('.communityPromptStats button').nth(3).click();
  await page.waitForSelector('.inspirationUploadPanel');
  assert(await page.locator('.inspirationUploadPanel input[type="checkbox"]').isChecked() === false, 'Opening share must not opt in to publication.');
  assert(await page.locator('.inspirationUploadPanel textarea').first().inputValue() === communityItems[0].prompt, 'Internal share dialog must receive the full prompt.');
  await page.locator('.inspirationUploadPanel textarea').first().fill('x'.repeat(100001));
  assert(await page.locator('.inspirationUploadPanel button[type="submit"]').isDisabled(), 'Oversized prompts must be blocked without truncation.');
  assert((await page.locator('.inspirationUploadPanel textarea').first().inputValue()).length === 100001, 'Input must keep pasted text for editing.');
  await page.locator('.inspirationUploadPanel textarea').first().fill('Long public prompt.\n  Preserve indentation.\n'.repeat(700).trim());
  await page.locator('.inspirationUploadPanel input[type="file"]').setInputFiles({
    name: 'fixture.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
  });
  await page.locator('.inspirationUploadPanel input[type="checkbox"]').check();
  await page.setViewportSize({ width: 390, height: 700 });
  const dialogBounds = await page.locator('.inspirationUploadPanel').boundingBox();
  const submitBounds = await page.locator('.inspirationUploadPanel button[type="submit"]').boundingBox();
  assert(dialogBounds.x >= 0 && dialogBounds.width <= 390 && submitBounds.y + submitBounds.height <= 700, 'Mobile share dialog and submit action must fit the viewport.', { dialogBounds, submitBounds });
  await page.locator('.inspirationUploadPanel button[type="submit"]').click();
  await page.waitForSelector('.inspirationUploadPanel', { state: 'hidden' });
  assert(communityItems[0].visibility === 'public' && communityItems[0].canWithdraw, 'Publication must send explicit confirmation.');
  assert(communityItems[0].prompt.length > 12000 && communityItems[0].image.startsWith('data:image/png;base64,'), 'Public media and full prompt must be submitted durably.');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '撤回公开分享', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="撤回公开分享"]'));
  assert(communityItems.length === 1 && communityItems[0].visibility === 'private', 'Withdraw should remove only the chosen public item.');

  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
