import { chromium } from 'playwright';
import { createServer } from 'vite';

const TOTAL_IMAGE_ITEMS = 2;
const TOTAL_PROMPT_ITEMS = 3;

function svgDataUrl(label) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220" fill="#0f766e"/><text x="160" y="124" fill="white" font-family="Arial" font-size="34" text-anchor="middle">${label}</text></svg>`)}`;
}

function cases() {
  const imageCases = Array.from({ length: TOTAL_IMAGE_ITEMS }, (_, index) => ({
    id: `image-case-${index + 1}`,
    title: `Image inspiration ${index + 1}`,
    category: 'Prompt Zone Test',
    promptPreview: `Image prompt ${index + 1}`,
    image: svgDataUrl(`#${index + 1}`),
    thumbnail: svgDataUrl(`#${index + 1}`)
  }));
  const promptCases = Array.from({ length: TOTAL_PROMPT_ITEMS }, (_, index) => ({
    id: `prompt-case-${index + 1}`,
    title: `Prompt only inspiration ${index + 1}`,
    category: 'Prompt Zone Test',
    promptPreview: `Prompt-only idea ${index + 1}: create a careful product scene with clear composition.`,
    imageUnavailable: true,
    imageUnavailableReason: 'HTTP_404',
    remoteImageUrl: `https://example.invalid/missing-${index + 1}.jpg`
  }));
  return [...imageCases, ...promptCases];
}

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
  const missingRequests = [];

  await page.addInitScript((items) => {
    localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify({
      sessionId: 'prompt-zone-smoke-session',
      mode: 'image',
      status: 'idle',
      prompt: 'Existing prompt must stay independent.',
      model: 'gpt-image-2',
      generationQueue: [],
      canvasNodes: []
    }));
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.endsWith('/cases.json') || url.endsWith('cases.json')) {
        return new Response(JSON.stringify({
          categories: ['Prompt Zone Test'],
          styles: [],
          scenes: [],
          cases: items,
          videoInspirations: []
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/inspirations.json') || url.endsWith('inspirations.json')) {
        return new Response(JSON.stringify({ sources: [], sourceCounts: [], categories: [], cases: [], errors: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(input, init);
    };
  }, cases());

  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) missingRequests.push(request.url());
  });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.locator('[data-workspace="inspiration"]').first().click();
  await page.waitForSelector('.promptOnlyZone', { timeout: 8000 });

  const initial = await page.evaluate(() => ({
    imageCards: document.querySelectorAll('.inspirationCanvasGrid > .caseTile:not(.promptOnly)').length,
    promptCards: document.querySelectorAll('.promptOnlyZone .caseTile.promptOnly').length,
    hasPromptZone: Boolean(document.querySelector('.promptOnlyZone')),
    body: document.body.innerText
  }));

  assert(initial.hasPromptZone, 'Prompt-only inspirations should render in a dedicated zone.', initial);
  assert(initial.imageCards === TOTAL_IMAGE_ITEMS, 'Image inspirations should stay in the main image grid.', initial);
  assert(initial.promptCards === TOTAL_PROMPT_ITEMS, 'Prompt-only inspirations should render as prompt cards.', initial);
  assert(missingRequests.length === 0, 'Prompt-only cards should not request broken remote image URLs.', missingRequests);

  await page.locator('.promptOnlyZone .caseTile.promptOnly .promptCaseMain').first().click();
  await page.waitForSelector('.lightboxOverlay', { timeout: 8000 });
  const previewFlow = await page.evaluate(() => ({
    hasLightbox: Boolean(document.querySelector('.lightboxOverlay')),
    overlayPosition: document.querySelector('.lightboxOverlay') ? getComputedStyle(document.querySelector('.lightboxOverlay')).position : '',
    promptTextVisible: document.querySelector('.lightboxPromptPanel')?.innerText.includes('Prompt-only idea 1') || false,
    hasUseButton: Boolean(document.querySelector('.lightboxUseButton'))
  }));
  assert(previewFlow.hasLightbox, 'Clicking a prompt-only inspiration should open a dedicated preview.', previewFlow);
  assert(previewFlow.overlayPosition === 'fixed', 'Prompt preview should be an independent viewport overlay.', previewFlow);
  assert(previewFlow.promptTextVisible, 'Prompt-only preview should show the full prompt before use.', previewFlow);
  assert(previewFlow.hasUseButton, 'Prompt-only preview should provide an explicit use action.', previewFlow);
  await page.locator('.lightboxUseButton').click();
  await page.waitForSelector('.creationDesk textarea', { timeout: 8000 });
  const useFlow = await page.evaluate(() => ({
    hasLightbox: Boolean(document.querySelector('.lightboxOverlay')),
    hasDesk: Boolean(document.querySelector('.creationDesk')),
    imageWorkspaceActive: Boolean(document.querySelector('[data-workspace="image"].active')),
    promptValue: document.querySelector('.creationDesk textarea')?.value || '',
    promptTextVisible: document.body.innerText.includes('Prompt-only idea 1'),
    promptBadges: document.querySelectorAll('.promptOnlyZone .promptCaseMain > span').length
  }));
  assert(!useFlow.hasLightbox, 'Using a prompt-only inspiration should close the preview.', useFlow);
  assert(useFlow.hasDesk, 'Using a prompt-only inspiration should return to the creation desk.', useFlow);
  assert(useFlow.promptValue === 'Prompt-only idea 1: create a careful product scene with clear composition.', 'Using a prompt-only inspiration should replace, not append to, the composer prompt.', useFlow);
  assert(useFlow.promptBadges === 0, 'Prompt-only cards should not repeat a prompt-type badge on every card.', useFlow);

  console.log(JSON.stringify({ ok: true, initial, previewFlow, useFlow }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
