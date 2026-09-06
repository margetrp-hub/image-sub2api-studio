const BASE_PATH = import.meta.env.BASE_URL || '/';
const PROTECTED_IMAGE_CONCURRENCY = 6;
const protectedImageQueue = [];
let activeProtectedImageRequests = 0;

export function assetPath(value) {
  if (!value) return '';
  if (/^(https?:|data:|blob:)/.test(value)) return value;
  if (value.startsWith('/studio-api/')) return value;
  const base = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;
  return value.startsWith('/') ? `${base}${value.slice(1)}` : `${base}${value}`;
}

export function publicJsonPath(fileName) {
  const base = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;
  return `${base}${fileName}`;
}

export function resolveResultUrl(url) {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

export function displayResultUrl(url) {
  return assetPath(resolveResultUrl(url));
}

export function isProtectedStudioAsset(url) {
  const value = String(url || '');
  return value.startsWith('/studio-api/history/')
    || value.startsWith('/studio-api/generation-jobs/')
    || value.startsWith('/studio-api/community-prompts/')
    || value.startsWith('/studio-api/library-assets/');
}

function runQueuedProtectedImageTasks() {
  while (activeProtectedImageRequests < PROTECTED_IMAGE_CONCURRENCY && protectedImageQueue.length) {
    const task = protectedImageQueue.shift();
    activeProtectedImageRequests += 1;
    task.run()
      .then(task.resolve, task.reject)
      .finally(() => {
        activeProtectedImageRequests = Math.max(0, activeProtectedImageRequests - 1);
        runQueuedProtectedImageTasks();
      });
  }
}

export function enqueueProtectedImageTask(run) {
  return new Promise((resolve, reject) => {
    protectedImageQueue.push({ run, resolve, reject });
    runQueuedProtectedImageTasks();
  });
}
