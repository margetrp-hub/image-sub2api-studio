import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, FormData as UndiciFormData, fetch as undiciFetch } from 'undici';
import { createServiceConfig } from './studio-service/config.js';
import { createCommunityPromptStore, sanitizeCommunityPrompt } from './studio-service/communityPrompts.js';
import { atomicWriteJson, parseJsonText } from './studio-service/jsonFiles.js';
import { createKeyedLock } from './studio-service/keyedLock.js';
import { serverJobFingerprint } from './studio-service/jobFingerprint.js';
import { createPublicPromptStore } from './studio-service/publicPrompts.js';
import {
  annotateProviderModels,
  applyProviderEndpoint,
  buildProviderImageEditPlan,
  buildProviderImageGenerationPlan,
  buildProviderVideoGenerationPlan,
  normalizeProviderImageItems,
  normalizeProviderVideoTask,
  providerProfile
} from './studio-service/providerProfiles.js';
import { createLoginFailureLimiter, createStandaloneAuthStore } from './studio-service/standaloneAuth.js';
import { multilineText, promptText, text, validatePromptLengths } from './studio-service/text.js';
import { createUserBackupService } from './studio-service/userBackup.js';
import { recoverUserRestore } from './studio-service/restoreTransaction.js';
import { createUserStorage } from './studio-service/userStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
  PORT,
  HOST,
  DATA_DIR,
  LIBRARY_DIR,
  LIBRARY_ASSET_DIRS,
  AUTH_MODE,
  AUTH_REGISTRATION_MODE,
  AUTH_DATABASE_PATH,
  AUTH_SESSION_TTL_MS,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_PASSWORD_ITERATIONS,
  AUTH_LOGIN_MAX_FAILURES,
  AUTH_LOGIN_FAILURE_WINDOW_MS,
  AUTH_GLOBAL_LOGIN_MAX_ATTEMPTS,
  AUTH_LOGIN_MAX_CONCURRENCY,
  AUTH_LOGIN_MAX_BODY_BYTES,
  CREDITS_ENABLED,
  USER_PROVIDER_ONLY,
  STUDIO_MASTER_KEY,
  ALLOW_PRIVATE_PROVIDER_URLS,
  AI_GATEWAY_BASE_URL,
  STUDIO_EMBED_GATEWAY_BASE_URL,
  STUDIO_EMBED_ORIGINS,
  PROVIDER_BASE_URL,
  PROVIDER_API_KEY,
  PROVIDER_TYPE,
  PROVIDER_CHAT_MODEL,
  HISTORY_LIMIT,
  SESSION_NODE_LIMIT,
  SESSION_URL_LIMIT,
  SESSION_QUEUE_LIMIT,
  SESSION_MESSAGE_LIMIT,
  SESSION_ASSET_PREFIX,
  JOB_LIMIT,
  JOB_TIMEOUT_MS,
  GATEWAY_FETCH_TIMEOUT_MS,
  JOB_CONCURRENCY,
  JOB_ACTIVE_STATUSES,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_MAX_TRANSIENT_FAILURES,
  SERVICE_STARTED_AT,
  SERVICE_VERSION,
  MAX_BODY_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  ALLOWED_ORIGINS
} = createServiceConfig({ scriptsDir: __dirname });

// A provider may briefly return 404 while an async video task becomes visible.
// Once that window is exhausted, keep the request ID and fail instead of polling
// a missing task for the full provider timeout.
const VIDEO_POLL_NOT_FOUND_MAX_RETRIES = 3;

const MANUAL_UPDATE_DIR = process.env.STUDIO_MANUAL_UPDATE_DIR || path.join(DATA_DIR, 'manual-update');
const MANUAL_UPDATE_REQUEST_FILE = process.env.STUDIO_MANUAL_UPDATE_REQUEST_FILE || path.join(MANUAL_UPDATE_DIR, 'request');
const MANUAL_UPDATE_STATUS_FILE = process.env.STUDIO_MANUAL_UPDATE_STATUS_FILE || path.join(MANUAL_UPDATE_DIR, 'status.json');

const standaloneAuthStore = AUTH_MODE === 'standalone'
  ? createStandaloneAuthStore({
    databasePath: AUTH_DATABASE_PATH,
    sessionTtlMs: AUTH_SESSION_TTL_MS,
    passwordIterations: AUTH_PASSWORD_ITERATIONS,
    minimumPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
    loginMaxFailures: AUTH_LOGIN_MAX_FAILURES,
    loginFailureWindowMs: AUTH_LOGIN_FAILURE_WINDOW_MS,
    billingDefaults: { creditsEnabled: CREDITS_ENABLED },
    providerMasterKey: STUDIO_MASTER_KEY,
    allowPrivateProviderUrls: ALLOW_PRIVATE_PROVIDER_URLS,
    providerFetchImpl: undiciFetch
  })
  : null;
const standaloneLoginIpLimiter = AUTH_MODE === 'standalone'
  ? createLoginFailureLimiter({ maxFailures: Math.max(10, AUTH_LOGIN_MAX_FAILURES * 2), windowMs: AUTH_LOGIN_FAILURE_WINDOW_MS })
  : null;
const standaloneLoginAccountLimiter = AUTH_MODE === 'standalone'
  ? createLoginFailureLimiter({ maxFailures: AUTH_LOGIN_MAX_FAILURES, windowMs: AUTH_LOGIN_FAILURE_WINDOW_MS })
  : null;
const standaloneLoginAttempts = [];
let standaloneLoginInFlight = 0;
const LIBRARY_LICENSE = {
  name: '社区提示词模板 · CC BY 4.0',
  spdx: 'CC-BY-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  notice: '提示词模板内容来自公开社区，遵循 CC BY 4.0 许可证；使用和改编时请保留原作者或来源归属。'
};
const PROMPT_PRESETS = [
  {
    id: 'image-product-poster',
    mode: 'image',
    title: '产品海报',
    prompt: '生成一张高级产品海报：主体清晰居中，保留产品真实结构和材质，使用精致棚拍光线，背景干净，有足够标题留白，整体适合商业投放。',
    tag: 'product'
  },
  {
    id: 'image-social-cover',
    mode: 'image',
    title: '社媒封面',
    prompt: '生成一张社媒封面图：画面有强焦点，版式现代，颜色鲜明但不过度，预留短标题空间，光影精致，适合内容平台、短视频或活动封面。',
    tag: 'social'
  },
  {
    id: 'image-portrait',
    mode: 'image',
    title: '头像写真',
    prompt: '生成一张精修头像写真：保留自然肤质和真实五官，眼神有表达力，背景干净，柔和侧光，气质自信，成片接近高端编辑写真。',
    tag: 'portrait'
  },
  {
    id: 'image-commerce-main',
    mode: 'image',
    title: '电商主图',
    prompt: '生成一张电商主图：保持产品身份不变，提升光线和质感，去除杂乱元素，主体居中清楚，画面适合商城首图展示。',
    tag: 'commerce'
  },
  {
    id: 'video-product-spot',
    mode: 'video',
    title: '产品短片',
    prompt: '生成一段 5 秒产品广告视频：产品保持真实结构和材质，镜头缓慢推进，精致棚拍光线，背景干净，有高级商业感，运动稳定，不要文字水印。'
  },
  {
    id: 'video-cinematic-shot',
    mode: 'video',
    title: '电影镜头',
    prompt: '生成一段电影感视频：主体清晰，浅景深，柔和逆光，镜头缓慢横移，环境有真实空间层次，动作自然，画面稳定。'
  },
  {
    id: 'video-architecture-tour',
    mode: 'video',
    title: '建筑漫游',
    prompt: '生成一段建筑空间漫游视频：镜头沿空间轴线缓慢前进，保持垂直线稳定，展示材质、光线和空间尺度，真实摄影风格。'
  },
  {
    id: 'video-social-motion',
    mode: 'video',
    title: '社媒动态',
    prompt: '生成一段适合短视频封面的动态视频：主体有轻微动作，镜头节奏清晰，色彩干净，第一秒抓人，画面不要出现字幕或水印。'
  }
];
const VIDEO_INSPIRATIONS = [
  {
    id: 'video-product-launch',
    kind: 'video-inspiration',
    title: '产品发布短片',
    intent: '商业广告',
    summary: '棚拍质感，镜头推近，突出材质和卖点。',
    prompt: '生成一段 5 秒产品发布短片：产品保持真实结构和材质，镜头从中景缓慢推近到细节特写，背景干净，灯光有高级棚拍质感，画面稳定，不出现字幕、水印或变形。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'product_ad',
    videoQuality: 'high',
    negativePrompt: '文字、水印、畸变、产品结构变化、手指遮挡'
  },
  {
    id: 'video-social-hook',
    kind: 'video-inspiration',
    title: '社媒开场钩子',
    intent: '短视频封面',
    summary: '第一秒有动作，竖屏抓人，适合社媒投放。',
    prompt: '生成一段适合社媒开场的 5 秒竖屏视频：主体在第一秒有清晰动作，镜头轻微前推，色彩干净，节奏明确，画面有封面感，不出现字幕或平台水印。',
    videoAspect: '9:16',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'realistic',
    videoQuality: 'standard',
    negativePrompt: '字幕、水印、过度闪烁、脸部变形、背景穿帮'
  },
  {
    id: 'video-architecture-walkthrough',
    kind: 'video-inspiration',
    title: '建筑空间漫游',
    intent: '空间展示',
    summary: '沿空间轴线前进，展示材质、光线和尺度。',
    prompt: '生成一段建筑空间漫游视频：镜头沿空间轴线缓慢前进，保持垂直线稳定，展示墙面材质、自然光线和空间尺度，真实摄影风格，运动顺滑。',
    videoAspect: '16:9',
    videoDuration: 10,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'realistic',
    videoQuality: 'high',
    negativePrompt: '透视扭曲、墙体变形、漂浮家具、文字水印'
  },
  {
    id: 'video-cinematic-portrait',
    kind: 'video-inspiration',
    title: '电影感人物镜头',
    intent: '人物氛围',
    summary: '浅景深、逆光、轻微横移，突出情绪。',
    prompt: '生成一段电影感人物视频：主体表情自然，浅景深，柔和逆光，镜头缓慢横移，背景有真实空间层次，动作克制，画面稳定，有胶片质感。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'pan',
    videoStyle: 'cinematic',
    videoQuality: 'high',
    negativePrompt: '脸部变形、多余手指、眼神漂移、字幕、水印'
  },
  {
    id: 'video-ui-flow',
    kind: 'video-inspiration',
    title: '界面操作演示',
    intent: '产品功能',
    summary: '干净界面，模拟点击和状态切换。',
    prompt: '生成一段产品界面操作演示视频：界面清晰，镜头固定，按钮和面板状态自然切换，动效克制，像真实软件录屏的高级演示，不出现多余文字或水印。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 30,
    videoMotion: 'static',
    videoStyle: 'product_ad',
    videoQuality: 'standard',
    negativePrompt: '乱码文字、错位界面、闪烁、鼠标变形、水印'
  },
  {
    id: 'video-food-closeup',
    kind: 'video-inspiration',
    title: '美食细节特写',
    intent: '餐饮内容',
    summary: '微距、热气、材质流动，适合菜单宣传。',
    prompt: '生成一段美食微距特写视频：镜头缓慢推近，能看到食物表面质感、热气和轻微流动，光线温暖自然，背景简洁，画面真实诱人。',
    videoAspect: '9:16',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'realistic',
    videoQuality: 'high',
    negativePrompt: '过度油腻、食物变形、文字、水印、餐具穿模'
  },
  {
    id: 'video-fashion-turntable',
    kind: 'video-inspiration',
    title: '服饰环绕展示',
    intent: '电商种草',
    summary: '人物或单品环绕，展示轮廓和材质。',
    prompt: '生成一段服饰环绕展示视频：主体保持稳定，镜头轻微环绕，展示衣料质感、廓形和细节，光线干净，动作自然，适合电商和种草短片。',
    videoAspect: '9:16',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'orbit',
    videoStyle: 'realistic',
    videoQuality: 'standard',
    negativePrompt: '肢体变形、衣服融化、图案漂移、文字水印'
  },
  {
    id: 'video-animation-mascot',
    kind: 'video-inspiration',
    title: '角色动画循环',
    intent: 'IP角色',
    summary: '轻动作循环，适合品牌角色和表情包。',
    prompt: '生成一段角色动画循环视频：角色保持一致，做一个轻微挥手或点头动作，动作可循环，背景简洁，表情友好，画面干净，不出现字幕或水印。',
    videoAspect: '1:1',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'static',
    videoStyle: 'animation',
    videoQuality: 'standard',
    negativePrompt: '角色漂移、五官变化、肢体断裂、文字、水印'
  },
  {
    id: 'video-event-kv-motion',
    kind: 'video-inspiration',
    title: '活动主视觉动态化',
    intent: '营销物料',
    summary: '把主视觉做成轻动态，适合投屏和社媒。',
    prompt: '生成一段活动主视觉动态视频：保留主视觉主体，背景元素轻微漂移，光影有层次，镜头缓慢拉远，适合大屏和社媒投放，不出现额外文字或水印。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'pull_out',
    videoStyle: 'cinematic',
    videoQuality: 'standard',
    negativePrompt: '文字错乱、主体变形、过度粒子、水印'
  },
  {
    id: 'video-scene-establishing',
    kind: 'video-inspiration',
    title: '场景建立镜头',
    intent: '故事开场',
    summary: '从环境到主体，建立氛围和叙事空间。',
    prompt: '生成一段故事开场的场景建立镜头：镜头从环境缓慢移动到主体，空间层次清楚，光线自然，有电影感，动作克制，适合作为短片第一镜。',
    videoAspect: '16:9',
    videoDuration: 10,
    videoFps: 24,
    videoMotion: 'pan',
    videoStyle: 'cinematic',
    videoQuality: 'high',
    negativePrompt: '镜头抖动、主体消失、空间变形、字幕、水印'
  }
];

const jobQueues = new Map();
const activeJobControllers = new Map();
const jobStorageLocks = createKeyedLock();
const userDataLocks = createKeyedLock();
const COMMUNITY_PROMPT_LIMIT = 300;
const gatewayFetchAgent = new Agent({
  headersTimeout: GATEWAY_FETCH_TIMEOUT_MS,
  bodyTimeout: GATEWAY_FETCH_TIMEOUT_MS,
  keepAliveTimeout: 120_000,
  keepAliveMaxTimeout: 120_000,
  ...(JOB_CONCURRENCY > 0 ? { connections: Math.max(8, JOB_CONCURRENCY * 4) } : {})
});
const videoPollAgent = new Agent({
  headersTimeout: GATEWAY_FETCH_TIMEOUT_MS,
  bodyTimeout: GATEWAY_FETCH_TIMEOUT_MS,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 10_000,
  ...(JOB_CONCURRENCY > 0 ? { connections: Math.max(4, JOB_CONCURRENCY * 2) } : {}),
  pipelining: 0
});

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(redactProviderSecret(JSON.stringify(payload)));
}

function sendDownloadJson(res, fileName, payload) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store'
  });
  res.end(redactProviderSecret(JSON.stringify(payload, null, 2)));
}

function redactProviderSecret(value) {
  let result = String(value ?? '');
  if (AUTH_MODE !== 'standalone' || !PROVIDER_API_KEY) return result;
  const serializedSecret = JSON.stringify(PROVIDER_API_KEY).slice(1, -1);
  for (const secret of new Set([PROVIDER_API_KEY, serializedSecret])) {
    if (secret) result = result.split(secret).join('[REDACTED]');
  }
  return result;
}

function redactProviderValue(value, depth = 0) {
  if (AUTH_MODE !== 'standalone' || !PROVIDER_API_KEY || depth > 20) return value;
  if (typeof value === 'string') return redactProviderSecret(value);
  if (Array.isArray(value)) return value.map((item) => redactProviderValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactProviderValue(item, depth + 1)]));
  }
  return value;
}

