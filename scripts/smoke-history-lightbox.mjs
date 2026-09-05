import { chromium } from 'playwright';
import { createServer } from 'vite';

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
}

function svgDataUrl(label, color) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="${color}"/><text x="240" y="200" fill="white" font-family="Arial" font-size="42" text-anchor="middle">${label}</text></svg>`)}`;
}

const firstImage = svgDataUrl('first', '#1f766e');
const secondImage = svgDataUrl('second', '#7c5cff');
const historyRecord = {
  id: 'lightbox-smoke-record',
  sessionId: 'lightbox-smoke-session',
  mode: 'image',
  model: 'gpt-image-2',
  createdAt: new Date().toISOString(),
  prompt: 'Lightbox smoke prompt',
  generationPrompt: 'Subject: a carefully framed studio still life. Lighting: soft window light.',
  resultUrls: [firstImage, secondImage],
  displayResultUrls: [firstImage, secondImage],
  size: '1024x1024',
  quality: 'high'
};

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page.addInitScript((record) => {
    localStorage.setItem('image-sub2api-studio:history:v2:guest', JSON.stringify([record]));
    localStorage.setItem('image-sub2api-studio:session:v1', JSON.stringify({
      sessionId: 'lightbox-smoke-session',
      prompt: '',
      canvasNodes: [],
      generationQueue: [],
      assistantMessages: []
    }));
    window.__lightboxSmoke = { clipboard: [] };
  }, historyRecord);

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.locator('[data-workspace="history"]').click();
  await page.locator('.historyOpen').first().click();
  await page.locator('.historyWorkspacePanel .resultPreviewButton').first().click();
  await page.waitForSelector('.lightboxOverlay', { timeout: 8000 });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => window.__lightboxSmoke.clipboard.push(value) }
    });
  });

  const initial = await page.evaluate(() => ({
    position: getComputedStyle(document.querySelector('.lightboxOverlay')).position,
    parentTag: document.querySelector('.lightboxOverlay')?.parentElement?.tagName || '',
    navButtons: document.querySelectorAll('.lightboxNavButton').length,
    imageSrc: document.querySelector('.lightboxImageStage img')?.getAttribute('src') || '',
    prompt: document.querySelector('.lightboxPromptPanel')?.innerText || '',
    activeElement: document.activeElement?.className || ''
  }));
  assert(initial.position === 'fixed', 'Lightbox overlay must stay fixed to the viewport.', initial);
  assert(initial.parentTag === 'BODY', 'Lightbox overlay should be portaled to document.body.', initial);
  assert(initial.navButtons === 1, 'The first result should expose only a next navigation button.', initial);
  assert(initial.imageSrc === firstImage, 'Lightbox should open the selected first result.', initial);
  assert(initial.prompt.includes('carefully framed studio still life'), 'Lightbox should retain the full generation prompt.', initial);

  await page.locator('.lightboxPromptActions button').filter({ hasText: '复制' }).click();
  const copied = await page.evaluate(() => ({
    copied: window.__lightboxSmoke.clipboard.length,
    buttonText: [...document.querySelectorAll('.lightboxPromptActions button')].find((button) => button.textContent.includes('已复制'))?.textContent || ''
  }));
  assert(copied.copied === 1 && copied.buttonText.includes('已复制'), 'Copy action should provide visible confirmation.', copied);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  const next = await page.evaluate(() => ({
    imageSrc: document.querySelector('.lightboxImageStage img')?.getAttribute('src') || '',
    navButtons: document.querySelectorAll('.lightboxNavButton').length
  }));
  assert(next.imageSrc === secondImage, 'ArrowRight should advance to the next result.', next);
  assert(next.navButtons === 1, 'The second result should expose only a previous navigation button.', next);

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  const previous = await page.evaluate(() => document.querySelector('.lightboxImageStage img')?.getAttribute('src') || '');
  assert(previous === firstImage, 'ArrowLeft should return to the previous result.', { previous });

  await page.keyboard.press('Escape');
  await page.waitForSelector('.lightboxOverlay', { state: 'detached', timeout: 8000 });
  // Dialog focus restoration runs after the portal has unmounted.
  await page.waitForFunction(() => document.activeElement?.classList.contains('resultPreviewButton'), null, { timeout: 5000 });
  const closed = await page.evaluate(() => document.activeElement?.className || '');
  assert(closed.includes('resultPreviewButton'), 'Closing the lightbox should restore focus to the result preview button.', { closed });

  console.log(JSON.stringify({ ok: true, initial, copied, next, previous, closed }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
