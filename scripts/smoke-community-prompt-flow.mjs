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
    navigator.clipboard = {
      writeText: async (value) => {
        window.__communitySmoke.clipboard.push(value);
      }
    };
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
        id: 'share-smoke-1',
        kind: 'community-prompt',
        title: body.title,
        category: body.category || 'Community Prompts',
        prompt: body.prompt,
        promptPreview: body.prompt,
        sourceName: 'User shared',
        reactions: { up: 0, down: 0 },
        copied: 0,
        shared: 0,
        userReaction: ''
      };
      communityItems = [item, ...communityItems];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, item }) });
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
  await page.locator('.inspirationUploadPanel input').first().fill('Smoke shared prompt');
  await page.locator('.inspirationUploadPanel textarea').first().fill('A refined shared prompt for a clean product poster with soft light.');
  await page.locator('.inspirationUploadPanel button[type="submit"]').click();
  await page.waitForSelector('.promptOnlyZone .caseTile.promptOnly', { timeout: 8000 });

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
    body: document.body.innerText
  }));
  assert(result.hasUploadButton, 'Upload inspiration button should render.', result);
  assert(result.hasPromptCard, 'Created community prompt should render in prompt zone.', result);
  assert(result.upText.includes('1'), 'Upvote should update the card count.', result);
  assert(result.copyText.includes('1'), 'Copy action should update the card count.', result);

  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
