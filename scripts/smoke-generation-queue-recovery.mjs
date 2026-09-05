import { chromium } from 'playwright';
import { createServer } from 'vite';
import { clickGenerate, fillGenerationPrompt } from './smoke-ui-helpers.mjs';

const screenshotDir = 'output/playwright';
const screenshotPath = `${screenshotDir}/generation-queue-recovery.png`;
const failedScreenshotPath = `${screenshotDir}/generation-queue-failed-message.png`;
const runningScreenshotPath = `${screenshotDir}/generation-queue-running-cancel.png`;
const localQueuedScreenshotPath = `${screenshotDir}/generation-queue-local-restored.png`;
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const currentSessionKey = 'image-sub2api-studio:current-session:v1';
const currentSessionScopedKey = (sessionId) => `${currentSessionKey}:${sessionId}`;

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function restoredSession() {
  return {
    sessionId: 'queue-recovery-session',
    mode: 'image',
    status: 'loading',
    message: 'Restored generation is still running.',
    prompt: 'A quiet ceramic object on a soft paper background',
    model: 'gpt-image-2',
    progress: { stage: 'gateway', percent: 38, completed: 0, total: 1 },
    generationQueue: [{
      id: 'task-restored-1',
      serverJobId: 'job-restored-1',
      remote: true,
      status: 'running',
      stage: 'gateway',
      prompt: 'A quiet ceramic object on a soft paper background',
      summary: 'A quiet ceramic object on a soft paper background',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'high',
      count: 1
    }],
    assistantMessages: [],
    canvasNodes: []
  };
}

function failedSession() {
  return {
    sessionId: 'queue-failed-session',
    mode: 'image',
    status: 'loading',
    message: 'Restored generation failed.',
    prompt: 'A quiet ceramic object on a soft paper background',
    model: 'gpt-image-2',
    progress: { stage: 'gateway', percent: 38, completed: 0, total: 1 },
    generationQueue: [{
      id: 'task-failed-1',
      serverJobId: 'job-failed-1',
      remote: true,
      status: 'running',
      stage: 'gateway',
      prompt: 'A quiet ceramic object on a soft paper background',
      summary: 'A quiet ceramic object on a soft paper background',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'high',
      count: 1
    }],
    assistantMessages: [],
    canvasNodes: []
  };
}

function runningSession() {
  return {
    sessionId: 'queue-running-session',
    mode: 'image',
    status: 'loading',
    message: 'Restored generation is still running.',
    prompt: 'A quiet ceramic object waiting in the service queue',
    model: 'gpt-image-2',
    progress: { stage: 'gateway', percent: 38, completed: 0, total: 1 },
    generationQueue: [{
      id: 'task-running-1',
      serverJobId: 'job-running-1',
      remote: true,
      status: 'running',
      stage: 'gateway',
      prompt: 'A quiet ceramic object waiting in the service queue',
      summary: 'A quiet ceramic object waiting in the service queue',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'high',
      count: 1
    }],
    assistantMessages: [],
    canvasNodes: []
  };
}

function localQueuedSession() {
  return {
    sessionId: 'queue-local-session',
    mode: 'image',
    status: 'idle',
    message: '',
    prompt: 'A restored local queued task should continue safely',
    model: 'gpt-image-2',
    progress: { stage: 'idle', percent: 0, completed: 0, total: 1 },
    generationQueue: [{
      id: 'task-local-queued-1',
      status: 'queued',
      mode: 'image',
      prompt: 'A restored local queued task should continue safely',
      summary: 'A restored local queued task should continue safely',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium',
      count: 1,
      restorable: true
    }],
    assistantMessages: [],
    canvasNodes: []
  };
}