function sendCors(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'https';
  const sameHostOrigins = new Set();
  if (host) {
    sameHostOrigins.add(`https://${host}`);
    sameHostOrigins.add(`http://${host}`);
    sameHostOrigins.add(`${forwardedProto}://${host}`);
  }
  const allowOrigin = !origin || ALLOWED_ORIGINS.includes(origin) || sameHostOrigins.has(origin) ? origin : '';
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  return Boolean(!origin || allowOrigin);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match ? match[1].trim() : '';
}

function clientIp(req) {
  const remoteAddress = String(req.socket?.remoteAddress || 'unknown').trim();
  const proxyIsLoopback = /^(?:::ffff:)?127\.|^::1$/.test(remoteAddress);
  const realIp = proxyIsLoopback ? String(req.headers['x-real-ip'] || '').trim() : '';
  const forwarded = proxyIsLoopback
    ? String(req.headers['x-forwarded-for'] || '').split(',').map((item) => item.trim()).filter(Boolean).at(-1) || ''
    : '';
  const address = realIp || forwarded || remoteAddress;
  return address.slice(0, 120);
}

function loginRateLimitKey(req, identifier) {
  const normalizedIdentifier = String(identifier || '').trim().toLowerCase().slice(0, 254);
  return `${clientIp(req)}\n${normalizedIdentifier}`;
}

function requireLoginBucket(limiter, key) {
  const result = limiter.check(key);
  if (result.allowed) return;
  const error = new Error('LOGIN_RATE_LIMITED');
  error.status = 429;
  error.retryAfterMs = result.retryAfterMs;
  throw error;
}

function requireGlobalLoginCapacity() {
  const now = Date.now();
  const cutoff = now - AUTH_LOGIN_FAILURE_WINDOW_MS;
  while (standaloneLoginAttempts.length && standaloneLoginAttempts[0] <= cutoff) {
    standaloneLoginAttempts.shift();
  }
  const limit = Math.max(1, Number(AUTH_GLOBAL_LOGIN_MAX_ATTEMPTS) || 120);
  if (standaloneLoginAttempts.length >= limit) {
    const error = new Error('LOGIN_RATE_LIMITED');
    error.status = 429;
    error.retryAfterMs = Math.max(1, standaloneLoginAttempts[0] + AUTH_LOGIN_FAILURE_WINDOW_MS - now);
    throw error;
  }
  standaloneLoginAttempts.push(now);
}

function beginLoginWork() {
  const limit = Math.max(1, Number(AUTH_LOGIN_MAX_CONCURRENCY) || 4);
  if (standaloneLoginInFlight >= limit) {
    const error = new Error('LOGIN_BUSY');
    error.status = 429;
    error.retryAfterMs = 1000;
    throw error;
  }
  standaloneLoginInFlight += 1;
  return () => {
    standaloneLoginInFlight = Math.max(0, standaloneLoginInFlight - 1);
  };
}

function standaloneUserDir(userId) {
  const id = String(userId || '').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    const error = new Error('STUDIO_USER_ID_INVALID');
    error.status = 401;
    throw error;
  }
  return { userKey: id, userDir: path.join(DATA_DIR, 'users', id) };
}

function requireAdmin(auth) {
  if (auth?.user?.role !== 'admin') {
    const error = new Error('ADMIN_REQUIRED');
    error.status = 403;
    throw error;
  }
}

async function readManualUpdateStatus() {
  try {
    const payload = JSON.parse(await fs.readFile(MANUAL_UPDATE_STATUS_FILE, 'utf8'));
    if (payload && typeof payload === 'object') return payload;
  } catch {
    // The root updater may not have been installed yet.
  }
  return {
    state: 'idle',
    currentVersion: SERVICE_VERSION,
    targetVersion: '',
    message: '尚未检查更新。',
    updatedAt: ''
  };
}

async function requestManualUpdate() {
  await fs.mkdir(MANUAL_UPDATE_DIR, { recursive: true });
  let handle;
  try {
    handle = await fs.open(MANUAL_UPDATE_REQUEST_FILE, 'wx', 0o640);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const busy = new Error('UPDATE_ALREADY_RUNNING');
      busy.status = 409;
      throw busy;
    }
    const unavailable = new Error('UPDATE_SERVICE_UNAVAILABLE');
    unavailable.status = 503;
    throw unavailable;
  }
  try {
    await handle.writeFile(JSON.stringify({ requestedAt: new Date().toISOString() }), 'utf8');
  } finally {
    await handle.close();
  }
  return {
    ...(await readManualUpdateStatus()),
    state: 'queued',
    message: '更新请求已提交，等待 VPS 更新服务执行。',
    updatedAt: new Date().toISOString()
  };
}

async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('BODY_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return validatePromptLengths(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch (failure) {
    if (failure.message === 'PROMPT_TOO_LONG') throw failure;
    const error = new Error('INVALID_JSON');
    error.status = 400;
    throw error;
  }
}

const userStorage = createUserStorage({
  historyLimit: HISTORY_LIMIT,
  sessionAssetPrefix: SESSION_ASSET_PREFIX,
  parseJsonText
});
const {
  normalizeSessionId,
  ensureUserDirs,
  sessionPath,
  sessionPathForId,
  sessionsDir,
  sessionAssetId,
  jobsPath,
  communityPromptsPath,
  backupsDir,
  readRecords,
  writeRecords,
  readSession,
  writeSession,
  readSessionSnapshot
} = userStorage;

const communityPromptStore = createCommunityPromptStore({
  ensureUserDirs,
  communityPromptsPath,
  parseJsonText,
  limit: COMMUNITY_PROMPT_LIMIT
});
const {
  readCommunityPrompts,
  writeCommunityPrompts
} = communityPromptStore;
const publicPromptStore = createPublicPromptStore(path.join(DATA_DIR, 'community'));

async function readVisibleCommunityPrompts(auth) {
  if (!auth) return [];
  const [own, published] = await Promise.all([readCommunityPrompts(auth), publicPromptStore.list(auth)]);
  const publishedIds = new Set(published.map((item) => item.id));
  return [...published, ...own.filter((item) => !publishedIds.has(item.id))
    .map((item) => ({ ...item, visibility: 'private', canWithdraw: false }))];
}

function normalizeGatewayAccountPayload(payload) {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code === 0) return payload.data;
    throw new Error(payload.message || 'GATEWAY_AUTH_FAILED');
  }
  return payload;
}

async function gatewayAccountRequest(pathname, token, baseUrl = AI_GATEWAY_BASE_URL) {
  if (!baseUrl) {
    const error = new Error('GATEWAY_AUTH_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || `GATEWAY_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return normalizeGatewayAccountPayload(payload);
}

async function embeddedGatewayUser(token) {
  let user;
  try {
    user = await gatewayAccountRequest('/api/v1/auth/me', token, STUDIO_EMBED_GATEWAY_BASE_URL);
  } catch (firstError) {
    try {
      user = await gatewayAccountRequest('/api/v1/user/profile', token, STUDIO_EMBED_GATEWAY_BASE_URL);
    } catch (secondError) {
      const unauthorized = firstError?.status === 401 || secondError?.status === 401;
      const error = new Error(unauthorized ? 'EMBED_AUTH_INVALID' : 'EMBED_AUTH_UNAVAILABLE');
      error.status = unauthorized ? 401 : 503;
      throw error;
    }
  }

  const userId = user?.id || user?.user?.id || user?.email || user?.username;
  if (!userId) {
    const error = new Error('EMBED_USER_ID_MISSING');
    error.status = 401;
    throw error;
  }
  return { userId: String(userId) };
}

async function handleEmbeddedAuthRoute(req, res, parts) {
  if (AUTH_MODE !== 'standalone' || !standaloneAuthStore) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  const body = await readJsonBody(req, Math.max(1024, Number(AUTH_LOGIN_MAX_BODY_BYTES) || 16 * 1024));
  const parentOrigin = String(body.parentOrigin || '').trim().replace(/\/+$/, '');
  if (STUDIO_EMBED_ORIGINS.length && !STUDIO_EMBED_ORIGINS.includes(parentOrigin)) {
    const error = new Error('EMBED_ORIGIN_NOT_ALLOWED');
    error.status = 403;
    throw error;
  }
  const token = text(body.token, 512);
  if (!token) {
    const error = new Error('EMBED_TOKEN_REQUIRED');
    error.status = 401;
    throw error;
  }

  const external = await embeddedGatewayUser(token);
  const user = standaloneAuthStore.ensureExternalUser({
    provider: 'embedded-gateway',
    providerUserId: external.userId
  });
  const session = standaloneAuthStore.createSessionForUser(user.id);
  standaloneAuthStore.secureDatabaseFiles();
  return sendJson(res, 200, { ok: true, ...session });
}

async function authenticate(req) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error('AUTH_REQUIRED');
    error.status = 401;
    throw error;
  }

  if (AUTH_MODE === 'standalone') {
    const verified = standaloneAuthStore.verifySession(token);
    return {
      user: verified.user,
      session: verified.session,
      ...standaloneUserDir(verified.user.id)
    };
  }

  if (AUTH_MODE === 'local') {
    const key = createHash('sha256').update(`local:${token}`).digest('hex');
    return {
      user: { id: 'local-workspace', username: 'Local Workspace' },
      userKey: key,
      userDir: path.join(DATA_DIR, 'users', key)
    };
  }

  let user;
  try {
    user = await gatewayAccountRequest('/api/v1/auth/me', token);
  } catch {
    user = await gatewayAccountRequest('/api/v1/user/profile', token);
  }

  const userId = user?.id || user?.user?.id || user?.email || user?.username;
  if (!userId) {
    const error = new Error('USER_ID_MISSING');
    error.status = 401;
    throw error;
  }

  const key = createHash('sha256').update(String(userId)).digest('hex');
  return {
    user,
    userKey: key,
    userDir: path.join(DATA_DIR, 'users', key)
  };
}

function jobRuntimeKey(auth, jobId) {
  return `${auth.userKey}:${jobId}`;
}

function jobBillingReference(jobId) {
  return `generation:${jobId}`;
}

function jobRefundReference(jobId) {
  return `generation-refund:${jobId}`;
}

function reserveJobCredits(auth, job) {
  if (!standaloneAuthStore || AUTH_MODE !== 'standalone') return null;
  const cost = standaloneAuthStore.calculateJobCost(job);
  const chargeReference = jobBillingReference(job.id);
  const reservation = standaloneAuthStore.reserveCredits({
    userId: auth.user.id,
    amount: cost.amount,
    referenceId: chargeReference,
    metadata: {
      jobId: job.id,
      mode: job.mode,
      route: job.route,
      model: job.model,
      unit: cost.unit || 0,
      quantity: cost.quantity || 1
    }
  });
  return {
    amount: cost.amount,
    unit: cost.unit || 0,
    quantity: cost.quantity || 1,
    status: cost.amount > 0 ? 'reserved' : 'disabled',
    chargeReference,
    refundReference: jobRefundReference(job.id),
    balanceAfter: reservation.balance,
    reservedAt: new Date().toISOString()
  };
}

function chargeJobCredits(auth, job) {
  const billing = job?.billing;
  if (!standaloneAuthStore || AUTH_MODE !== 'standalone' || !billing) return billing || null;
  if (['charged', 'refunded', 'unknown'].includes(billing.status)) return billing;
  const amount = Math.max(0, Number(billing.amount || 0));
  if (!amount) return { ...billing, status: 'disabled' };
  const summary = standaloneAuthStore.getCreditSummary(auth.user.id);
  return {
    ...billing,
    status: 'charged',
    balanceAfter: summary.balance,
    chargedAt: new Date().toISOString()
  };
}

function refundJobCredits(auth, job, reason) {
  const billing = job?.billing;
  if (!standaloneAuthStore || AUTH_MODE !== 'standalone' || !billing || billing.status === 'refunded') {
    return billing || null;
  }
  const amount = Math.max(0, Number(billing.amount || 0));
  if (!amount) return { ...billing, status: 'disabled' };
  const refundReference = billing.refundReference || jobRefundReference(job.id);
  const refund = standaloneAuthStore.refundCredits({
    userId: auth.user.id,
    amount,
    referenceId: refundReference,
    metadata: {
      jobId: job.id,
      reason: text(reason || 'generation_failed', 120),
      chargeReference: billing.chargeReference || jobBillingReference(job.id)
    }
  });
  return {
    ...billing,
    status: 'refunded',
    refundReference,
    balanceAfter: refund.balance,
    refundedAt: new Date().toISOString()
  };
}

function markJobBillingUnknown(auth, job, reason) {
  const billing = job?.billing;
  if (!standaloneAuthStore || AUTH_MODE !== 'standalone' || !billing) return billing || null;
  const amount = Math.max(0, Number(billing.amount || 0));
  if (!amount) return { ...billing, status: 'disabled' };
  const summary = standaloneAuthStore.getCreditSummary(auth.user.id);
  return {
    ...billing,
    status: 'unknown',
    balanceAfter: summary.balance,
    unknownReason: text(reason || 'upstream_status_unknown', 120),
    unknownAt: new Date().toISOString()
  };
}

function isQueuedInMemory(auth, jobId) {
  const queue = jobQueues.get(auth.userKey);
  return Boolean(queue?.items?.some((item) => item.jobId === jobId));
}

function jobIsActiveInMemory(auth, jobId) {
  return activeJobControllers.has(jobRuntimeKey(auth, jobId)) || isQueuedInMemory(auth, jobId);
}

function normalizeJobForRead(auth, job) {
  if (!job || typeof job !== 'object') return null;
  const status = text(job.status || 'queued', 40);
  if (JOB_ACTIVE_STATUSES.has(status) && !jobIsActiveInMemory(auth, job.id)) {
    const updatedAt = Date.parse(job.updatedAt || job.startedAt || job.createdAt || '');
    const canResumeVideo = job.mode === 'video' && text(job.upstreamTaskId || job.requestIds?.[0], 180);
    if ((!Number.isFinite(updatedAt) || updatedAt < SERVICE_STARTED_AT - 1000) && !canResumeVideo) {
      return {
        ...job,
        status: 'unknown',
        stage: 'unknown',
        updatedAt: new Date().toISOString(),
        billing: markJobBillingUnknown(auth, job, 'runtime_not_attached'),
        error: {
          code: 'JOB_RUNTIME_NOT_ATTACHED',
          message: 'The service restarted or lost the active runner before this job returned a final result.'
        }
      };
    }
  }
  return job;
}

async function withUserJobLock(auth, action) {
  return jobStorageLocks.run(auth.userKey, action);
}