async function installCommonRoutes(page) {
  await page.addInitScript(({ providerSettingsKey, manualSecretKey }) => {
    localStorage.setItem(providerSettingsKey, JSON.stringify({
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: 'https://queue-smoke.example/v1',
      route: 'auto',
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    sessionStorage.setItem(manualSecretKey, 'queue-smoke-secret');
  }, { providerSettingsKey, manualSecretKey });
  await page.route('**/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 1, email: 'queue-smoke@example.com', username: 'queue-smoke' })
  }));
  await page.route('**/api-keys**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 1, key: 'test-key-smoke-visible-prefix' }])
  }));
  await page.route('**/keys**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 1, key: 'test-key-smoke-visible-prefix', status: 'active' }])
  }));
  await page.route('**/v1/models**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ id: 'gpt-image-2' }, { id: 'gpt-5.5' }] })
  }));
  await page.route('**/dashboard/billing/usage**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ total: 0, requests: 0 })
  }));
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
  let jobPollCount = 0;
  let sessionSaveCount = 0;

  await installCommonRoutes(page);
  await page.route('**/studio-api/session**', async (route) => {
    if (route.request().method() === 'POST') {
      sessionSaveCount += 1;
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, session: body })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, session: restoredSession() })
    });
  });
  await page.route('**/studio-api/generation-jobs?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      jobs: [{
        id: 'job-restored-1',
        sessionId: 'queue-recovery-session',
        status: 'gateway',
        stage: 'gateway',
        completed: 0,
        total: 1,
        resultUrls: []
      }]
    })
  }));
  await page.route('**/studio-api/generation-jobs/job-restored-1', (route) => {
    jobPollCount += 1;
    const status = jobPollCount < 2 ? 'gateway' : 'unknown';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        job: {
          id: 'job-restored-1',
          sessionId: 'queue-recovery-session',
          status,
          stage: status,
          completed: 0,
          total: 1,
          resultUrls: [],
          error: status === 'unknown'
            ? {
              code: 'JOB_RUNTIME_NOT_ATTACHED',
              message: 'The service restarted while this job was active.'
            }
            : null
        }
      })
    });
  });

  const recoverySessionKey = currentSessionScopedKey('queue-recovery-session');
  await page.addInitScript((sessionKey) => {
    localStorage.setItem('auth_token', 'queue-smoke-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, email: 'queue-smoke@example.com' }));
    localStorage.setItem('image-sub2api-studio:current-session:v1:active', 'queue-recovery-session');
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: 'queue-recovery-session',
      status: 'loading',
      prompt: 'Local cache copy',
      generationQueue: [{
        id: 'task-restored-1',
        serverJobId: 'job-restored-1',
        remote: true,
        status: 'running',
        prompt: 'Local cache copy',
        summary: 'Local cache copy'
      }]
    }));
  }, recoverySessionKey);

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.canvasQueueDock', { timeout: 8000 });
  await page.waitForTimeout(2200);
  await page.waitForFunction((sessionKey) => {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return stored.generationQueue?.[0]?.status === 'unknown';
  }, recoverySessionKey, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate((sessionKey) => {
    const queueItems = [...document.querySelectorAll('.canvasQueueItem')].map((node) => ({
      className: node.className,
      text: node.innerText
    }));
    const buttons = [...document.querySelectorAll('.canvasQueueItem button')].map((node) => ({
      title: node.getAttribute('title') || '',
      label: node.getAttribute('aria-label') || ''
    }));
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return {
      queueItems,
      buttons,
      storedStatus: stored.generationQueue?.[0]?.status || '',
      body: document.body.innerText.slice(0, 1200)
    };
  }, recoverySessionKey);

  assert(jobPollCount >= 2, 'Restored remote generation job was not polled after page load.', { jobPollCount, result });
  assert(result.queueItems.length === 1, `Expected one restored queue item, got ${result.queueItems.length}.`, result);
  assert(result.queueItems[0].className.includes('unknown'), 'Restored remote job did not stay visible as an unknown queue item.', result);
  assert(result.storedStatus === 'unknown', 'Unknown queue status was not saved back into the current session cache.', result);
  assert(result.buttons.length >= 1, 'Unknown queue item did not expose an acknowledge/remove control.', result);
  assert(sessionSaveCount >= 1, 'Recovered queue snapshot was not saved back to the history service.', { sessionSaveCount });

  const failedPage = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  let failedSessionSaveCount = 0;
  let failedRetryCreateCount = 0;
  const failedRetryRequests = [];
  await installCommonRoutes(failedPage);
  await failedPage.route('**/studio-api/session**', async (route) => {
    if (route.request().method() === 'POST') {
      failedSessionSaveCount += 1;
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, session: body })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, session: failedSession() })
    });
  });
  await failedPage.route('**/studio-api/generation-jobs?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      jobs: [{
        id: 'job-failed-1',
        sessionId: 'queue-failed-session',
        status: 'failed',
        stage: 'failed',
        completed: 0,
        total: 1,
        resultUrls: [],
        requestIds: ['req-failed-1'],
        error: {
          code: 'HTTP_403',
          status: 403,
          requestId: 'req-failed-1',
          message: 'ORIGIN_NOT_ALLOWED'
        }
      }]
    })
  }));
  await failedPage.route('**/studio-api/generation-jobs', async (route) => {
    if (route.request().method() === 'POST') {
      failedRetryCreateCount += 1;
      const body = route.request().postDataJSON();
      failedRetryRequests.push({
        method: route.request().method(),
        request: body?.request || null
      });
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          job: {
            id: 'job-failed-retry-1',
            sessionId: 'queue-failed-session',
            status: 'succeeded',
            stage: 'succeeded',
            prompt: body?.request?.prompt || '',
            model: body?.request?.model || 'gpt-image-2',
            size: body?.request?.size || '1024x1024',
            quality: body?.request?.quality || 'medium',
            count: 1,
            completed: 1,
            total: 1,
            resultUrls: ['/studio-api/history/job-failed-retry-1/assets/0.png']
          }
        })
      });
    }
    return route.continue();
  });
  await failedPage.route('**/studio-api/generation-jobs/job-failed-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      job: {
        id: 'job-failed-1',
        sessionId: 'queue-failed-session',
        status: 'failed',
        stage: 'failed',
        completed: 0,
        total: 1,
        resultUrls: [],
        requestIds: ['req-failed-1'],
        error: {
          code: 'HTTP_403',
          status: 403,
          requestId: 'req-failed-1',
          message: 'ORIGIN_NOT_ALLOWED'
        }
      }
    })
  }));
  await failedPage.route('**/studio-api/generation-jobs/job-failed-retry-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      job: {
        id: 'job-failed-retry-1',
        sessionId: 'queue-failed-session',
        status: 'succeeded',
        stage: 'succeeded',
        completed: 1,
        total: 1,
        resultUrls: ['/studio-api/history/job-failed-retry-1/assets/0.png']
      }
    })
  }));
  await failedPage.route('**/studio-api/history/job-failed-retry-1/assets/0.png', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0X9WQAAAABJRU5ErkJggg==', 'base64')
  }));
  const failedSessionKey = currentSessionScopedKey('queue-failed-session');
  await failedPage.addInitScript((sessionKey) => {
    localStorage.setItem('auth_token', 'queue-smoke-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, email: 'queue-smoke@example.com' }));
    localStorage.setItem('image-sub2api-studio:current-session:v1:active', 'queue-failed-session');
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: 'queue-failed-session',
      status: 'loading',
      prompt: 'Local failed cache copy',
      generationQueue: [{
        id: 'task-failed-1',
        serverJobId: 'job-failed-1',
        remote: true,
        status: 'running',
        prompt: 'Local failed cache copy',
        summary: 'Local failed cache copy'
      }]
    }));
  }, failedSessionKey);
  await failedPage.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await failedPage.waitForSelector('.canvasQueueDock', { timeout: 8000 });
  await failedPage.waitForTimeout(1800);
  await failedPage.screenshot({ path: failedScreenshotPath, fullPage: true });
  const failedResult = await failedPage.evaluate((sessionKey) => ({
    body: document.body.innerText.slice(0, 1800),
    queueItems: [...document.querySelectorAll('.canvasQueueItem')].map((node) => ({
      className: node.className,
      text: node.innerText
    })),
    storedStatus: JSON.parse(localStorage.getItem(sessionKey) || '{}')?.generationQueue?.[0]?.status || ''
  }), failedSessionKey);
  assert(failedResult.body.includes('STUDIO_ALLOWED_ORIGINS'), 'Failed restored job did not show the allowed-origin explanation.', failedResult);
  assert(!failedResult.body.includes('上游返回了未识别的英文错误'), 'Failed restored job fell back to the generic English-error message.', failedResult);
  assert(failedResult.queueItems[0]?.className.includes('failed'), 'Failed restored job did not stay visible as a failed queue item.', failedResult);
  assert(failedResult.queueItems[0]?.text.includes('查看错误详情'), 'Failed queue card must offer a compact error-details action.', failedResult);
  assert(!failedResult.queueItems[0]?.text.includes('STUDIO_ALLOWED_ORIGINS'), 'Failed queue card must not expand the full error inline.', failedResult);
  assert(!failedResult.queueItems[0]?.text.includes('ORIGIN_NOT_ALLOWED'), 'Failed queue card exposed the raw upstream error instead of a readable explanation.', failedResult);
  await failedPage.locator('.canvasQueueErrorSummary').first().click();
  await failedPage.waitForSelector('.studioErrorDialog');
  const errorDetails = await failedPage.locator('.studioErrorDialog').innerText();
  assert(errorDetails.includes('STUDIO_ALLOWED_ORIGINS'), 'Error dialog must retain the readable allowed-origin explanation.', { errorDetails });
  await failedPage.keyboard.press('Escape');
  await failedPage.waitForSelector('.studioErrorDialog', { state: 'detached' });
  assert(failedResult.storedStatus === 'failed', 'Failed queue status was not saved back into the current session cache.', failedResult);
  assert(failedSessionSaveCount >= 1, 'Failed queue snapshot was not saved back to the history service.', { failedSessionSaveCount });
  await fillGenerationPrompt(failedPage, 'A retry after a restored failed generation should submit a fresh service job.');
  await clickGenerate(failedPage);
  await failedPage.locator('.generationConfirmPrimary').click();
  await failedPage.waitForFunction((sessionKey) => {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return stored.status === 'success' && stored.canvasNodes?.length >= 1;
  }, failedSessionKey, { timeout: 10000 });
  const failedRetryResult = await failedPage.evaluate((sessionKey) => {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return {
      status: stored.status || '',
      canvasNodes: stored.canvasNodes?.length || 0,
      hasRegenerateDialog: Boolean(document.querySelector('.regenerateDialogBackdrop')),
      body: document.body.innerText.slice(0, 1800)
    };
  }, failedSessionKey);
  assert(failedRetryCreateCount === 1, 'Main generate action in a restored failed state did not create exactly one fresh service job.', { failedRetryCreateCount, failedRetryRequests, failedRetryResult });
  assert(failedRetryRequests[0]?.request?.route === 'generations', 'Retry from the main generate action did not use the image generations route.', { failedRetryRequests, failedRetryResult });
  assert(failedRetryRequests[0]?.request?.model === 'gpt-image-2', 'Retry from the main generate action did not preserve the image model.', { failedRetryRequests, failedRetryResult });
  assert(!failedRetryResult.hasRegenerateDialog, 'Main generate action opened the regenerate dialog instead of submitting the service job.', failedRetryResult);
  assert(failedRetryResult.status === 'success' && failedRetryResult.canvasNodes >= 1, 'Fresh service job after restored failure did not restore a result into the canvas.', failedRetryResult);
  await failedPage.close();

  const runningPage = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  let runningCancelCount = 0;
  let runningPollCount = 0;
  await installCommonRoutes(runningPage);
  await runningPage.route('**/studio-api/session**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, session: body })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, session: runningSession() })
    });
  });
  await runningPage.route('**/studio-api/generation-jobs?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      jobs: [{
        id: 'job-running-1',
        sessionId: 'queue-running-session',
        status: 'gateway',
        stage: 'gateway',
        completed: 0,
        total: 1,
        resultUrls: []
      }]
    })
  }));
  await runningPage.route('**/studio-api/generation-jobs/job-running-1', (route) => {
    if (route.request().method() === 'DELETE') {
      runningCancelCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          job: {
            id: 'job-running-1',
            sessionId: 'queue-running-session',
            status: 'canceled',
            stage: 'canceled',
            completed: 0,
            total: 1,
            resultUrls: [],
            error: {
              code: 'JOB_CANCELED',
              message: 'The job was canceled locally.'
            }
          }
        })
      });
    }
    runningPollCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        job: {
          id: 'job-running-1',
          sessionId: 'queue-running-session',
          status: 'gateway',
          stage: 'gateway',
          completed: 0,
          total: 1,
          resultUrls: []
        }
      })
    });
  });
  const runningSessionKey = currentSessionScopedKey('queue-running-session');
  await runningPage.addInitScript((sessionKey) => {
    localStorage.setItem('auth_token', 'queue-smoke-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, email: 'queue-smoke@example.com' }));
    localStorage.setItem('image-sub2api-studio:current-session:v1:active', 'queue-running-session');
    localStorage.setItem(sessionKey, JSON.stringify({
      sessionId: 'queue-running-session',
      status: 'loading',
      prompt: 'Local running cache copy',
      generationQueue: [{
        id: 'task-running-1',
        serverJobId: 'job-running-1',
        remote: true,
        status: 'running',
        prompt: 'Local running cache copy',
        summary: 'Local running cache copy'
      }]
    }));
  }, runningSessionKey);
  await runningPage.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await runningPage.waitForSelector('.canvasQueueDock', { timeout: 8000 });
  await runningPage.waitForFunction(() => (
    [...document.querySelectorAll('.canvasQueueItem')].some((node) => node.className.includes('running') && node.innerText.includes('生成中'))
  ), null, { timeout: 8000 });
  const runningBeforeCancel = await runningPage.evaluate(() => ({
    queueItems: [...document.querySelectorAll('.canvasQueueItem')].map((node) => ({
      className: node.className,
      text: node.innerText
    })),
    buttons: [...document.querySelectorAll('.canvasQueueItem button')].map((node) => ({
      title: node.getAttribute('title') || '',
      label: node.getAttribute('aria-label') || ''
    })),
    body: document.body.innerText.slice(0, 1400)
  }));
  assert(runningPollCount >= 1, 'Running restored job was not polled after page load.', { runningPollCount, runningBeforeCancel });
  assert(runningBeforeCancel.queueItems[0]?.className.includes('running'), 'Running restored job did not remain visible as a running queue item.', runningBeforeCancel);
  assert(runningBeforeCancel.buttons.some((button) => button.title.includes('停止') || button.label.includes('停止')), 'Running restored job did not expose a stop control.', runningBeforeCancel);

  await runningPage.locator('.canvasQueueItem button').first().click();
  await runningPage.waitForFunction((sessionKey) => {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return stored.generationQueue?.[0]?.status === 'canceled';
  }, runningSessionKey, { timeout: 8000 });
  await runningPage.screenshot({ path: runningScreenshotPath, fullPage: true });
  const runningResult = await runningPage.evaluate((sessionKey) => {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return {
      storedStatus: stored.generationQueue?.[0]?.status || '',
      queueItems: [...document.querySelectorAll('.canvasQueueItem')].map((node) => ({
        className: node.className,
        text: node.innerText
      })),
      body: document.body.innerText.slice(0, 1400)
    };
  }, runningSessionKey);
  assert(runningCancelCount === 1, 'Stop control did not call the server-side cancel endpoint exactly once.', { runningCancelCount, runningResult });
  assert(runningResult.storedStatus === 'canceled', 'Canceled running queue status was not saved back into the current session cache.', runningResult);
  assert(runningResult.queueItems[0]?.className.includes('canceled'), 'Canceled running job did not remain visible as a canceled queue item.', runningResult);
  assert(!runningResult.queueItems[0]?.text.includes('服务端任务 job-running-1'), 'Canceled running job fell back to an opaque server job label.', runningResult);
  assert(!runningResult.body.includes('正在生成'), 'Canceled running job left the main composer in a generating state.', runningResult);
  await runningPage.close();

  const localQueuedContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const localQueuedPage = await localQueuedContext.newPage();
  let localJobCreateCount = 0;
  await installCommonRoutes(localQueuedPage);
  await localQueuedPage.route('**/studio-api/session**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, session: body })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, session: { ...localQueuedSession(), updatedAt: '2020-01-01T00:00:00.000Z', generationQueue: [] } })
    });
  });
  await localQueuedPage.route('**/studio-api/generation-jobs?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, jobs: [] })
  }));
  await localQueuedPage.route('**/studio-api/generation-jobs', async (route) => {
    if (route.request().method() === 'POST') {
      localJobCreateCount += 1;
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          job: {
            id: 'job-local-restored-1',
            sessionId: 'queue-local-session',
            status: 'succeeded',
            stage: 'succeeded',
            prompt: body?.request?.prompt || '',
            model: body?.request?.model || 'gpt-image-2',
            size: body?.request?.size || '1024x1024',
            quality: body?.request?.quality || 'medium',
            count: 1,
            completed: 1,
            total: 1,
            resultUrls: ['/studio-api/history/job-local-restored-1/assets/0.png']
          }
        })
      });
    }
    return route.continue();
  });
  await localQueuedPage.route('**/studio-api/generation-jobs/job-local-restored-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      job: {
        id: 'job-local-restored-1',
        sessionId: 'queue-local-session',
        status: 'succeeded',
        stage: 'succeeded',
        prompt: 'A restored local queued task should continue safely',
        model: 'gpt-image-2',
        size: '1024x1024',
        quality: 'medium',
        count: 1,
        completed: 1,
        total: 1,
        resultUrls: ['/studio-api/history/job-local-restored-1/assets/0.png']
      }
    })
  }));
  await localQueuedPage.route('**/studio-api/history/job-local-restored-1/assets/0.png', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0X9WQAAAABJRU5ErkJggg==', 'base64')
  }));
  await localQueuedPage.route('https://queue-local-restored.example/v1/images/generations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: [{
        b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0X9WQAAAABJRU5ErkJggg=='
      }]
    })
  }));
  const localQueuedSnapshot = {
    ...localQueuedSession(),
    updatedAt: new Date().toISOString()
  };
  const localQueuedSessionKey = currentSessionScopedKey('queue-local-session');
  await localQueuedPage.addInitScript(({ snapshot, providerSettingsKey, manualSecretKey, sessionKey }) => {
    localStorage.setItem('auth_token', 'queue-smoke-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, email: 'queue-smoke@example.com' }));
    localStorage.setItem('image-sub2api-studio:current-session:v1:active', 'queue-local-session');
    localStorage.setItem(providerSettingsKey, JSON.stringify({
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: 'https://queue-local-restored.example/v1',
      route: 'auto',
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    sessionStorage.setItem(manualSecretKey, 'queue-local-restored-secret');
    localStorage.setItem(sessionKey, JSON.stringify(snapshot));
  }, { snapshot: localQueuedSnapshot, providerSettingsKey, manualSecretKey, sessionKey: localQueuedSessionKey });
  await localQueuedPage.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await localQueuedPage.waitForFunction((sessionKey) => {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return stored.canvasNodes?.length >= 1 && stored.status === 'success';
  }, localQueuedSessionKey, { timeout: 10000 });
  await localQueuedPage.screenshot({ path: localQueuedScreenshotPath, fullPage: true });
  const localQueuedResult = await localQueuedPage.evaluate((sessionKey) => {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || '{}');
    return {
      storedStatus: stored.generationQueue?.[0]?.status || '',
      appStatus: stored.status || '',
      canvasNodes: stored.canvasNodes?.length || 0,
      body: document.body.innerText.slice(0, 1400)
    };
  }, localQueuedSessionKey);
  assert(localJobCreateCount === 1, 'Restored local queued task did not create exactly one server generation job.', { localJobCreateCount, localQueuedResult });
  assert(localQueuedResult.appStatus === 'success', 'Restored local queued task did not finish with a success session status.', localQueuedResult);
  assert(localQueuedResult.storedStatus !== 'failed', 'Restored local queued task was marked failed even though the result was recovered.', localQueuedResult);
  assert(localQueuedResult.canvasNodes >= 1, 'Restored local queued task did not restore the generated result into the canvas.', localQueuedResult);
  await localQueuedContext.close();

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    failedScreenshotPath,
    runningScreenshotPath,
    localQueuedScreenshotPath,
    jobPollCount,
    sessionSaveCount,
    failedRetryCreateCount,
    runningPollCount,
    runningCancelCount,
    localJobCreateCount,
    result,
    failedResult,
    failedRetryRequests,
    runningResult,
    localQueuedResult
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