async function readJobsUnlocked(auth) {
  try {
    const raw = await fs.readFile(jobsPath(auth), 'utf8');
    const parsed = parseJsonText(raw);
    const jobs = Array.isArray(parsed) ? parsed : [];
    let changed = false;
    const normalized = jobs.map((job) => {
      const nextJob = normalizeJobForRead(auth, job);
      if (nextJob && nextJob !== job) changed = true;
      return nextJob;
    }).filter(Boolean);
    if (changed) {
      await writeJobsUnlocked(auth, normalized);
    }
    return normalized;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readJobs(auth) {
  return withUserJobLock(auth, () => readJobsUnlocked(auth));
}

async function writeJobsUnlocked(auth, jobs) {
  await ensureUserDirs(auth);
  await atomicWriteJson(jobsPath(auth), JOB_LIMIT > 0 ? jobs.slice(0, JOB_LIMIT) : jobs);
}

async function writeJobs(auth, jobs) {
  return withUserJobLock(auth, () => writeJobsUnlocked(auth, jobs));
}

async function updateJob(auth, jobId, patch) {
  return withUserJobLock(auth, async () => {
    const jobs = await readJobsUnlocked(auth);
    const index = jobs.findIndex((job) => job.id === jobId);
    if (index < 0) return null;
    const nextJob = {
      ...jobs[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    const nextJobs = [nextJob, ...jobs.filter((job) => job.id !== jobId)];
    await writeJobsUnlocked(auth, nextJobs);
    return nextJob;
  });
}

const userBackupService = createUserBackupService({
  serviceVersion: SERVICE_VERSION,
  normalizeSessionId,
  normalizeRecordId: requireRecordId,
  ensureUserDirs,
  backupsDir,
  sessionPath,
  sessionsDir,
  readRecords,
  writeRecords,
  readSessionSnapshot,
  writeSession,
  readJobs,
  writeJobs,
  readCommunityPrompts,
  writeCommunityPrompts
});
const {
  buildUserBackup,
  restoreUserBackup
} = userBackupService;

function isLikelyGarbledText(value) {
  const body = String(value || '').trim();
  if (!body) return false;
  if (/[\u0000-\u001f\u007f\ufffd]/.test(body)) return true;
  if (/[\u00c2\u00c3][\u0080-\u00bf]|(?:\u00e2\u20ac[\u0098-\u009d\u0153\u2122])|(?:[\u00e4-\u00e9][\u0080-\u00ff]{1,3}){2,}/.test(body)) return true;
  const latin = (body.match(/[A-Za-z]/g) || []).length;
  const cjk = (body.match(/[\u3400-\u9fff]/g) || []).length;
  const hasSeparator = /[\s/|.,:;()[\]{}_+\-·，。：；（）【】]/.test(body);
  if (latin > 0 && cjk >= 2 && !hasSeparator) return true;
  const useful = (body.match(/[A-Za-z0-9\u3400-\u9fff]/g) || []).length;
  return body.length >= 4 && useful / body.length < 0.45;
}

function cleanSourceText(value, length) {
  const body = text(value, length);
  return body && !isLikelyGarbledText(body) ? body : '';
}

function cleanLibraryId(value) {
  const raw = String(value || '').trim();
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(raw)) {
    const error = new Error('LIBRARY_ITEM_NOT_FOUND');
    error.status = 404;
    throw error;
  }
  return raw;
}

const RECORD_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

function requireRecordId(value) {
  const raw = String(value || '');
  if (RECORD_ID_PATTERN.test(raw)) return raw;
  const error = new Error('RECORD_ID_INVALID');
  error.status = 400;
  throw error;
}

function cleanRecordId(value) {
  try {
    return requireRecordId(value);
  } catch {
    return randomUUID();
  }
}

function assetExtension(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'video/webm') return 'webm';
  return 'png';
}

function detectImageMime(buffer, fallback = 'image/png') {
  if (buffer?.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer?.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer?.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return /^image\/(png|jpeg|webp)$/.test(fallback) ? fallback : 'image/png';
}

async function writeAssetBuffer(auth, recordId, buffer, mime, index) {
  const maxBytes = mime.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!buffer.length || buffer.length > maxBytes) return '';
  const ext = assetExtension(mime);
  const assetDir = path.join(auth.userDir, 'assets', recordId);
  await fs.mkdir(assetDir, { recursive: true });
  const fileName = `${index}.${ext}`;
  await fs.writeFile(path.join(assetDir, fileName), buffer);
  return `/studio-api/history/${recordId}/assets/${fileName}`;
}

async function storeResultUrl(auth, recordId, value, index) {
  const raw = String(value || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/studio-api/history/')) return raw;
  if (raw.startsWith('/studio-api/generation-jobs/')) return raw;

  const match = raw.match(/^data:((?:image\/(?:png|jpeg|webp))|video\/(?:mp4|webm));base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return '';

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  return writeAssetBuffer(auth, recordId, buffer, match[1], index);
}

async function storeSharedResultUrl(auth, shareId, value) {
  const raw = String(value || '').trim();
  if (/^https?:\/\//i.test(raw)) {
    throw Object.assign(new Error('SHARE_ASSET_REQUIRES_UPLOAD'), { status: 400 });
  }
  if (!raw.startsWith('/studio-api/')) {
    const stored = await storeResultUrl(auth, shareId, raw, 0);
    if (raw && !stored) {
      const error = new Error('SHARE_ASSET_INVALID');
      error.status = 400;
      throw error;
    }
    return stored;
  }
  const match = raw.match(/^\/studio-api\/(?:history|generation-jobs)\/([A-Za-z0-9_-]{8,160})\/assets\/([0-9]{1,3}\.(?:png|jpg|webp|mp4|webm))$/);
  if (!match) {
    const error = new Error('SHARE_ASSET_INVALID');
    error.status = 400;
    throw error;
  }
  const sourcePath = path.join(auth.userDir, 'assets', match[1], match[2]);
  const stat = await fs.stat(sourcePath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat?.isFile()) {
    const error = new Error('SHARE_ASSET_NOT_FOUND');
    error.status = 404;
    throw error;
  }
  const maxBytes = /\.(?:mp4|webm)$/.test(match[2]) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!stat.size || stat.size > maxBytes) {
    const error = new Error('SHARE_ASSET_SIZE_INVALID');
    error.status = 400;
    throw error;
  }
  const targetDir = path.join(auth.userDir, 'assets', shareId);
  const fileName = `0${path.extname(match[2])}`;
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(sourcePath, path.join(targetDir, fileName));
  return `/studio-api/history/${shareId}/assets/${fileName}`;
}

async function storeSessionUrl(auth, value, index, assetId = sessionAssetId()) {
  return storeResultUrl(auth, assetId, value, index);
}

async function readJsonFile(filePath, fallback = {}) {
  try {
    return parseJsonText(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function protectedLibraryAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\/studio-api\/library-assets\//i.test(raw)) return raw;
  if (/^\/studio-api\/(?:history|community-prompts)\/[a-zA-Z0-9_-]{8,80}\/assets\/[0-9]{1,3}\.(?:png|jpe?g|webp|mp4|webm)$/i.test(raw)) return raw;
  if (/^(?:\.\/)?\/?images\//i.test(raw)) return `/studio-api/library-assets/${raw.replace(/^(?:\.\/)?\/?images\//i, '')}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
}

function safeLibraryAssetSegments(rawAssetPath) {
  const segments = String(rawAssetPath || '').split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '..' || segment.includes('\0'))) return null;
  return segments;
}

function resolveLibraryAssetPath(segments) {
  if (!segments?.length) return '';
  for (const assetDir of LIBRARY_ASSET_DIRS) {
    const filePath = path.join(assetDir, ...segments);
    const relative = path.relative(assetDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (existsSync(filePath)) return filePath;
  }
  return '';
}

function libraryAssetExists(value) {
  const raw = String(value || '').trim();
  if (!/^\/studio-api\/library-assets\//i.test(raw)) return false;
  const assetPath = decodeURIComponent(raw.replace(/^\/studio-api\/library-assets\//i, ''));
  return Boolean(resolveLibraryAssetPath(safeLibraryAssetSegments(assetPath)));
}

function protectedLibraryThumbnailUrl(item) {
  const direct = protectedLibraryAssetUrl(item.thumbnail || item.thumb || item.thumbnail_url || item.thumbnailUrl);
  if (direct && (/^https?:\/\//i.test(direct) || libraryAssetExists(direct))) return direct;

  const image = String(item.image || item.image_url || '').trim();
  const localImage = protectedLibraryAssetUrl(image);
  if (/^(?:https?:\/\/|\/studio-api\/(?:history|community-prompts)\/)/i.test(localImage)) return localImage;
  if (/(?:^|\/)thumbs\//i.test(image)) return localImage;
  const match = image.match(/^(?:\.\/)?\/?images\/(.+)\.(png|jpe?g)$/i);
  if (!match) return libraryAssetExists(localImage) ? localImage : '';
  const generated = `/studio-api/library-assets/thumbs/${match[1]}.webp`;
  return libraryAssetExists(generated) ? generated : (libraryAssetExists(localImage) ? localImage : '');
}

function sanitizeLibrarySummary(item) {
  const image = protectedLibraryAssetUrl(item.image || item.image_url);
  const thumbnail = protectedLibraryThumbnailUrl(item);
  return {
    id: item.id,
    title: text(item.title, 180),
    image,
    thumbnail,
    imageAlt: text(item.imageAlt, 240),
    sourceLabel: cleanSourceText(item.sourceLabel, 120),
    sourceName: cleanSourceText(item.sourceName, 120),
    promptPreview: text(item.promptPreview, 160),
    kind: text(item.kind, 80),
    visibility: item.visibility === 'public' ? 'public' : 'private',
    canWithdraw: item.canWithdraw === true,
    category: text(item.category, 120),
    styles: Array.isArray(item.styles) ? item.styles.slice(0, 8).map((value) => text(value, 80)).filter(Boolean) : [],
    scenes: Array.isArray(item.scenes) ? item.scenes.slice(0, 8).map((value) => text(value, 80)).filter(Boolean) : [],
    featured: Boolean(item.featured),
    external: Boolean(item.external),
    sourceUrl: text(item.sourceUrl || item.githubUrl || item.sourceRepository, 600),
    sourceLicense: LIBRARY_LICENSE.spdx,
    attributionRequired: item.attributionRequired !== false,
    imageUnavailable: Boolean(item.imageUnavailable),
    imageUnavailableReason: text(item.imageUnavailableReason, 120),
    riskTags: Array.isArray(item.riskTags) ? item.riskTags.slice(0, 8).map((value) => text(value, 80)).filter(Boolean) : [],
    createdAt: text(item.createdAt, 60),
    updatedAt: text(item.updatedAt, 60),
    note: multilineText(item.note, 800),
    generationPrompt: promptText(item.generationPrompt || item.generation?.generationPrompt),
    generation: item.generation && typeof item.generation === 'object' ? item.generation : {},
    reactions: item.reactions && typeof item.reactions === 'object' ? item.reactions : { up: 0, down: 0 },
    copied: Math.max(0, Number(item.copied || 0)),
    shared: Math.max(0, Number(item.shared || 0)),
    userReaction: ['up', 'down'].includes(item.userReaction) ? item.userReaction : ''
  };
}

function sanitizeLibraryDetail(item) {
  return {
    ...sanitizeLibrarySummary(item),
    prompt: promptText(item.prompt)
  };
}

function sanitizePromptPresetSummary(item) {
  return {
    id: item.id,
    mode: item.mode,
    title: text(item.title, 120),
    tag: text(item.tag, 80)
  };
}

function sanitizePromptPresetDetail(item) {
  return {
    ...sanitizePromptPresetSummary(item),
    prompt: promptText(item.prompt)
  };
}

function sanitizeVideoInspirationSummary(item) {
  return {
    id: item.id,
    kind: 'video-inspiration',
    title: text(item.title, 160),
    intent: text(item.intent, 120),
    summary: text(item.summary, 180),
    videoAspect: text(item.videoAspect, 20),
    videoDuration: Number(item.videoDuration) || 5,
    videoFps: Number(item.videoFps) || 24,
    videoMotion: text(item.videoMotion, 80),
    videoStyle: text(item.videoStyle, 80),
    videoQuality: text(item.videoQuality, 40)
  };
}

function sanitizeVideoInspirationDetail(item) {
  return {
    ...sanitizeVideoInspirationSummary(item),
    prompt: promptText(item.prompt),
    negativePrompt: promptText(item.negativePrompt)
  };
}

async function readLibrary(auth = null) {
  const localData = await readJsonFile(path.join(LIBRARY_DIR, 'cases.json'), { cases: [] });
  const inspirationData = await readJsonFile(path.join(LIBRARY_DIR, 'inspirations.json'), { cases: [] });
  const localCases = Array.isArray(localData?.cases) ? localData.cases : [];
  const inspirationCases = Array.isArray(inspirationData?.cases) ? inspirationData.cases : [];
  const communityCases = await readVisibleCommunityPrompts(auth);
  const rawCases = [...communityCases, ...localCases, ...inspirationCases].filter((item) => item && item.id !== undefined && item.id !== null);
  const cases = rawCases.map(sanitizeLibrarySummary);
  return {
    rawCases,
    payload: {
      ok: true,
      license: LIBRARY_LICENSE,
      totalCases: cases.length,
      categories: [...new Set([
        ...(Array.isArray(localData?.categories) ? localData.categories : []),
        ...(Array.isArray(inspirationData?.categories) ? inspirationData.categories : []),
        ...communityCases.map((item) => item.category).filter(Boolean),
        ...cases.map((item) => item.category).filter(Boolean)
      ])].sort(),
      styles: [...new Set(cases.flatMap((item) => item.styles || []))].sort(),
      scenes: [...new Set(cases.flatMap((item) => item.scenes || []))].sort(),
      promptPresets: PROMPT_PRESETS.map(sanitizePromptPresetSummary),
      videoInspirations: VIDEO_INSPIRATIONS.map(sanitizeVideoInspirationSummary),
      cases
    }
  };
}

function sanitizeCase(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id || null,
    title: text(value.title, 160),
    image: text(value.image, 600),
    imageAlt: text(value.imageAlt, 240),
    promptPreview: text(value.promptPreview, 800),
    category: text(value.category, 120)
  };
}

function sanitizeSessionObject(value) {
  if (!value || typeof value !== 'object') return null;
  return { ...value };
}

function sanitizeAssistantMessages(items) {
  const source = Array.isArray(items) ? items.slice(-SESSION_MESSAGE_LIMIT) : [];
  return source
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: text(item.id || randomUUID(), 120),
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: text(item.content, 8000),
      finalPrompt: promptText(item.finalPrompt),
      pending: Boolean(item.pending),
      failed: Boolean(item.failed)
    }))
    .filter((item) => item.content || item.finalPrompt);
}

function sanitizePromptSuggestion(value) {
  if (!value || typeof value !== 'object') return null;
  const suggestion = {
    subject: text(value.subject, 2000),
    scene: text(value.scene, 2000),
    composition: text(value.composition, 2000),
    style: text(value.style, 2000),
    lighting: text(value.lighting, 2000),
    details: text(value.details, 3000),
    textRules: text(value.textRules, 2000),
    constraints: text(value.constraints, 3000),
    finalPrompt: promptText(value.finalPrompt),
    raw: text(value.raw, 16000)
  };
  return Object.values(suggestion).some(Boolean) ? suggestion : null;
}

function sanitizeCanvasView(value) {
  if (!value || typeof value !== 'object') return { x: 0, y: 0, zoom: 1 };
  const x = Number(value.x);
  const y = Number(value.y);
  const zoom = Number(value.zoom);
  return {
    x: Number.isFinite(x) ? Math.max(-8000, Math.min(8000, x)) : 0,
    y: Number.isFinite(y) ? Math.max(-8000, Math.min(8000, y)) : 0,
    zoom: Number.isFinite(zoom) ? Math.max(0.2, Math.min(3, zoom)) : 1
  };
}

function sanitizeDownloadMeta(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    mode: text(value.mode || 'image', 40),
    providerId: text(value.providerId, 160),
    createdAt: value.createdAt && !Number.isNaN(Date.parse(value.createdAt)) ? value.createdAt : '',
    prompt: promptText(value.prompt),
    id: text(value.id, 160)
  };
}

async function sanitizeSessionUrls(auth, values, assetIndex, assetId = sessionAssetId()) {
  const urls = [];
  const source = Array.isArray(values) ? values.slice(0, SESSION_URL_LIMIT) : [];
  for (const value of source) {
    const stored = await storeSessionUrl(auth, value, assetIndex.current, assetId);
    assetIndex.current += 1;
    if (stored) urls.push(stored);
    else if (/^(https?:|blob:)/i.test(String(value || ''))) urls.push(String(value));
  }
  return urls;
}

async function sanitizeCanvasNodes(auth, nodes, assetIndex, assetId = sessionAssetId()) {
  const source = Array.isArray(nodes) ? nodes.slice(0, SESSION_NODE_LIMIT) : [];
  const result = [];
  for (const node of source) {
    if (!node || typeof node !== 'object') continue;
    const rawUrl = String(node.url || '');
    let url = '';
    if (rawUrl) {
      url = await storeSessionUrl(auth, rawUrl, assetIndex.current, assetId);
      assetIndex.current += 1;
      if (!url && /^(https?:|blob:)/i.test(rawUrl)) url = rawUrl;
    }
    const x = Number(node.x);
    const y = Number(node.y);
    const width = Number(node.width);
    const height = Number(node.height);
    const canvasIndex = Math.round(Number(node.canvasIndex));
    result.push({
      id: text(node.id || randomUUID(), 120),
      parentId: text(node.parentId, 120),
      canvasIndex: Number.isFinite(canvasIndex) ? canvasIndex : result.length + 1,
      kind: text(node.kind || 'image', 40),
      url,
      persistedUrl: url,
      sourceUrl: text(node.sourceUrl, 1200),
      prompt: promptText(node.prompt),
      generationPrompt: promptText(node.generationPrompt || node.prompt),
      workflow: sanitizeWorkflow(node.workflow),
      title: text(node.title, 160),
      x: Number.isFinite(x) ? Math.max(-8000, Math.min(8000, x)) : 0,
      y: Number.isFinite(y) ? Math.max(-8000, Math.min(8000, y)) : 0,
      width: Number.isFinite(width) ? Math.max(240, Math.min(620, Math.round(width))) : undefined,
      height: Number.isFinite(height) ? Math.max(200, Math.min(520, Math.round(height))) : undefined,
      createdAt: node.createdAt && !Number.isNaN(Date.parse(node.createdAt)) ? node.createdAt : new Date().toISOString(),
      downloadMeta: sanitizeDownloadMeta(node.downloadMeta)
    });
  }
  return result;
}

function sanitizeCanvasCustomLinks(links) {
  const source = Array.isArray(links) ? links.slice(0, SESSION_NODE_LIMIT) : [];
  return source
    .map((link) => ({
      id: text(link?.id || randomUUID(), 120),
      fromId: text(link?.fromId, 120),
      toId: text(link?.toId, 120),
      createdAt: link?.createdAt && !Number.isNaN(Date.parse(link.createdAt)) ? link.createdAt : new Date().toISOString()
    }))
    .filter((link) => link.fromId && link.toId);
}

function sanitizeGenerationQueue(items) {
  const source = Array.isArray(items)
    ? SESSION_QUEUE_LIMIT > 0 ? items.slice(-SESSION_QUEUE_LIMIT) : items
    : [];
  return source
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: text(item.id || randomUUID(), 120),
      serverJobId: text(item.serverJobId, 120),
      remote: Boolean(item.remote),
      status: text(item.status || 'queued', 40),
      createdAt: Number(item.createdAt || Date.now()),
      startedAt: item.startedAt ? Number(item.startedAt) : null,
      completedAt: item.completedAt ? Number(item.completedAt) : null,
      mode: text(item.mode || 'image', 40),
      providerId: text(item.providerId || item.provider || '', 160),
      providerFamily: text(item.providerFamily || item.providerId || item.provider || '', 160),
      apiKeySource: text(item.apiKeySource || '', 60),
      providerLabel: text(item.providerLabel || '', 160),
      prompt: promptText(item.prompt),
      model: text(item.model, 160),
      aspect: text(item.aspect || item.aspectRatio, 40),
      aspectRatio: text(item.aspectRatio || item.aspect, 40),
      customSize: text(item.customSize, 40),
      size: text(item.size, 40),
      quality: text(item.quality, 40),
      resolutionTier: text(item.resolutionTier, 40),
      outputFormat: text(item.outputFormat, 20),
      moderation: text(item.moderation, 40),
      count: Math.max(1, Math.min(10, Number(item.count || 1))),
      selectedCanvasNodeId: text(item.selectedCanvasNodeId, 120),
      selectedCanvasNodeSnapshot: sanitizeSessionObject(item.selectedCanvasNodeSnapshot),
      referencesOpen: Boolean(item.referencesOpen),
      summary: text(item.summary || item.prompt, 260),
      restorable: Boolean(item.restorable),
      restored: Boolean(item.restored),
      stage: text(item.stage, 40),
      completed: Math.max(0, Math.min(10, Number(item.completed || 0))),
      total: Math.max(1, Math.min(10, Number(item.total || item.count || 1))),
      resultUrls: Array.isArray(item.resultUrls) ? item.resultUrls.slice(0, 10).map((value) => text(value, 1200)).filter(Boolean) : [],
      requestIds: Array.isArray(item.requestIds) ? item.requestIds.slice(0, 8).map((value) => text(value, 160)).filter(Boolean) : [],
      error: item.error && typeof item.error === 'object'
        ? {
          code: text(item.error.code, 120),
          status: item.error.status || null,
          requestId: text(item.error.requestId, 160),
          message: text(item.error.message, 1200)
        }
        : null
    }));
}

async function pruneSessionAssets(auth, session) {
  const assetId = sessionAssetId(session?.sessionId);
  const assetDir = path.join(auth.userDir, 'assets', assetId);
  const referenced = new Set();
  const collect = (url) => {
    const match = String(url || '').match(new RegExp(`/studio-api/history/${assetId}/assets/([0-9]{1,3}\\.(?:png|jpg|webp|mp4|webm))$`));
    if (match) referenced.add(match[1]);
  };
  for (const url of session.results || []) collect(url);
  for (const url of session.videoResults || []) collect(url);
  for (const node of session.canvasNodes || []) collect(node?.url);
  const files = await fs.readdir(assetDir).catch(() => []);
  await Promise.all(files
    .filter((fileName) => /^[0-9]{1,3}\.(png|jpg|webp|mp4|webm)$/.test(fileName) && !referenced.has(fileName))
    .map((fileName) => fs.rm(path.join(assetDir, fileName), { force: true })));
}

async function sanitizeSession(auth, body) {
  const assetIndex = { current: 0 };
  const sessionId = text(body.sessionId, 120);
  const assetId = sessionAssetId(sessionId);
  const results = await sanitizeSessionUrls(auth, body.results, assetIndex, assetId);
  const videoResults = await sanitizeSessionUrls(auth, body.videoResults, assetIndex, assetId);
  const canvasNodes = await sanitizeCanvasNodes(auth, body.canvasNodes, assetIndex, assetId);
  const session = {
    updatedAt: new Date().toISOString(),
    sessionId,
    mode: text(body.mode || 'image', 40),
    prompt: promptText(body.prompt),
    model: text(body.model, 160),
    results,
    videoResults,
    resultBatchMeta: sanitizeSessionObject(body.resultBatchMeta),
    canvasNodes,
    canvasCustomLinks: sanitizeCanvasCustomLinks(body.canvasCustomLinks),
    generationQueue: sanitizeGenerationQueue(body.generationQueue),
    selectedCanvasNodeId: text(body.selectedCanvasNodeId, 120),
    canvasEditorNodeId: text(body.canvasEditorNodeId, 120),
    canvasView: sanitizeCanvasView(body.canvasView),
    status: text(body.status || 'idle', 40),
    message: text(body.message, 1000),
    progress: sanitizeSessionObject(body.progress),
    timing: sanitizeSessionObject(body.timing),
    assistantMessages: sanitizeAssistantMessages(body.assistantMessages),
    promptSuggestion: sanitizePromptSuggestion(body.promptSuggestion),
    selectedCase: sanitizeCase(body.selectedCase),
    parameters: sanitizeSessionObject(body.parameters)
  };
  await pruneSessionAssets(auth, session);
  return session;
}

async function sanitizeRecord(auth, body) {
  const recordId = cleanRecordId(body.id);
  const inputUrls = Array.isArray(body.resultUrls) ? body.resultUrls.slice(0, 4) : [];
  const resultUrls = [];
  for (let index = 0; index < inputUrls.length; index += 1) {
    const stored = await storeResultUrl(auth, recordId, inputUrls[index], index);
    if (stored) resultUrls.push(stored);
  }

  return {
    id: recordId,
    sessionId: text(body.sessionId, 120),
    createdAt: body.createdAt && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : new Date().toISOString(),
    mode: text(body.mode || 'image', 40),
    kind: text(body.kind || body.mode || 'image', 40),
    providerId: text(body.providerId || body.provider || '', 160),
    providerFamily: text(body.providerFamily || body.providerId || body.provider || '', 160),
    apiKeySource: text(body.apiKeySource || '', 60),
    providerLabel: text(body.providerLabel || '', 160),
    prompt: promptText(body.prompt),
    generationPrompt: promptText(body.generationPrompt || body.prompt),
    workflow: sanitizeWorkflow(body.workflow),
    model: text(body.model, 120),
    size: text(body.size, 40),
    quality: text(body.quality, 40),
    outputFormat: text(body.outputFormat || body.output_format || '', 20),
    moderation: text(body.moderation || '', 40),
    aspectRatio: text(body.aspectRatio || body.aspect || body.videoAspectRatio || body.videoAspect, 40),
    resolutionTier: text(body.resolutionTier, 40),
    duration: Math.max(0, Number(body.duration || body.videoDuration) || 0),
    fps: Math.max(0, Number(body.fps || body.videoFps) || 0),
    width: Math.max(0, Number(body.width) || 0),
    height: Math.max(0, Number(body.height) || 0),
    videoMotion: text(body.videoMotion || body.motion, 160),
    videoStyle: text(body.videoStyle, 160),
    videoQuality: text(body.videoQuality, 160),
    negativePrompt: promptText(body.negativePrompt),
    referenceCount: Math.max(0, Number(body.referenceCount) || 0),
    requestIds: Array.isArray(body.requestIds) ? body.requestIds.slice(0, 8).map((value) => text(value, 160)).filter(Boolean) : [],
    usageSummary: text(body.usageSummary || body.costSummary || '', 240),
    costSummary: text(body.costSummary || '', 240),
    timing: sanitizeSessionObject(body.timing),
    count: Math.max(1, Math.min(10, Number(body.count || 1))),
    resultUrls,
    case: sanitizeCase(body.case)
  };
}

function cleanJobId(value) {
  const raw = String(value || '');
  return /^[a-zA-Z0-9_-]{8,100}$/.test(raw) ? raw : randomUUID();
}

function sanitizeWorkflow(workflow) {
  if (!workflow || typeof workflow !== 'object') return null;
  const lineage = Array.isArray(workflow.lineage)
    ? workflow.lineage
      .slice(-24)
      .map((step, index) => ({
        index: Number(step?.index) || index + 1,
        jobId: text(step?.jobId, 160),
        nodeId: text(step?.nodeId, 160),
        mode: text(step?.mode || 'image', 40),
        route: text(step?.route || '', 80),
        prompt: promptText(step?.prompt)
      }))
      .filter((step) => step.prompt)
    : [];
  const rootPrompt = promptText(workflow.rootPrompt);
  if (!rootPrompt && !lineage.length) return null;
  return { rootPrompt, lineage };
}

function normalizeGatewayBaseUrl(value) {
  const raw = String(value || AI_GATEWAY_BASE_URL).replace(/\/+$/, '');
  if (raw.endsWith('/v1')) return raw;
  return `${raw}/v1`;
}

function standaloneProviderRuntime(request = {}, userId = '') {
  if (AUTH_MODE === 'standalone' && request.apiKeySource === 'linked') {
    const connectionId = text(request.providerConnectionId || request.providerProfileId, 160);
    if (!connectionId || !userId) {
      const error = new Error('PROVIDER_CONNECTION_REQUIRED');
      error.status = 400;
      throw error;
    }
    const settings = standaloneAuthStore?.getBillingSettings();
    if (!settings?.providerBindingEnabled) {
      const error = new Error('PROVIDER_BINDING_DISABLED');
      error.status = 403;
      throw error;
    }
    const connection = standaloneAuthStore.getProviderConnectionRuntime(userId, connectionId);
    return {
      apiKey: connection.apiKey,
      gatewayBaseUrl: connection.gatewayBaseUrl,
      connectionId: connection.connectionId,
      profile: providerProfile(request.providerType || request.providerId || 'openai-compatible')
    };
  }
  const manual = AUTH_MODE === 'standalone' && (USER_PROVIDER_ONLY || request.apiKeySource === 'manual');
  const apiKey = manual ? text(request.apiKey, 4000) : PROVIDER_API_KEY;
  const configuredBaseUrl = manual ? text(request.gatewayBaseUrl, 4000) : PROVIDER_BASE_URL;
  if (!configuredBaseUrl || !apiKey) {
    const error = new Error(manual ? 'MANUAL_PROVIDER_NOT_CONFIGURED' : 'STUDIO_PROVIDER_NOT_CONFIGURED');
    error.status = 503;
    throw error;
  }
  const gatewayBaseUrl = normalizeGatewayBaseUrl(configuredBaseUrl);
  let url;
  try {
    url = new URL(gatewayBaseUrl);
  } catch {
    const error = new Error('STUDIO_PROVIDER_CONFIGURATION_INVALID');
    error.status = 503;
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    const error = new Error('STUDIO_PROVIDER_CONFIGURATION_INVALID');
    error.status = 503;
    throw error;
  }
  return {
    apiKey,
    gatewayBaseUrl: url.toString().replace(/\/+$/, ''),
    profile: providerProfile(manual ? request.providerType || request.providerId : PROVIDER_TYPE)
  };
}

function modelSyncEndpointUrl(gatewayBaseUrl) {
  const base = normalizeGatewayBaseUrl(gatewayBaseUrl);
  let url;
  try {
    url = new URL(`${base}/models`);
  } catch {
    const error = new Error('MODEL_SYNC_GATEWAY_URL_INVALID');
    error.status = 400;
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    const error = new Error('MODEL_SYNC_GATEWAY_URL_INVALID');
    error.status = 400;
    throw error;
  }
  return url.toString();
}

async function fetchGatewayModels(apiKey, gatewayBaseUrl, signal) {
  const response = await undiciFetch(modelSyncEndpointUrl(gatewayBaseUrl), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    dispatcher: gatewayFetchAgent,
    signal
  });
  return readGatewayResponse(response);
}

function chatCompletionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => typeof item === 'string' ? item : item?.text || '')
      .join('')
      .trim();
  }
  return '';
}

async function providerChatCompletion({ model, messages, signal, request = {}, userId = '' }) {
  const runtime = standaloneProviderRuntime(request, userId);
  const selectedModel = text(request.apiKeySource === 'manual'
    ? model || 'gpt-4o-mini'
    : PROVIDER_CHAT_MODEL || model || 'gpt-4o-mini', 160);
  const payload = await postJsonToGateway(`${runtime.gatewayBaseUrl}/chat/completions`, runtime.apiKey, {
    model: selectedModel,
    messages,
    temperature: 0.7,
    stream: false
  }, `studio-prompt-${randomUUID()}`, signal);
  const content = chatCompletionText(payload);
  if (!content) {
    const error = new Error('STUDIO_PROVIDER_EMPTY_RESPONSE');
    error.status = 502;
    throw error;
  }
  return { model: selectedModel, text: content };
}

function sanitizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-20).map((item) => ({
    role: ['system', 'user', 'assistant'].includes(item?.role) ? item.role : 'user',
    content: text(item?.content, 12_000)
  })).filter((item) => item.content);
}

async function handleStandalonePromptRoute(req, res, parts, userId) {
  if (AUTH_MODE !== 'standalone' || req.method !== 'POST' || parts.length !== 3) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  }
  const body = await readJsonBody(req);
  if (parts[2] === 'optimize') {
    const prompt = promptText(body.prompt);
    if (!prompt) return sendJson(res, 400, { ok: false, error: 'PROMPT_REQUIRED' });
    const instruction = text(body.instruction, 4_000);
    const result = await providerChatCompletion({
      model: body.model,
      request: body,
      messages: [
        {
          role: 'system',
          content: 'You are an image prompt editor. Return only the improved image generation prompt, with no preamble or quotation marks.'
        },
        {
          role: 'user',
          content: `${instruction ? `${instruction}\n\n` : ''}Original prompt:\n${prompt}`
        }
      ],
      signal: req.signal,
      userId
    });
    return sendJson(res, 200, { ok: true, prompt: result.text, text: result.text, model: result.model });
  }
  if (parts[2] === 'assistant') {
    const messages = sanitizeChatMessages(body.messages);
    const prompt = promptText(body.prompt);
    const instruction = text(body.userInstruction || body.instruction, 4_000);
    const context = [
      body.basePrompt ? `Canvas base prompt:\n${promptText(body.basePrompt)}` : '',
      body.selectedCanvasLabel ? `Selected canvas: ${text(body.selectedCanvasLabel, 500)}` : '',
      body.aspectRatio || body.size || body.resolutionTier || body.quality
        ? `Image parameters: ${[body.aspectRatio, body.size, body.resolutionTier, body.quality].map((item) => text(item, 100)).filter(Boolean).join(', ')}`
        : ''
    ].filter(Boolean).join('\n\n');
    if (context) messages.unshift({ role: 'system', content: context });
    if (!messages.length && prompt) messages.push({ role: 'user', content: `Current prompt:\n${prompt}` });
    if (instruction) messages.push({ role: 'user', content: instruction });
    if (!messages.length) return sendJson(res, 400, { ok: false, error: 'PROMPT_REQUIRED' });
    const result = await providerChatCompletion({ model: body.model, messages, signal: req.signal, request: body, userId });
    return sendJson(res, 200, { ok: true, text: result.text, model: result.model });
  }
  return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
}

function dataUrlToBuffer(value) {
  const raw = String(value || '');
  const match = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return {
    mime: match[1],
    buffer,
    ext: assetExtension(match[1])
  };
}

function normalizeImageInput(value, index) {
  if (!value) return null;
  const dataUrl = typeof value === 'string' ? value : value.dataUrl;
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed) return null;
  return {
    ...parsed,
    name: text(value.name || `reference-${index + 1}.${parsed.ext}`, 120)
  };
}

function gatewayErrorMessage(error) {
  const payload = error?.payload || {};
  const message = payload?.error?.message || payload?.message || error?.message || 'GENERATION_JOB_FAILED';
  return redactProviderSecret(String(message).slice(0, 1200));
}

function gatewayDispatchErrorMessage(error) {
  const message = String(error?.message || '');
  const causeCode = String(error?.cause?.code || '');
  if (
    error?.name === 'TimeoutError'
    || causeCode === 'UND_ERR_HEADERS_TIMEOUT'
    || causeCode === 'UND_ERR_BODY_TIMEOUT'
    || /headers timeout|body timeout|timeout/i.test(message)
  ) {
    return 'The gateway did not return a final response before the Workbench timeout. The upstream image request may still be processing, queued, or billed.';
  }
  return 'The Workbench service could not deliver this request to the gateway. Check the gateway URL, service network, origin allowlist, and firewall before retrying.';
}

function gatewayRequestId(payload, headers) {
  return redactProviderSecret(text(
    payload?.request_id
    || payload?.id
    || payload?.error?.request_id
    || payload?.error?.requestId
    || headers?.get?.('x-request-id')
    || headers?.get?.('openai-request-id')
    || '',
    180
  ));
}

async function readGatewayResponse(response) {
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? parseJsonText(raw) : {};
  } catch {
    payload = { message: raw.slice(0, 1200) };
  }
  const safePayload = redactProviderValue(payload);
  if (!response.ok) {
    const error = new Error(safePayload?.error?.message || safePayload?.message || `GATEWAY_HTTP_${response.status}`);
    error.status = response.status;
    error.payload = safePayload;
    error.requestId = gatewayRequestId(safePayload, response.headers);
    throw error;
  }
  const requestId = gatewayRequestId(safePayload, response.headers);
  if (requestId && safePayload && typeof safePayload === 'object' && !safePayload.request_id) safePayload.request_id = requestId;
  return safePayload;
}

async function persistRemoteImage(auth, recordId, rawUrl, index) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60 * 1000);
  try {
    const response = await fetch(rawUrl, { signal: controller.signal });
    if (!response.ok) return rawUrl;
    const mime = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|webp)$/.test(mime)) return rawUrl;
    const buffer = Buffer.from(await response.arrayBuffer());
    return await writeAssetBuffer(auth, recordId, buffer, mime, index) || rawUrl;
  } catch {
    return rawUrl;
  } finally {
    clearTimeout(timer);
  }
}

async function persistGatewayImage(auth, recordId, item, index, outputFormat = 'png') {
  const url = String(item?.url || item?.image_url || '').trim();
  if (item?.b64_json || item?.image_base64) {
    const fallbackMime = outputFormat === 'jpeg'
      ? 'image/jpeg'
      : outputFormat === 'webp'
        ? 'image/webp'
        : 'image/png';
    const buffer = Buffer.from(String(item.b64_json || item.image_base64).replace(/\s+/g, ''), 'base64');
    const mime = detectImageMime(buffer, fallbackMime);
    return writeAssetBuffer(auth, recordId, buffer, mime, index);
  }
  if (url.startsWith('data:')) {
    return storeResultUrl(auth, recordId, url, index);
  }
  if (/^https?:\/\//i.test(url)) {
    return persistRemoteImage(auth, recordId, url, index);
  }
  return '';
}

function providerEndpointUrl(gatewayBaseUrl, endpoint) {
  const pathName = String(endpoint || '').trim();
  if (/^https?:\/\//i.test(pathName)) return pathName;
  return `${String(gatewayBaseUrl || '').replace(/\/+$/, '')}/${pathName.replace(/^\/+/, '')}`;
}

function providerAssetUrl(gatewayBaseUrl, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = `${String(gatewayBaseUrl || '').replace(/\/+$/, '')}/`;
  return new URL(raw, base).toString();
}

function imageInputDataUrl(image) {
  if (!image?.buffer?.length || !image.mime) return '';
  return `data:${image.mime};base64,${image.buffer.toString('base64')}`;
}

async function getJsonFromGateway(url, apiKey, clientRequestId, signal) {
  const response = await undiciFetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(clientRequestId ? { 'X-Client-Request-ID': clientRequestId } : {})
    },
    dispatcher: gatewayFetchAgent,
    signal
  });
  return readGatewayResponse(response);
}

async function getVideoTaskFromGateway(url, apiKey, clientRequestId, signal) {
  const response = await undiciFetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(clientRequestId ? { 'X-Client-Request-ID': clientRequestId } : {})
    },
    dispatcher: videoPollAgent,
    signal
  });
  return readGatewayResponse(response);
}

async function readLimitedResponseBuffer(response, maxBytes) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    const error = new Error('VIDEO_ASSET_TOO_LARGE');
    error.status = 413;
    throw error;
  }
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      const error = new Error('VIDEO_ASSET_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    return buffer;
  }
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('VIDEO_ASSET_TOO_LARGE');
      const error = new Error('VIDEO_ASSET_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function persistGatewayVideo(auth, recordId, rawUrl, index, runtime, clientRequestId, signal) {
  const url = providerAssetUrl(runtime.gatewayBaseUrl, rawUrl);
  if (!url) return '';
  const gatewayOrigin = new URL(runtime.gatewayBaseUrl).origin;
  const assetOrigin = new URL(url).origin;
  const response = await undiciFetch(url, {
    headers: assetOrigin === gatewayOrigin ? {
      Authorization: `Bearer ${runtime.apiKey}`,
      ...(clientRequestId ? { 'X-Client-Request-ID': clientRequestId } : {})
    } : {},
    dispatcher: gatewayFetchAgent,
    signal
  });
  if (!response.ok) await readGatewayResponse(response);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !['video/mp4', 'application/octet-stream'].includes(contentType)) {
    const error = new Error('VIDEO_ASSET_FORMAT_UNSUPPORTED');
    error.status = 502;
    throw error;
  }
  const buffer = await readLimitedResponseBuffer(response, MAX_VIDEO_BYTES);
  return writeAssetBuffer(auth, recordId, buffer, 'video/mp4', index);
}

function waitForProviderPoll(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error('JOB_CANCELED'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason || new Error('JOB_CANCELED'));
    }, { once: true });
  });
}

function isTransientVideoPollError(error, consecutiveFailures = 0) {
  const status = Number(error?.status || 0);
  if (status === 404) return consecutiveFailures <= VIDEO_POLL_NOT_FOUND_MAX_RETRIES;
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function pollFailureDetails(error) {
  const status = Number(error?.status || 0);
  const causeCode = String(error?.cause?.code || '').trim();
  const errorCode = String(causeCode || error?.code || error?.name || 'POLL_FAILED')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .slice(0, 80);
  return { status: status || null, code: errorCode };
}

async function runVideoGenerationRequest(auth, job, runtime, signal, resumeTaskId = '') {
  const plan = runtime.plan || buildProviderVideoGenerationPlan(
    runtime.profile || providerProfile(PROVIDER_TYPE),
    job,
    imageInputDataUrl(runtime.images[0])
  );
  const createEndpoint = providerEndpointUrl(runtime.gatewayBaseUrl, plan.endpoint);
  let currentJob = job;
  let task;
  if (resumeTaskId) {
    task = { id: resumeTaskId, status: 'in_progress', progress: job.progress };
  } else {
    currentJob = await updateJob(auth, job.id, {
      status: 'gateway',
      stage: 'gateway',
      endpoint: providerPublicEndpoint(plan.endpoint),
      invocationAdapter: plan.adapter,
      completed: 0,
      total: 1,
      timing: {
        ...(job.timing || {}),
        gatewayAt: Date.now()
      }
    }) || job;
    const createPayload = plan.payloadFormat === 'multipart'
      ? await postMultipartToGateway(
          createEndpoint,
          runtime.apiKey,
          buildProviderMultipartForm(plan, runtime, { includeVideoReference: true }),
          job.clientRequestId,
          signal
        )
      : await postJsonToGateway(createEndpoint, runtime.apiKey, plan.body, job.clientRequestId, signal);
    task = normalizeProviderVideoTask(createPayload);
  }
  if (!task.id) {
    const error = new Error('VIDEO_TASK_ID_MISSING');
    error.payload = task.raw || null;
    throw error;
  }
  const requestIds = [task.id];
  currentJob = await updateJob(auth, job.id, {
    status: task.status === 'completed' ? 'saving' : 'upstream',
    stage: task.status === 'completed' ? 'saving' : 'upstream',
    requestIds,
    upstreamTaskId: task.id,
    progress: task.progress,
    timing: {
      ...(currentJob.timing || {}),
      ...(resumeTaskId ? { recoveryAt: Date.now() } : { responseAt: Date.now() })
    }
  }) || currentJob;

  let transientPollFailures = 0;
  while (!['completed', 'failed'].includes(task.status)) {
    await waitForProviderPoll(VIDEO_POLL_INTERVAL_MS, signal);
    const retrieveEndpoint = providerEndpointUrl(runtime.gatewayBaseUrl, applyProviderEndpoint(plan.retrieveEndpoint, { id: task.id }));
    try {
      task = normalizeProviderVideoTask(await getVideoTaskFromGateway(retrieveEndpoint, runtime.apiKey, job.clientRequestId, signal));
      transientPollFailures = 0;
      currentJob = await updateJob(auth, job.id, {
        status: task.status === 'completed' ? 'saving' : task.status === 'failed' ? 'failed' : 'upstream',
        stage: task.status === 'completed' ? 'saving' : task.status === 'failed' ? 'failed' : 'upstream',
        progress: task.progress,
        requestIds,
        timing: {
          ...(currentJob.timing || {}),
          polledAt: Date.now(),
          pollLastStatus: 200,
          pollLastError: null
        }
      }) || currentJob;
    } catch (error) {
      transientPollFailures += 1;
      if (!isTransientVideoPollError(error, transientPollFailures) || transientPollFailures > VIDEO_POLL_MAX_TRANSIENT_FAILURES) throw error;
      const failure = pollFailureDetails(error);
      currentJob = await updateJob(auth, job.id, {
        status: 'upstream',
        stage: 'upstream',
        requestIds,
        timing: {
          ...(currentJob.timing || {}),
          pollRetryAt: Date.now(),
          pollRetryCount: transientPollFailures,
          pollLastStatus: failure.status,
          pollLastError: failure.code
        }
      }) || currentJob;
      continue;
    }
    if (!task.id) task.id = requestIds[0];
  }
  if (task.status === 'failed') {
    const error = new Error(task.error?.message || 'VIDEO_GENERATION_FAILED');
    error.payload = task.raw;
    throw error;
  }

  const contentPath = task.url || (plan.contentEndpoint
    ? providerEndpointUrl(runtime.gatewayBaseUrl, applyProviderEndpoint(plan.contentEndpoint, { id: task.id }))
    : '');
  if (!contentPath) {
    const error = new Error('VIDEO_GENERATION_RETURNED_NO_VIDEO');
    error.payload = task.raw;
    throw error;
  }
  const stored = await persistGatewayVideo(auth, job.id, contentPath, 0, runtime, job.clientRequestId, signal);
  if (!stored) throw new Error('VIDEO_ASSET_SAVE_FAILED');
  currentJob = await updateJob(auth, job.id, {
    status: 'video',
    stage: 'video',
    completed: 1,
    total: 1,
    resultUrls: [stored],
    requestIds,
    timing: {
      ...(currentJob.timing || {}),
      savedAt: Date.now()
    }
  }) || currentJob;
  return { resultUrls: [stored], requestIds, usage: task.raw?.usage || null, timing: currentJob.timing || null };
}

function buildJobRecord(body) {
  const request = body?.request && typeof body.request === 'object' ? body.request : body;
  const mode = request.mode === 'video' ? 'video' : ['edit', 'mask'].includes(request.mode) ? request.mode : 'image';
  const route = mode === 'video' ? 'video' : mode === 'image' && request.route !== 'edits' ? 'generations' : 'edits';
  const count = mode === 'video' ? 1 : Math.max(1, Math.min(10, Number(request.n || request.count || 1)));
  const now = new Date().toISOString();
  return {
    id: cleanJobId(request.id || body.id),
    clientRequestId: cleanJobId(request.clientRequestId || body.clientRequestId),
    sessionId: text(request.sessionId || body.sessionId, 120),
    parentCanvasNodeId: text(request.parentCanvasNodeId || body.parentCanvasNodeId, 120),
    fingerprint: text(request.fingerprint || body.fingerprint, 16000),
    status: 'queued',
    stage: 'queued',
    createdAt: now,
    updatedAt: now,
    startedAt: '',
    completedAt: '',
    mode,
    route,
    endpoint: '',
    invocationAdapter: '',
    providerId: text(request.providerId || request.provider || '', 160),
    providerFamily: text(request.providerFamily || request.providerId || request.provider || '', 160),
    apiKeySource: text(request.apiKeySource || '', 60),
    providerLabel: text(request.providerLabel || '', 160),
    model: text(request.model, 160),
    prompt: promptText(request.prompt),
    generationPrompt: promptText(request.generationPrompt || request.prompt),
    workflow: sanitizeWorkflow(request.workflow),
    size: text(request.size || 'auto', 40),
    quality: text(request.quality || 'auto', 40),
    outputFormat: text(request.outputFormat || request.output_format || 'png', 20),
    moderation: text(request.moderation || 'auto', 40),
    aspectRatio: text(request.aspectRatio || request.videoAspect || '', 40),
    resolutionTier: text(request.resolutionTier, 40),
    duration: Math.max(1, Math.min(30, Number(request.duration || request.videoDuration || 5))),
    width: Math.max(0, Number(request.width || 0)),
    height: Math.max(0, Number(request.height || 0)),
    fps: Math.max(0, Number(request.fps || request.videoFps || 0)),
    motion: text(request.motion || request.videoMotion || '', 80),
    videoStyle: text(request.style || request.videoStyle || '', 80),
    videoQuality: text(request.videoQuality || request.quality || '', 40),
    negativePrompt: promptText(request.negativePrompt),
    count,
    completed: 0,
    total: count,
    resultUrls: [],
    usage: null,
    error: null,
    requestIds: [],
    timing: {
      queuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      totalMs: null
    },
    inputSummary: {
      referenceCount: Array.isArray(body.images) ? body.images.length : 0,
      hasMask: Boolean(body.mask)
    }
  };
}

function buildJobRuntime(body, auth) {
  const request = body?.request && typeof body.request === 'object' ? body.request : body;
  let apiKey;
  let gatewayBaseUrl;
  let profile;
  if (AUTH_MODE === 'standalone') {
    ({ apiKey, gatewayBaseUrl, profile } = standaloneProviderRuntime({ ...body, ...request }, auth?.user?.id));
  } else {
    apiKey = text(body.apiKey || request.apiKey, 4000);
    gatewayBaseUrl = normalizeGatewayBaseUrl(body.gatewayBaseUrl || request.gatewayBaseUrl || AI_GATEWAY_BASE_URL);
    profile = providerProfile(request.providerFamily || request.providerId);
  }
  if (!apiKey) {
    const error = new Error('GENERATION_JOB_API_KEY_REQUIRED');
    error.status = 400;
    throw error;
  }
  return {
    apiKey,
    gatewayBaseUrl,
    profile,
    images: (Array.isArray(body.images) ? body.images : []).slice(0, 4).map(normalizeImageInput).filter(Boolean),
    mask: body.mask ? normalizeImageInput(body.mask, 0) : null
  };
}

function buildJobInvocationPlan(job, runtime) {
  const imageDataUrls = runtime.images.map(imageInputDataUrl).filter(Boolean);
  if (job.mode === 'video') {
    return buildProviderVideoGenerationPlan(runtime.profile, job, imageDataUrls[0] || '');
  }
  if (job.route === 'edits') {
    return buildProviderImageEditPlan(runtime.profile, job, imageDataUrls);
  }
  return buildProviderImageGenerationPlan(runtime.profile, job, imageDataUrls);
}

function providerPublicEndpoint(endpoint) {
  const value = String(endpoint || '');
  return value.startsWith('/v1/') ? value : `/v1/${value.replace(/^\/+/, '')}`;
}

function buildProviderMultipartForm(plan, runtime, { includeVideoReference = false } = {}) {
  const form = new UndiciFormData();
  for (const [key, value] of Object.entries(plan.body || {})) {
    form.set(key, String(value));
  }
  if (includeVideoReference && runtime.images[0]) {
    const image = runtime.images[0];
    form.set('input_reference', new Blob([image.buffer], { type: image.mime }), image.name || `reference.${image.ext}`);
  } else {
    runtime.images.forEach((image, index) => {
      form.append('image', new Blob([image.buffer], { type: image.mime }), image.name || `reference-${index + 1}.${image.ext}`);
    });
    if (runtime.mask) {
      form.set('mask', new Blob([runtime.mask.buffer], { type: runtime.mask.mime }), runtime.mask.name || `mask.${runtime.mask.ext}`);
    }
  }
  return form;
}

async function writeHistoryRecordForJob(auth, job) {
  if (!Array.isArray(job.resultUrls) || !job.resultUrls.length) return;
  const record = {
    id: job.id,
    sessionId: job.sessionId,
    createdAt: job.createdAt,
    mode: job.mode,
    providerId: job.providerId,
    providerFamily: job.providerFamily,
    apiKeySource: job.apiKeySource,
    providerLabel: job.providerLabel,
    prompt: job.prompt,
    generationPrompt: job.generationPrompt || job.prompt,
    workflow: sanitizeWorkflow(job.workflow),
    model: job.model,
    size: job.size,
    quality: job.quality,
    outputFormat: job.outputFormat,
    moderation: job.moderation,
    aspect: job.aspectRatio,
    aspectRatio: job.aspectRatio,
    resolutionTier: job.resolutionTier,
    videoAspect: job.aspectRatio,
    videoAspectRatio: job.aspectRatio,
    duration: job.duration,
    videoDuration: job.duration,
    width: job.width,
    height: job.height,
    fps: job.fps,
    videoFps: job.fps,
    videoMotion: job.motion,
    videoStyle: job.videoStyle,
    videoQuality: job.videoQuality,
    negativePrompt: job.negativePrompt,
    referenceCount: job.inputSummary?.referenceCount || 0,
    count: job.count,
    resultUrls: job.resultUrls,
    requestIds: Array.isArray(job.requestIds) ? job.requestIds : [],
    usageSummary: job.usage ? JSON.stringify(job.usage).slice(0, 240) : '',
    timing: job.timing || null,
    case: null
  };
  await userDataLocks.run(auth.userKey, async () => {
    const records = await readRecords(auth);
    await writeRecords(auth, [record, ...records.filter((item) => item.id !== record.id)].slice(0, HISTORY_LIMIT));
  });
}

async function postJsonToGateway(url, apiKey, body, clientRequestId, signal) {
  signal?.throwIfAborted();
  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Request-ID': clientRequestId,
      'X-Request-ID': clientRequestId
    },
    body: JSON.stringify(body),
    dispatcher: gatewayFetchAgent,
    signal
  });
  return readGatewayResponse(response);
}

async function postMultipartToGateway(url, apiKey, form, clientRequestId, signal) {
  signal?.throwIfAborted();
  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Client-Request-ID': clientRequestId,
      'X-Request-ID': clientRequestId
    },
    body: form,
    dispatcher: gatewayFetchAgent,
    signal
  });
  return readGatewayResponse(response);
}

async function runGenerationRequest(auth, job, runtime, signal) {
  if (job.mode === 'video') {
    return runVideoGenerationRequest(auth, job, runtime, signal);
  }
  const resultUrls = [];
  const requestIds = [];
  const usages = [];
  const total = Math.max(1, Number(job.count || 1));
  let currentJob = job;
  const plan = runtime.plan || buildJobInvocationPlan(job, runtime);
  if (job.route === 'edits' && plan.payloadFormat === 'multipart') {
    currentJob = await updateJob(auth, job.id, {
      status: 'gateway',
      stage: 'gateway',
      completed: 0,
      total,
      lastClientRequestId: job.clientRequestId,
      endpoint: providerPublicEndpoint(plan.endpoint),
      invocationAdapter: plan.adapter,
      timing: {
        ...(currentJob.timing || {}),
        gatewayAt: Date.now()
      }
    }) || currentJob;
    const payload = await postMultipartToGateway(
      providerEndpointUrl(runtime.gatewayBaseUrl, plan.endpoint),
      runtime.apiKey,
      buildProviderMultipartForm(plan, runtime),
      job.clientRequestId,
      signal
    );
    const items = normalizeProviderImageItems(plan.adapter, payload);
    if (!items.length) {
      const error = new Error('IMAGES_EDITS_RETURNED_NO_IMAGES');
      error.payload = payload;
      throw error;
    }
    requestIds.push(gatewayRequestId(payload));
    currentJob = await updateJob(auth, job.id, {
      status: 'saving',
      stage: 'saving',
      completed: 0,
      total,
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        responseAt: Date.now(),
        savingAt: Date.now()
      }
    }) || currentJob;
    for (let index = 0; index < items.length; index += 1) {
      const stored = await persistGatewayImage(auth, job.id, items[index], resultUrls.length, job.outputFormat);
      if (stored) resultUrls.push(stored);
      currentJob = await updateJob(auth, job.id, {
        status: 'image',
        stage: 'image',
        completed: Math.min(resultUrls.length, total),
        total,
        resultUrls,
        requestIds: requestIds.filter(Boolean),
        timing: {
          ...(currentJob.timing || {}),
          savedAt: Date.now()
        }
      }) || currentJob;
    }
    if (payload?.usage) usages.push(payload.usage);
    return { resultUrls, requestIds, usage: usages[0] || null, timing: currentJob.timing || null };
  }

  for (let index = 0; index < total; index += 1) {
    const clientRequestId = `${job.clientRequestId}-${index + 1}`;
    currentJob = await updateJob(auth, job.id, {
      status: 'gateway',
      stage: 'gateway',
      completed: resultUrls.length,
      total,
      lastClientRequestId: clientRequestId,
      endpoint: providerPublicEndpoint(plan.endpoint),
      invocationAdapter: plan.adapter,
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        gatewayAt: Date.now()
      }
    }) || currentJob;
    const payload = await postJsonToGateway(
      providerEndpointUrl(runtime.gatewayBaseUrl, plan.endpoint),
      runtime.apiKey,
      plan.body,
      clientRequestId,
      signal
    );
    const items = normalizeProviderImageItems(plan.adapter, payload);
    if (!items.length) {
      const error = new Error('IMAGES_GENERATIONS_RETURNED_NO_IMAGES');
      error.payload = payload;
      throw error;
    }
    requestIds.push(gatewayRequestId(payload));
    currentJob = await updateJob(auth, job.id, {
      status: 'saving',
      stage: 'saving',
      completed: resultUrls.length,
      total,
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        responseAt: Date.now(),
        savingAt: Date.now()
      }
    }) || currentJob;
    for (const item of items) {
      const stored = await persistGatewayImage(auth, job.id, item, resultUrls.length, job.outputFormat);
      if (stored) resultUrls.push(stored);
    }
    if (payload?.usage) usages.push(payload.usage);
    currentJob = await updateJob(auth, job.id, {
      status: 'image',
      stage: 'image',
      completed: Math.min(resultUrls.length, total),
      total,
      resultUrls,
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        savedAt: Date.now()
      }
    }) || currentJob;
  }
  return { resultUrls, requestIds, usage: usages.length === 1 ? usages[0] : usages.length ? usages : null, timing: currentJob.timing || null };
}

async function runGenerationJob(auth, jobId, runtime, resumeTaskId = '') {
  const existingJobs = await readJobs(auth);
  const existingJob = existingJobs.find((job) => job.id === jobId);
  const recovering = Boolean(resumeTaskId);
  if (!existingJob || (recovering
    ? existingJob.status !== 'upstream' || existingJob.upstreamTaskId !== resumeTaskId
    : existingJob.status !== 'queued')) return;

  const startedAt = Number(existingJob.timing?.startedAt) || Date.now();
  const controller = new AbortController();
  const key = jobRuntimeKey(auth, jobId);
  activeJobControllers.set(key, controller);
  const timer = setTimeout(() => controller.abort(new Error('JOB_TIMEOUT')), JOB_TIMEOUT_MS);
  try {
    const queuedAt = Number(existingJob.timing?.queuedAt) || Date.parse(existingJob.createdAt || '') || null;
    let job = await updateJob(auth, jobId, {
      status: recovering ? 'upstream' : 'dispatching',
      stage: recovering ? 'upstream' : 'dispatching',
      startedAt: new Date(startedAt).toISOString(),
      timing: {
        queuedAt,
        startedAt,
        completedAt: null,
        totalMs: null,
        ...(recovering ? { recoveryStartedAt: Date.now() } : {})
      }
    });
    if (!job) return;
    const result = await runGenerationRequest(auth, job, runtime, controller.signal, resumeTaskId);
    const completedAt = Date.now();
    const billing = chargeJobCredits(auth, job);
    const nextJob = await updateJob(auth, jobId, {
      status: 'succeeded',
      stage: 'succeeded',
      completedAt: new Date(completedAt).toISOString(),
      completed: result.resultUrls.length,
      total: Math.max(Number(job.count || 1), result.resultUrls.length),
      resultUrls: result.resultUrls,
      usage: result.usage,
      requestIds: result.requestIds.filter(Boolean),
      billing,
      timing: {
        ...(result.timing || {}),
        queuedAt: result.timing?.queuedAt || Number(existingJob.timing?.queuedAt) || Date.parse(existingJob.createdAt || '') || null,
        startedAt,
        completedAt,
        totalMs: completedAt - startedAt
      },
      error: null
    });
    if (nextJob) await writeHistoryRecordForJob(auth, nextJob);
  } catch (error) {
    const completedAt = Date.now();
    const reason = String(controller.signal.reason?.message || '');
    const timedOut = controller.signal.aborted && reason.includes('JOB_TIMEOUT');
    const canceled = controller.signal.aborted && reason.includes('JOB_CANCELED');
    const requestId = error?.requestId || gatewayRequestId(error?.payload || {});
    const failedJob = (await readJobs(auth)).find((item) => item.id === jobId);
    const dispatchFailed = !timedOut
      && !canceled
      && !error?.status
      && !requestId
      && (
        error?.name === 'TypeError'
        || /fetch failed|network|econn|enotfound|etimedout|eai_again/i.test(String(error?.message || ''))
      );
    const failedStatus = timedOut || canceled || dispatchFailed ? 'unknown' : 'failed';
    let billing = failedJob?.billing || null;
    if (failedStatus === 'unknown' && billing) {
      billing = markJobBillingUnknown(
        auth,
        failedJob,
        timedOut ? 'job_timeout' : canceled ? 'canceled_after_dispatch' : 'dispatch_result_unknown'
      );
    } else if (failedStatus !== 'unknown') {
      billing = refundJobCredits(auth, failedJob, failedStatus);
    }
    await updateJob(auth, jobId, {
      status: failedStatus,
      stage: failedStatus,
      completedAt: new Date(completedAt).toISOString(),
      timing: {
        ...(failedJob?.timing || {}),
        startedAt,
        completedAt,
        totalMs: completedAt - startedAt
      },
      billing,
      error: {
        code: timedOut ? 'JOB_TIMEOUT' : canceled ? 'JOB_CANCELED_UPSTREAM_UNKNOWN' : dispatchFailed ? 'GATEWAY_DISPATCH_FAILED' : (error?.status ? `HTTP_${error.status}` : 'GENERATION_JOB_FAILED'),
        status: error?.status || null,
        requestId,
        message: timedOut
          ? 'The server stopped waiting for this generation job. The upstream request may still finish or bill.'
          : canceled
            ? 'The running job was canceled locally, but the upstream may still finish or bill. Billing requires reconciliation.'
            : dispatchFailed
              ? gatewayDispatchErrorMessage(error)
              : gatewayErrorMessage(error)
      }
    });
  } finally {
    clearTimeout(timer);
    activeJobControllers.delete(key);
  }
}

function enqueueGenerationJob(auth, job, runtime, resumeTaskId = '') {
  const queue = jobQueues.get(auth.userKey) || { running: 0, draining: false, items: [] };
  if (queue.items.some((item) => item.jobId === job.id) || activeJobControllers.has(jobRuntimeKey(auth, job.id))) return;
  queue.items.push({ auth, jobId: job.id, runtime, resumeTaskId });
  jobQueues.set(auth.userKey, queue);
  setTimeout(() => drainGenerationQueue(auth.userKey), 0);
}

function recoverPersistedVideoJobs(auth, jobs) {
  if (AUTH_MODE !== 'standalone') return;
  for (const job of jobs) {
    const taskId = job.mode === 'video' && job.status === 'upstream'
      ? text(job.upstreamTaskId || job.requestIds?.[0], 180)
      : '';
    if (!taskId || jobIsActiveInMemory(auth, job.id)) continue;
    try {
      const runtime = buildJobRuntime({ request: job }, auth);
      runtime.plan = buildJobInvocationPlan(job, runtime);
      enqueueGenerationJob(auth, job, runtime, taskId);
    } catch {
      // Keep the persisted job visible; the next read can retry recovery.
    }
  }
}

async function drainGenerationQueue(userKey) {
  const queue = jobQueues.get(userKey);
  if (!queue || queue.draining) return;
  queue.draining = true;
  while (queue.items.length && (!JOB_CONCURRENCY || queue.running < JOB_CONCURRENCY)) {
    const item = queue.items.shift();
    queue.running += 1;
    runGenerationJob(item.auth, item.jobId, item.runtime, item.resumeTaskId)
      .catch(() => {})
      .finally(() => {
        queue.running = Math.max(0, queue.running - 1);
        setTimeout(() => drainGenerationQueue(userKey), 0);
      });
  }
  queue.draining = false;
}

async function preserveLegacySharedAssets(auth, recordIds) {
  const ids = new Set(recordIds);
  const items = await readCommunityPrompts(auth);
  let changed = false;
  for (const item of items) {
    const match = String(item.image || '').match(/^\/studio-api\/(?:history|generation-jobs)\/([A-Za-z0-9_-]{8,160})\/assets\//);
    if (!match || !ids.has(match[1]) || match[1] === item.id) continue;
    // Legacy metadata allowed punctuation that is not a valid asset directory.
    // A separate safe asset id preserves the existing inspiration id.
    const assetId = /^[A-Za-z0-9_-]{8,160}$/.test(item.id) ? item.id : `share-${randomUUID()}`;
    item.image = await storeSharedResultUrl(auth, assetId, item.image);
    changed = true;
  }
  if (changed) await writeCommunityPrompts(auth, items);
}

async function removeRecordAssets(auth, recordId) {
  const assetsRoot = path.resolve(auth.userDir, 'assets');
  const assetDir = path.resolve(assetsRoot, requireRecordId(recordId));
  const relative = path.relative(assetsRoot, assetDir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('RECORD_ID_INVALID');
    error.status = 400;
    throw error;
  }
  await fs.rm(assetDir, { recursive: true, force: true });
}

function parseRoute(req) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  return { url, parts };
}

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    const error = new Error('INVALID_PATH');
    error.status = 400;
    throw error;
  }
}

async function serveAsset(req, res, auth, parts) {
  const recordId = cleanRecordId(parts[2]);
  const fileName = parts[4] || '';
  if (!/^[0-9]{1,3}\.(png|jpg|webp|mp4|webm)$/.test(fileName)) {
    return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }

  const filePath = path.join(auth.userDir, 'assets', recordId, fileName);
  const relative = path.relative(path.join(auth.userDir, 'assets'), filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });

  const ext = path.extname(fileName).slice(1);
  const isVideo = ext === 'mp4' || ext === 'webm';
  const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : isVideo ? `video/${ext}` : 'image/png';
  const range = isVideo ? String(req.headers.range || '') : '';
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    const suffix = match && !match[1] ? Number(match[2]) : null;
    const start = suffix !== null ? Math.max(0, stat.size - suffix) : Number(match?.[1]);
    const end = suffix !== null || !match?.[2] ? stat.size - 1 : Math.min(Number(match[2]), stat.size - 1);
    if (!match || (!match[1] && !match[2]) || (suffix !== null && (!Number.isSafeInteger(suffix) || suffix <= 0))
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': mime,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': auth.publication ? 'private, no-store' : 'private, max-age=3600'
    });
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    ...(isVideo ? { 'Accept-Ranges': 'bytes' } : {}),
    'Cache-Control': auth.publication ? 'private, no-store' : 'private, max-age=3600'
  });
  createReadStream(filePath).pipe(res);
}

function assetEtag(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function normalizeEtag(value) {
  return String(value || '').trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
}

function libraryAssetIsFresh(req, stat, etag) {
  const ifNoneMatch = String(req.headers['if-none-match'] || '').trim();
  if (ifNoneMatch) {
    return ifNoneMatch
      .split(',')
      .map(normalizeEtag)
      .some((value) => value === '*' || value === normalizeEtag(etag));
  }
  const ifModifiedSince = Date.parse(String(req.headers['if-modified-since'] || ''));
  if (!Number.isFinite(ifModifiedSince)) return false;
  return Math.floor(stat.mtimeMs / 1000) * 1000 <= ifModifiedSince;
}

async function serveLibraryAsset(req, res, auth, parts) {
  const rawAssetPath = decodeURIComponent(parts.slice(2).join('/'));
  const segments = safeLibraryAssetSegments(rawAssetPath);
  if (!segments) {
    return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }

  const filePath = resolveLibraryAssetPath(segments);
  if (!filePath) return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg'
    ? 'image/jpeg'
    : ext === 'webp'
      ? 'image/webp'
      : ext === 'svg'
        ? 'image/svg+xml'
        : 'image/png';
  const etag = assetEtag(stat);
  const headers = {
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=604800, stale-while-revalidate=604800',
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  };
  if (libraryAssetIsFresh(req, stat, etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, {
    ...headers,
    'Content-Length': stat.size
  });
  createReadStream(filePath).pipe(res);
}

async function handleStandaloneAuthRoute(req, res, parts, url) {
  if (!standaloneAuthStore) return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });

  if (req.method === 'GET' && parts.length === 3 && parts[2] === 'config') {
    const settings = standaloneAuthStore.getBillingSettings();
    return sendJson(res, 200, {
      ok: true,
      registration: {
        enabled: AUTH_REGISTRATION_MODE === 'open' && settings.registrationEnabled,
        bonusCredits: settings.creditsEnabled ? settings.registrationBonusCredits : 0,
        passwordMinLength: AUTH_PASSWORD_MIN_LENGTH
      },
      credits: {
        enabled: settings.creditsEnabled
      },
      recharge: {
        enabled: settings.creditsEnabled && settings.rechargeEnabled,
        creditCodeEnabled: settings.creditsEnabled && settings.creditCodeEnabled,
        shopUrl: settings.rechargeShopUrl
      },
      providerConnections: {
        enabled: settings.providerBindingEnabled && standaloneAuthStore.providerConnections.configured,
        providers: ['sub2api-compatible', 'newapi-compatible']
      }
    });
  }

  if (req.method === 'POST' && parts.length === 4 && parts[2] === 'password' && parts[3] === 'reset') {
    const body = await readJsonBody(req, Math.max(1024, Number(AUTH_LOGIN_MAX_BODY_BYTES) || 16 * 1024));
    const user = standaloneAuthStore.resetPassword({
      identifier: body.identifier,
      token: body.token,
      password: body.password
    });
    standaloneAuthStore.secureDatabaseFiles();
    return sendJson(res, 200, { ok: true, user });
  }

  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'register') {
    const settings = standaloneAuthStore.getBillingSettings();
    if (AUTH_REGISTRATION_MODE !== 'open' || !settings.registrationEnabled) {
      return sendJson(res, 403, { ok: false, error: 'REGISTRATION_DISABLED' });
    }

    const body = await readJsonBody(req, Math.max(1024, Number(AUTH_LOGIN_MAX_BODY_BYTES) || 16 * 1024));
    const identifier = body.email || body.username;
    const ipKey = clientIp(req);
    const accountKey = String(identifier || '').trim().toLowerCase().slice(0, 254) || '<invalid>';
    requireGlobalLoginCapacity();
    requireLoginBucket(standaloneLoginIpLimiter, ipKey);
    requireLoginBucket(standaloneLoginAccountLimiter, accountKey);
    const releaseLoginWork = beginLoginWork();
    let result;
    try {
      const user = standaloneAuthStore.register({
        email: body.email,
        username: body.username,
        password: body.password
      });
      result = await standaloneAuthStore.login({
        identifier: user.email,
        password: body.password,
        rateLimitKey: loginRateLimitKey(req, user.email)
      });
    } finally {
      releaseLoginWork();
    }
    standaloneAuthStore.secureDatabaseFiles();
    return sendJson(res, 201, { ok: true, ...result });
  }

  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'login') {
    const body = await readJsonBody(req, Math.max(1024, Number(AUTH_LOGIN_MAX_BODY_BYTES) || 16 * 1024));
    const identifier = body.identifier || body.email || body.username;
    const ipKey = clientIp(req);
    const accountKey = String(identifier || '').trim().toLowerCase().slice(0, 254) || '<invalid>';
    requireGlobalLoginCapacity();
    requireLoginBucket(standaloneLoginIpLimiter, ipKey);
    requireLoginBucket(standaloneLoginAccountLimiter, accountKey);
    const releaseLoginWork = beginLoginWork();
    let result;
    try {
      result = await standaloneAuthStore.login({
        identifier,
        password: body.password,
        rateLimitKey: loginRateLimitKey(req, identifier)
      });
    } catch (error) {
      if (['INVALID_CREDENTIALS', 'ACCOUNT_DISABLED'].includes(error?.code)) {
        standaloneLoginIpLimiter.recordFailure(ipKey);
        standaloneLoginAccountLimiter.recordFailure(accountKey);
      }
      throw error;
    } finally {
      releaseLoginWork();
    }
    standaloneLoginAccountLimiter.reset(accountKey);
    standaloneAuthStore.secureDatabaseFiles();
    return sendJson(res, 200, { ok: true, ...result });
  }

  const auth = await authenticate(req);
  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'logout') {
    const result = standaloneAuthStore.logout(bearerToken(req));
    return sendJson(res, 200, { ok: true, ...result });
  }
  if (req.method === 'GET' && parts.length === 3 && parts[2] === 'me') {
    return sendJson(res, 200, {
      ok: true,
      user: standaloneAuthStore.getUserWithBilling(auth.user.id),
      session: auth.session
    });
  }

  if (req.method === 'GET' && parts.length === 3 && parts[2] === 'credits') {
    return sendJson(res, 200, { ok: true, credits: standaloneAuthStore.getCreditSummary(auth.user.id) });
  }
  if (req.method === 'GET' && parts.length === 4 && parts[2] === 'credits' && parts[3] === 'transactions') {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 50)));
    return sendJson(res, 200, {
      ok: true,
      credits: standaloneAuthStore.getCreditSummary(auth.user.id),
      transactions: standaloneAuthStore.listCreditTransactions(auth.user.id, limit)
    });
  }
  if (req.method === 'POST' && parts.length === 4 && parts[2] === 'credits' && parts[3] === 'redeem') {
    const body = await readJsonBody(req);
    const result = standaloneAuthStore.redeemCreditCode({ userId: auth.user.id, code: body.code });
    return sendJson(res, 200, { ok: true, credits: result });
  }

  if (req.method === 'GET' && parts.length === 3 && parts[2] === 'provider-connections') {
    return sendJson(res, 200, { ok: true, connections: standaloneAuthStore.listProviderConnections(auth.user.id) });
  }
  if (req.method === 'POST' && parts.length === 3 && parts[2] === 'provider-connections') {
    const settings = standaloneAuthStore.getBillingSettings();
    if (!settings.providerBindingEnabled) return sendJson(res, 403, { ok: false, error: 'PROVIDER_BINDING_DISABLED' });
    const body = await readJsonBody(req, Math.max(1024, Number(AUTH_LOGIN_MAX_BODY_BYTES) || 16 * 1024));
    const connection = await standaloneAuthStore.bindProviderConnection({ ...body, userId: auth.user.id });
    standaloneAuthStore.secureDatabaseFiles();
    return sendJson(res, 201, { ok: true, connection });
  }
  if (req.method === 'DELETE' && parts.length === 4 && parts[2] === 'provider-connections') {
    const result = standaloneAuthStore.removeProviderConnection(auth.user.id, decodeRoutePart(parts[3]));
    standaloneAuthStore.secureDatabaseFiles();
    return sendJson(res, 200, { ok: true, ...result });
  }
  if (req.method === 'POST' && parts.length === 5 && parts[2] === 'provider-connections' && parts[4] === 'test') {
    const connection = await standaloneAuthStore.testProviderConnection(auth.user.id, decodeRoutePart(parts[3]));
    return sendJson(res, 200, { ok: true, connection });
  }

  if (parts[2] !== 'admin') {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  }
  requireAdmin(auth);

  if (req.method === 'GET' && parts.length === 5 && parts[3] === 'update' && parts[4] === 'status') {
    return sendJson(res, 200, { ok: true, update: await readManualUpdateStatus() });
  }
  if (req.method === 'POST' && parts.length === 4 && parts[3] === 'update') {
    return sendJson(res, 202, { ok: true, update: await requestManualUpdate() });
  }

  if (req.method === 'GET' && parts.length === 5 && parts[3] === 'billing' && parts[4] === 'settings') {
    return sendJson(res, 200, { ok: true, settings: standaloneAuthStore.getBillingSettings() });
  }
  if (req.method === 'POST' && parts.length === 5 && parts[3] === 'billing' && parts[4] === 'settings') {
    const body = await readJsonBody(req);
    const settings = standaloneAuthStore.updateBillingSettings(body, auth.user.id);
    return sendJson(res, 200, { ok: true, settings });
  }
  if (req.method === 'GET' && parts.length === 5 && parts[3] === 'billing' && parts[4] === 'stats') {
    return sendJson(res, 200, { ok: true, stats: standaloneAuthStore.getBillingStats() });
  }

  if (req.method === 'GET' && parts.length === 5 && parts[3] === 'billing' && parts[4] === 'codes') {
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 200)));
    return sendJson(res, 200, { ok: true, codes: standaloneAuthStore.listCreditCodes(limit) });
  }
  if (req.method === 'POST' && parts.length === 5 && parts[3] === 'billing' && parts[4] === 'codes') {
    const body = await readJsonBody(req);
    const code = standaloneAuthStore.createCreditCode({ ...body, actorUserId: auth.user.id });
    return sendJson(res, 201, { ok: true, code });
  }
  if (req.method === 'POST' && parts.length === 7 && parts[3] === 'billing' && parts[4] === 'codes' && parts[6] === 'disable') {
    const code = standaloneAuthStore.disableCreditCode(decodeRoutePart(parts[5]));
    return sendJson(res, 200, { ok: true, code });
  }

  if (parts[3] !== 'users') {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  if (req.method === 'GET' && parts.length === 4) {
    const users = standaloneAuthStore.listUsersWithBilling();
    return sendJson(res, 200, { ok: true, users });
  }
  if (req.method === 'POST' && parts.length === 4) {
    const body = await readJsonBody(req);
    const role = String(body.role || 'user').trim().toLowerCase();
    if (!['admin', 'user'].includes(role)) {
      const error = new Error('INVALID_ROLE');
      error.status = 400;
      throw error;
    }
    const user = standaloneAuthStore.createUser({
      email: body.email,
      username: body.username,
      password: body.password,
      role
    });
    standaloneAuthStore.secureDatabaseFiles();
    return sendJson(res, 201, { ok: true, user });
  }
  if (req.method === 'POST' && parts.length === 6 && parts[5] === 'disable') {
    const user = standaloneAuthStore.disableUser(decodeRoutePart(parts[4]));
    return sendJson(res, 200, { ok: true, user });
  }
  if (req.method === 'POST' && parts.length === 6 && parts[5] === 'password-reset') {
    const result = standaloneAuthStore.createPasswordResetToken({
      userId: decodeRoutePart(parts[4]),
      actorUserId: auth.user.id
    });
    return sendJson(res, 200, { ok: true, ...result });
  }
  if (req.method === 'POST' && parts.length === 6 && parts[5] === 'credits') {
    const userId = decodeRoutePart(parts[4]);
    const body = await readJsonBody(req);
    const credits = standaloneAuthStore.adjustCredits({
      userId,
      amount: body.amount,
      reason: body.reason,
      referenceId: body.referenceId
    });
    return sendJson(res, 200, {
      ok: true,
      user: standaloneAuthStore.getUserWithBilling(userId),
      credits
    });
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
}

async function handler(req, res) {
  let releaseUserData;
  const corsAllowed = sendCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(corsAllowed ? 204 : 403);
    res.end();
    return;
  }
  if (!corsAllowed) {
    return sendJson(res, 403, { ok: false, error: 'ORIGIN_NOT_ALLOWED' });
  }

  const { url, parts } = parseRoute(req);
  if (parts.join('/') === 'studio-api/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'image-agent-studio-history',
      legacyService: 'ai-image-workbench-history',
      version: SERVICE_VERSION,
      providerType: AUTH_MODE === 'standalone' ? providerProfile(PROVIDER_TYPE).type : '',
      providerConfigured: AUTH_MODE === 'standalone' ? (!USER_PROVIDER_ONLY && Boolean(PROVIDER_BASE_URL && PROVIDER_API_KEY)) : false,
      videoConfigured: AUTH_MODE === 'standalone' ? (!USER_PROVIDER_ONLY && Boolean(PROVIDER_BASE_URL && PROVIDER_API_KEY)) : false,
      providerMode: AUTH_MODE === 'standalone' && USER_PROVIDER_ONLY ? 'per-user' : 'server',
      userProviderOnly: USER_PROVIDER_ONLY,
      creditsEnabled: standaloneAuthStore ? standaloneAuthStore.getBillingSettings().creditsEnabled : false,
      jobConcurrency: JOB_CONCURRENCY,
      startedAt: new Date(SERVICE_STARTED_AT).toISOString()
    });
  }

  if (parts[0] !== 'studio-api' || !['auth', 'history', 'session', 'generation-jobs', 'model-sync', 'prompt', 'library', 'library-assets', 'community-prompts', 'prompt-presets', 'video-inspirations', 'backup'].includes(parts[1])) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  try {
    const hasAuthHeader = Boolean(String(req.headers.authorization || '').trim());

    if (parts[1] === 'auth') {
      if (req.method === 'POST' && parts.length === 3 && parts[2] === 'embedded') {
        return await handleEmbeddedAuthRoute(req, res, parts);
      }
      return await handleStandaloneAuthRoute(req, res, parts, url);
    }

    if (!hasAuthHeader && req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library' && parts.length === 2) {
      const { payload } = await readLibrary(null);
      return sendJson(res, 200, payload);
    }

    if (!hasAuthHeader && req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library' && parts.length === 3) {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const { rawCases } = await readLibrary(null);
      const item = rawCases.find((caseItem) => String(caseItem.id) === id);
      if (!item) return sendJson(res, 404, { ok: false, error: 'LIBRARY_ITEM_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, case: sanitizeLibraryDetail(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library-assets') {
      return serveLibraryAsset(req, res, null, parts);
    }

    const auth = await authenticate(req);
    // Lock the whole read/modify/write operation, including shared asset copies.
    // Generation runners take the same lock only when committing their history.
    if (['history', 'session', 'community-prompts', 'backup', 'generation-jobs', 'library'].includes(parts[1])) {
      releaseUserData = await userDataLocks.acquire(auth.userKey);
      await recoverUserRestore(auth);
    }

    if (req.method === 'GET' && parts[1] === 'community-prompts' && parts[3] === 'assets' && parts.length === 5) {
      const assetAuth = await publicPromptStore.assetAuth(auth, parts[2], parts[4]);
      if (!assetAuth) return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
      return serveAsset(req, res, assetAuth, ['studio-api', 'history', parts[2], 'assets', parts[4]]);
    }

    if (parts[1] === 'prompt') {
      return await handleStandalonePromptRoute(req, res, parts, auth.user.id);
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'model-sync' && parts.length === 2) {
      const body = await readJsonBody(req);
      let apiKey;
      let gatewayBaseUrl;
      let profile;
      if (AUTH_MODE === 'standalone') {
        ({ apiKey, gatewayBaseUrl, profile } = standaloneProviderRuntime(body, auth.user.id));
      } else {
        apiKey = text(body.apiKey, 4000);
        gatewayBaseUrl = body.gatewayBaseUrl || AI_GATEWAY_BASE_URL;
        profile = providerProfile(body.providerType || body.providerId);
      }
      if (!apiKey) return sendJson(res, 400, { ok: false, error: 'MODEL_SYNC_API_KEY_REQUIRED' });
      const models = await fetchGatewayModels(apiKey, gatewayBaseUrl, req.signal);
      return sendJson(res, 200, { ok: true, models: annotateProviderModels(models, profile.type) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'backup' && parts.length === 2) {
      const backup = await buildUserBackup(auth, 'manual');
      const stamp = backup.createdAt.replace(/[:.]/g, '-');
      return sendDownloadJson(res, `image-agent-studio-backup-${stamp}.json`, backup);
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'backup' && parts[2] === 'restore' && parts.length === 3) {
      const body = await readJsonBody(req);
      const jobs = await readJobs(auth);
      const queue = jobQueues.get(auth.userKey);
      if (queue?.running || queue?.items?.length || jobs.some((job) => JOB_ACTIVE_STATUSES.has(job.status))) {
        return sendJson(res, 409, { ok: false, error: 'BACKUP_RESTORE_JOBS_ACTIVE' });
      }
      const result = await restoreUserBackup(auth, body);
      return sendJson(res, 200, result);
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'session' && parts.length === 2) {
      const sessionId = text(url.searchParams.get('sessionId'), 120);
      let session = await readSession(auth, sessionId);
      if (sessionId && !session) {
        const legacySession = await readSession(auth);
        session = legacySession?.sessionId === sessionId ? legacySession : null;
      }
      return sendJson(res, 200, { ok: true, session });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'session' && parts.length === 2) {
      const body = await readJsonBody(req);
      const requestedSessionId = text(url.searchParams.get('sessionId'), 120);
      const session = await sanitizeSession(auth, { ...body, sessionId: body?.sessionId || requestedSessionId });
      const sessionId = text(session.sessionId || requestedSessionId, 120);
      await writeSession(auth, session, sessionId);
      return sendJson(res, 200, { ok: true, session });
    }

    if (req.method === 'DELETE' && parts[0] === 'studio-api' && parts[1] === 'session' && parts.length === 2) {
      const sessionId = text(url.searchParams.get('sessionId'), 120);
      await fs.rm(sessionPathForId(auth, sessionId), { force: true });
      await fs.rm(path.join(auth.userDir, 'assets', sessionAssetId(sessionId)), { recursive: true, force: true });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 2) {
      const sessionId = text(url.searchParams.get('sessionId'), 120);
      const requestedLimit = Math.max(1, Number(url.searchParams.get('limit') || 40));
      const limit = JOB_LIMIT > 0 ? Math.min(JOB_LIMIT, requestedLimit) : requestedLimit;
      const jobs = await readJobs(auth);
      recoverPersistedVideoJobs(auth, jobs);
      const filtered = sessionId ? jobs.filter((job) => job.sessionId === sessionId) : jobs;
      return sendJson(res, 200, { ok: true, jobs: filtered.slice(0, limit) });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 2) {
      const body = await readJsonBody(req);
      const job = buildJobRecord(body);
      const result = await withUserJobLock(auth, async () => {
        const jobs = await readJobsUnlocked(auth);
        const existingById = jobs.find((item) => item.id === job.id);
        if (existingById) return { job: existingById, duplicate: true };

        const runtime = buildJobRuntime(body, auth);
        if (job.route === 'edits' && !runtime.images.length) {
          const error = new Error('REFERENCE_IMAGE_REQUIRED');
          error.status = 400;
          throw error;
        }
        runtime.plan = buildJobInvocationPlan(job, runtime);
        job.fingerprint = serverJobFingerprint(job, runtime, body.request || body);
        job.endpoint = providerPublicEndpoint(runtime.plan.endpoint);
        job.invocationAdapter = runtime.plan.adapter;
        if (job.fingerprint) {
          const existing = jobs.find((item) => (
            item.fingerprint === job.fingerprint
            && item.sessionId === job.sessionId
            && JOB_ACTIVE_STATUSES.has(item.status)
          ));
          if (existing) return { job: existing, duplicate: true };
        }
        job.billing = reserveJobCredits(auth, job);
        try {
          await writeJobsUnlocked(auth, [job, ...jobs.filter((item) => item.id !== job.id)]);
        } catch (error) {
          if (job.billing) refundJobCredits(auth, job, 'enqueue_failed');
          throw error;
        }
        return { job, runtime, duplicate: false };
      });
      if (result.duplicate) return sendJson(res, 202, { ok: true, job: result.job, duplicate: true });
      try {
        enqueueGenerationJob(auth, result.job, result.runtime);
      } catch (error) {
        if (result.job.billing) {
          const billing = refundJobCredits(auth, result.job, 'enqueue_failed');
          await updateJob(auth, result.job.id, { billing });
        }
        throw error;
      }
      return sendJson(res, 202, { ok: true, job: result.job });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 3) {
      const jobId = cleanJobId(parts[2]);
      const jobs = await readJobs(auth);
      const job = jobs.find((item) => item.id === jobId);
      if (!job) return sendJson(res, 404, { ok: false, error: 'GENERATION_JOB_NOT_FOUND' });
      recoverPersistedVideoJobs(auth, [job]);
      return sendJson(res, 200, { ok: true, job });
    }

    if (req.method === 'DELETE' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 3) {
      const jobId = cleanJobId(parts[2]);
      const jobs = await readJobs(auth);
      const currentJob = jobs.find((item) => item.id === jobId);
      if (!currentJob) return sendJson(res, 404, { ok: false, error: 'GENERATION_JOB_NOT_FOUND' });
      if (!JOB_ACTIVE_STATUSES.has(currentJob.status)) {
        return sendJson(res, 200, { ok: true, job: currentJob });
      }
      const key = jobRuntimeKey(auth, jobId);
      const controller = activeJobControllers.get(key);
      const queue = jobQueues.get(auth.userKey);
      const queued = Boolean(queue?.items?.some((item) => item.jobId === jobId));
      if (queue?.items?.length) {
        queue.items = queue.items.filter((item) => item.jobId !== jobId);
      }
      if (controller) controller.abort(new Error('JOB_CANCELED'));
      const upstreamMayHaveAccepted = Boolean(controller) || !queued;
      const status = upstreamMayHaveAccepted ? 'unknown' : 'canceled';
      const billing = upstreamMayHaveAccepted
        ? markJobBillingUnknown(auth, currentJob, 'canceled_after_dispatch')
        : refundJobCredits(auth, currentJob, 'canceled_before_dispatch');
      const job = await updateJob(auth, jobId, {
        status,
        stage: status,
        completedAt: new Date().toISOString(),
        billing,
        error: {
          code: upstreamMayHaveAccepted ? 'JOB_CANCELED_UPSTREAM_UNKNOWN' : 'JOB_CANCELED',
          message: upstreamMayHaveAccepted
            ? 'The job was canceled locally after dispatch. The upstream result and billing require reconciliation.'
            : 'The queued job was canceled before dispatch.'
        }
      });
      return sendJson(res, 200, { ok: true, job });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library' && parts.length === 2) {
      const { payload } = await readLibrary(auth);
      return sendJson(res, 200, payload);
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library' && parts.length === 3) {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const { rawCases } = await readLibrary(auth);
      const item = rawCases.find((caseItem) => String(caseItem.id) === id);
      if (!item) return sendJson(res, 404, { ok: false, error: 'LIBRARY_ITEM_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, case: sanitizeLibraryDetail(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'community-prompts' && parts.length === 2) {
      const items = await readVisibleCommunityPrompts(auth);
      return sendJson(res, 200, { ok: true, items });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'community-prompts' && parts.length === 2) {
      const body = await readJsonBody(req);
      if (body.visibility === 'public' && body.publicationConfirmed !== true) {
        return sendJson(res, 400, { ok: false, error: 'PUBLICATION_CONFIRMATION_REQUIRED' });
      }
      const prompt = promptText(body.prompt);
      if (!prompt) return sendJson(res, 400, { ok: false, error: 'PROMPT_REQUIRED' });
      const now = new Date().toISOString();
      const id = `share-${randomUUID()}`;
      const image = await storeSharedResultUrl(auth, id, body.image);
      const item = sanitizeCommunityPrompt({
        id,
        title: body.title,
        prompt,
        generationPrompt: body.generationPrompt || body.generation?.generationPrompt || prompt,
        promptPreview: body.promptPreview || prompt,
        category: body.category || 'Community Prompts',
        note: body.note,
        image,
        imageAlt: body.imageAlt,
        generation: body.generation,
        tags: body.tags,
        visibility: body.visibility === 'public' ? 'public' : 'private',
        createdAt: now,
        updatedAt: now,
        sourceName: 'User shared'
      });
      if (body.visibility === 'public') {
        try {
          const published = await publicPromptStore.publish(auth, item);
          return sendJson(res, 200, { ok: true, item: published });
        } finally {
          // Publication owns an independent global copy, not this staging asset.
          await fs.rm(path.join(auth.userDir, 'assets', id), { recursive: true, force: true }).catch(() => {});
        }
      }
      const items = await readCommunityPrompts(auth);
      const nextItems = await writeCommunityPrompts(auth, [item, ...items.filter((entry) => entry.id !== item.id)]);
      return sendJson(res, 200, { ok: true, item: nextItems[0] });
    }

    if (req.method === 'DELETE' && parts[1] === 'community-prompts' && parts.length === 3) {
      await publicPromptStore.withdraw(auth, cleanLibraryId(decodeURIComponent(parts[2])));
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'community-prompts' && parts.length === 4 && parts[3] === 'reaction') {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const body = await readJsonBody(req);
      const action = text(body.action, 20);
      if (/^share-[a-f0-9-]{36}$/.test(parts[2])) {
        const published = await publicPromptStore.react(auth, id, action);
        if (published) return sendJson(res, 200, { ok: true, item: published });
      }
      const items = await readCommunityPrompts(auth);
      const index = items.findIndex((item) => String(item.id) === id);
      if (index < 0) return sendJson(res, 404, { ok: false, error: 'COMMUNITY_PROMPT_NOT_FOUND' });
      const item = { ...items[index] };
      const reactions = { ...(item.reactions || {}) };
      if (action === 'up' || action === 'down') {
        const previous = item.userReaction;
        if (previous && reactions[previous] > 0) reactions[previous] -= 1;
        item.userReaction = previous === action ? '' : action;
        if (item.userReaction) reactions[item.userReaction] = Math.max(0, Number(reactions[item.userReaction] || 0)) + 1;
      } else if (action === 'copy') {
        item.copied = Math.max(0, Number(item.copied || 0)) + 1;
      } else if (action === 'share') {
        item.shared = Math.max(0, Number(item.shared || 0)) + 1;
      } else {
        return sendJson(res, 400, { ok: false, error: 'ACTION_NOT_SUPPORTED' });
      }
      item.reactions = reactions;
      item.updatedAt = new Date().toISOString();
      items[index] = item;
      await writeCommunityPrompts(auth, items);
      return sendJson(res, 200, { ok: true, item: sanitizeCommunityPrompt(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'prompt-presets' && parts.length === 3) {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const item = PROMPT_PRESETS.find((preset) => preset.id === id);
      if (!item) return sendJson(res, 404, { ok: false, error: 'PROMPT_PRESET_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, preset: sanitizePromptPresetDetail(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'video-inspirations' && parts.length === 3) {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const item = VIDEO_INSPIRATIONS.find((inspiration) => inspiration.id === id);
      if (!item) return sendJson(res, 404, { ok: false, error: 'VIDEO_INSPIRATION_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, inspiration: sanitizeVideoInspirationDetail(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library-assets') {
      return serveLibraryAsset(req, res, auth, parts);
    }

    if (req.method === 'GET' && parts.length === 2) {
      const records = await readRecords(auth);
      const limit = Math.max(1, Math.min(HISTORY_LIMIT, Number(url.searchParams.get('limit') || 30)));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      const page = records.slice(offset, offset + limit);
      const nextOffset = offset + page.length < records.length ? offset + page.length : null;
      return sendJson(res, 200, { ok: true, records: page, total: records.length, nextOffset });
    }

    if (req.method === 'POST' && parts.length === 2) {
      const body = await readJsonBody(req);
      const record = await sanitizeRecord(auth, body);
      const records = await readRecords(auth);
      const nextRecords = [record, ...records.filter((item) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
      await writeRecords(auth, nextRecords);
      return sendJson(res, 200, { ok: true, record });
    }

    if (req.method === 'DELETE' && parts.length === 2) {
      const records = await readRecords(auth);
      await preserveLegacySharedAssets(auth, records.map((record) => record.id));
      await Promise.all(records.map((record) => removeRecordAssets(auth, record.id)));
      await writeRecords(auth, []);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'DELETE' && parts.length === 3) {
      const recordId = cleanRecordId(parts[2]);
      const records = await readRecords(auth);
      await preserveLegacySharedAssets(auth, [recordId]);
      await removeRecordAssets(auth, recordId);
      await writeRecords(auth, records.filter((item) => item.id !== recordId));
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && parts.length === 5 && parts[3] === 'assets') {
      return serveAsset(req, res, auth, parts);
    }

    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    const status = error.status || 500;
    if (error.retryAfterMs) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
    }
    const message = status >= 500 && status !== 502 && status !== 503
      ? 'STUDIO_HISTORY_FAILED'
      : redactProviderSecret(error.code || error.message);
    if (status >= 500) {
      console.warn('Studio history service failed', {
        message: redactProviderSecret(String(error?.code || error?.message || 'unknown').slice(0, 240))
      });
    }
    return sendJson(res, status, {
      ok: false,
      error: message,
      ...(status < 500 && error.details && typeof error.details === 'object'
        ? { details: redactProviderValue(error.details) }
        : {})
    });
  } finally {
    releaseUserData?.();
  }
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    console.warn('Unhandled studio history error', {
      message: redactProviderSecret(String(error?.message || 'unknown').slice(0, 240))
    });
    sendJson(res, 500, { ok: false, error: 'STUDIO_HISTORY_FAILED' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`image-agent-studio history service listening on http://${HOST}:${PORT}/studio-api`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Auth mode: ${AUTH_MODE}`);
  if (AUTH_MODE === 'standalone') {
    console.log(`Registration mode: ${AUTH_REGISTRATION_MODE}`);
    const effectiveProviderMode = AUTH_MODE === 'standalone' && USER_PROVIDER_ONLY ? 'per-user' : 'server';
    console.log(`Provider mode: ${effectiveProviderMode}`);
    console.log(`Server-managed provider configured: ${effectiveProviderMode === 'server' && Boolean(PROVIDER_BASE_URL && PROVIDER_API_KEY)}`);
    console.log(`Provider type: ${providerProfile(PROVIDER_TYPE).type}`);
  } else {
    console.log(`AI gateway base URL: ${AI_GATEWAY_BASE_URL}`);
  }
});
