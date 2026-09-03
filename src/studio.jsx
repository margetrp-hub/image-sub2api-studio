import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Copy,
  Download,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BotMessageSquare,
  Brush,
  Eraser,
  History,
  ImageIcon,
  Images,
  KeyRound,
  LoaderCircle,
  LogOut,
  Languages,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  Redo2,
  FlipHorizontal,
  ScanLine,
  SquarePen,
  WandSparkles,
  Trash2,
  Upload,
  Video,
  X
} from 'lucide-react';
import './studio.css';
import './styles/studio.polish-reference-chat.css';
import './styles/studio.polish-concept-composer.css';
import './styles/studio.polish-modern-console.css';
import './styles/studio.polish-prompt-first.css';
import './styles/studio.polish-conversation-rail.css';
import './styles/studio.canvas-workspace.css';
import './styles/studio.composer-compact-shell.css';
import './styles/studio.composer-session-pane.css';
import './styles/studio.composer-prompt-workspace.css';
import './styles/studio.composer-creator-dock.css';
import './styles/studio.composer-parameter-dock.css';
import './styles/studio.composer-final-concept.css';
import './styles/studio.reference-overrides.css';
import './styles/studio.left-rail.css';
import './styles/studio.composer-final-guards.css';
import './styles/studio.composer-shell.css';
import './styles/studio.queue-progress.css';
import './styles/studio.composer-layout.css';
import './styles/studio.reference-panel.css';
import './styles/studio.context-side-panel.css';
import './styles/studio.composer-conversation.css';
import './styles/studio.interactions.css';
import './styles/studio.final-state.css';
import './styles/studio.composer-final-base.css';
import './styles/studio.composer-final-beta.css';
import './styles/studio.composer-final-tooling.css';
import './styles/studio.composer-final-modal.css';
import './styles/studio.composer-final-locks.css';
import './styles/studio.composer-final-live.css';
import './styles/studio.composer-live-guards.css';
import './styles/studio.imageforge-polish.css';
import './styles/studio.composer-codex.css';
import './styles/studio.composer-codex-guards.css';
import './styles/studio.workstation-shell.css';
import './styles/studio.playground-polish.css';
import './styles/studio.flow-modes.css';
import './styles/studio.composer-state-polish.css';
import './styles/studio.canvas-composer-refinement.css';
import './styles/studio.apple-refinement.css';
import './styles/studio.typography.css';
import {
  bootstrapEmbeddedSession,
  clearSession,
  getImageUrls,
  getVideoUrls,
  getConfiguredBaseUrls,
  getLoginUrl,
  isEmbeddedStudioLaunch,
  loadProviderSettings,
  loadSession,
  saveProviderSettings,
  saveSelectedKeyId,
  STUDIO_STANDALONE
} from './aiGatewayClient';
import { createTranslator, loadStudioLanguage, nextLanguage, saveStudioLanguage, SUPPORTED_LANGUAGES } from './studio/i18n.js';
import { createHistoryCanvasBuilder } from './studio/canvas/historyCanvas.js';
import { createCurrentSessionSerializers } from './studio/state/sessionPersistence.js';
import { deriveSessionStateFromSnapshot, notifySessionSnapshotChange } from './studio/state/sessionApply.js';
import {
  clampCountForProvider,
  getImageProvider,
  providerAspectOptions,
  providerCountRange,
  providerCustomSizeOptions,
  providerParameterList
} from './studio/providers/index.js';
import { resolveProviderAdapter } from './studio/providers/adapters.js';
import {
  clearHistoryItems,
  deleteHistoryItem,
  historyScopeFromIdentity,
  loadHistoryItems,
  mergeHistoryRecords,
  saveHistoryItems
} from './studio/storage/index.js';
import { createHistoryPersistence } from './studio/storage/historyPersistence.js';
import { createCurrentSessionStorage } from './studio/storage/currentSessionStorage.js';
import {
  assetPath,
  displayResultUrl,
  enqueueProtectedImageTask,
  publicJsonPath
} from './studio/util/assets.js';
import {
  ComposerLiveStatus,
  GenerationTimingPanel,
  ProgressBar,
  progressText
} from './studio/components/generationStatus.jsx';
import { BottomComposerPanel } from './studio/components/bottomComposerPanel.jsx';
import { ComposerParamShelf } from './studio/components/composerParamShelf.jsx';
import { ComposerPromptRow } from './studio/components/composerPromptRow.jsx';
import { ComposerThread } from './studio/components/composerThread.jsx';
import { GenerationQueueDock } from './studio/components/generationQueue.jsx';
import { LeftRail } from './studio/components/leftRail.jsx';
import {
  apiKeyDisplay,
  apiKeyMeta,
  maskApiKey,
  providerLabel,
  usesGatewayAccount
} from './studio/util/providerSettings.js';
import {
  assistantConfigForLibrary,
  createProviderProfileId,
  deleteProviderProfile,
  loadProviderLibrary,
  modelOptionsForProfile,
  providerSettingsFromProfile,
  saveProviderLibrary,
  upsertProviderProfile
} from './studio/util/providerLibrary.js';
import { saveFirstRunState, shouldOpenFirstRun } from './studio/util/firstRun.js';
import {
  caseCardMeta,
  hasLibraryPreviewImage,
  templatePreviewImage,
  templateReferenceFullImage,
  templateReferenceThumb,
  templateThumbnail,
  riskLabel
} from './studio/util/templates.js';
import { useCanvasNodes } from './studio/hooks/useCanvasNodes.js';
import { useCanvasView } from './studio/hooks/useCanvasView.js';
import { useCanvasInteraction } from './studio/hooks/useCanvasInteraction.js';
import { useGenerationQueue } from './studio/hooks/useGenerationQueue.js';

const RegenerateDialog = React.lazy(() => import('./studio/components/regenerateDialog.jsx').then((module) => ({
  default: module.RegenerateDialog
})));
const GenerationConfirmDialog = React.lazy(() => import('./studio/components/generationConfirmDialog.jsx').then((module) => ({
  default: module.GenerationConfirmDialog
})));
const MaskEditor = React.lazy(() => import('./studio/components/maskEditor.jsx').then((module) => ({
  default: module.MaskEditor
})));
const GalleryWorkspacePanel = React.lazy(() => import('./studio/components/galleryWorkspace.jsx').then((module) => ({
  default: module.GalleryWorkspacePanel
})));
const SettingsPanel = React.lazy(() => import('./studio/components/settingsPanel.jsx').then((module) => ({
  default: module.SettingsPanel
})));
const FirstRunGuide = React.lazy(() => import('./studio/components/firstRunGuide.jsx').then((module) => ({
  default: module.FirstRunGuide
})));
const InspirationUploadDialog = React.lazy(() => import('./studio/components/inspirationUploadDialog.jsx').then((module) => ({
  default: module.InspirationUploadDialog
})));
import { buildGenerationTask as buildGenerationTaskPure, generationFilesForJob as generationFilesForJobPure, waitForServerJob as waitForServerJobPure } from './studio/generation/taskBuilder.js';
import { buildCanvasContinuationPlan, composeCanvasContinuationPrompt } from './studio/generation/promptComposition.js';
import {
  resolveProviderRequest,
  syncGatewayModels
} from './studio/generation/modelSync.js';
import {
  buildQueuedImageTaskFingerprint,
  buildServerImageGenerationJobPayload,
  buildServerVideoGenerationJobPayload,
  endpointForGenerationTask,
  imageGenerationRouteForMode
} from './studio/generation/executor.js';
import { canvasEdgeGeometry, canvasEdgeLineageClass, canvasLinkPreviewGeometry, canvasViewForNodes, nodeHeight, nodeWidth } from './studio/util/canvasGeometry.js';
import {
  CANVAS_DRAG_CLICK_TOLERANCE,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_HORIZONTAL_GAP,
  CANVAS_NODE_MAX_HEIGHT,
  CANVAS_NODE_MAX_WIDTH,
  CANVAS_NODE_MIN_HEIGHT,
  CANVAS_NODE_MIN_WIDTH,
  CANVAS_NODE_VERTICAL_GAP,
  CANVAS_NODE_WIDTH,
  CANVAS_PERFORMANCE_EDGE_THRESHOLD,
  CANVAS_PERFORMANCE_NODE_THRESHOLD,
  CANVAS_PLANE_HEIGHT,
  CANVAS_PLANE_WIDTH,
  CANVAS_PROTECTED_ASSET_RESOLVE_LIMIT,
  CANVAS_VIRTUALIZATION_MARGIN
} from './studio/util/canvasConstants.js';
import { Topbar } from './studio/components/topbar.jsx';
import { AccountBillingDialog } from './studio/components/accountBillingDialog.jsx';
import { CanvasNodeCard } from './studio/components/canvasNodeCard.jsx';
import {
  CreativeRecipeBar,
  PromptSectionList
} from './studio/components/promptTools.jsx';
import {
  LazyImage,
  ProtectedHistoryThumb,
  ProtectedStudioImage
} from './studio/components/media.jsx';
import {
  Lightbox,
  ResultGrid,
  VideoLightbox,
  VideoResultGrid,
  WorkPreviewResultActions
} from './studio/components/resultDisplay.jsx';
import {
  buildStudioDownloadFilename,
  downloadMetaFromHistoryItem,
  formatHistoryTime,
  OUTPUT_FORMAT_LABELS,
  QUALITY_LABELS,
  RESOLUTION_TIER_LABELS,
  resultExtension,
  resultVideoExtension
} from './studio/util/resultFiles.js';
import { prepareCommunityInspirationDraft } from './studio/util/share.js';
import {
  currentSessionProject,
  groupHistorySessions,
  historyResultItems,
  safeImageCandidate
} from './studio/util/historyView.js';
import {
  buildHistoryInspirationCases,
  mergeHistoryInspirationCases
} from './studio/util/historyInspiration.js';
import {
  CURRENT_PROJECT_QUEUE_STATUSES,
  GENERATION_CONCURRENCY,
  GENERATION_QUEUE_LIMIT,
  GENERATION_STALL_NOTICE_MS,
  GENERATION_TIMEOUT_MS,
  activeGenerationQueueCount,
  appendGenerationQueueTask,
  createGenerationTaskId,
  findDuplicateActiveGenerationTask,
  firstQueuedGenerationTask,
  generationErrorMessage,
  hasRestorableLocalQueueTask,
  isActiveServerJobStatus,
  isFinalServerJobStatus,
  isRestorableQueueItem,
  isVisibleServerJob,
  markRemoteGenerationJobTask,
  normalizeQueueStatus,
  removeGenerationQueueItem,
  replaceGenerationQueueItem,
  restorableRemoteJobIds,
  retryGenerationQueueTask,
  queueStatusFromServerJob,
  serverJobMessage,
  serverJobProgress,
  serverJobTimingPatch,
  upsertRemoteGenerationJobTask
} from './studio/util/generationJobs.js';
import {
  clamp,
  compact,
  formatFileSize,
  formatMoney,
  orderTemplates,
  storedResultUrls,
  templateKey,
  textSignature,
  wantsPromptRewrite
} from './studio/util/formatters.js';
import {
  modelBillingLabel,
  modelBillingUnitLabel,
  payloadUsageSummary,
  pointValue
} from './studio/util/billing.js';
import {
  parseAssistantReply,
  parseOptimizedPrompt
} from './studio/util/assistantReply.js';
import {
  CREATIVE_RECIPES,
  CREATIVE_RECIPE_PREFIX,
  stripCreativeRecipePrompt
} from './studio/util/recipes.js';
import { clearDraft, loadDraft, saveDraft } from './studio/storage/draftStorage.js';
import { loadTheme, saveTheme } from './studio/storage/themeStorage.js';
import { loadTemplateFavorites, saveTemplateFavorites } from './studio/storage/templateFavoritesStorage.js';
import { loadWorkbenchLayout, saveWorkbenchLayout } from './studio/storage/workbenchLayoutStorage.js';
import {
  ASPECT_OPTIONS,
  CUSTOM_SIZE_OPTIONS,
  MODERATION,
  OUTPUT_FORMATS,
  QUALITY,
  RESOLUTION_TIERS,
  SIZES,
  normalizeAspect,
  normalizeCount,
  normalizeModeration,
  normalizeOutputFormat,
  normalizeQuality,
  normalizeResolutionTier,
  normalizeSize,
  sizeFromAspect,
  withResolutionHint,
  withReferenceRoleHint
} from './studio/util/imageOptions.js';
import {
  VIDEO_ASPECT_OPTIONS,
  VIDEO_DURATIONS,
  VIDEO_FPS_OPTIONS,
  VIDEO_MOTIONS,
  VIDEO_QUALITY,
  VIDEO_STYLES,
  normalizeVideoAspect,
  normalizeVideoDuration,
  normalizeVideoFps,
  normalizeVideoMotion,
  normalizeVideoQuality,
  normalizeVideoStyle,
  videoSizeFromAspect
} from './studio/util/videoOptions.js';
import {
  IMAGE_REFERENCE_LIMIT,
  SUPPORTED_IMAGE_TYPES,
  createReferenceItem,
  filePreviewUrl,
  supportedReferenceFiles
} from './studio/util/reference.js';
import {
  MASK_FILL_COLOR,
  MASK_HISTORY_LIMIT,
  createMaskSnapshot,
  createMaskState,
  dataUrlToFile,
  drawMaskSnapshot,
  fileToDataUrl,
  loadImageDimensions,
  maskSnapshotToImageData,
  restoreMaskSnapshot
} from './studio/util/mask.js';
import {
  COMMUNITY_LICENSE_NOTICE,
  EMPTY_SITE_DATA,
  fetchPublicJson,
  loadStaticLibraryData as _loadStaticLibraryData,
  mergeSiteData,
  normalizeLibraryPayload
} from './studio/util/library.js';
import {
  hasMeaningfulSessionContent,
  hasRestorableServerGeneration as _hasRestorableServerGeneration
} from './studio/util/sessionPredicates.js';
import { createGatewayClient, createHistoryClient } from './studio/runtime/clients.js';

const IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1', 'gpt-image-1-mini'];
const VIDEO_MODELS = [];
const IMAGE_GENERATION_ROUTE_LABEL = '自动选择';
const WORKSPACES = [
  { value: 'image', label: '图片创作' },
  { value: 'inspiration', label: '灵感库' },
  { value: 'video', label: '视频创作' },
  { value: 'history', label: '历史图库' }
];
const DESK_MODES = [
  { value: 'image', label: '文生图', icon: ImageIcon },
  { value: 'edit', label: '参考图', icon: Images },
  { value: 'mask', label: 'Mask', icon: ScanLine }
];
const INITIAL_TEMPLATE_LIMIT = 12;
const TEMPLATE_PAGE_SIZE = 12;
const HISTORY_PAGE_SIZE = 20;
const CATEGORY_LABELS = {
  'My Highlights': '我的高赞',
  'Architecture & Spaces': '建筑空间',
  'Brand & Logos': '品牌标识',
  'Characters & People': '人物角色',
  'Charts & Infographics': '图表信息图',
  'Community Prompts': '社区灵感',
  'Documents & Publishing': '文档出版',
  'Fashion & Beauty': '时尚美妆',
  'Games & Entertainment': '游戏娱乐',
  'History & Classical Themes': '历史古风',
  'Illustration & Art': '插画艺术',
  'Other Use Cases': '其他场景',
  'Photography & Realism': '摄影写实',
  'Posters & Typography': '海报字体',
  'Products & E-commerce': '产品电商',
  'Scenes & Storytelling': '场景叙事',
  'UI & Interfaces': '界面交互'
};
const FALLBACK_PROMPT_PRESETS = [];
const FALLBACK_VIDEO_INSPIRATIONS = [];
const BASE_PATH = import.meta.env.BASE_URL || '/';
const STUDIO_BACK_URL = import.meta.env.VITE_STUDIO_BACK_URL || '/';
const STUDIO_ADMIN_URL = new URL('admin.html', new URL(BASE_PATH, window.location.origin)).pathname;
const LIBRARY_AUTH_REQUIRED = String(import.meta.env.VITE_STUDIO_LIBRARY_AUTH_REQUIRED || '').toLowerCase() === 'true';
const HISTORY_KEY = 'image-sub2api-studio:history:v1';
const LEGACY_HISTORY_KEY = 'ohlaoo-studio:history:v1';
const HISTORY_SCOPE_PREFIX = 'image-sub2api-studio:history:v2';
const LEGACY_HISTORY_SCOPE_PREFIX = 'ohlaoo-studio:history:v2';
const CURRENT_SESSION_KEY = 'image-sub2api-studio:current-session:v1';
const LOCAL_HISTORY_LIMIT = 30;
const REFERENCE_ROLES = [
  { value: 'identity', label: '主体' },
  { value: 'style', label: '风格' },
  { value: 'composition', label: '构图' },
  { value: 'product', label: '产品' }
];
const CATEGORY_COVERS = {
  'My Highlights': 'latest',
  'Architecture & Spaces': 'architecture',
  'Brand & Logos': 'brand',
  'Characters & People': 'character',
  'Charts & Infographics': 'infographic',
  'Community Prompts': 'latest',
  'Documents & Publishing': 'document',
  'Fashion & Beauty': 'photo',
  'Games & Entertainment': 'gallery',
  'History & Classical Themes': 'history',
  'Illustration & Art': 'illustration',
  'Other Use Cases': 'other',
  'Photography & Realism': 'photo',
  'Posters & Typography': 'poster',
  'Products & E-commerce': 'product',
  'Scenes & Storytelling': 'scene',
  'UI & Interfaces': 'ui'
};
const PROMPT_PRESETS = FALLBACK_PROMPT_PRESETS;

function hasRestorableServerGeneration(session) {
  return _hasRestorableServerGeneration(session, isRestorableQueueItem);
}

const {
  normalizeCachedCurrentSession,
  prepareCurrentSessionForServer,
  serializeAssistantMessage,
  serializePromptSuggestion,
  serializeGenerationQueueItem
} = createCurrentSessionSerializers({
  generationQueueLimit: GENERATION_QUEUE_LIMIT,
  imageModels: IMAGE_MODELS,
  videoModels: VIDEO_MODELS,
  normalizeQueueStatus,
  normalizeSize,
  normalizeQuality,
  normalizeResolutionTier,
  normalizeOutputFormat,
  normalizeModeration,
  normalizeCount,
  normalizeVideoAspect,
  normalizeVideoDuration,
  normalizeVideoFps,
  normalizeVideoMotion,
  normalizeVideoStyle,
  normalizeVideoQuality
});

const {
  loadCurrentSession,
  loadActiveCurrentSession,
  saveCurrentSession,
  clearCurrentSessionCache,
  sessionSnapshotComparePayload
} = createCurrentSessionStorage({
  storageKey: CURRENT_SESSION_KEY,
  normalizeCachedCurrentSession,
  prepareCurrentSessionForServer
});

function loadStaticLibraryData() {
  return _loadStaticLibraryData({
    promptPresets: PROMPT_PRESETS,
    videoInspirations: FALLBACK_VIDEO_INSPIRATIONS
  });
}

const {
  historyStorageKey,
  loadHistory,
  saveHistory,
  loadPersistedHistory,
  deletePersistedHistory,
  clearPersistedHistory
} = createHistoryPersistence({
  historyKey: HISTORY_KEY,
  legacyHistoryKey: LEGACY_HISTORY_KEY,
  historyScopePrefix: HISTORY_SCOPE_PREFIX,
  legacyHistoryScopePrefix: LEGACY_HISTORY_SCOPE_PREFIX,
  localHistoryLimit: LOCAL_HISTORY_LIMIT,
  loadHistoryItems,
  saveHistoryItems,
  deleteHistoryItem,
  clearHistoryItems
});

const { buildCanvasNodeFromHistoryItem } = createHistoryCanvasBuilder({
  canvasNodeWidth: CANVAS_NODE_WIDTH,
  canvasNodeHeight: CANVAS_NODE_HEIGHT,
  canvasNodeHorizontalGap: CANVAS_NODE_HORIZONTAL_GAP,
  downloadMetaFromHistoryItem
});

function imageMimeExtension(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
  if (value.includes('webp')) return 'webp';
  return 'png';
}

async function imageUrlToFile(url, filename = 'canvas-reference.png') {
  const source = String(url || '');
  if (!source) throw new Error('CANVAS_IMAGE_EMPTY');
  if (source.startsWith('data:')) return dataUrlToFile(source, filename);
  const response = await fetch(assetPath(source));
  if (!response.ok) throw new Error(`CANVAS_IMAGE_HTTP_${response.status}`);
  const blob = await response.blob();
  const type = blob.type || 'image/png';
  if (!SUPPORTED_IMAGE_TYPES.has(type)) throw new Error('CANVAS_IMAGE_UNSUPPORTED');
  const cleanName = filename.replace(/\.[a-z0-9]+$/i, '');
  return new File([blob], `${cleanName}.${imageMimeExtension(type)}`, { type });
}

function referenceRoleLabel(value) {
  return REFERENCE_ROLES.find((item) => item.value === value)?.label || REFERENCE_ROLES[0].label;
}

function collectStateBlobUrls({ results = [], videoResults = [], canvasNodes = [], previewImage = null, previewVideo = null } = {}) {
  const urls = new Set();
  const collect = (value) => {
    const url = String(value || '');
    if (url.startsWith('blob:')) urls.add(url);
  };
  results.forEach(collect);
  videoResults.forEach(collect);
  canvasNodes.forEach((node) => {
    collect(node?.url);
    collect(node?.fallbackUrl);
  });
  collect(previewImage?.url);
  collect(typeof previewVideo === 'string' ? previewVideo : previewVideo?.url);
  return urls;
}

function revokeBlobUrls(urls) {
  for (const url of urls || []) {
    if (String(url || '').startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

function categoryLabel(value) {
  if (value === 'All') return '全部分类';
  return CATEGORY_LABELS[value] || value || '未分类';
}


function categoryCover(value, variant = 'thumb') {
  const slug = CATEGORY_COVERS[value] || CATEGORY_COVERS['Other Use Cases'];
  return variant === 'protected'
    ? `/studio-api/library-assets/category-covers/${slug}.jpg`
    : `/images/thumbs/category-covers/${slug}.webp`;
}

function handleImageFallback(event, fallback) {
  const image = event.currentTarget;
  const nextSrc = fallback ? assetPath(fallback) : '';
  if (nextSrc && image.src !== nextSrc && image.dataset.fallbackUsed !== 'true') {
    image.dataset.fallbackUsed = 'true';
    image.src = nextSrc;
    return;
  }
  image.hidden = true;
  image.closest('.categoryThumbs, .caseMedia')?.classList.add('imageMissing');
}

function buildCategoryGroups(cases) {
  const groups = new Map();
  const protectedAssets = (cases || []).some((item) => String(item?.thumbnail || item?.image || item?.image_url || '').startsWith('/studio-api/'));
  for (const item of orderTemplates(cases || [])) {
    const key = item.category || 'Other Use Cases';
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: categoryLabel(key),
        count: 0,
        cover: categoryCover(key, protectedAssets ? 'protected' : 'thumb'),
        coverFallback: categoryCover(key, protectedAssets ? 'protected' : 'thumb'),
        featured: null,
        samples: []
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (!group.featured && (item.thumbnail || item.image || item.image_url)) group.featured = item;
    if (group.samples.length < 3) group.samples.push(item);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
}

function connectionReady(settings, apiKey, isAuthenticated) {
  if (settings.apiKeySource === 'linked') {
    return Boolean(isAuthenticated && settings.providerProfileId);
  }
  if (settings.apiKeySource === 'manual') {
    return Boolean(settings.manualApiKey?.trim() && settings.manualGatewayBaseUrl?.trim());
  }
  return Boolean(isAuthenticated && apiKey?.key);
}

function providerSetupMessage(settings, providerRequest, t) {
  if (settings.apiKeySource === 'linked' && !providerRequest?.providerConnectionId) {
    return t('statusMessages.providerConnectionRequired', '请先绑定供应商账号。');
  }
  if (settings.apiKeySource === 'manual') {
    if (!providerRequest?.gatewayBaseUrl) return t('statusMessages.gatewayRequired', '请先填写接口地址。');
    if (!providerRequest?.apiKey) return t('statusMessages.keyRequired', '请先填写密钥。');
  }
  return t('statusMessages.accountPreparing', '账号连接还在准备中。');
}

function canUseClientGenerationFallback() {
  return Boolean(import.meta.env.DEV && !STUDIO_STANDALONE);
}

function workspaceLabel(value) {
  return WORKSPACES.find((item) => item.value === value)?.label || WORKSPACES[0].label;
}

function WorkbenchModeSwitch({ activeWorkspace, onChange, t }) {
  const items = [
    { value: 'image', label: t('workspace.image', '图片创作'), icon: ImageIcon },
    { value: 'video', label: t('workspace.video', '视频创作'), icon: Video }
  ];

  return (
    <div className="workbenchModeSwitch" role="group" aria-label={t('workspace.creationType', '创作类型')}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeWorkspace === item.value;
        return (
          <button
            type="button"
            className={active ? 'active' : ''}
            key={item.value}
            onClick={() => {
              if (!active) onChange(item.value);
            }}
            aria-pressed={active}
          >
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkflowModeSwitch({ activeMode, onChange, t }) {
  const items = [
    { value: 'single', label: t('workspace.singleGeneration', '单次生图'), icon: Sparkles },
    { value: 'canvas', label: t('workspace.infiniteCanvas', '无限画布'), icon: SquarePen }
  ];

  return (
    <div className="workbenchModeSwitch workflowModeSwitch" role="group" aria-label={t('workspace.workflowMode', '创作模式')}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeMode === item.value;
        return (
          <button
            type="button"
            className={active ? 'active' : ''}
            key={item.value}
            onClick={() => {
              if (!active) onChange(item.value);
            }}
            aria-pressed={active}
          >
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CreationDesk({
  sessionId,
  activeWorkspace,
  selectedCase,
  selectedHistory,
  onResolveCase,
  apiKey,
  client,
  assistantClient,
  assistantProviderSettings,
  providerSettings,
  onProviderChange,
  providerProfiles = [],
  activeProviderProfileId = '',
  onSelectProvider,
  modelOptions,
  modelsStatus,
  usageSummary,
  isAuthenticated,
  onRequireLogin,
  onOpenSettings,
  onProfileRefresh,
  onHistoryAdd,
  remoteSession,
  remoteSessionReady,
  persistenceKey,
  onSessionSnapshot,
  sessionSnapshot,
  promptPresets,
  appendTemplateRequest,
  onAppendTemplateConsumed,
  onOpenWorkspace,
  firstRunRequest,
  onFirstRunRequestConsumed,
  onShareResult,
  focusSignal = 0,
  t
}) {
  const draftRef = useRef(loadDraft());
  // sessionSnapshot (pushed by the parent, local-first) is the authoritative
  // restored-session source. We fall back to loadCurrentSession only for the
  // very first mount of an anonymous desk before the parent effect has run —
  // once the parent is wired, the prop is always set first. The previous
  // design read localStorage directly here and never re-synced, which is why
  // canvas nodes bled across sessions when the parent's remote sync landed.
  const currentSessionRef = useRef(sessionSnapshot || loadCurrentSession(sessionId));
  const restoredSession = sessionSnapshot || currentSessionRef.current;
  const sessionCreatedAtRef = useRef(restoredSession?.createdAt || new Date().toISOString());
  const initialParameters = restoredSession?.parameters || draftRef.current || {};
  const restoredMode = restoredSession?.mode || (activeWorkspace === 'video' ? 'video' : 'image');
  const generationRef = useRef({ id: 0, controller: null });
  const handledFirstRunRequestRef = useRef('');
  const batchTaskResultsRef = useRef(new Map());
  const resolvingCaseRef = useRef({ id: 0 });
  const appliedCasePromptRef = useRef({ key: '', prompt: '' });
  const maskEditorRef = useRef(null);
  const composerThreadRef = useRef(null);
  const lastSessionSnapshotPayloadRef = useRef('');
  const [mode, setMode] = useState(restoredMode);
  const [prompt, setPrompt] = useState(() => restoredSession?.prompt || draftRef.current?.prompt || '');
  const [model, setModel] = useState(() => (
    restoredSession?.model
      || initialParameters.model
      || providerSettings.imageGenerationModel
      || IMAGE_MODELS[0]
  ));
  const initialSize = normalizeSize(initialParameters.size || initialParameters.customSize || '1024x1024');
  const [aspect, setAspect] = useState(() => normalizeAspect(initialParameters.aspect || initialParameters.aspectRatio, initialSize));
  const [customSize, setCustomSize] = useState(() => normalizeSize(initialParameters.customSize || initialSize));
  const [quality, setQuality] = useState(() => normalizeQuality(initialParameters.quality));
  const [resolutionTier, setResolutionTier] = useState(() => normalizeResolutionTier(initialParameters.resolutionTier));
  const [outputFormat, setOutputFormat] = useState(() => normalizeOutputFormat(initialParameters.outputFormat));
  const [moderation, setModeration] = useState(() => normalizeModeration(initialParameters.moderation));
  const [count, setCount] = useState(() => initialParameters.count || 1);
  const [videoModel, setVideoModel] = useState(() => (
    initialParameters.videoModel
      || (restoredMode === 'video' ? restoredSession?.model : '')
      || providerSettings.videoModel
      || VIDEO_MODELS[0]
  ));
  const [videoAspect, setVideoAspect] = useState(() => normalizeVideoAspect(initialParameters.videoAspect || initialParameters.videoAspectRatio));
  const [videoDuration, setVideoDuration] = useState(() => normalizeVideoDuration(initialParameters.videoDuration || initialParameters.duration));
  const [videoFps, setVideoFps] = useState(() => normalizeVideoFps(initialParameters.videoFps || initialParameters.fps));
  const [videoMotion, setVideoMotion] = useState(() => normalizeVideoMotion(initialParameters.videoMotion));
  const [videoStyle, setVideoStyle] = useState(() => normalizeVideoStyle(initialParameters.videoStyle));
  const [videoQuality, setVideoQuality] = useState(() => normalizeVideoQuality(initialParameters.videoQuality));
  const [negativePrompt, setNegativePrompt] = useState(() => initialParameters.negativePrompt || '');
  const [pendingFirstRunRequest, setPendingFirstRunRequest] = useState(null);
  const [videoReferenceFiles, setVideoReferenceFiles] = useState([]);
  const [videoReferencePreviews, setVideoReferencePreviews] = useState([]);
  const restoredWasGenerating = restoredSession?.status === 'loading';
  const restoredHasServerJob = hasRestorableServerGeneration(restoredSession);
  const restoredPendingReview = restoredWasGenerating && (
    (Array.isArray(restoredSession?.results) && restoredSession.results.length)
    || (Array.isArray(restoredSession?.videoResults) && restoredSession.videoResults.length)
    || (Array.isArray(restoredSession?.canvasNodes) && restoredSession.canvasNodes.length)
  );
  const [status, setStatus] = useState(restoredWasGenerating ? restoredHasServerJob ? 'loading' : 'error' : 'idle');
  const [message, setMessage] = useState(restoredWasGenerating
    ? restoredHasServerJob
      ? '检测到服务端仍有生成任务，正在继续同步状态；刷新页面不会丢失队列。'
      : restoredPendingReview
      ? '页面刷新前有生成请求正在进行，已保留收到的预览/画布。上游可能仍已扣费，请先检查结果或等待，不要立刻重复提交。'
      : '页面刷新前有生成请求正在进行，但本页已断开监听。上游可能仍已扣费，请先到历史图库或服务端确认，再决定是否重试。'
    : '');
  const [results, setResults] = useState(() => Array.isArray(restoredSession?.results) ? restoredSession.results : []);
  const [videoResults, setVideoResults] = useState(() => Array.isArray(restoredSession?.videoResults) ? restoredSession.videoResults : []);
  const [resultBatchMeta, setResultBatchMeta] = useState(() => restoredSession?.resultBatchMeta || null);
  const [videoTask, setVideoTask] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewVideo, setPreviewVideo] = useState('');
  const [progress, setProgress] = useState(() => restoredWasGenerating
    ? {
      ...(restoredSession?.progress || {}),
      stage: restoredHasServerJob ? (restoredSession?.progress?.stage || 'upstream') : restoredPendingReview ? 'pending_review' : 'failed',
      percent: restoredSession?.progress?.percent || (restoredHasServerJob ? 52 : 0)
    }
    : { stage: 'idle', percent: 0, completed: 0, total: 1 });
  const [timing, setTiming] = useState(() => restoredSession?.timing || null);
  const [composerNow, setComposerNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [promptInstruction, setPromptInstruction] = useState('');
  const [promptSuggestion, setPromptSuggestion] = useState(() => serializePromptSuggestion(restoredSession?.promptSuggestion));
  const [assistantMessages, setAssistantMessages] = useState(() => (
    Array.isArray(restoredSession?.assistantMessages)
      ? restoredSession.assistantMessages.map(serializeAssistantMessage).filter(Boolean).slice(-24)
      : []
  ));
  const [activeRecipeId, setActiveRecipeId] = useState('');
  const [composerInspirationOpen, setComposerInspirationOpen] = useState(false);
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  const [caseResolving, setCaseResolving] = useState(false);
  const [referenceItems, setReferenceItems] = useState([]);
  const [referencePreviews, setReferencePreviews] = useState([]);
  const [referenceDropActive, setReferenceDropActive] = useState(false);
  const [videoDropActive, setVideoDropActive] = useState(false);
  const [maskExportUrl, setMaskExportUrl] = useState('');
  const [layoutSections, setLayoutSections] = useState(() => loadWorkbenchLayout());
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [generationConfirmOpen, setGenerationConfirmOpen] = useState(false);
  const [generationConfirmTask, setGenerationConfirmTask] = useState(null);
  const {
    canvasView,
    setCanvasView,
    canvasViewport,
    setCanvasViewport,
    canvasDragRef,
    suppressCanvasClickRef,
    focusCanvasOnNodes: focusCanvasOnNodesBase
  } = useCanvasView(restoredSession);
  const {
    canvasNodes,
    setCanvasNodes,
    canvasNodesRef,
    canvasCustomLinks,
    setCanvasCustomLinks,
    selectedCanvasNodeId,
    setSelectedCanvasNodeId,
    canvasLinkDraft,
    setCanvasLinkDraft,
    canvasNodeMap,
    canvasEdges,
    canvasLinkPreview,
    childNodeIds,
    parentNodeIds,
    linkedNodeIds,
    selectedCanvasNode
  } = useCanvasNodes(restoredSession);
  const [canvasEditorNodeId, setCanvasEditorNodeId] = useState('');
  const [canvasEditorPrompt, setCanvasEditorPrompt] = useState('');
  const [canvasEditorMode, setCanvasEditorMode] = useState('image');
  const [pendingCanvasGenerate, setPendingCanvasGenerate] = useState(null);
  const [pendingCanvasReroll, setPendingCanvasReroll] = useState(null);
  const [pendingSuggestionGenerate, setPendingSuggestionGenerate] = useState(null);
  const {
    generationQueue,
    setGenerationQueue,
    generationQueueRef,
    generationQueueRunnerRef,
    generationQueueActiveCountRef,
    generationContextsRef,
    restoredQueueStartedRef,
    recoveredJobIdsRef
  } = useGenerationQueue(restoredSession);
  const workPreviewRef = useRef(null);
  const appliedRemoteSessionRef = useRef('');
  const stateBlobUrlsRef = useRef(new Set());
  const updateLayoutSections = (patch) => {
    setLayoutSections((current) => {
      const next = { ...current, ...patch };
      saveWorkbenchLayout(next);
      return next;
    });
  };
  const showComposerForGeneration = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: false,
    composerParameters: false
  });
  const workspaceFlowMode = layoutSections.flowMode === 'single' ? 'single' : 'canvas';
  const switchWorkflowMode = (nextMode) => {
    if (nextMode === workspaceFlowMode) return;
    updateLayoutSections({ flowMode: nextMode });
  };

  useEffect(() => {
    if (workspaceFlowMode !== 'single') return;
    import('./styles/studio.single-flow.css');
  }, [workspaceFlowMode]);

  useEffect(() => {
    const requestId = String(firstRunRequest?.id || '');
    if (!requestId || handledFirstRunRequestRef.current === requestId) return;
    setPendingFirstRunRequest(firstRunRequest);
    setMode('image');
    setPrompt(firstRunRequest.prompt || '');
    setModel(firstRunRequest.model || providerSettings.imageGenerationModel || IMAGE_MODELS[0]);
    setCount(1);
    setSelectedCanvasNodeId('');
    updateLayoutSections({
      flowMode: 'single',
      bottomComposer: true,
      composerFolded: false,
      composerParameters: false
    });
  }, [firstRunRequest?.id]);

  useEffect(() => {
    const requestId = String(pendingFirstRunRequest?.id || '');
    if (!requestId || handledFirstRunRequestRef.current === requestId) return;
    if (workspaceFlowMode !== 'single' || mode !== 'image') return;
    if (prompt !== pendingFirstRunRequest.prompt || model !== pendingFirstRunRequest.model) return;
    if (!connectionReady(providerSettings, apiKey, isAuthenticated)) return;
    handledFirstRunRequestRef.current = requestId;
    const task = buildGenerationTask({
      mode: 'image',
      prompt: pendingFirstRunRequest.prompt,
      rawPrompt: pendingFirstRunRequest.prompt,
      model: pendingFirstRunRequest.model,
      count: 1,
      referenceItems: [],
      selectedCanvasNodeId: ''
    });
    setPendingFirstRunRequest(null);
    onFirstRunRequestConsumed?.(requestId);
    enqueueIndependentImageBatch(task);
  }, [
    pendingFirstRunRequest?.id,
    workspaceFlowMode,
    mode,
    prompt,
    model,
    providerSettings.providerProfileId,
    providerSettings.manualGatewayBaseUrl,
    providerSettings.manualApiKey,
    apiKey?.key,
    isAuthenticated
  ]);

  useEffect(() => {
    if (status !== 'loading' && timing?.status !== 'running') return undefined;
    setComposerNow(Date.now());
    const timer = window.setInterval(() => setComposerNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status, timing?.status, timing?.startedAt]);

  useEffect(() => {
    const nextUrls = collectStateBlobUrls({
      results,
      videoResults,
      canvasNodes,
      previewImage,
      previewVideo
    });
    for (const url of stateBlobUrlsRef.current) {
      if (!nextUrls.has(url)) URL.revokeObjectURL(url);
    }
    stateBlobUrlsRef.current = nextUrls;
  }, [results, videoResults, canvasNodes, previewImage?.url, previewVideo?.url, previewVideo]);

  useEffect(() => () => {
    for (const url of stateBlobUrlsRef.current) URL.revokeObjectURL(url);
    stateBlobUrlsRef.current.clear();
  }, []);

  const isReady = connectionReady(providerSettings, apiKey, isAuthenticated);
  const promptAssistantSettings = assistantProviderSettings || providerSettings;
  const promptAssistantClient = assistantClient || client;
  const currentImageProvider = getImageProvider(providerSettings.providerId, providerSettings.apiKeySource);
  const currentProviderAdapter = resolveProviderAdapter({
    providerId: providerSettings.providerId,
    authMode: providerSettings.apiKeySource
  });
  const currentGenerationPlan = currentProviderAdapter.buildGenerationPlan({
    requestedRoute: providerSettings.route
  });
  const currentEditPlan = currentProviderAdapter.buildEditPlan();
  const currentVideoPlan = currentProviderAdapter.buildVideoPlan();
  const imageAspectOptions = useMemo(() => providerAspectOptions(currentImageProvider, ASPECT_OPTIONS, SIZES), [currentImageProvider]);
  const customSizeOptions = useMemo(() => providerCustomSizeOptions(currentImageProvider, CUSTOM_SIZE_OPTIONS, SIZES), [currentImageProvider]);
  const imageQualityOptions = useMemo(() => (
    providerParameterList(currentImageProvider, 'qualities', QUALITY).filter((item) => item !== 'auto')
  ), [currentImageProvider]);
  const imageResolutionTierOptions = useMemo(() => (
    providerParameterList(currentImageProvider, 'resolutionTiers', RESOLUTION_TIERS.map((item) => item.value))
      .map((value) => RESOLUTION_TIERS.find((item) => item.value === value) || { value, label: String(value).toUpperCase() })
  ), [currentImageProvider]);
  const imageOutputFormatOptions = useMemo(() => providerParameterList(currentImageProvider, 'outputFormats', OUTPUT_FORMATS), [currentImageProvider]);
  const imageCountRange = useMemo(() => providerCountRange(currentImageProvider), [currentImageProvider]);
  const defaultImageModelOptions = IMAGE_MODELS.map((id) => ({ id, label: id }));
  const configuredImageModelOptions = [
    providerSettings.imageGenerationModel,
    providerSettings.imageEditModel
  ].map((id) => String(id || '').trim()).filter(Boolean).map((id) => ({ id, label: id }));
  const baseImageModelOptions = modelOptions?.image?.length ? modelOptions.image : defaultImageModelOptions;
  const imageModelOptions = [
    ...configuredImageModelOptions.filter((item) => !baseImageModelOptions.some((option) => option.id === item.id)),
    ...baseImageModelOptions
  ];
  const configuredVideoModel = String(providerSettings.videoModel || '').trim();
  const baseVideoModelOptions = modelOptions?.video?.length ? modelOptions.video : VIDEO_MODELS.map((id) => ({ id, label: id }));
  const syncedVideoModelOptions = configuredVideoModel && !baseVideoModelOptions.some((item) => item.id === configuredVideoModel)
    ? [{ id: configuredVideoModel, label: configuredVideoModel }, ...baseVideoModelOptions]
    : baseVideoModelOptions;
  const videoModelOptions = videoModel && !syncedVideoModelOptions.some((item) => item.id === videoModel)
    ? [{ id: videoModel, label: videoModel }, ...syncedVideoModelOptions]
    : syncedVideoModelOptions;
  const activeModelInfo = imageModelOptions.find((item) => item.id === model);
  const activeVideoModelInfo = videoModelOptions.find((item) => item.id === videoModel);
  const hasSyncedVideoModels = syncedVideoModelOptions.length > 0;
  const hasVideoModels = hasSyncedVideoModels || Boolean(videoModel);
  const size = sizeFromAspect(aspect, customSize);
  const countValue = clampCountForProvider(count, currentImageProvider, normalizeCount);
  const videoSize = videoSizeFromAspect(videoAspect);
  const currentDownloadMeta = resultBatchMeta || {
    mode: mode === 'video' ? 'video' : 'image',
    providerId: mode === 'video'
      ? videoModel
      : model,
    createdAt: timing?.startedAt || Date.now(),
    prompt,
    size,
    quality,
    resolutionTier,
    outputFormat,
    id: timing?.startedAt || selectedHistory?.id || selectedCase?.id || ''
  };
  async function handleShareResult(url, index = 0, shareMeta = currentDownloadMeta) {
    if (!url && !shareMeta?.prompt) return;
    try {
      const matchingNode = [...canvasNodesRef.current].reverse().find((node) => (
        node?.url === url || node?.persistedUrl === url
      ));
      const draft = await prepareCommunityInspirationDraft({
        url: matchingNode?.persistedUrl || url,
        index,
        meta: {
          ...currentDownloadMeta,
          ...(shareMeta || {}),
          model: shareMeta?.model || shareMeta?.providerId || model,
          aspectRatio: shareMeta?.aspectRatio || shareMeta?.aspect || aspect,
          size: shareMeta?.size || size,
          quality: shareMeta?.quality || quality,
          resolutionTier: shareMeta?.resolutionTier || resolutionTier,
          outputFormat: shareMeta?.outputFormat || outputFormat,
          count: shareMeta?.count ?? countValue,
          referenceCount: shareMeta?.referenceCount ?? referenceItems.length
        }
      });
      await onShareResult?.(draft);
    } catch (error) {
      setStatus('error');
      setMessage(t('statusMessages.resultShareFailed', '无法准备灵感投稿，请重试。'));
    }
  }
  const visiblePromptPresets = (promptPresets || PROMPT_PRESETS).filter((item) => item.mode === mode);
  const referenceFiles = referenceItems.map((item) => item.file);
  const isImageEditMode = mode === 'edit' || mode === 'mask';
  const deskModeLabel = (value) => {
    if (value === 'image') return t('mode.textToImage', '文生图');
    if (value === 'edit') return t('mode.referenceEdit', '参考图');
    if (value === 'mask') return t('mode.mask', 'Mask');
    return value;
  };
  const qualityLabel = (value) => {
    if (value === 'auto') return t('quality.auto', '自动');
    if (value === 'low') return t('quality.low', '低');
    if (value === 'medium') return t('quality.medium', '中');
    if (value === 'high') return t('quality.high', '高');
    return value;
  };
  const aspectLabel = (item) => (item.value === 'custom' ? t('params.manual', '手动') : item.label);
  const customSizeLabel = (item) => (item.value === 'auto' ? t('params.auto', '自动') : item.label);
  const videoMotionLabel = (item) => (item.value === 'auto' ? t('params.auto', '自动') : item.label);
  const videoStyleLabel = (item) => (item.value === 'auto' ? t('params.auto', '自动') : item.label);
  const moderationLabel = (value) => (value === 'auto' ? t('params.auto', '自动') : qualityLabel(value));
  const resolutionTierLabel = (item) => RESOLUTION_TIER_LABELS[item.value] || item.label;
  const imageCountSuffix = t('params.imageCountSuffix', '张');
  useEffect(() => {
    if (mode === 'video') return;
    if (count !== countValue) setCount(countValue);
    if (imageQualityOptions.length && !imageQualityOptions.includes(quality)) {
      setQuality(imageQualityOptions.includes('medium') ? 'medium' : imageQualityOptions[0]);
    }
    if (imageOutputFormatOptions.length && !imageOutputFormatOptions.includes(outputFormat)) {
      setOutputFormat(imageOutputFormatOptions.includes('png') ? 'png' : imageOutputFormatOptions[0]);
    }
    if (imageResolutionTierOptions.length && !imageResolutionTierOptions.some((item) => item.value === resolutionTier)) {
      setResolutionTier(imageResolutionTierOptions[0].value);
    }
    if (aspect !== 'custom' && !imageAspectOptions.some((item) => item.value === aspect)) {
      const nextAspect = imageAspectOptions.find((item) => item.value !== 'custom') || imageAspectOptions[0];
      if (nextAspect) {
        setAspect(nextAspect.value);
        if (nextAspect.value !== 'custom') setCustomSize(nextAspect.size);
      }
    }
    if (aspect === 'custom' && customSizeOptions.length && !customSizeOptions.some((item) => item.value === customSize)) {
      setCustomSize(customSizeOptions[0].value);
    }
  }, [
    mode,
    count,
    countValue,
    quality,
    outputFormat,
    resolutionTier,
    aspect,
    customSize,
    imageQualityOptions,
    imageOutputFormatOptions,
    imageResolutionTierOptions,
    imageAspectOptions,
    customSizeOptions
  ]);

  const canvasPerformanceMode = canvasNodes.length >= CANVAS_PERFORMANCE_NODE_THRESHOLD || canvasEdges.length >= CANVAS_PERFORMANCE_EDGE_THRESHOLD;
  const visibleCanvasNodeIds = useMemo(() => {
    const zoom = canvasView.zoom || 1;
    const margin = CANVAS_VIRTUALIZATION_MARGIN;
    const viewportWidth = Math.max(1, canvasViewport.width || 1);
    const viewportHeight = Math.max(1, canvasViewport.height || 1);
    const ids = new Set();
    for (const node of canvasNodes) {
      if (!node?.id) continue;
      const screenLeft = viewportWidth / 2 + canvasView.x + Number(node.x || 0) * zoom;
      const screenTop = viewportHeight / 2 + canvasView.y + Number(node.y || 0) * zoom;
      const screenRight = screenLeft + nodeWidth(node) * zoom;
      const screenBottom = screenTop + nodeHeight(node) * zoom;
      const nearViewport = screenRight >= -margin
        && screenLeft <= viewportWidth + margin
        && screenBottom >= -margin
        && screenTop <= viewportHeight + margin;
      if (
        nearViewport
        || node.id === selectedCanvasNodeId
        || node.id === canvasEditorNodeId
        || linkedNodeIds.has(node.id)
      ) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [
    canvasNodes,
    canvasView.x,
    canvasView.y,
    canvasView.zoom,
    canvasViewport.width,
    canvasViewport.height,
    selectedCanvasNodeId,
    canvasEditorNodeId,
    linkedNodeIds
  ]);
  const renderedCanvasEdges = useMemo(() => {
    if (!canvasPerformanceMode) return canvasEdges;
    return canvasEdges.filter((edge) => {
      const directlySelected = Boolean(selectedCanvasNodeId)
        && (edge.from.id === selectedCanvasNodeId || edge.to.id === selectedCanvasNodeId);
      return directlySelected
        || visibleCanvasNodeIds.has(edge.from.id)
        || visibleCanvasNodeIds.has(edge.to.id);
    });
  }, [canvasEdges, canvasPerformanceMode, visibleCanvasNodeIds, selectedCanvasNodeId, childNodeIds, parentNodeIds]);

  function addCanvasCustomLink(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    if (!canvasNodeMap.has(fromId) || !canvasNodeMap.has(toId)) return false;
    const toNode = canvasNodeMap.get(toId);
    const alreadyLinked = toNode?.parentId === fromId || canvasCustomLinks.some((link) => link.fromId === fromId && link.toId === toId);
    if (alreadyLinked) return false;
    const visited = new Set();
    const reachesFromTarget = (nodeId) => {
      if (!nodeId || visited.has(nodeId)) return false;
      if (nodeId === fromId) return true;
      visited.add(nodeId);
      return canvasEdges.some((edge) => edge.from.id === nodeId && reachesFromTarget(edge.to.id));
    };
    if (reachesFromTarget(toId)) {
      setStatus('error');
      setMessage(t('statusMessages.linkCycle', '这条关联会形成循环，请换一个方向连接。'));
      window.setTimeout(() => setStatus('idle'), 1600);
      return false;
    }
    setCanvasCustomLinks((current) => [
      ...current,
      {
        id: `${fromId}-${toId}-${Date.now()}`,
        fromId,
        toId,
        createdAt: new Date().toISOString()
      }
    ]);
    setSelectedCanvasNodeId(toId);
    setStatus('success');
    setMessage(t('statusMessages.linkCreated', '已建立画布关联。'));
    window.setTimeout(() => setStatus('idle'), 1200);
    return true;
  }

  function resolveCanvasEdgeLineageClass(edge) {
    return canvasEdgeLineageClass(edge, selectedCanvasNodeId, childNodeIds, parentNodeIds);
  }
  const draftParameters = () => ({
    aspect,
    aspectRatio: aspect,
    customSize,
    size,
    quality,
    resolutionTier,
    outputFormat,
    moderation,
    count: countValue
  });
  const videoDraftParameters = () => ({
    videoModel,
    videoAspect,
    videoAspectRatio: videoAspect,
    videoDuration,
    duration: videoDuration,
    videoFps,
    fps: videoFps,
    videoMotion,
    videoStyle,
    videoQuality,
    negativePrompt
  });

  function applyGenerationTaskSnapshot(task) {
    if (!task) return;
    setMode(task.mode);
    setPrompt(task.prompt);
    setModel(task.model || IMAGE_MODELS[0]);
    setAspect(normalizeAspect(task.aspect || task.aspectRatio, task.size));
    setCustomSize(normalizeSize(task.customSize || task.size));
    setQuality(normalizeQuality(task.quality));
    setResolutionTier(normalizeResolutionTier(task.resolutionTier));
    setOutputFormat(normalizeOutputFormat(task.outputFormat));
    setModeration(normalizeModeration(task.moderation));
    setCount(normalizeCount(task.batchId ? task.batchTotal : task.count));
    setVideoModel(task.videoModel || VIDEO_MODELS[0]);
    setVideoAspect(normalizeVideoAspect(task.videoAspect || task.videoAspectRatio));
    setVideoDuration(normalizeVideoDuration(task.videoDuration || task.duration));
    setVideoFps(normalizeVideoFps(task.videoFps || task.fps));
    setVideoMotion(normalizeVideoMotion(task.videoMotion));
    setVideoStyle(normalizeVideoStyle(task.videoStyle));
    setVideoQuality(normalizeVideoQuality(task.videoQuality));
    setNegativePrompt(task.negativePrompt || '');
    setReferenceItems(Array.isArray(task.referenceItems) ? task.referenceItems : []);
    setVideoReferenceFiles(Array.isArray(task.videoReferenceFiles) ? task.videoReferenceFiles : []);
    setSelectedCanvasNodeId(task.selectedCanvasNodeId || '');
    updateLayoutSections({ bottomComposer: true, references: Boolean(task.referencesOpen) });
  }

  function applySessionSnapshot(sessionSnapshot) {
    const next = deriveSessionStateFromSnapshot(sessionSnapshot, {
      fallbackCustomSize: customSize,
      imageModels: IMAGE_MODELS,
      videoModels: VIDEO_MODELS,
      generationQueueLimit: GENERATION_QUEUE_LIMIT,
      normalizeSize,
      normalizeAspect,
      normalizeQuality,
      normalizeResolutionTier,
      normalizeOutputFormat,
      normalizeModeration,
      normalizeCount,
      normalizeVideoAspect,
      normalizeVideoDuration,
      normalizeVideoFps,
      normalizeVideoMotion,
      normalizeVideoStyle,
      normalizeVideoQuality,
      serializeGenerationQueueItem,
      serializeAssistantMessage,
      serializePromptSuggestion,
      hasRestorableServerGeneration
    });
    if (!next) return;
    setMode(next.mode);
    setPrompt(next.prompt);
    setModel(next.model);
    setAspect(next.aspect);
    setCustomSize(next.customSize);
    setQuality(next.quality);
    setResolutionTier(next.resolutionTier);
    setOutputFormat(next.outputFormat);
    setModeration(next.moderation);
    setCount(next.count);
    setVideoModel(next.videoModel);
    setVideoAspect(next.videoAspect);
    setVideoDuration(next.videoDuration);
    setVideoFps(next.videoFps);
    setVideoMotion(next.videoMotion);
    setVideoStyle(next.videoStyle);
    setVideoQuality(next.videoQuality);
    setNegativePrompt(next.negativePrompt);
    setResults(next.results);
    setVideoResults(next.videoResults);
    setResultBatchMeta(next.resultBatchMeta);
    setCanvasNodes(next.canvasNodes);
    setCanvasCustomLinks(next.canvasCustomLinks);
    generationQueueRef.current = next.generationQueue;
    setGenerationQueue(next.generationQueue);
    setSelectedCanvasNodeId(next.selectedCanvasNodeId);
    setCanvasEditorNodeId(next.canvasEditorNodeId);
    setCanvasLinkDraft(null);
    setCanvasView(next.canvasView);
    setAssistantMessages(next.assistantMessages);
    setPromptSuggestion(next.promptSuggestion);
    setStatus(next.status);
    setMessage(next.message);
    setProgress(next.progress);
    setTiming(next.timing);
  }

  function commitCurrentSessionPatch(patch) {
    const snapshot = saveCurrentSession({
      ...currentSessionRef.current,
      sessionId,
      ...patch
    });
    currentSessionRef.current = snapshot;
    return notifySessionSnapshotChange(snapshot, {
      encodePayload: sessionSnapshotComparePayload,
      lastEncodedRef: lastSessionSnapshotPayloadRef,
      onSessionSnapshot
    });
  }

  function commitGenerationQueue(nextQueue) {
    generationQueueRef.current = nextQueue;
    setGenerationQueue(nextQueue);
    commitCurrentSessionPatch({ generationQueue: nextQueue });
  }

  useEffect(() => {
    if (!remoteSession) return;
    const remoteSessionMarker = remoteSession.updatedAt || sessionSnapshotComparePayload(remoteSession);
    if (!remoteSessionMarker) return;
    if (appliedRemoteSessionRef.current === remoteSessionMarker) return;
    const remoteUpdated = Date.parse(remoteSession.updatedAt) || 0;
    const localSession = currentSessionRef.current;
    const localUpdated = Date.parse(localSession?.updatedAt || '') || 0;
    if (localUpdated && localUpdated > remoteUpdated && hasMeaningfulSessionContent(localSession)) return;
    appliedRemoteSessionRef.current = remoteSessionMarker;
    currentSessionRef.current = remoteSession;
    applySessionSnapshot(remoteSession);
  }, [remoteSession]);

  useEffect(() => {
    const element = workPreviewRef.current;
    if (!element) return undefined;
    const updateViewport = () => {
      const rect = element.getBoundingClientRect();
      setCanvasViewport((current) => {
        const width = Math.round(rect.width || current.width || 1200);
        const height = Math.round(rect.height || current.height || 720);
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    };
    updateViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);
      return () => window.removeEventListener('resize', updateViewport);
    }
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const protectedAssetUrl = (node) => {
      const url = String(node?.url || '');
      const persistedUrl = String(node?.persistedUrl || '');
      if (url.startsWith('/studio-api/history/') || url.startsWith('/studio-api/generation-jobs/')) return url;
      return '';
    };
    if (canvasPerformanceMode) return;
    const protectedNodes = canvasNodes
      .map((node) => ({ node, assetUrl: protectedAssetUrl(node) }))
      .filter((item) => item.assetUrl)
      .slice(0, CANVAS_PROTECTED_ASSET_RESOLVE_LIMIT);
    if (!protectedNodes.length || !isAuthenticated) return;
    let cancelled = false;
    const historyClient = createHistoryClient({ session: loadSession() });
    Promise.all(protectedNodes.map(async ({ node, assetUrl }) => ({
      id: node.id,
      persistedUrl: assetUrl,
      url: await enqueueProtectedImageTask(() => historyClient.resolveAssetUrl(assetUrl)).catch(() => assetUrl)
    }))).then((resolved) => {
      if (cancelled) {
        revokeBlobUrls(resolved.map((item) => item.url));
        return;
      }
      const resolvedMap = new Map(resolved
        .filter((item) => item.url && !String(item.url).startsWith('/studio-api/'))
        .map((item) => [item.id, item]));
      if (!resolvedMap.size) return;
      setCanvasNodes((current) => current.map((node) => (
        resolvedMap.has(node.id)
          ? { ...node, persistedUrl: node.persistedUrl || resolvedMap.get(node.id).persistedUrl, url: resolvedMap.get(node.id).url }
          : node
      )));
    });
    return () => {
      cancelled = true;
    };
  }, [canvasNodes, isAuthenticated, canvasPerformanceMode, visibleCanvasNodeIds]);

  useEffect(() => {
    const snapshot = saveCurrentSession({
      sessionId,
      createdAt: currentSessionRef.current?.createdAt || sessionCreatedAtRef.current,
      mode,
      prompt,
      model,
      results,
      videoResults,
      persistedResults: currentSessionRef.current?.persistedResults || [],
      persistedVideoResults: currentSessionRef.current?.persistedVideoResults || [],
      resultBatchMeta,
      canvasNodes: canvasNodesRef.current,
      canvasCustomLinks,
      generationQueue: generationQueueRef.current,
      selectedCanvasNodeId,
      canvasEditorNodeId,
      canvasView,
      status,
      message,
      progress,
      timing,
      assistantMessages: assistantMessages.map(serializeAssistantMessage).filter(Boolean).slice(-24),
      promptSuggestion: serializePromptSuggestion(promptSuggestion),
      selectedCase: selectedCase ? {
        id: selectedCase.id,
        title: selectedCase.title,
        image: selectedCase.image || selectedCase.image_url || '',
        imageAlt: selectedCase.imageAlt,
        promptPreview: selectedCase.promptPreview,
        category: selectedCase.category
      } : null,
      parameters: {
        ...draftParameters(),
        ...videoDraftParameters()
      }
    });
    currentSessionRef.current = snapshot;
    notifySessionSnapshotChange(snapshot, {
      encodePayload: sessionSnapshotComparePayload,
      lastEncodedRef: lastSessionSnapshotPayloadRef,
      onSessionSnapshot
    });
  }, [
    sessionId,
    mode,
    prompt,
    model,
    results,
    videoResults,
    resultBatchMeta,
    canvasNodes,
    canvasCustomLinks,
    generationQueue,
    selectedCanvasNodeId,
    canvasEditorNodeId,
    canvasView,
    status,
    message,
    progress,
    timing,
    assistantMessages,
    promptSuggestion?.finalPrompt,
    promptSuggestion?.raw,
    selectedCase?.id,
    aspect,
    customSize,
    quality,
    resolutionTier,
    outputFormat,
    moderation,
    countValue,
    videoModel,
    videoAspect,
    videoDuration,
    videoFps,
    videoMotion,
    videoStyle,
    videoQuality,
    negativePrompt
  ]);

  useEffect(() => {
    if (restoredQueueStartedRef.current) return;
    if (!isReady) return;
    if (!hasRestorableLocalQueueTask(generationQueueRef.current)) return;
    restoredQueueStartedRef.current = true;
    setMessage(t('statusMessages.localQueueRestored', '已恢复刷新前的本地排队任务，正在继续执行。'));
    runGenerationQueue();
  }, [isReady]);

  useEffect(() => {
    const thread = composerThreadRef.current;
    if (!layoutSections.bottomComposer || !thread) return;
    const frame = window.requestAnimationFrame(() => {
      if (promptSuggestion && assistantMessages.length) {
        const suggestion = thread.querySelector('.promptSuggestion');
        if (suggestion) {
          thread.scrollTop = thread.scrollHeight;
          return;
        }
      }
      thread.scrollTop = thread.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    assistantMessages,
    promptSuggestion?.finalPrompt,
    promptSuggestion?.raw,
    status,
    progress.stage,
    generationQueue.length,
    layoutSections.bottomComposer,
    message
  ]);

  function toggleLayoutSection(key) {
    updateLayoutSections({ [key]: !layoutSections[key] });
  }

  function focusCanvasOnNodes(nodes = canvasNodes, preferredId = selectedCanvasNodeId) {
    focusCanvasOnNodesBase(nodes, preferredId);
  }


  function appendCanvasNodes(urls, { kind = 'image', parentId = '', promptText = '', title = '生成结果', downloadMeta, replaceBatchId = '', persistedUrls = [], workflow = null } = {}) {
    if (!urls.length) return;
    const activeDownloadMeta = downloadMeta || resultBatchMeta;
    setCanvasNodes((current) => {
      const retained = replaceBatchId
        ? current.filter((node) => node.downloadMeta?.id !== replaceBatchId)
        : current;
      const siblings = parentId ? retained.filter((node) => node.parentId === parentId).length : retained.filter((node) => !node.parentId).length;
      const parent = parentId ? retained.find((node) => node.id === parentId) : null;
      const parentWidth = nodeWidth(parent);
      const baseX = parent ? parent.x + parentWidth + CANVAS_NODE_HORIZONTAL_GAP : 0;
      const baseY = parent ? parent.y + (siblings - 0.5) * (CANVAS_NODE_HEIGHT + CANVAS_NODE_VERTICAL_GAP) : (retained.length % 4) * (CANVAS_NODE_HEIGHT + CANVAS_NODE_VERTICAL_GAP) - 250;
      const nextCanvasIndex = retained.reduce((max, node) => Math.max(max, Number(node.canvasIndex) || 0), 0) + 1;
      const nextNodes = urls.map((url, index) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
        parentId,
        canvasIndex: nextCanvasIndex + index,
        kind,
        url,
        persistedUrl: persistedUrls[index] || '',
        prompt: promptText,
        generationPrompt: promptText,
        workflow,
        downloadMeta: {
          mode: kind === 'video' ? 'video' : 'image',
          providerId: activeDownloadMeta?.providerId || '',
          createdAt: activeDownloadMeta?.createdAt || new Date().toISOString(),
          prompt: promptText,
          id: activeDownloadMeta?.id || ''
        },
        title: urls.length > 1 ? `${title} ${index + 1}` : title,
        x: baseX + index * 32,
        y: baseY + index * 42,
        width: CANVAS_NODE_WIDTH,
        height: CANVAS_NODE_HEIGHT,
        createdAt: new Date().toISOString()
      }));
      setSelectedCanvasNodeId(nextNodes[0]?.id || '');
      const nextCanvasNodes = [...retained, ...nextNodes];
      canvasNodesRef.current = nextCanvasNodes;
      commitCurrentSessionPatch({
        canvasNodes: nextCanvasNodes,
        selectedCanvasNodeId: nextNodes[0]?.id || selectedCanvasNodeId,
        generationQueue: generationQueueRef.current
      });
      return nextCanvasNodes;
    });
  }

  async function attachServerJobResult(historyClient, job, { silent = false } = {}) {
    const persistedUrls = Array.isArray(job?.resultUrls) ? job.resultUrls.filter(Boolean) : [];
    if (!job?.id || !persistedUrls.length || recoveredJobIdsRef.current.has(job.id)) return false;
    const currentNodes = Array.isArray(canvasNodesRef.current) ? canvasNodesRef.current : [];
    if (currentNodes.some((node) => node.downloadMeta?.id === job.id || persistedUrls.includes(node.persistedUrl || node.url))) {
      recoveredJobIdsRef.current.add(job.id);
      return false;
    }
    const displayUrls = await Promise.all(persistedUrls.map((url) => historyClient.resolveAssetUrl(url).catch(() => url)));
    if (sessionId !== job.sessionId) {
      revokeBlobUrls(displayUrls);
      return false;
    }
    const jobRequest = job.request && typeof job.request === 'object' ? job.request : {};
    const jobPrompt = job.generationPrompt || jobRequest.generationPrompt || job.prompt || jobRequest.prompt || '';
    const jobWorkflow = job.workflow || jobRequest.workflow || null;
    appendCanvasNodes(displayUrls, {
      kind: 'image',
      parentId: job.parentCanvasNodeId || jobRequest.parentCanvasNodeId || '',
      promptText: jobPrompt,
      workflow: jobWorkflow,
      downloadMeta: {
        mode: 'image',
        providerId: job.model || '',
        createdAt: job.createdAt || new Date().toISOString(),
        prompt: jobPrompt,
        id: job.id
      },
      title: '生成结果',
      replaceBatchId: job.id,
      persistedUrls
    });
    setResults(displayUrls);
    setResultBatchMeta({
      mode: 'image',
      providerId: job.model || '',
      createdAt: job.createdAt || new Date().toISOString(),
      prompt: jobPrompt,
      sessionId,
      id: job.id
    });
    recoveredJobIdsRef.current.add(job.id);
    clearRemoteGenerationJob(job.id, 'done');
    if (!silent) {
      setStatus('success');
      setProgress({ stage: 'completed', percent: 100, completed: displayUrls.length, total: displayUrls.length || 1 });
      setMessage(t('statusMessages.serverResultRestored', '已从服务端恢复生成结果。'));
    }
    return true;
  }

  function syncRemoteGenerationJob(job) {
    if (!job?.id) return;
    if (job.sessionId && job.sessionId !== sessionId) return;
    commitGenerationQueue(upsertRemoteGenerationJobTask(generationQueueRef.current, job, {
      defaultModel: IMAGE_MODELS[0],
      fallbackSummary: '服务端任务'
    }));
  }

  function clearRemoteGenerationJob(jobId, status = 'done') {
    if (!jobId) return;
    commitGenerationQueue(markRemoteGenerationJobTask(generationQueueRef.current, jobId, status));
  }

  useEffect(() => {
    if (!remoteSessionReady || !sessionId) return;
    let cancelled = false;
    let syncController = null;
    const historyClient = createHistoryClient({ session: loadSession() });
    historyClient.listGenerationJobs({ sessionId, limit: 12 })
      .then(async (jobs) => {
        if (cancelled) return;
        const knownJobIds = new Set(jobs.map((job) => job?.id).filter(Boolean));
        const restoredJobIds = restorableRemoteJobIds(generationQueueRef.current, knownJobIds);
        if (restoredJobIds.length) {
          const restoredJobs = await Promise.all(restoredJobIds.map((jobId) => (
            historyClient.getGenerationJob(jobId).catch(() => null)
          )));
          if (cancelled) return;
          jobs = [
            ...jobs,
            ...restoredJobs.filter((job) => job?.id && !knownJobIds.has(job.id) && (!job.sessionId || job.sessionId === sessionId))
          ];
        }
        const visibleRemoteJobs = jobs.filter(isVisibleServerJob);
        visibleRemoteJobs.forEach(syncRemoteGenerationJob);
        const succeededJobs = jobs
          .filter((job) => job.status === 'succeeded' && Array.isArray(job.resultUrls) && job.resultUrls.length)
          .reverse();
        for (const job of succeededJobs) {
          if (cancelled) return;
          await attachServerJobResult(historyClient, job, { silent: true });
        }
        if (generationRef.current.controller) return;
        const activeJob = jobs.find((job) => isActiveServerJobStatus(job.status));
        if (!activeJob || recoveredJobIdsRef.current.has(activeJob.id)) {
          const interruptedJob = jobs.find((job) => ['unknown', 'failed'].includes(job.status));
          if (interruptedJob && !recoveredJobIdsRef.current.has(interruptedJob.id)) {
            clearRemoteGenerationJob(interruptedJob.id, queueStatusFromServerJob(interruptedJob));
            setStatus('error');
            setProgress(serverJobProgress(interruptedJob, interruptedJob.count));
            setMessage(serverJobMessage(interruptedJob, t));
          }
          return;
        }
        syncRemoteGenerationJob(activeJob);
        setStatus('loading');
        setProgress(serverJobProgress(activeJob, activeJob.count));
            setMessage(t('statusMessages.serverJobsSyncing', '检测到服务端仍有生成任务，正在继续同步状态。'));
        const controller = new AbortController();
        syncController = controller;
        generationRef.current = { id: generationRef.current.id + 1, controller, remoteJobId: activeJob.id };
        try {
          const finalJob = await waitForServerJob(historyClient, activeJob.id, { signal: controller.signal, total: activeJob.count });
          if (cancelled || !finalJob) return;
          if (finalJob.status === 'succeeded') {
            await attachServerJobResult(historyClient, finalJob);
            clearRemoteGenerationJob(finalJob.id, 'done');
          } else {
            clearRemoteGenerationJob(finalJob.id, queueStatusFromServerJob(finalJob));
            setStatus('error');
            setMessage(serverJobMessage(finalJob, t));
          }
        } finally {
          if (generationRef.current.remoteJobId === activeJob.id) {
            generationRef.current = { id: generationRef.current.id, controller: null };
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      syncController?.abort(new DOMException('Session changed', 'AbortError'));
    };
  }, [remoteSessionReady, persistenceKey, sessionId]);

  function composedGenerationPrompt() {
    const currentPrompt = prompt.trim();
    if (!currentPrompt) return selectedCanvasNode?.prompt?.trim() || '';
    if (!selectedCanvasNode?.prompt) return currentPrompt;
    return composeCanvasContinuationPrompt(selectedCanvasNode, currentPrompt, { mode });
  }

  function assistantBasePrompt() {
    return selectedCanvasNode?.prompt?.trim() || '';
  }

  function assistantUserInstruction() {
    return prompt.trim();
  }

  async function selectedCanvasReferenceFiles(node = selectedCanvasNode) {
    if (!node || node.kind === 'video' || !node.url) return [];
    try {
      const file = await imageUrlToFile(node.url, `canvas-${node.canvasIndex || 1}.png`);
      return [file];
    } catch (error) {
      throw new Error('选中的画布图片无法作为参考图读取，请重新选择图片节点或从历史图库里打开。');
    }
  }

  async function copyCanvasNodePrompt(node) {
    const text = node?.prompt?.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus('success');
    setMessage(t('statusMessages.nodePromptCopied', '#{index} 的提示词已复制。', { index: node.canvasIndex || '' }));
    window.setTimeout(() => setStatus('idle'), 1200);
  }

  async function setCanvasNodeAsReference(node) {
    if (!node || node.kind === 'video' || !node.url) return;
    try {
      const file = await imageUrlToFile(node.url, `canvas-${node.canvasIndex || 1}.png`);
      setReferenceItems([createReferenceItem(file, 'identity')]);
      setSelectedCanvasNodeId(node.id);
      setMode('edit');
      updateLayoutSections({ references: true, bottomComposer: true });
      setStatus('success');
      setMessage(t('statusMessages.nodeReferenceSet', '#{index} 已设为本轮参考图。', { index: node.canvasIndex || '' }));
      window.setTimeout(() => setStatus('idle'), 1200);
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || t('statusMessages.nodeReferenceFailed', '这张图暂时无法设为参考图。'));
    }
  }

  function previewCanvasNode(node) {
    if (!node?.url) return;
    if (node.kind === 'video') {
      setPreviewVideo({
        url: node.url,
        index: Math.max(0, (node.canvasIndex || 1) - 1),
        downloadMeta: node.downloadMeta || null
      });
      return;
    }
    setPreviewImage({
      url: node.url,
      index: Math.max(0, (node.canvasIndex || 1) - 1),
      downloadMeta: node.downloadMeta || null
    });
  }

  function deleteCanvasNode(node) {
    if (!node?.id) return;
    const deletedIds = new Set([node.id]);
      setCanvasNodes((current) => {
        let changed = true;
        while (changed) {
        changed = false;
        for (const item of current) {
          if (!deletedIds.has(item.id) && deletedIds.has(item.parentId)) {
            deletedIds.add(item.id);
            changed = true;
          }
        }
      }
      return current.filter((item) => !deletedIds.has(item.id));
    });
    setCanvasCustomLinks((current) => current.filter((link) => !deletedIds.has(link.fromId) && !deletedIds.has(link.toId)));
    setCanvasLinkDraft((current) => current && deletedIds.has(current.fromId) ? null : current);
    if (deletedIds.has(selectedCanvasNodeId)) setSelectedCanvasNodeId('');
    if (deletedIds.has(canvasEditorNodeId)) closeCanvasEditor();
    setStatus('success');
    setMessage(t('statusMessages.nodeDeleted', '#{index} 已从当前画布移除。', { index: node.canvasIndex || '' }));
    window.setTimeout(() => setStatus('idle'), 1200);
  }

  function openCanvasEditor(node, nextMode = 'image') {
    if (!node) return;
    setSelectedCanvasNodeId(node.id);
    setCanvasEditorNodeId(node.id);
    setCanvasEditorMode(nextMode);
    setCanvasEditorPrompt('');
    setMode(nextMode);
    updateLayoutSections({
      bottomComposer: false,
      references: nextMode === 'mask'
    });
    setStatus('idle');
    setMessage('');
  }

  function closeCanvasEditor() {
    setCanvasEditorNodeId('');
    setCanvasEditorPrompt('');
  }

  function generateFromCanvasEditor(node, modeOverride = canvasEditorMode) {
    if (!node) return;
    const nextPrompt = canvasEditorPrompt.trim();
    const normalizedMode = modeOverride === 'video' ? 'video' : modeOverride === 'mask' ? 'mask' : modeOverride === 'edit' ? 'edit' : 'image';
    const continuationPlan = normalizedMode === 'image' || normalizedMode === 'video'
      ? buildCanvasContinuationPlan(node, nextPrompt, { mode: normalizedMode })
      : null;
    const generationPrompt = continuationPlan
      ? continuationPlan.generationPrompt
      : nextPrompt;
    setSelectedCanvasNodeId(node.id);
    setMode(normalizedMode);
    if (normalizedMode === 'mask') {
      updateLayoutSections({ references: true, bottomComposer: false });
      setPrompt(generationPrompt);
      if (!maskEditorRef.current?.exportMask?.()) {
        setStatus('idle');
        setMessage(t('statusMessages.maskPaintRequired', '先在 Mask 面板涂抹需要重绘的区域，再回到这张图点生成。'));
        return;
      }
    }
    setPrompt(generationPrompt);
    setPendingCanvasGenerate({
      nodeId: node.id,
      mode: normalizedMode,
      prompt: generationPrompt,
      rawPrompt: nextPrompt,
      workflow: continuationPlan?.workflow || null,
      referenceItems: [],
      referencesOpen: normalizedMode !== 'image',
      selectedCanvasNodeSnapshot: { ...node },
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  // Node-level quick reroll: re-run a node's own prompt to get a fresh variant,
  // optionally at a different aspect. Unlike generateFromCanvasEditor this adds
  // no new lineage step (empty instruction inherits the node's prompt as-is);
  // it just produces another take. Aspect changes go through setAspect first,
  // so we stage the request and let a pending-effect fire the confirm once the
  // size params have actually synced — mirroring the pendingCanvasGenerate flow.
  function rerollCanvasNode(node, { aspect: nextAspect } = {}) {
    if (!node || node.kind === 'video') return;
    const plan = buildCanvasContinuationPlan(node, '', { mode: 'image' });
    const generationPrompt = plan.generationPrompt || node.generationPrompt || node.prompt || '';
    if (!generationPrompt) {
      setStatus('error');
      setMessage(t('statusMessages.rerollNoPrompt', '这张图没有可复用的提示词，无法重出。'));
      window.setTimeout(() => setStatus('idle'), 1600);
      return;
    }
    const resolvedAspect = nextAspect
      ? normalizeAspect(nextAspect, sizeFromAspect(nextAspect, customSize))
      : aspect;
    const resolvedSize = sizeFromAspect(resolvedAspect, customSize);
    closeCanvasEditor();
    setSelectedCanvasNodeId(node.id);
    setMode('image');
    if (nextAspect && resolvedAspect !== 'custom') {
      setAspect(resolvedAspect);
      setCustomSize(resolvedSize);
    }
    setPrompt(generationPrompt);
    setPendingCanvasReroll({
      nodeId: node.id,
      prompt: generationPrompt,
      rawPrompt: '',
      workflow: plan.workflow || node.workflow || null,
      aspect: resolvedAspect,
      size: resolvedSize,
      selectedCanvasNodeSnapshot: { ...node },
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  function generateMaskFromPanel() {
    if (!selectedCanvasNode) {
      setStatus('error');
      setMessage(t('statusMessages.maskSelectNode', '请先选中一张画布图片，再用 Mask 继续生成。'));
      return;
    }
    setCanvasEditorMode('mask');
    setCanvasEditorNodeId(selectedCanvasNode.id);
    generateFromCanvasEditor(selectedCanvasNode, 'mask');
  }

  function changeCanvasEditorMode(nextMode) {
    setCanvasEditorMode(nextMode);
    setMode(nextMode);
    updateLayoutSections({
      references: nextMode === 'mask',
      bottomComposer: false
    });
    setStatus('idle');
    setMessage('');
  }

  function selectCanvasNode(node) {
    setSelectedCanvasNodeId(node.id);
    setCanvasEditorNodeId(node.id);
    setCanvasEditorMode('image');
    setCanvasEditorPrompt('');
    const nextPrompt = node.prompt ? `继续优化 #${node.canvasIndex || ''}：` : '';
    setPrompt(nextPrompt);
    updateLayoutSections({ bottomComposer: true });
    setMode((current) => current === 'video' ? 'video' : 'image');
    setStatus('idle');
    setMessage('');
  }

  const {
    setCanvasZoom,
    resetCanvasView,
    startCanvasPan,
    moveCanvasPan,
    endCanvasPan,
    startCanvasNodeResize,
    startCanvasNodeDrag,
    startCanvasLink,
    finishCanvasLink,
    handleCanvasNodeMediaClick
  } = useCanvasInteraction({
    canvasView,
    setCanvasView,
    canvasNodes,
    setCanvasNodes,
    canvasNodeMap,
    canvasEdges,
    canvasCustomLinks,
    setCanvasCustomLinks,
    canvasLinkDraft,
    setCanvasLinkDraft,
    selectedCanvasNodeId,
    setSelectedCanvasNodeId,
    canvasDragRef,
    suppressCanvasClickRef,
    addCanvasCustomLink,
    selectCanvasNode,
    setStatus,
    setMessage,
    t
  });

  function casePromptKey(item) {
    if (!item) return '';
    return `${item.kind || 'case'}:${item.id ?? item.title ?? item.promptPreview ?? ''}`;
  }

  function applySelectedCasePrompt(item, nextPrompt) {
    const key = casePromptKey(item);
    const value = nextPrompt || '';
    appliedCasePromptRef.current = { key, prompt: value };
  }

  useEffect(() => {
    if (activeWorkspace === 'video') {
      setMode('video');
      return;
    }
    if (mode === 'video') setMode('image');
  }, [activeWorkspace]);

  useEffect(() => {
    if (!selectedCase) return;
    if (selectedCase.kind === 'video-inspiration') {
      setMode('video');
      setVideoAspect(normalizeVideoAspect(selectedCase.videoAspect || selectedCase.videoAspectRatio));
      setVideoDuration(normalizeVideoDuration(selectedCase.videoDuration || selectedCase.duration));
      setVideoFps(normalizeVideoFps(selectedCase.videoFps || selectedCase.fps));
      setVideoMotion(normalizeVideoMotion(selectedCase.videoMotion));
      setVideoStyle(normalizeVideoStyle(selectedCase.videoStyle));
      setVideoQuality(normalizeVideoQuality(selectedCase.videoQuality));
      setPromptSuggestion(null);
      setPreviewImage(null);
      setVideoResults([]);
      setVideoTask(null);
      if (!selectedCase.prompt && selectedCase.id && onResolveCase) {
        const requestId = resolvingCaseRef.current.id + 1;
        resolvingCaseRef.current = { id: requestId };
        setCaseResolving(true);
        applySelectedCasePrompt(selectedCase, '');
        setNegativePrompt('');
        onResolveCase(selectedCase)
          .then((resolvedCase) => {
            if (resolvingCaseRef.current.id !== requestId || !resolvedCase) return;
            applySelectedCasePrompt(selectedCase, resolvedCase.prompt || '');
            setNegativePrompt(resolvedCase.negativePrompt || '');
            updateLayoutSections({ bottomComposer: true });
          })
          .catch((error) => {
            if (resolvingCaseRef.current.id !== requestId) return;
            setStatus('error');
            setMessage(error?.message || '视频灵感读取失败。');
          })
          .finally(() => {
            if (resolvingCaseRef.current.id === requestId) setCaseResolving(false);
          });
        return;
      }
      applySelectedCasePrompt(selectedCase, selectedCase.prompt || '');
      setNegativePrompt(selectedCase.negativePrompt || '');
      if (selectedCase.prompt) updateLayoutSections({ bottomComposer: true });
      return;
    }
    if (!selectedCase.prompt && selectedCase.id && onResolveCase) {
      const requestId = resolvingCaseRef.current.id + 1;
      resolvingCaseRef.current = { id: requestId };
      setCaseResolving(true);
      applySelectedCasePrompt(selectedCase, selectedCase.promptPreview || '');
      onResolveCase(selectedCase)
        .then((resolvedCase) => {
          if (resolvingCaseRef.current.id !== requestId || !resolvedCase) return;
          applySelectedCasePrompt(selectedCase, resolvedCase.prompt || resolvedCase.promptPreview || '');
          updateLayoutSections({
            bottomComposer: true,
            references: Boolean(templatePreviewImage(resolvedCase || selectedCase))
          });
          setPromptSuggestion(null);
          setPreviewImage(null);
        })
        .catch((error) => {
          if (resolvingCaseRef.current.id !== requestId) return;
          setStatus('error');
          setMessage(error?.message || '模板详情读取失败。');
        })
        .finally(() => {
          if (resolvingCaseRef.current.id === requestId) setCaseResolving(false);
        });
      return;
    }
    if (draftRef.current?.prompt) {
      setMode(draftRef.current.mode || 'image');
      appliedCasePromptRef.current = { key: '', prompt: '' };
      setPrompt(draftRef.current.prompt);
      setModel(draftRef.current.model || IMAGE_MODELS[0]);
      const nextSize = normalizeSize(draftRef.current.size || '1024x1024');
      setAspect(normalizeAspect(draftRef.current.aspect || draftRef.current.aspectRatio, nextSize));
      setCustomSize(normalizeSize(draftRef.current.customSize || nextSize));
      setQuality(normalizeQuality(draftRef.current.quality));
      setResolutionTier(normalizeResolutionTier(draftRef.current.resolutionTier));
      setOutputFormat(normalizeOutputFormat(draftRef.current.outputFormat));
      setModeration(normalizeModeration(draftRef.current.moderation));
      setCount(normalizeCount(draftRef.current.count));
      setVideoModel(draftRef.current.videoModel || VIDEO_MODELS[0]);
      setVideoAspect(normalizeVideoAspect(draftRef.current.videoAspect || draftRef.current.videoAspectRatio));
      setVideoDuration(normalizeVideoDuration(draftRef.current.videoDuration || draftRef.current.duration));
      setVideoFps(normalizeVideoFps(draftRef.current.videoFps || draftRef.current.fps));
      setVideoMotion(normalizeVideoMotion(draftRef.current.videoMotion));
      setVideoStyle(normalizeVideoStyle(draftRef.current.videoStyle));
      setVideoQuality(normalizeVideoQuality(draftRef.current.videoQuality));
      setNegativePrompt(draftRef.current.negativePrompt || '');
      updateLayoutSections({ bottomComposer: true });
      draftRef.current = null;
      clearDraft();
      return;
    }
    applySelectedCasePrompt(selectedCase, selectedCase?.prompt || selectedCase?.promptPreview || '');
    if (selectedCase?.prompt || selectedCase?.promptPreview) {
      updateLayoutSections({
        bottomComposer: true,
        references: Boolean(templatePreviewImage(selectedCase))
      });
    }
    setPromptSuggestion(null);
    setPreviewImage(null);
  }, [selectedCase]);

  useEffect(() => {
    if (!appendTemplateRequest?.prompt) return;
    setPrompt(appendTemplateRequest.prompt.trim());
    updateLayoutSections({ bottomComposer: true, composerFolded: false });
    setStatus('success');
    setMessage(t('statusMessages.templateLoaded', '已载入独立提示词，可继续编辑。'));
    window.setTimeout(() => setStatus('idle'), 1200);
    onAppendTemplateConsumed?.(appendTemplateRequest.id);
  }, [appendTemplateRequest?.id]);

  useEffect(() => {
    const previews = referenceItems.map((item) => filePreviewUrl(item.file));
    setReferencePreviews(previews);
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [referenceItems]);

  useEffect(() => () => {
    if (maskExportUrl) URL.revokeObjectURL(maskExportUrl);
  }, [maskExportUrl]);

  useEffect(() => {
    const previews = videoReferenceFiles.map(filePreviewUrl);
    setVideoReferencePreviews(previews);
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [videoReferenceFiles]);

  function appendReferenceImages(files) {
    const nextFiles = supportedReferenceFiles(files, IMAGE_REFERENCE_LIMIT);
    if (!nextFiles.length) {
      setStatus('error');
      setMessage(t('statusMessages.referenceUnsupported', '只支持 PNG / JPG / WebP 参考图。'));
      return;
    }
    if (mode === 'image') setMode('edit');
    setReferenceItems((current) => [
      ...current,
      ...nextFiles.map((file, index) => createReferenceItem(file, current.length + index === 0 ? 'identity' : 'style'))
    ].slice(0, IMAGE_REFERENCE_LIMIT));
    setStatus('idle');
    setMessage('');
  }

  function appendVideoReferenceImage(files) {
    const nextFiles = supportedReferenceFiles(files, 1);
    if (!nextFiles.length) {
      setStatus('error');
      setMessage(t('statusMessages.referenceUnsupported', '只支持 PNG / JPG / WebP 参考图。'));
      return;
    }
    setVideoReferenceFiles(nextFiles);
    setStatus('idle');
    setMessage('');
  }

  function referencePasteFiles(event) {
    const files = supportedReferenceFiles(event.clipboardData?.files, IMAGE_REFERENCE_LIMIT);
    if (!files.length) return;
    event.preventDefault();
    appendReferenceImages(files);
  }

  function videoReferencePasteFiles(event) {
    const files = supportedReferenceFiles(event.clipboardData?.files, 1);
    if (!files.length) return;
    event.preventDefault();
    appendVideoReferenceImage(files);
  }

  function removeReferenceImage(index) {
    setReferenceItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (referenceItems.length <= 1 && mode === 'edit') setMode('image');
  }

  function clearReferenceImages() {
    setReferenceItems([]);
    if (mode === 'edit') setMode('image');
    if (maskExportUrl) {
      URL.revokeObjectURL(maskExportUrl);
      setMaskExportUrl('');
    }
  }

  function handleMaskExportReady(url) {
    if (maskExportUrl) URL.revokeObjectURL(maskExportUrl);
    setMaskExportUrl(url);
    setStatus('success');
    setMessage(t('statusMessages.maskExported', 'Mask 已导出，可用于本次局部重绘。'));
    window.setTimeout(() => setStatus('idle'), 1400);
  }

  function moveReferenceImage(index, direction) {
    setReferenceItems((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function updateReferenceRole(index, role) {
    setReferenceItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, role } : item
    )));
  }

  function removeVideoReferenceImage() {
    setVideoReferenceFiles([]);
  }

  useEffect(() => {
    function handleWindowPaste(event) {
      const target = event.target;
      if (target?.closest?.('textarea, input:not([type="file"]), [contenteditable="true"]')) return;
      if (mode === 'edit' || mode === 'mask') {
        const files = supportedReferenceFiles(event.clipboardData?.files, IMAGE_REFERENCE_LIMIT);
        if (!files.length) return;
        event.preventDefault();
        appendReferenceImages(files);
      }
      if (mode === 'video') {
        const files = supportedReferenceFiles(event.clipboardData?.files, 1);
        if (!files.length) return;
        event.preventDefault();
        appendVideoReferenceImage(files);
      }
    }
    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [mode]);

  useEffect(() => {
    if (!selectedHistory) return;
    if (activeWorkspace !== 'history') {
      setMode(activeWorkspace === 'video' ? 'video' : selectedHistory.mode === 'mask' ? 'mask' : selectedHistory.mode === 'edit' ? 'edit' : 'image');
    }
    const selectedResultItems = historyResultItems(selectedHistory);
    const primaryPrompt = selectedResultItems[0]?.generationPrompt || selectedResultItems[0]?.prompt || selectedHistory.prompt || '';
    setPrompt(primaryPrompt);
    setModel(selectedHistory.model || IMAGE_MODELS[0]);
    const nextSize = normalizeSize(selectedHistory.size || '1024x1024');
    setAspect(normalizeAspect(selectedHistory.aspect || selectedHistory.aspectRatio, nextSize));
    setCustomSize(normalizeSize(selectedHistory.customSize || nextSize));
    setQuality(normalizeQuality(selectedHistory.quality));
    setResolutionTier(normalizeResolutionTier(selectedHistory.resolutionTier));
    setOutputFormat(normalizeOutputFormat(selectedHistory.outputFormat));
    setModeration(normalizeModeration(selectedHistory.moderation));
    setCount(normalizeCount(selectedHistory.count));
    setVideoModel(selectedHistory.mode === 'video' ? selectedHistory.model || selectedHistory.videoModel || VIDEO_MODELS[0] : videoModel);
    setVideoAspect(normalizeVideoAspect(selectedHistory.videoAspect || selectedHistory.aspect || selectedHistory.aspectRatio));
    setVideoDuration(normalizeVideoDuration(selectedHistory.videoDuration || selectedHistory.duration));
    setVideoFps(normalizeVideoFps(selectedHistory.videoFps || selectedHistory.fps));
    setVideoMotion(normalizeVideoMotion(selectedHistory.videoMotion));
    setVideoStyle(normalizeVideoStyle(selectedHistory.videoStyle));
    setVideoQuality(normalizeVideoQuality(selectedHistory.videoQuality));
    setNegativePrompt(selectedHistory.negativePrompt || '');
    const nextUrls = selectedResultItems.length
      ? selectedResultItems.map((result) => result.displayUrl || result.url).filter(Boolean)
      : Array.isArray(selectedHistory.displayResultUrls)
        ? selectedHistory.displayResultUrls
        : Array.isArray(selectedHistory.resultUrls)
          ? selectedHistory.resultUrls
          : [];
    setResults(selectedHistory.mode === 'video' ? [] : nextUrls);
    setVideoResults(selectedHistory.mode === 'video' ? nextUrls : []);
    setResultBatchMeta(downloadMetaFromHistoryItem(selectedHistory, selectedHistory.mode === 'video'));
    if (nextUrls.length) {
      const nextNodes = (selectedResultItems.length ? selectedResultItems : nextUrls)
        .map((result, index) => buildCanvasNodeFromHistoryItem(selectedHistory, result, index));
      setCanvasNodes(nextNodes);
      setSelectedCanvasNodeId(nextNodes[0]?.id || '');
      setCanvasView(canvasViewForNodes(nextNodes, nextNodes[0]?.id || ''));
    }
    setStatus('idle');
    setPromptSuggestion(null);
    setProgress({ stage: 'idle', percent: 0, completed: 0, total: normalizeCount(selectedHistory.count) });
    setMessage('');
  }, [selectedHistory?.id]);

  useEffect(() => {
    if (!focusSignal || !canvasNodes.length) return;
    focusCanvasOnNodes(canvasNodes, selectedCanvasNodeId);
  }, [focusSignal]);

  useEffect(() => {
    if (!imageModelOptions.some((item) => item.id === model)) {
      setModel(imageModelOptions[0]?.id || IMAGE_MODELS[0]);
    }
  }, [modelOptions?.image]);

  useEffect(() => {
    if (syncedVideoModelOptions.length && !syncedVideoModelOptions.some((item) => item.id === videoModel)) {
      setVideoModel(syncedVideoModelOptions[0].id);
    }
  }, [modelOptions?.video]);

  useEffect(() => () => {
    generationRef.current.controller?.abort();
    for (const context of generationContextsRef.current.values()) {
      context.active = false;
      context.controller?.abort();
    }
    generationContextsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!pendingCanvasGenerate) return;
    if (selectedCanvasNodeId !== pendingCanvasGenerate.nodeId) return;
    if (mode !== pendingCanvasGenerate.mode) return;
    if (prompt !== pendingCanvasGenerate.prompt) return;
    setPendingCanvasGenerate(null);
    closeCanvasEditor();
    openGenerationConfirm({
      mode: pendingCanvasGenerate.mode,
      prompt: pendingCanvasGenerate.prompt,
      rawPrompt: pendingCanvasGenerate.rawPrompt,
      workflow: pendingCanvasGenerate.workflow,
      referenceItems: pendingCanvasGenerate.referenceItems,
      referencesOpen: pendingCanvasGenerate.referencesOpen,
      selectedCanvasNodeId: pendingCanvasGenerate.nodeId,
      selectedCanvasNodeSnapshot: pendingCanvasGenerate.selectedCanvasNodeSnapshot
    });
  }, [pendingCanvasGenerate?.requestId, selectedCanvasNodeId, mode, prompt]);

  // Fire the confirm dialog for a staged node reroll once selection, prompt,
  // and (when the reroll changed the aspect) the size params have all synced.
  // Gating on `size` too is what separates this from pendingCanvasGenerate:
  // a "reroll at 16:9" must not open the confirm until setAspect/setCustomSize
  // have propagated, otherwise the task would capture the old dimensions.
  useEffect(() => {
    if (!pendingCanvasReroll) return;
    if (selectedCanvasNodeId !== pendingCanvasReroll.nodeId) return;
    if (mode !== 'image') return;
    if (prompt !== pendingCanvasReroll.prompt) return;
    if (sizeFromAspect(aspect, customSize) !== pendingCanvasReroll.size) return;
    setPendingCanvasReroll(null);
    openGenerationConfirm({
      mode: 'image',
      prompt: pendingCanvasReroll.prompt,
      rawPrompt: pendingCanvasReroll.rawPrompt,
      workflow: pendingCanvasReroll.workflow,
      referenceItems: [],
      referencesOpen: false,
      selectedCanvasNodeId: pendingCanvasReroll.nodeId,
      selectedCanvasNodeSnapshot: pendingCanvasReroll.selectedCanvasNodeSnapshot
    });
  }, [pendingCanvasReroll?.requestId, selectedCanvasNodeId, mode, prompt, aspect, customSize]);

  useEffect(() => {
    if (!pendingSuggestionGenerate) return;
    if (prompt !== pendingSuggestionGenerate.prompt) return;
    setPendingSuggestionGenerate(null);
    openGenerationConfirm();
  }, [pendingSuggestionGenerate?.requestId, prompt]);

  function applyCreativeRecipe(recipe) {
    if (!recipe) return;
    setMode((current) => current === 'video' ? current : current);
    const nextSize = normalizeSize(recipe.size);
    setAspect(normalizeAspect(recipe.aspect, nextSize));
    setCustomSize(nextSize);
    setQuality(normalizeQuality(recipe.quality));
    setResolutionTier(normalizeResolutionTier(recipe.resolutionTier));
    setActiveRecipeId(recipe.id);
    setPrompt((current) => {
      const base = stripCreativeRecipePrompt(current);
      if (!base) return recipe.prompt;
      if (base.includes(recipe.prompt)) return base;
      return `${base}\n\n${CREATIVE_RECIPE_PREFIX}${recipe.prompt}`;
    });
    setStatus('idle');
    setMessage('');
  }

  async function applyPromptPreset(item) {
    if (!item?.id) return;
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setCaseResolving(true);
    try {
      const historyClient = createHistoryClient({ session: loadSession() });
      const preset = await historyClient.getPromptPreset(item.id);
      if (preset?.prompt) {
        setPrompt(preset.prompt);
        updateLayoutSections({ bottomComposer: true });
      }
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || '快捷提示词读取失败。');
    } finally {
      setCaseResolving(false);
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function optimizeCurrentPrompt() {
    // Use the same prompt-composition path the generator uses, so that
    // optimizing while a canvas node is selected (and the composer is
    // empty) optimizes the node's prompt instead of erroring out. The
    // previous implementation only read `prompt.trim()`, which made the
    // "optimize" button unusable from the canvas-continuation flow even
    // though the error message promised it would work.
    const currentPrompt = composedGenerationPrompt().trim();
    if (!currentPrompt) {
      setStatus('error');
      setMessage(caseResolving
        ? t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。')
        : t('statusMessages.promptRequired', '请先填写提示词，或先选中一个画布节点继续。'));
      return;
    }
    if (caseResolving) {
      setStatus('error');
      setMessage(t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。'));
      return;
    }
    if (optimizingPrompt) return;
    if (usesGatewayAccount(promptAssistantSettings) && !isAuthenticated) {
      saveDraft({
        caseId: selectedCase?.id || null,
        mode,
        prompt: currentPrompt,
        model,
        ...draftParameters(),
        ...videoDraftParameters()
      });
      onRequireLogin();
      return;
    }
    const providerRequest = resolveProviderRequest(promptAssistantSettings, apiKey);
    if (!providerRequest.apiKey || !providerRequest.gatewayBaseUrl) {
      setStatus('error');
      setMessage(providerSetupMessage(promptAssistantSettings, providerRequest, t));
      onOpenSettings();
      return;
    }
    setOptimizingPrompt(true);
    setStatus('loading');
    setMessage(t('statusMessages.optimizingPrompt', '正在优化提示词'));
    try {
      const result = await promptAssistantClient.optimizePrompt({
        ...providerRequest,
        model: promptAssistantSettings.responsesModel,
        prompt: currentPrompt,
        instruction: promptInstruction.trim(),
        size,
        aspectRatio: aspect,
        quality,
        resolutionTier: RESOLUTION_TIER_LABELS[resolutionTier] || resolutionTier,
        onPartial: (text) => {
          const parsed = parseOptimizedPrompt(text);
          if (parsed) setPromptSuggestion(parsed);
          setMessage(t('statusMessages.receivingSuggestion', '正在接收优化建议'));
        }
      });
      setPromptSuggestion(parseOptimizedPrompt(result.prompt));
      setStatus('success');
      setMessage(t('statusMessages.suggestionReady', '已生成优化建议，可合并或替换。'));
      window.setTimeout(() => setStatus('idle'), 1200);
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || t('statusMessages.optimizeFailed', '优化失败'));
    } finally {
      setOptimizingPrompt(false);
    }
  }

  async function sendAssistantMessage() {
    const userText = assistantUserInstruction();
    if (!userText) {
      setStatus('error');
      setMessage(t('statusMessages.assistantInputRequired', '请先输入你想让 AI 帮你整理的创作想法。'));
      return;
    }
    if (caseResolving) {
      setStatus('error');
      setMessage(t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。'));
      return;
    }
    if (optimizingPrompt) return;
    if (usesGatewayAccount(promptAssistantSettings) && !isAuthenticated) {
      saveDraft({
        caseId: selectedCase?.id || null,
        mode,
        prompt: userText,
        model,
        ...draftParameters(),
        ...videoDraftParameters()
      });
      onRequireLogin();
      return;
    }
    const providerRequest = resolveProviderRequest(promptAssistantSettings, apiKey);
    if (!providerRequest.apiKey || !providerRequest.gatewayBaseUrl) {
      setStatus('error');
      setMessage(providerSetupMessage(promptAssistantSettings, providerRequest, t));
      onOpenSettings();
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText
    };
    const pendingMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: t('statusMessages.assistantPending', '正在整理创作提示词...'),
      pending: true
    };
    const nextMessages = [...assistantMessages, userMessage];
    setAssistantMessages([...nextMessages, pendingMessage]);
    setOptimizingPrompt(true);
    setStatus('loading');
    setMessage(t('statusMessages.assistantCalling', '正在调用对话模型'));
    try {
      const result = await promptAssistantClient.chatPromptAssistant({
        ...providerRequest,
        model: promptAssistantSettings.responsesModel,
        prompt: selectedCanvasNode ? userText : composedGenerationPrompt(),
        basePrompt: wantsPromptRewrite(userText) ? '' : assistantBasePrompt(),
        userInstruction: userText,
        selectedCanvasLabel: selectedCanvasNode ? `#${selectedCanvasNode.canvasIndex || ''}` : '',
        messages: nextMessages.map((item) => ({ role: item.role, content: item.content })),
        size,
        aspectRatio: aspect,
        quality,
        resolutionTier: RESOLUTION_TIER_LABELS[resolutionTier] || resolutionTier,
        onPartial: (text) => {
          const parsed = parseAssistantReply(text);
          setAssistantMessages((current) => current.map((item) => item.id === pendingMessage.id ? {
            ...item,
            content: parsed?.reply || text || t('statusMessages.assistantPending', '正在整理创作提示词...'),
            pending: true
          } : item));
        }
      });
      const parsed = parseAssistantReply(result.text);
      if (parsed?.finalPrompt) {
        setPromptSuggestion({
          finalPrompt: parsed.finalPrompt,
          raw: result.text
        });
      }
      setAssistantMessages((current) => current.map((item) => item.id === pendingMessage.id ? {
        ...item,
        content: parsed?.reply || result.text,
        finalPrompt: parsed?.finalPrompt || '',
        pending: false
      } : item));
      setStatus('success');
      setMessage(parsed?.finalPrompt
        ? t('statusMessages.assistantReady', '已整理为可生成提示词。')
        : t('statusMessages.assistantReplied', '助手已回复。'));
      window.setTimeout(() => setStatus('idle'), 1200);
    } catch (error) {
      setAssistantMessages((current) => current.map((item) => item.id === pendingMessage.id ? {
        ...item,
        content: error?.message || t('statusMessages.assistantFailed', '对话模型调用失败'),
        pending: false,
        failed: true
      } : item));
      setStatus('error');
      setMessage(error?.message || t('statusMessages.assistantFailed', '对话模型调用失败'));
    } finally {
      setOptimizingPrompt(false);
    }
  }

  function mergeSuggestion() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    setPrompt(`${prompt.trim()}\n\n${t('statusMessages.suggestionMergePrefix', '补充优化：')}\n${nextPrompt}`.trim());
    setPromptSuggestion(null);
  }

  function replaceSuggestion() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    setPrompt(nextPrompt);
    setPromptSuggestion(null);
  }

  async function copySuggestion() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    await navigator.clipboard.writeText(nextPrompt);
    setStatus('success');
    setMessage(t('statusMessages.suggestionCopied', '优化建议已复制。'));
    window.setTimeout(() => setStatus('idle'), 1200);
  }

  function useSuggestionForGenerate() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    setPrompt(nextPrompt);
    setPromptSuggestion(null);
    setPendingSuggestionGenerate({
      prompt: nextPrompt,
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  async function videoReferenceDataUrl() {
    const file = videoReferenceFiles[0];
    if (!file) return '';
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('REFERENCE_IMAGE_READ_FAILED'));
      reader.readAsDataURL(file);
    });
  }

  function buildGenerationTask(overrides = {}) {
    const taskMode = overrides.mode || mode;
    const taskNode = overrides.selectedCanvasNodeSnapshot
      || (workspaceFlowMode === 'canvas' ? selectedCanvasNode : null);
    const rawPrompt = typeof overrides.rawPrompt === 'string' ? overrides.rawPrompt : prompt.trim();
    const canContinueCanvas = workspaceFlowMode === 'canvas'
      && taskNode
      && (taskMode === 'image' || taskMode === 'video')
      && rawPrompt;
    let taskOverrides = { ...overrides };
    if (canContinueCanvas) {
      const continuationPlan = buildCanvasContinuationPlan(taskNode, rawPrompt, { mode: taskMode });
      taskOverrides = {
        ...taskOverrides,
        rawPrompt,
        workflow: taskOverrides.workflow || continuationPlan.workflow,
        prompt: typeof taskOverrides.prompt === 'string' ? taskOverrides.prompt : continuationPlan.generationPrompt
      };
    } else if (rawPrompt && typeof taskOverrides.rawPrompt !== 'string') {
      taskOverrides.rawPrompt = rawPrompt;
    }
    const fallbackPrompt = taskOverrides.prompt || (workspaceFlowMode === 'canvas'
      ? composedGenerationPrompt()
      : rawPrompt);
    return buildGenerationTaskPure({
      mode: taskMode,
      model,
      aspect,
      customSize,
      size,
      quality,
      resolutionTier,
      outputFormat,
      moderation,
      countValue,
      videoModel,
      videoAspect,
      videoDuration,
      videoFps,
      videoMotion,
      videoStyle,
      videoQuality,
      negativePrompt,
      referenceItems,
      videoReferenceFiles,
      selectedCanvasNode: taskNode,
      selectedCanvasNodeId: workspaceFlowMode === 'canvas' ? selectedCanvasNodeId : '',
      sessionId,
      providerSettings,
      layoutSectionsReferences: layoutSections.references,
      maskFile: mode === 'mask' ? maskEditorRef.current?.exportMask?.() || null : null,
      fallbackPrompt
    }, taskOverrides);
  }

  function markGenerationTask(id, patch) {
    commitGenerationQueue(replaceGenerationQueueItem(generationQueueRef.current, id, patch));
  }

  function cancelGenerationTask(id) {
    const target = generationQueueRef.current.find((item) => item.id === id);
    if (!target) return;
    if (target.remote && target.serverJobId) {
      const historyClient = createHistoryClient({ session: loadSession() });
      const targetContext = generationContextsRef.current.get(target.id);
      if (targetContext?.remoteJobId === target.serverJobId) {
        targetContext.active = false;
        targetContext.controller?.abort(new Error('JOB_CANCELED'));
        generationContextsRef.current.delete(target.id);
        if (generationRef.current.taskKey === target.id) {
          generationRef.current = { id: generationRef.current.id + 1, controller: null };
        }
      }
      markGenerationTask(id, { status: 'canceled', completedAt: Date.now() });
      setStatus('error');
      setProgress((current) => ({
        ...current,
        stage: 'failed',
        percent: 0
      }));
      historyClient.cancelGenerationJob(target.serverJobId)
        .then((job) => {
          if (job?.id) syncRemoteGenerationJob(job);
          setMessage(serverJobMessage(job || { status: 'canceled' }, t));
        })
        .catch(() => {
          setMessage(t('statusMessages.queueCancelFailed', '已从本页移除队列项；服务端取消失败，请稍后查看历史图库确认结果。'));
        });
      return;
    }
    if (target.status === 'running') {
      stopGeneration(id);
      return;
    }
    commitGenerationQueue(replaceGenerationQueueItem(generationQueueRef.current, id, { status: 'canceled', completedAt: Date.now() }));
    setMessage(t('statusMessages.queueCanceled', '已取消排队任务。'));
  }

  function retryGenerationTask(id) {
    const target = generationQueueRef.current.find((item) => item.id === id);
    if (!target) return;
    const retryResult = retryGenerationQueueTask(generationQueueRef.current, id, {
      createId: createGenerationTaskId,
      fallbackSummary: t('statusMessages.queueRetryFallbackSummary', '重试生成任务')
    });
    if (retryResult.blocked) {
      setStatus('error');
      setMessage(t('statusMessages.queueRemoteRetryBlocked', '这个任务来自服务端恢复记录，不能安全自动重提；请先确认历史图库没有新结果，再用当前提示词重新生成。'));
      return;
    }
    commitGenerationQueue(retryResult.queue);
    setMessage(t('statusMessages.queueRetryAdded', '已重新加入生成队列。'));
    runGenerationQueue();
  }

  function acknowledgeGenerationTask(id) {
    const target = generationQueueRef.current.find((item) => item.id === id);
    commitGenerationQueue(removeGenerationQueueItem(generationQueueRef.current, id));
    if (target?.status === 'unknown') {
      setMessage(t('statusMessages.queueUnknownDismissed', '已收起结果未知的任务；请稍后查看历史图库，如果没有新结果再重试。'));
    } else {
      setMessage(t('statusMessages.queueDismissed', '已收起队列提示。'));
    }
  }

  function validateGenerationTask(task) {
    if (!task.prompt) {
      setStatus('error');
      setMessage(caseResolving
        ? t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。')
        : t('statusMessages.promptRequired', '请先填写提示词，或先选中一个画布节点继续。'));
      return false;
    }
    const taskCanvasReference = task.selectedCanvasNodeSnapshot;
    const taskUsesCanvasReference = Boolean(taskCanvasReference && taskCanvasReference.kind !== 'video' && taskCanvasReference.url && (task.mode === 'edit' || task.mode === 'mask'));
    const taskReferenceCount = Array.isArray(task.referenceItems) ? task.referenceItems.filter((item) => item?.file).length : 0;
    if ((task.mode === 'edit' || task.mode === 'mask') && !taskReferenceCount && !taskUsesCanvasReference) {
      setStatus('error');
      setMessage(task.mode === 'mask'
        ? t('statusMessages.maskModeReferenceRequired', '请先在 Mask 模式上传参考图。')
        : t('statusMessages.referenceRequired', '请先上传参考图。'));
      return false;
    }
    if (task.mode === 'mask' && !task.maskFile) {
      setStatus('error');
      setMessage(t('statusMessages.maskEditorRequired', '请先在 Mask 编辑器里上传参考图并涂抹要重绘的区域。'));
      return false;
    }
    if (task.mode === 'video' && (!hasSyncedVideoModels || !task.videoModel)) {
      setStatus('error');
      setMessage(modelsStatus === 'loading'
        ? t('statusMessages.videoModelsLoadingWait', '正在读取当前 Key 的视频模型，请稍后。')
        : t('statusMessages.videoModelsUnavailable', '当前 Key 没有开放视频模型。'));
      showComposerForGeneration();
      return false;
    }
    const activeCount = activeGenerationQueueCount(generationQueueRef.current);
    if (GENERATION_QUEUE_LIMIT > 0 && activeCount >= GENERATION_QUEUE_LIMIT) {
      setStatus('error');
      setMessage(t('statusMessages.queueLimit', '当前队列已满，最多保留 {count} 个待生成任务。', { count: GENERATION_QUEUE_LIMIT }));
      return false;
    }
    const duplicateTask = findDuplicateActiveGenerationTask(generationQueueRef.current, task.fingerprint);
    if (duplicateTask) {
      setStatus('error');
      setMessage(t('statusMessages.duplicateGenerationTask', '相同的生成请求已经在队列中，请等它完成或先取消后再提交。'));
      showComposerForGeneration();
      return false;
    }
    return true;
  }

  function enqueueGenerationTask(task) {
    if (!validateGenerationTask(task)) return false;
    const activeCount = activeGenerationQueueCount(generationQueueRef.current);
    const availableSlots = GENERATION_CONCURRENCY > 0
      ? Math.max(0, GENERATION_CONCURRENCY - activeCount)
      : Number.POSITIVE_INFINITY;
    showComposerForGeneration();
    commitGenerationQueue(appendGenerationQueueTask(generationQueueRef.current, task));
    setMessage(activeCount && availableSlots > 0
      ? GENERATION_CONCURRENCY > 0
        ? t('statusMessages.parallelStarted', '已加入并行生成，当前将同时运行 {count}/{limit} 个任务。', {
          count: Math.min(GENERATION_CONCURRENCY, activeCount + 1),
          limit: GENERATION_CONCURRENCY
        })
        : t('statusMessages.parallelStartedUnlimited', '已加入并行生成，工作台不设置并发上限。')
      : activeCount
        ? t('statusMessages.queueAddedBehind', '当前并发已满，已进入等待队列，前面还有 {count} 个任务。', { count: activeCount })
        : t('statusMessages.queueAdded', '已开始生成。'));
    runGenerationQueue();
    return true;
  }

  function enqueueGeneration(overrides = {}) {
    return enqueueGenerationTask(buildGenerationTask(overrides));
  }

  function enqueueIndependentImageBatch(task) {
    const total = Math.max(1, normalizeCount(task?.count));
    if (task?.mode === 'video' || total <= 1) return enqueueGenerationTask(task);
    const batchId = createGenerationTaskId();
    batchTaskResultsRef.current.clear();
    setResults([]);
    setResultBatchMeta({ ...task, batchId, batchTotal: total, count: total });
    let accepted = 0;
    for (let index = 0; index < total; index += 1) {
      const batchTask = {
        ...task,
        id: `${batchId}-${index + 1}`,
        status: 'queued',
        createdAt: Date.now() + index,
        count: 1,
        batchId,
        batchIndex: index,
        batchTotal: total,
        fingerprint: buildQueuedImageTaskFingerprint({
          sessionId,
          mode: task.mode,
          route: task.mode === 'edit' || task.mode === 'mask' ? 'edits' : 'generations',
          providerId: providerSettings.providerId,
          apiKeySource: providerSettings.apiKeySource,
          model: task.model,
          prompt: task.prompt,
          size: task.size,
          quality: task.quality,
          resolutionTier: task.resolutionTier,
          outputFormat: task.outputFormat,
          moderation: task.moderation,
          count: 1,
          batchKey: `${batchId}:${index}`,
          selectedCanvasNodeId: task.selectedCanvasNodeId,
          referenceCount: task.referenceItems?.length || 0,
          hasMask: Boolean(task.maskFile)
        })
      };
      if (enqueueGenerationTask(batchTask)) accepted += 1;
    }
    if (accepted > 1) {
      setMessage(t('statusMessages.batchStarted', '已拆分为 {count} 个独立任务，正在批量生成。', { count: accepted }));
    }
    return accepted > 0;
  }

  function runGenerationQueue() {
    if (generationQueueRunnerRef.current) return;
    generationQueueRunnerRef.current = true;
    while (
      (!GENERATION_CONCURRENCY || generationQueueActiveCountRef.current < GENERATION_CONCURRENCY)
      && firstQueuedGenerationTask(generationQueueRef.current)
    ) {
        const nextTask = firstQueuedGenerationTask(generationQueueRef.current);
        if (!nextTask) break;
        if (nextTask.remote || nextTask.restorable === false) {
          markGenerationTask(nextTask.id, {
            status: 'failed',
            completedAt: Date.now(),
            summary: `${nextTask.summary || nextTask.prompt || t('composer.queue', '排队任务')}${t('statusMessages.queueRestoredUnsafeSuffix', '（刷新后不能安全自动重提）')}`
          });
          continue;
        }
        markGenerationTask(nextTask.id, { status: 'running', startedAt: Date.now() });
        applyGenerationTaskSnapshot(nextTask);
        generationQueueActiveCountRef.current += 1;
        Promise.resolve()
          .then(() => generate({ fromQueue: true, queueTaskId: nextTask.id, task: nextTask, maskFile: nextTask.maskFile || null }))
          .then((succeeded) => {
            const currentTask = generationQueueRef.current.find((item) => item.id === nextTask.id);
            if (currentTask?.status === 'running') {
              markGenerationTask(nextTask.id, {
                status: succeeded ? 'done' : 'failed',
                completedAt: Date.now()
              });
            }
          })
          .catch(() => {
            markGenerationTask(nextTask.id, { status: 'failed', completedAt: Date.now() });
          })
          .finally(() => {
            generationQueueActiveCountRef.current = Math.max(0, generationQueueActiveCountRef.current - 1);
            generationQueueRunnerRef.current = false;
            runGenerationQueue();
          });
    }
    generationQueueRunnerRef.current = false;
  }

  async function generationFilesForJob(files) {
    return generationFilesForJobPure(files, IMAGE_REFERENCE_LIMIT);
  }


  function syncServerJobTiming(job) {
    if (!job?.timing || typeof job.timing !== 'object') return;
    setTiming((current) => serverJobTimingPatch(job, current));
  }

  async function waitForServerJob(historyClient, jobId, { signal, total }) {
    return waitForServerJobPure(historyClient, jobId, {
      signal,
      total,
      t,
      onProgress: setProgress,
      onMessage: setMessage,
      onTiming: (job) => setTiming((current) => serverJobTimingPatch(job, current))
    });
  }

  function publishImageResults(urls, task) {
    const nextUrls = Array.isArray(urls) ? urls : [];
    if (!task?.batchId) {
      setResults(nextUrls);
      return;
    }
    batchTaskResultsRef.current.set(task.id, nextUrls);
    setResults([...batchTaskResultsRef.current.values()].flat());
  }

  async function generate(options = {}) {
    const task = options.task || null;
    const activeMode = task?.mode || mode;
    const configuredImageModel = String(providerSettings.imageGenerationModel || '').trim();
    const configuredEditModel = String(providerSettings.imageEditModel || '').trim();
    const configuredVideoModel = String(providerSettings.videoModel || '').trim();
    const activeModel = task?.model
      || ((activeMode === 'edit' || activeMode === 'mask') ? configuredEditModel : configuredImageModel)
      || model;
    const activePrompt = task?.prompt || (workspaceFlowMode === 'canvas'
      ? composedGenerationPrompt()
      : prompt.trim());
    const activeSelectedNode = task?.selectedCanvasNodeSnapshot
      || (workspaceFlowMode === 'canvas' ? selectedCanvasNode : null);
    const activeWorkflow = task?.workflow || (
      workspaceFlowMode === 'canvas'
      && activeSelectedNode
      && (activeMode === 'image' || activeMode === 'video')
        ? buildCanvasContinuationPlan(activeSelectedNode, task?.rawPrompt || prompt.trim(), { mode: activeMode }).workflow
        : null
    );
    const activeLineageParentId = workspaceFlowMode === 'canvas' ? activeSelectedNode?.id || '' : '';
    const activeReferenceItems = Array.isArray(task?.referenceItems) ? task.referenceItems : referenceItems;
    const activeReferenceFiles = task?.referenceItems?.map((item) => item.file).filter(Boolean) || referenceFiles;
    const activeVideoReferenceFiles = task?.videoReferenceFiles || videoReferenceFiles;
    const activeIsImageEditMode = activeMode === 'edit' || activeMode === 'mask';
    const activeSize = task?.size || size;
    const activeQuality = task?.quality || quality;
    const activeResolutionTier = task?.resolutionTier || resolutionTier;
    const activeOutputFormat = task?.outputFormat || outputFormat;
    const activeModeration = task?.moderation || moderation;
    const providerAdapter = resolveProviderAdapter({
      providerId: providerSettings.providerId,
      authMode: providerSettings.apiKeySource
    });
    const videoPlan = providerAdapter.buildVideoPlan();
    const activeImageParameters = providerAdapter.normalizeImageParameters({
      size: activeSize,
      quality: activeQuality,
      resolutionTier: activeResolutionTier,
      outputFormat: activeOutputFormat,
      moderation: activeModeration,
      count: task?.count || countValue,
      n: task?.count || countValue
    });
    const normalizedActiveSize = activeImageParameters.size;
    const normalizedActiveQuality = activeImageParameters.quality;
    const normalizedActiveResolutionTier = activeImageParameters.resolutionTier;
    const normalizedActiveOutputFormat = activeImageParameters.outputFormat;
    const normalizedActiveModeration = activeImageParameters.moderation;
    const activeCount = normalizeCount(activeImageParameters.count);
    const activeVideoModel = task?.videoModel || configuredVideoModel || videoModel;
    const activeVideoAspect = task?.videoAspect || videoAspect;
    const activeVideoDuration = normalizeVideoDuration(task?.videoDuration || task?.duration || videoDuration);
    const activeVideoFps = normalizeVideoFps(task?.videoFps || task?.fps || videoFps);
    const activeVideoMotion = task?.videoMotion || videoMotion;
    const activeVideoStyle = task?.videoStyle || videoStyle;
    const activeVideoQuality = task?.videoQuality || videoQuality;
    const activeNegativePrompt = task?.negativePrompt || negativePrompt;
    const activeVideoSize = videoSizeFromAspect(activeVideoAspect);
    if (caseResolving) {
      setStatus('error');
      setMessage(t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。'));
      return false;
    }
    if (!options.fromQueue && status === 'loading' && !generationRef.current.controller) {
      setStatus('error');
      setProgress((current) => ({ ...current, stage: 'pending_review', percent: current.percent || 0 }));
      setMessage(t('statusMessages.disconnectedReview', '上一轮生成状态已经断开，请先确认历史图库/当前画布没有新结果，再点“确认重试”。'));
      return false;
    }
    if (progress.stage === 'pending_review') {
      setProgress({ stage: 'idle', percent: 0, completed: 0, total: activeCount });
      setMessage('');
    }
    const basePrompt = activePrompt;
    const lineageParentId = activeLineageParentId;
    if (!basePrompt) {
      setStatus('error');
      setMessage(caseResolving
        ? t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。')
        : t('statusMessages.promptRequired', '请先填写提示词，或先选中一个画布节点继续。'));
      return false;
    }
    const willUseCanvasReference = Boolean(activeSelectedNode && activeSelectedNode.kind !== 'video' && activeSelectedNode.url && (activeMode === 'edit' || activeMode === 'mask'));
    if (activeIsImageEditMode && !activeReferenceFiles.length && !willUseCanvasReference) {
      setStatus('error');
      setMessage(activeMode === 'mask'
        ? t('statusMessages.maskModeReferenceRequired', '请先在 Mask 模式上传参考图。')
        : t('statusMessages.referenceRequired', '请先上传参考图。'));
      return false;
    }
    let maskFile = null;
    if (activeMode === 'mask') {
      maskFile = options.maskFile || maskEditorRef.current?.exportMask?.() || null;
      if (!maskFile) {
        setStatus('error');
        setMessage(t('statusMessages.maskEditorRequired', '请先在 Mask 编辑器里上传参考图并涂抹要重绘的区域。'));
        return false;
      }
    }
    if (usesGatewayAccount(providerSettings) && !isAuthenticated) {
      saveDraft({
        caseId: selectedCase?.id || null,
        mode: activeMode,
        prompt: basePrompt,
        model: activeModel,
        ...draftParameters(),
        ...videoDraftParameters()
      });
      onRequireLogin();
      return false;
    }
    const providerRequest = resolveProviderRequest(providerSettings, apiKey);
    const activeVideoGatewayBaseUrl = String(providerSettings.videoGatewayBaseUrl || '').trim() || providerRequest.gatewayBaseUrl || '';
    const activeRouteLabel = endpointForGenerationTask({
      mode: activeMode,
      referenceCount: activeReferenceFiles.length,
      hasCanvasReference: willUseCanvasReference,
      hasMask: Boolean(maskFile),
      endpoints: {
        video: videoPlan.createEndpoint,
        edits: currentEditPlan.endpoint,
        generations: currentGenerationPlan.endpoint
      }
    });
    if (!providerRequest.apiKey || !providerRequest.gatewayBaseUrl) {
      setStatus('error');
      setMessage(providerSetupMessage(providerSettings, providerRequest, t));
      onOpenSettings();
      return false;
    }

    if (!options.fromQueue) {
      generationRef.current.controller?.abort();
      for (const context of generationContextsRef.current.values()) {
        context.active = false;
        context.controller?.abort();
      }
      generationContextsRef.current.clear();
    }
    const requestId = generationRef.current.id + 1;
    const controller = new AbortController();
    const startedAt = Date.now();
    const generationId = `${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
    const generationMeta = {
      mode: activeMode === 'video' ? 'video' : 'image',
      providerId: activeMode === 'video'
        ? activeVideoModel
        : activeModel,
      model: activeMode === 'video' ? activeVideoModel : activeModel,
      createdAt: new Date(startedAt).toISOString(),
      prompt: basePrompt,
      generationPrompt: basePrompt,
      size: activeSize,
      quality: activeQuality,
      resolutionTier: activeResolutionTier,
      outputFormat: activeOutputFormat,
      aspectRatio: activeMode === 'video' ? activeVideoAspect : (task?.aspectRatio || task?.aspect || aspect),
      moderation: normalizedActiveModeration,
      count: activeCount,
      referenceCount: activeReferenceFiles.length,
      sessionId,
      id: generationId,
      batchId: task?.batchId || '',
      batchIndex: Number(task?.batchIndex || 0),
      batchTotal: Number(task?.batchTotal || 1)
    };
    let firstByteAt = null;
    let timeoutReached = false;
    const requestKey = options.queueTaskId || generationId;
    const requestContext = {
      id: requestId,
      taskKey: requestKey,
      controller,
      remoteJobId: '',
      active: true
    };
    generationContextsRef.current.set(requestKey, requestContext);
    generationRef.current = requestContext;
    const isCurrentRequest = () => requestContext.active
      && generationContextsRef.current.get(requestKey) === requestContext;
    const stallTimer = window.setTimeout(() => {
      if (!isCurrentRequest() || firstByteAt) return;
      setMessage(t('statusMessages.upstreamStall', '上游还没有返回数据，可能正在排队或生成较慢，请继续等待。'));
      setProgress((current) => current.stage === 'request' ? { ...current, stage: 'queued', percent: Math.max(current.percent || 0, 12) } : current);
    }, GENERATION_STALL_NOTICE_MS);
    const timeoutTimer = window.setTimeout(() => {
      if (!isCurrentRequest()) return;
      timeoutReached = true;
      requestContext.active = false;
      generationContextsRef.current.delete(requestKey);
      if (generationRef.current.taskKey === requestKey) {
        generationRef.current = { id: requestId + 1, controller: null };
      }
      setStatus('error');
      setProgress((current) => ({
        ...current,
        stage: 'pending_review',
        percent: Math.max(current.percent || 0, 12)
      }));
      setMessage(t('errors.timeout', '等待时间过长，这次页面已结束等待。上游可能仍在处理，请稍后查看历史图库后再决定是否重试。'));
      const timeoutError = new Error('GENERATION_TIMEOUT');
      timeoutError.code = 'GENERATION_TIMEOUT';
      controller.abort(timeoutError);
    }, GENERATION_TIMEOUT_MS);

    showComposerForGeneration();
    setStatus('loading');
    setResultBatchMeta(generationMeta);
    setProgress({ stage: 'request', percent: 8, completed: 0, total: activeCount });
    setTiming({
      status: 'running',
      startedAt,
      firstByteAt: null,
      completedAt: null,
      model: activeMode === 'video' ? activeVideoModel : activeModel,
      routeLabel: activeRouteLabel,
      spec: activeMode === 'video' ? `${activeVideoAspect} · ${activeVideoDuration}s · ${activeVideoFps}fps` : `${normalizedActiveSize} · ${normalizedActiveQuality} · ${RESOLUTION_TIER_LABELS[normalizedActiveResolutionTier] || normalizedActiveResolutionTier}`
    });
    setMessage(t('statusMessages.submitted', '已提交'));
    try {
      if (activeMode === 'video') {
        if (!hasSyncedVideoModels || !activeVideoModel) {
          const failedAt = Date.now();
          setStatus('error');
          setProgress({ stage: 'failed', percent: 0, completed: 0, total: 1 });
          setTiming((current) => current ? { ...current, status: 'failed', completedAt: failedAt } : current);
          setMessage(modelsStatus === 'loading'
            ? t('statusMessages.videoModelsLoadingWait', '正在读取当前 Key 的视频模型，请稍后。')
            : t('statusMessages.videoModelsUnavailable', '当前 Key 没有开放视频模型。'));
          return false;
        }
        let payload = null;
        let urls = [];
        let persistedResultUrls = [];
        if (STUDIO_STANDALONE) {
          const historyClient = createHistoryClient({ session: loadSession() });
          const jobImages = await generationFilesForJob(activeVideoReferenceFiles, 1);
          const job = await historyClient.createGenerationJob(buildServerVideoGenerationJobPayload({
            serverManaged: STUDIO_STANDALONE && providerSettings.apiKeySource !== 'manual',
            apiKey: providerRequest.apiKey,
            gatewayBaseUrl: activeVideoGatewayBaseUrl,
            generationMeta,
            sessionId,
            parentCanvasNodeId: lineageParentId,
            providerId: providerSettings.providerId,
            providerProfileId: providerSettings.providerProfileId,
            apiKeySource: providerSettings.apiKeySource,
            providerLabel: providerLabel(providerSettings, apiKey),
            images: jobImages,
            model: activeVideoModel,
            prompt: basePrompt,
            generationPrompt: basePrompt,
            aspectRatio: activeVideoAspect,
            duration: activeVideoDuration,
            width: activeVideoSize.width,
            height: activeVideoSize.height,
            fps: activeVideoFps,
            motion: activeVideoMotion,
            style: activeVideoStyle,
            quality: activeVideoQuality,
            negativePrompt: activeNegativePrompt.trim(),
            workflow: activeWorkflow
          }));
          if (!job?.id) throw new Error('GENERATION_JOB_CREATE_FAILED');
          requestContext.remoteJobId = job.id;
          if (generationRef.current.taskKey === requestKey) {
            generationRef.current = { ...generationRef.current, remoteJobId: job.id };
          }
          if (options.queueTaskId) {
            markGenerationTask(options.queueTaskId, {
              serverJobId: job.id,
              remote: true,
              restorable: false,
              summary: job.prompt || basePrompt || '服务端视频任务'
            });
          } else {
            syncRemoteGenerationJob(job);
          }
          setProgress(serverJobProgress(job, 1));
          setMessage(serverJobMessage(job, t));
          const finalJob = await waitForServerJob(historyClient, job.id, { signal: controller.signal, total: 1 });
          if (!isCurrentRequest()) return false;
          if (!finalJob || finalJob.status !== 'succeeded') {
            if (finalJob?.id) syncRemoteGenerationJob(finalJob);
            const error = new Error(finalJob?.error?.message || 'GENERATION_JOB_FAILED');
            error.status = finalJob?.error?.status;
            error.code = finalJob?.status === 'unknown' ? 'GENERATION_JOB_UNKNOWN' : finalJob?.error?.code;
            error.requestId = finalJob?.error?.requestId || finalJob?.requestIds?.[0] || '';
            throw error;
          }
          persistedResultUrls = Array.isArray(finalJob.resultUrls) ? finalJob.resultUrls : [];
          urls = await Promise.all(persistedResultUrls.map((url) => historyClient.resolveAssetUrl(url).catch(() => url)));
          payload = {
            task_id: finalJob.requestIds?.[0] || finalJob.id,
            id: finalJob.requestIds?.[0] || finalJob.id,
            status: 'completed',
            video_url: urls[0] || '',
            raw: finalJob
          };
          if (!firstByteAt) {
            firstByteAt = Date.now();
            setTiming((current) => current ? { ...current, firstByteAt } : current);
          }
        } else {
          const referenceImage = activeVideoReferenceFiles[0]
            ? await fileToDataUrl(activeVideoReferenceFiles[0])
            : '';
          if (!isCurrentRequest()) return false;
          payload = await client.generateVideo({
            ...providerRequest,
            gatewayBaseUrl: activeVideoGatewayBaseUrl,
            transport: videoPlan.transport,
            createEndpoint: videoPlan.createEndpoint,
            retrieveEndpoint: videoPlan.retrieveEndpoint,
            contentEndpoint: videoPlan.contentEndpoint,
            model: activeVideoModel,
            prompt: basePrompt,
            image: referenceImage,
            duration: activeVideoDuration,
            width: activeVideoSize.width,
            height: activeVideoSize.height,
            fps: activeVideoFps,
            n: 1,
            metadata: {
              aspect_ratio: activeVideoAspect,
              camera_motion: activeVideoMotion,
              style: activeVideoStyle,
              quality_level: activeVideoQuality,
              negative_prompt: activeNegativePrompt.trim(),
              source: 'image-agent-studio'
            },
            signal: controller.signal,
            onProgress: (nextProgress) => {
              if (!isCurrentRequest()) return;
              if (!firstByteAt && nextProgress.stage && nextProgress.stage !== 'request') {
                firstByteAt = Date.now();
                setTiming((current) => current ? { ...current, firstByteAt } : current);
              }
              setVideoTask(nextProgress.task || null);
              setProgress((current) => ({ ...current, ...nextProgress }));
              setMessage(progressText(nextProgress, t('progress.videoGenerating', '视频生成中')));
            }
          });
          urls = getVideoUrls(payload);
        }
        if (!isCurrentRequest()) return false;
        if (!urls.length) {
          throw new Error('视频任务已完成，但没有返回视频地址。');
        }
        setResults([]);
        setVideoResults(urls);
        appendCanvasNodes(urls, {
          kind: 'video',
          parentId: lineageParentId,
          promptText: basePrompt,
          workflow: activeWorkflow,
          downloadMeta: generationMeta,
          title: '视频结果'
        });
        setVideoTask(payload);
      setProgress({ stage: 'completed', percent: 100, completed: 1, total: 1 });
      const completedAt = Date.now();
      setTiming((current) => current ? { ...current, status: 'completed', firstByteAt: current.firstByteAt || firstByteAt || completedAt, completedAt } : current);
      clearDraft();
      if (!options.fromQueue) setPrompt('');
      setStatus('success');
      setMessage(t('statusMessages.videoDone', '视频生成完成。'));
        const historyId = generationMeta.id;
        const historyCreatedAt = generationMeta.createdAt;
        onHistoryAdd({
          id: historyId,
          sessionId,
          createdAt: historyCreatedAt,
          mode: 'video',
          kind: 'video',
          providerId: generationMeta.providerId,
          prompt: basePrompt,
          generationPrompt: basePrompt,
          workflow: activeWorkflow,
          model: activeVideoModel,
          aspect: activeVideoAspect,
          aspectRatio: activeVideoAspect,
          videoAspect: activeVideoAspect,
          videoAspectRatio: activeVideoAspect,
          duration: activeVideoDuration,
          videoDuration: activeVideoDuration,
          fps: activeVideoFps,
          videoFps: activeVideoFps,
          videoMotion: activeVideoMotion,
          videoStyle: activeVideoStyle,
          videoQuality: activeVideoQuality,
          negativePrompt: activeNegativePrompt.trim(),
          width: activeVideoSize.width,
          height: activeVideoSize.height,
          taskId: payload.task_id || payload.id || '',
          usageSummary: payloadUsageSummary(payload.raw || payload),
          timing: {
            startedAt,
            firstByteMs: (firstByteAt || completedAt) - startedAt,
            totalMs: completedAt - startedAt
          },
          resultUrls: persistedResultUrls.length ? persistedResultUrls : storedResultUrls(urls),
          case: selectedCase ? {
            id: selectedCase.id,
            title: selectedCase.title,
            image: selectedCase.image || selectedCase.image_url || '',
            imageAlt: selectedCase.imageAlt,
            promptPreview: selectedCase.promptPreview,
            category: selectedCase.category
          } : null
        });
        if (usesGatewayAccount(providerSettings)) onProfileRefresh();
        return true;
      }

      const canvasReferenceFiles = willUseCanvasReference ? await selectedCanvasReferenceFiles(activeSelectedNode) : [];
      if (!isCurrentRequest()) return false;
      const editReferenceFiles = [...canvasReferenceFiles, ...activeReferenceFiles].slice(0, IMAGE_REFERENCE_LIMIT);
      const shouldUseImageEdits = imageGenerationRouteForMode({
        mode: activeMode,
        referenceCount: editReferenceFiles.length,
        hasMask: Boolean(maskFile)
      }) === 'edits';
      // Attach per-reference role guidance only when uploaded references are
      // actually part of the request. Canvas continuation references carry no
      // user-assigned role, so we key the hint off the rail's activeReferenceItems.
      const promptWithRoleHint = editReferenceFiles.length
        ? withReferenceRoleHint(basePrompt, activeReferenceItems, t)
        : basePrompt;
      const effectivePrompt = withResolutionHint(promptWithRoleHint, normalizedActiveResolutionTier, t);
      generationMeta.generationPrompt = effectivePrompt;
      generationMeta.referenceCount = editReferenceFiles.length;
      setResultBatchMeta((current) => current?.id === generationMeta.id
        ? { ...current, generationPrompt: effectivePrompt, referenceCount: editReferenceFiles.length }
        : current);
      let payload = null;
      let urls = [];
      let persistedResultUrls = [];
      const canUseServerJob = providerSettings.apiKeySource === 'linked'
        ? Boolean(providerRequest.providerConnectionId && isAuthenticated)
        : Boolean(providerRequest.apiKey && providerRequest.gatewayBaseUrl && (isAuthenticated || providerSettings.apiKeySource === 'manual'));
      if (canUseServerJob) {
        try {
          const historyClient = createHistoryClient({ session: loadSession() });
          const jobImages = shouldUseImageEdits ? await generationFilesForJob(editReferenceFiles) : [];
          const jobMask = maskFile ? {
            name: maskFile.name || 'mask.png',
            type: maskFile.type || 'image/png',
            dataUrl: await fileToDataUrl(maskFile)
          } : null;
          if (!isCurrentRequest()) return false;
          const imageRoute = shouldUseImageEdits ? 'edits' : 'generations';
          const job = await historyClient.createGenerationJob(buildServerImageGenerationJobPayload({
            serverManaged: STUDIO_STANDALONE && providerSettings.apiKeySource !== 'manual',
            apiKey: providerRequest.apiKey,
            gatewayBaseUrl: providerRequest.gatewayBaseUrl,
            images: jobImages,
            mask: jobMask,
            generationMeta,
            sessionId,
            parentCanvasNodeId: lineageParentId,
            providerId: providerSettings.providerId,
            providerProfileId: providerSettings.providerProfileId,
            apiKeySource: providerSettings.apiKeySource,
            providerLabel: providerLabel(providerSettings, apiKey),
            mode: activeMode,
            route: imageRoute,
            model: activeModel,
            prompt: basePrompt,
            generationPrompt: effectivePrompt,
            size: normalizedActiveSize,
            quality: normalizedActiveQuality,
            resolutionTier: normalizedActiveResolutionTier,
            outputFormat: normalizedActiveOutputFormat,
            moderation: normalizedActiveModeration,
            count: activeCount,
            batchId: task?.batchId || '',
            batchIndex: task?.batchIndex || 0,
            referenceCount: editReferenceFiles.length,
            hasMask: Boolean(maskFile),
            workflow: activeWorkflow
          }));
          if (!job?.id) throw new Error('GENERATION_JOB_CREATE_FAILED');
          requestContext.remoteJobId = job.id;
          if (generationRef.current.taskKey === requestKey) {
            generationRef.current = { ...generationRef.current, remoteJobId: job.id };
          }
          if (options.queueTaskId) {
            markGenerationTask(options.queueTaskId, {
              serverJobId: job.id,
              remote: true,
              restorable: false,
              summary: job.prompt || basePrompt || '服务端生成任务'
            });
          } else {
            syncRemoteGenerationJob(job);
          }
          setProgress(serverJobProgress(job, activeCount));
          setMessage(serverJobMessage(job, t));
          const finalJob = await waitForServerJob(historyClient, job.id, { signal: controller.signal, total: activeCount });
          if (!isCurrentRequest()) return false;
          if (!finalJob || finalJob.status !== 'succeeded') {
            if (finalJob?.id) syncRemoteGenerationJob(finalJob);
            const error = new Error(finalJob?.error?.message || 'GENERATION_JOB_FAILED');
            error.status = finalJob?.error?.status;
            error.code = finalJob?.status === 'unknown' ? 'GENERATION_JOB_UNKNOWN' : finalJob?.error?.code;
            error.requestId = finalJob?.error?.requestId || finalJob?.requestIds?.[0] || '';
            throw error;
          }
          persistedResultUrls = Array.isArray(finalJob.resultUrls) ? finalJob.resultUrls : [];
          urls = await Promise.all(persistedResultUrls.map((url) => historyClient.resolveAssetUrl(url).catch(() => url)));
          if (!isCurrentRequest()) {
            revokeBlobUrls(urls);
            return false;
          }
          payload = {
            data: urls.map((url) => ({ url })),
            usage: finalJob.usage,
            job: finalJob
          };
          if (!firstByteAt) {
            firstByteAt = Date.now();
            setTiming((current) => current ? { ...current, firstByteAt } : current);
          }
        } catch (error) {
          if (requestContext.remoteJobId) throw error;
          if (!canUseClientGenerationFallback()) {
            throw error;
          }
          setMessage(t('statusMessages.serviceQueueFallback', '服务端队列暂不可用，已切换为本页直连生成。'));
        }
      }
      if (!payload) {
        const request = {
          ...providerRequest,
          model: activeModel,
          prompt: effectivePrompt,
          size: normalizedActiveSize,
          quality: normalizedActiveQuality,
          outputFormat: normalizedActiveOutputFormat,
          moderation: normalizedActiveModeration,
          n: activeCount,
          signal: controller.signal,
          onPartial: (partialUrls) => {
            if (!isCurrentRequest()) return;
            if (!firstByteAt) {
              firstByteAt = Date.now();
              setTiming((current) => current ? { ...current, firstByteAt } : current);
            }
            publishImageResults(partialUrls, task);
            if (partialUrls.length) {
              appendCanvasNodes(partialUrls, {
                kind: 'image',
                parentId: lineageParentId,
                promptText: basePrompt,
                workflow: activeWorkflow,
                downloadMeta: generationMeta,
                title: t('statusMessages.previewTitle', '预览结果'),
                replaceBatchId: generationMeta.id
              });
            }
            setMessage(t('statusMessages.previewReceived', '收到预览'));
          },
          onProgress: (nextProgress) => {
            if (!isCurrentRequest()) return;
            if (!firstByteAt && nextProgress.stage && nextProgress.stage !== 'request') {
              firstByteAt = Date.now();
              setTiming((current) => current ? { ...current, firstByteAt } : current);
            }
            setProgress((current) => ({ ...current, ...nextProgress }));
            setMessage(progressText(nextProgress, t('statusMessages.generating', '生成中')));
          }
        };
        payload = shouldUseImageEdits
          ? await client.editImage({ ...request, images: editReferenceFiles, mask: maskFile })
          : await client.generateImage({ ...request, route: 'images', referenceImages: [] });
        urls = getImageUrls(payload);
      }
      if (!isCurrentRequest()) return false;
      if (!urls.length) {
        throw new Error(t('statusMessages.noImagesReturned', '请求完成，但没有返回图片。'));
      }
      publishImageResults(urls, task);
      appendCanvasNodes(urls, {
        kind: 'image',
        parentId: lineageParentId,
        promptText: basePrompt,
        workflow: activeWorkflow,
        downloadMeta: generationMeta,
        title: t('statusMessages.resultTitle', '生成结果'),
        replaceBatchId: generationMeta.id,
        persistedUrls: persistedResultUrls
      });
      setProgress({ stage: 'completed', percent: 100, completed: urls.length, total: activeCount || urls.length || 1 });
      const completedAt = Date.now();
      setTiming((current) => current ? { ...current, status: 'completed', firstByteAt: current.firstByteAt || firstByteAt || completedAt, completedAt } : current);
      clearDraft();
      if (!options.fromQueue) setPrompt('');
      setStatus('success');
      setMessage(urls.length
        ? t('statusMessages.imageDone', '生成完成。')
        : t('statusMessages.noImagesReturned', '请求完成，但没有返回图片。'));
      const historyId = generationMeta.id;
      const historyCreatedAt = generationMeta.createdAt;
      onHistoryAdd({
        id: historyId,
        sessionId,
        createdAt: historyCreatedAt,
        mode: activeMode,
        providerId: generationMeta.providerId,
        prompt: basePrompt,
        generationPrompt: effectivePrompt,
        workflow: activeWorkflow,
        model: activeModel,
        aspect: task?.aspect || aspect,
        aspectRatio: task?.aspectRatio || task?.aspect || aspect,
        customSize: task?.customSize || customSize,
        size: normalizedActiveSize,
        quality: normalizedActiveQuality,
        resolutionTier: normalizedActiveResolutionTier,
        outputFormat: normalizedActiveOutputFormat,
        moderation: normalizedActiveModeration,
        count: activeCount,
        usageSummary: payloadUsageSummary(payload),
        timing: {
          startedAt,
          firstByteMs: (firstByteAt || completedAt) - startedAt,
          totalMs: completedAt - startedAt
        },
        resultUrls: persistedResultUrls.length ? persistedResultUrls : storedResultUrls(urls),
        case: selectedCase ? {
          id: selectedCase.id,
          title: selectedCase.title,
          image: selectedCase.image || selectedCase.image_url || '',
          imageAlt: selectedCase.imageAlt,
          promptPreview: selectedCase.promptPreview,
          category: selectedCase.category
        } : null
      });
      if (usesGatewayAccount(providerSettings)) onProfileRefresh();
      return true;
    } catch (error) {
      if (!isCurrentRequest() && !timeoutReached) return false;
      setStatus('error');
      const failedAt = Date.now();
      setTiming((current) => current ? { ...current, status: 'failed', firstByteAt: current.firstByteAt || firstByteAt, completedAt: failedAt } : current);
      const displayError = timeoutReached && error?.name === 'AbortError'
        ? Object.assign(new Error('GENERATION_TIMEOUT'), { code: 'GENERATION_TIMEOUT' })
        : error;
      setProgress((current) => ({
        ...current,
        stage: timeoutReached || firstByteAt ? 'pending_review' : 'failed',
        percent: current.percent || 0
      }));
      setMessage(generationErrorMessage(displayError, t));
      return false;
    } finally {
      const wasForeground = generationRef.current.taskKey === requestKey;
      requestContext.active = false;
      generationContextsRef.current.delete(requestKey);
      if (wasForeground) {
        generationRef.current = { id: requestId, controller: null };
      }
      window.clearTimeout(stallTimer);
      window.clearTimeout(timeoutTimer);
    }
  }

  function stopGeneration(taskId = '') {
    const activeGeneration = taskId
      ? generationContextsRef.current.get(taskId)
        || (generationRef.current.taskKey === taskId ? generationRef.current : null)
      : generationRef.current;
    if (!activeGeneration?.controller) return;
    const currentRunningTask = generationQueueRef.current.find((item) => (
      item.status === 'running' && (!taskId || item.id === taskId)
    ));
    const remoteJobId = activeGeneration.remoteJobId || currentRunningTask?.serverJobId || '';
    const stoppedError = new Error('GENERATION_STOPPED');
    stoppedError.code = 'GENERATION_STOPPED';
    activeGeneration.controller.abort(stoppedError);
    activeGeneration.active = false;
    if (activeGeneration.taskKey) generationContextsRef.current.delete(activeGeneration.taskKey);
    if (!taskId || generationRef.current.taskKey === activeGeneration.taskKey) {
      generationRef.current = { id: activeGeneration.id + 1, controller: null };
    }
    const stoppedAt = Date.now();
    setStatus('error');
    setProgress((current) => ({
      ...current,
      stage: 'pending_review',
      percent: current.percent || 0
    }));
    setTiming((current) => current ? { ...current, status: 'failed', completedAt: stoppedAt } : current);
    setMessage(generationErrorMessage(stoppedError, t));
    if (currentRunningTask) markGenerationTask(currentRunningTask.id, { status: 'failed', completedAt: stoppedAt });
    if (remoteJobId) {
      clearRemoteGenerationJob(remoteJobId, 'canceled');
      const historyClient = createHistoryClient({ session: loadSession() });
      historyClient.cancelGenerationJob(remoteJobId)
        .then((job) => setMessage(serverJobMessage(job || { status: 'canceled' }, t)))
        .catch(() => setMessage(t('errors.cancelFailed', '已停止本页等待；服务端取消失败，请稍后查看历史图库/当前画布，再决定是否重试。')));
    }
  }

  const primaryImageResult = mode !== 'video' ? results[0] || '' : '';
  const primaryVideoResult = mode === 'video' ? videoResults[0] || '' : '';
  const hasPrimaryResult = Boolean(primaryImageResult || primaryVideoResult);
  const workPreviewImage = primaryImageResult
    ? primaryImageResult
    : mode === 'edit' && referencePreviews[0]
    ? referencePreviews[0]
    : mode === 'mask' && referencePreviews[0]
      ? referencePreviews[0]
    : mode === 'video' && videoReferencePreviews[0]
      ? videoReferencePreviews[0]
    : templatePreviewImage(selectedCase)
      ? assetPath(templatePreviewImage(selectedCase))
      : '';
  const workPreviewFallback = templateThumbnail(selectedCase);
  const previewAlt = primaryImageResult
    ? '生成结果 1'
    : mode === 'video' && videoReferenceFiles[0]
    ? videoReferenceFiles[0].name
    : isImageEditMode && referenceFiles[0]
    ? referenceFiles[0].name
    : selectedCase?.imageAlt || selectedCase?.title || 'Preview';
  const activeGenerationCount = generationQueue.filter((item) => item?.status === 'running').length;
  const activeQueuedGenerationCount = activeGenerationQueueCount(generationQueue);
  const availableGenerationSlots = GENERATION_CONCURRENCY > 0
    ? Math.max(0, GENERATION_CONCURRENCY - activeQueuedGenerationCount)
    : Number.POSITIVE_INFINITY;
  const isGenerating = activeGenerationCount > 0
    || (status === 'loading' && Boolean(generationRef.current.controller));
  const generationActionDisabled = false;
  const generationActionClass = status === 'error' ? 'isRetryAction' : '';
  const needsReviewBeforeRetry = status === 'error' && progress.stage === 'pending_review';
  const generationActionLabel = isGenerating
    ? availableGenerationSlots > 0
      ? t('composer.parallelGenerate', '并行生成')
      : t('composer.queueMore', '加入队列')
    : needsReviewBeforeRetry
      ? t('composer.confirmRegenerate', '确认重新生成')
      : status === 'error'
        ? t('composer.regenerate', '重新生成')
        : t('composer.generate', '生成');
  const generationActionIcon = status === 'error' ? <Redo2 size={18} /> : <Sparkles size={18} />;
  const compactGenerationActionIcon = status === 'error' ? <Redo2 size={16} /> : <Sparkles size={16} />;
  const openRegenerateDialog = () => {
    showComposerForGeneration();
    updateLayoutSections({
      bottomComposer: true,
      composerFolded: false,
      composerParameters: true
    });
    setRegenerateDialogOpen(true);
  };
  const openBottomParamShelf = () => {
    showComposerForGeneration();
    updateLayoutSections({
      bottomComposer: true,
      composerFolded: false,
      composerParameters: true
    });
  };
  const confirmRegenerate = () => {
    enqueueGeneration();
  };
  const openGenerationConfirm = (overrides = {}) => {
    const task = buildGenerationTask(overrides);
    if (!validateGenerationTask(task)) return;
    setGenerationConfirmTask(task);
    setGenerationConfirmOpen(true);
  };
  const closeGenerationConfirm = () => {
    setGenerationConfirmOpen(false);
    setGenerationConfirmTask(null);
  };
  const confirmGenerationAction = () => {
    const task = generationConfirmTask;
    closeGenerationConfirm();
    if (task) enqueueIndependentImageBatch(task);
  };
  const adjustGenerationParams = () => {
    closeGenerationConfirm();
    openBottomParamShelf();
  };
  const handleGenerateAction = () => {
    openGenerationConfirm();
  };
  const switchWorkbenchMode = (nextWorkspace) => {
    if (nextWorkspace === activeWorkspace) return;
    if (nextWorkspace === 'image') setMode((current) => (current === 'video' ? 'image' : current));
    if (nextWorkspace === 'video') {
      setMode('video');
      updateLayoutSections({
        bottomComposer: true,
        composerFolded: false,
        composerParameters: false
      });
    }
    window.queueMicrotask(() => onOpenWorkspace?.(nextWorkspace));
  };
  const maskSourcePreview = referencePreviews[0] || (mode === 'mask' && selectedCanvasNode && selectedCanvasNode.kind !== 'video' ? selectedCanvasNode.url : '');
  const maskSourceFile = referenceFiles[0] || (maskSourcePreview ? { name: selectedCanvasNode ? `#${selectedCanvasNode.canvasIndex || 1}.png` : 'reference.png' } : null);
  const selectedLibraryReferenceThumb = mode === 'image' && selectedCase ? assetPath(templateReferenceThumb(selectedCase)) : '';
  const selectedLibraryReferenceFull = mode === 'image' && selectedCase ? assetPath(templateReferenceFullImage(selectedCase)) : '';
  const selectedLibraryReferenceFallback = selectedLibraryReferenceThumb && selectedLibraryReferenceThumb !== selectedLibraryReferenceFull
    ? selectedLibraryReferenceThumb
    : '';
  const selectedLibraryReferenceTitle = selectedCase?.title || t('references.libraryPreview', '灵感图');
  const referenceSideCount = mode === 'mask'
    ? (maskSourcePreview ? 1 : 0)
    : mode === 'video'
      ? videoReferenceFiles.length
      : referenceFiles.length;
  const referenceSideLimit = mode === 'mask' || mode === 'video' ? 1 : IMAGE_REFERENCE_LIMIT;
  const composerUsesEditRoute = imageGenerationRouteForMode({
    mode,
    referenceCount: referenceFiles.length,
    hasCanvasReference: Boolean(selectedCanvasNode?.url)
  }) === 'edits';
  const routeEndpoints = {
    video: currentVideoPlan.endpoint,
    edits: currentEditPlan.endpoint,
    generations: currentGenerationPlan.endpoint
  };
  const composerRouteLabel = endpointForGenerationTask({
    mode,
    referenceCount: referenceFiles.length,
    hasCanvasReference: Boolean(selectedCanvasNode?.url),
    endpoints: routeEndpoints
  });
  const composerContextTitle = selectedCanvasNode
    ? t('composer.contextContinue', '基于 #{index} 继续创作', { index: selectedCanvasNode.canvasIndex || '' })
    : selectedCase?.title
      ? t('composer.contextTemplate', '来自模板：{title}', { title: selectedCase.title })
      : t('composer.contextNew', '新的创作会话');
  const composerContextMeta = selectedCanvasNode
    ? composerUsesEditRoute
      ? t('composer.contextUsesReference', '当前会把选中图片作为参考图')
      : t('composer.contextLineageOnly', '当前只继承提示词和画布关系')
    : mode === 'video'
      ? t('composer.contextVideo', '视频参数在底部参数栏设置')
      : t('composer.title', '把想法说出来，先整理，再生成');
  const composerGenerationVisible = status === 'loading' || status === 'success' || progress.stage === 'failed' || progress.stage === 'pending_review' || (status === 'error' && Boolean(message));
  const composerThreadHasContent = Boolean(assistantMessages.length);
  const activeGenerationQueueItems = generationQueue.filter((item) => CURRENT_PROJECT_QUEUE_STATUSES.has(item.status));
  const confirmTaskModelInfo = generationConfirmTask?.mode === 'video'
    ? videoModelOptions.find((item) => item.id === generationConfirmTask.videoModel)
    : imageModelOptions.find((item) => item.id === generationConfirmTask?.model);
  const confirmTaskReferenceCount = generationConfirmTask
    ? generationConfirmTask.mode === 'video'
      ? (generationConfirmTask.videoReferenceFiles || []).length
      : Math.min(
          IMAGE_REFERENCE_LIMIT,
          (generationConfirmTask.referenceItems || []).filter((item) => item?.file).length
            + (generationConfirmTask.selectedCanvasNodeSnapshot?.url && generationConfirmTask.selectedCanvasNodeSnapshot?.kind !== 'video' && (generationConfirmTask.mode === 'edit' || generationConfirmTask.mode === 'mask') ? 1 : 0)
        )
    : 0;
  const confirmTaskReferenceLimit = generationConfirmTask?.mode === 'video' || generationConfirmTask?.mode === 'mask' ? 1 : IMAGE_REFERENCE_LIMIT;
  const confirmTaskRouteLabel = generationConfirmTask
    ? endpointForGenerationTask({
        mode: generationConfirmTask.mode,
        referenceCount: confirmTaskReferenceCount,
        hasMask: Boolean(generationConfirmTask.maskFile),
        endpoints: routeEndpoints
      })
    : '';
  const confirmTaskOutputLabel = generationConfirmTask?.mode === 'video'
    ? `${generationConfirmTask.videoAspect} · ${generationConfirmTask.videoDuration}s · ${generationConfirmTask.videoFps}fps`
    : generationConfirmTask
      ? `${generationConfirmTask.size} · ${RESOLUTION_TIER_LABELS[generationConfirmTask.resolutionTier] || generationConfirmTask.resolutionTier} · ${qualityLabel(generationConfirmTask.quality)}`
      : '';
  const confirmTaskCountLabel = generationConfirmTask?.mode === 'video'
    ? `1 ${t('params.videoUnit', '段')}`
    : generationConfirmTask
      ? `${generationConfirmTask.count}${imageCountSuffix}`
      : '';
  const confirmTaskReferenceLabel = generationConfirmTask
    ? `${confirmTaskReferenceCount}/${confirmTaskReferenceLimit}${generationConfirmTask.mode === 'mask' && generationConfirmTask.maskFile ? ' · Mask' : ''}`
    : '';
  const confirmTaskQueueLabel = activeQueuedGenerationCount && availableGenerationSlots > 0
    ? t('composer.confirmQueueParallel', '确认后并行执行，还可使用 {count} 个并发位', { count: availableGenerationSlots })
    : activeQueuedGenerationCount
      ? t('composer.confirmQueueBehind', '当前并发已满，确认后进入等待队列')
      : t('composer.confirmQueueNow', '确认后立即开始');
  const confirmTaskPrimaryLabel = needsReviewBeforeRetry
      ? t('composer.confirmRegenerate', '确认重新生成')
      : status === 'error'
        ? t('composer.regenerate', '重新生成')
      : isGenerating || activeQueuedGenerationCount
        ? availableGenerationSlots > 0
          ? t('composer.parallelGenerate', '并行生成')
          : t('composer.queueMore', '加入队列')
        : t('composer.confirmGeneratePrimary', '确认生成');
  const composerFolded = layoutSections.bottomComposer && layoutSections.composerFolded === true;
  const toggleComposerFold = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: !composerFolded,
    composerParameters: composerFolded ? layoutSections.composerParameters : false
  });
  const foldComposerPanel = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: true,
    composerParameters: false
  });
  const openComposerPanel = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: false
  });
  const composerReferenceLimit = mode === 'video' ? 1 : IMAGE_REFERENCE_LIMIT;
  const sidePromptText = (promptSuggestion?.finalPrompt || promptSuggestion?.raw || prompt.trim() || selectedCanvasNode?.prompt || selectedCase?.prompt || selectedCase?.promptPreview || '').trim();
  const sidePromptSource = promptSuggestion
    ? t('context.promptSourceSuggestion', 'AI 建议')
    : prompt.trim()
      ? t('context.promptSourceInput', '输入框')
      : selectedCanvasNode?.prompt
        ? t('context.promptSourceNode', '画布 #{index}', { index: selectedCanvasNode.canvasIndex || '' })
        : selectedCase?.title
        ? t('context.promptSourceLibrary', '灵感库')
        : t('context.promptSourceEmpty', '等待输入');
  const copySidePrompt = async () => {
    if (!sidePromptText) return;
    await navigator.clipboard.writeText(sidePromptText);
    setCopied(true);
    setStatus('success');
    setMessage(t('statusMessages.promptCopied', '提示词已复制。'));
    window.setTimeout(() => {
      setCopied(false);
      setStatus('idle');
    }, 1200);
  };
  const composerPromptPlaceholder = selectedCanvasNode
    ? t('composer.placeholderCanvas', '写下要怎样延续这张图：换背景、加产品、调整风格... Enter 直接生成')
    : t('composer.placeholder', '写下提示词或创作想法，Enter 直接生成；点左侧小按钮才会调用 AI 优化。');
  const handleComposerReferenceDragEnter = (event) => {
    if (!supportedReferenceFiles(event.dataTransfer?.files || event.dataTransfer?.items, composerReferenceLimit).length) return;
    event.preventDefault();
    if (mode === 'video') setVideoDropActive(true);
    else setReferenceDropActive(true);
  };
  const handleComposerReferenceDragOver = (event) => {
    if (!supportedReferenceFiles(event.dataTransfer?.files || event.dataTransfer?.items, composerReferenceLimit).length) return;
    event.preventDefault();
    if (mode === 'video') setVideoDropActive(true);
    else setReferenceDropActive(true);
  };
  const handleComposerReferenceDragLeave = () => {
    setReferenceDropActive(false);
    setVideoDropActive(false);
  };
  const handleComposerReferenceDrop = (event) => {
    const files = supportedReferenceFiles(event.dataTransfer?.files, composerReferenceLimit);
    if (!files.length) return;
    event.preventDefault();
    setReferenceDropActive(false);
    setVideoDropActive(false);
    if (mode === 'video') appendVideoReferenceImage(files);
    else appendReferenceImages(files);
  };
  const handleComposerPromptPaste = (event) => {
    if (mode === 'video') videoReferencePasteFiles(event);
    else referencePasteFiles(event);
  };
  const handleComposerPromptFocus = () => {
    if (!layoutSections.bottomComposer || layoutSections.composerFolded) openComposerPanel();
  };
  const handleComposerPromptKeyDown = (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      sendAssistantMessage();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleGenerateAction();
    }
  };
  const handleSinglePromptKeyDown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleGenerateAction();
    }
  };
  const isVideoSingleMode = mode === 'video';
  const singleReferencePreviews = isVideoSingleMode ? videoReferencePreviews : referencePreviews;
  const singleReferenceFiles = isVideoSingleMode ? videoReferenceFiles : referenceFiles;
  const singleReferenceCount = isVideoSingleMode ? videoReferenceFiles.length : referenceFiles.length;
  const singleReferenceLimit = isVideoSingleMode ? 1 : IMAGE_REFERENCE_LIMIT;
  const singleReferenceDropActive = isVideoSingleMode ? videoDropActive : referenceDropActive;
  const singleResultCount = isVideoSingleMode ? videoResults.length : results.length;

  return (
    <section className={`creationDesk ${workspaceFlowMode === 'single' ? 'singleFlowMode' : 'canvasFlowMode'} ${layoutSections.references ? 'referencesOpen' : ''} ${layoutSections.bottomComposer ? 'composerOpen' : ''} ${composerThreadHasContent ? 'composerHasThread' : ''} ${layoutSections.composerParameters === false ? 'composerParamsCollapsed' : ''} paramRailCollapsed ${composerFolded ? 'composerFolded' : ''}`}>
      <GenerationQueueDock
        items={workspaceFlowMode === 'single'
          ? activeGenerationQueueItems.filter((item) => item.status !== 'done')
          : activeGenerationQueueItems}
        t={t}
        formatError={generationErrorMessage}
        onAcknowledge={acknowledgeGenerationTask}
        onCancel={cancelGenerationTask}
        onRetry={retryGenerationTask}
        concurrency={GENERATION_CONCURRENCY}
      />
      <div
        ref={workPreviewRef}
        className={`workPreview infiniteCanvas ${workspaceFlowMode === 'single' ? 'singleGenerationPreview' : 'canvasGenerationPreview'} ${hasPrimaryResult ? 'hasResult' : ''} ${canvasPerformanceMode ? 'performanceMode' : ''}`}
        onPointerDown={workspaceFlowMode === 'canvas' ? startCanvasPan : undefined}
        onPointerMove={workspaceFlowMode === 'canvas' ? moveCanvasPan : undefined}
        onPointerUp={workspaceFlowMode === 'canvas' ? endCanvasPan : undefined}
        onPointerCancel={workspaceFlowMode === 'canvas' ? endCanvasPan : undefined}
      >
        <div className="workbenchTopControls">
          <WorkflowModeSwitch
            activeMode={workspaceFlowMode}
            onChange={switchWorkflowMode}
            t={t}
          />
        <WorkbenchModeSwitch
          activeWorkspace={activeWorkspace === 'video' ? 'video' : 'image'}
          onChange={switchWorkbenchMode}
          t={t}
        />
        </div>
        {workspaceFlowMode === 'canvas' ? (
          <>
        <div className="canvasToolbar" aria-label={t('canvas.toolbar', '画布工具')}>
          <button type="button" onClick={() => setCanvasZoom((value) => value - 0.1)} aria-label={t('canvas.zoomOut', '缩小画布')} title={`${t('canvas.zoomOut', '缩小画布')} Ctrl/Cmd + -`}>-</button>
          <span>{Math.round(canvasView.zoom * 100)}%</span>
          <button type="button" onClick={() => setCanvasZoom((value) => value + 0.1)} aria-label={t('canvas.zoomIn', '放大画布')} title={`${t('canvas.zoomIn', '放大画布')} Ctrl/Cmd + +`}>+</button>
          <button type="button" onClick={resetCanvasView} title={`${t('canvas.reset', '重置')} Ctrl/Cmd + 0`}>{t('canvas.reset', '重置')}</button>
        </div>
        <div
          className="canvasPlane"
          style={{
            width: CANVAS_PLANE_WIDTH,
            height: CANVAS_PLANE_HEIGHT,
            transform: `translate(calc(-50% + ${canvasView.x}px), calc(-50% + ${canvasView.y}px)) scale(${canvasView.zoom})`
          }}
        >
          {renderedCanvasEdges.length || canvasLinkPreview ? (
            <svg className={`canvasLinks ${selectedCanvasNodeId ? 'hasSelection' : ''} ${canvasLinkDraft ? 'isLinking' : ''} ${canvasPerformanceMode ? 'performanceMode' : ''}`} width={CANVAS_PLANE_WIDTH} height={CANVAS_PLANE_HEIGHT} viewBox={`0 0 ${CANVAS_PLANE_WIDTH} ${CANVAS_PLANE_HEIGHT}`} aria-hidden="true">
              <defs>
                <marker id="canvasLinkArrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                  <path className="canvasLinkArrow" d="M 1 2 L 10 6 L 1 10 z" />
                </marker>
                <marker id="canvasLinkArrowActive" markerWidth="15" markerHeight="15" refX="12" refY="7.5" orient="auto" markerUnits="userSpaceOnUse">
                  <path className="canvasLinkArrowActive" d="M 1 2 L 12 7.5 L 1 13 z" />
                </marker>
                <filter id="canvasLinkGlow" x="-24%" y="-24%" width="148%" height="148%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {renderedCanvasEdges.map((edge) => {
                const { path, jointX, jointY } = canvasEdgeGeometry(edge.from, edge.to, CANVAS_PLANE_WIDTH, CANVAS_PLANE_HEIGHT);
                const edgeClass = resolveCanvasEdgeLineageClass(edge);
                const isEdgeActive = edgeClass.includes('active');
                return (
                  <g className={`canvasLinkGroup ${edgeClass} ${edge.type === 'custom' ? 'custom' : 'lineage'}`} key={edge.id}>
                    <path className="canvasLinkGlow" d={path} filter="url(#canvasLinkGlow)" />
                    <path className="canvasLinkPulse" d={path} />
                    <path className="canvasLinkPath" d={path} markerEnd={isEdgeActive ? 'url(#canvasLinkArrowActive)' : 'url(#canvasLinkArrow)'} />
                    <circle className="canvasLinkJoint" cx={jointX} cy={jointY} r="4.3" />
                    <circle className="canvasLinkJointCore" cx={jointX} cy={jointY} r="1.6" />
                    <text className="canvasLinkLabel" x={jointX + 12} y={jointY - 10}>
                      {`#${edge.from.canvasIndex || ''} -> #${edge.to.canvasIndex || ''}`}
                    </text>
                  </g>
                );
              })}
              {canvasLinkPreview?.point ? (() => {
                const path = canvasLinkPreviewGeometry(canvasLinkPreview.from, canvasLinkPreview.point, CANVAS_PLANE_WIDTH, CANVAS_PLANE_HEIGHT);
                return <path className="canvasLinkPreview" d={path} />;
              })() : null}
            </svg>
          ) : null}
          {canvasNodes.length ? canvasNodes.map((node) => (
            <CanvasNodeCard
              key={node.id}
              node={node}
              outputFormat={outputFormat}
              currentDownloadMeta={currentDownloadMeta}
              visibleCanvasNodeIds={visibleCanvasNodeIds}
              canvasPerformanceMode={canvasPerformanceMode}
              selectedCanvasNodeId={selectedCanvasNodeId}
              childNodeIds={childNodeIds}
              parentNodeIds={parentNodeIds}
              linkedNodeIds={linkedNodeIds}
              canvasLinkDraft={canvasLinkDraft}
              canvasEditorNodeId={canvasEditorNodeId}
              canvasEditorPrompt={canvasEditorPrompt}
              canvasEditorMode={canvasEditorMode}
              status={status}
              generationActionClass={generationActionClass}
              generationActionDisabled={generationActionDisabled}
              generationActionLabel={generationActionLabel}
              t={t}
              onStartNodeDrag={startCanvasNodeDrag}
              onStartNodeResize={startCanvasNodeResize}
              onFinishCanvasLink={finishCanvasLink}
              onStartCanvasLink={startCanvasLink}
              onMediaClick={handleCanvasNodeMediaClick}
              onOpenEditor={openCanvasEditor}
              onCloseEditor={closeCanvasEditor}
              onEditorPromptChange={setCanvasEditorPrompt}
              onEditorModeChange={changeCanvasEditorMode}
              onPreview={previewCanvasNode}
              onShare={handleShareResult}
              onSetAsReference={setCanvasNodeAsReference}
              onCopyPrompt={copyCanvasNodePrompt}
              onDelete={deleteCanvasNode}
              onGenerateFromEditor={generateFromCanvasEditor}
              onReroll={rerollCanvasNode}
              imageAspectOptions={imageAspectOptions}
            />
          )) : primaryVideoResult ? (
            <div className="canvasNode emptyCanvasNode previewFallbackNode">
              <Video size={28} />
              <strong>{t('canvas.videoResult', '视频结果')}</strong>
              <span>{t('canvas.nextNodeHint', '下一次生成会在画布里形成节点关系。')}</span>
            </div>
          ) : mode === 'video' ? (
            <div className="canvasNode emptyCanvasNode videoDraftNode">
              <Video size={30} />
              <strong>{t('canvas.videoDraftTitle', '视频创作初稿')}</strong>
              <span>{t('canvas.videoDraftHint', '输入分镜或画面描述，配置时长、比例和参考图；生成前会先确认模型与接口。')}</span>
              <button type="button" onClick={openBottomParamShelf}>
                <SlidersHorizontal size={14} />
                {t('canvas.videoDraftParams', '检查视频参数')}
              </button>
            </div>
          ) : workPreviewImage ? (
            <div className="canvasNode sourceNode previewFallbackNode">
              <ProtectedStudioImage
                src={workPreviewImage}
                fallbackSrc={workPreviewFallback}
                alt={previewAlt}
              />
              <span className="canvasNodeLabel">{hasPrimaryResult ? '#1' : selectedCase?.title || t('canvas.sourceImage', '参考画面')}</span>
            </div>
          ) : (
            <div className="canvasNode emptyCanvasNode">
              <ImageIcon size={28} />
              <strong>{t('canvas.title', '画布')}</strong>
              <span>{t('canvas.empty', '在底部输入想法并生成，第一张会成为 #1；选中任意图片后，再补充要求即可继续延伸。')}</span>
            </div>
          )}
        </div>
          </>
        ) : (
          <div className="singleGenerationWorkspace">
            <div className="singleGenerationShell">
              <div className="singleGenerationControlColumn">
                <section className="singleGenerationPanel singleGenerationFormPanel">
                <div className="singleGenerationHead">
                  <div>
                    <strong>{t('single.title', '单次生图')}</strong>
                  </div>
                  <button type="button" onClick={() => onOpenWorkspace?.('inspiration')}>
                    <Sparkles size={15} />
                    {t('workspace.inspiration', '灵感库')}
                  </button>
                  <button type="button" onClick={onOpenSettings}>
                    <KeyRound size={15} />
                    {t('settings.title', '设置')}
                  </button>
                </div>
                <div className="singleFieldGrid">
                  <label className="singleField">
                    <span>{t('settings.provider', '供应商')}</span>
                    {providerProfiles.length ? (
                      <select value={activeProviderProfileId} onChange={(event) => onSelectProvider?.(event.target.value)}>
                        {providerProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                      </select>
                    ) : (
                      <button type="button" className="singleKeyButton" onClick={onOpenSettings}>
                        {STUDIO_STANDALONE ? <Server size={14} /> : <KeyRound size={14} />}
                        <strong>{STUDIO_STANDALONE && providerSettings.apiKeySource !== 'manual'
                          ? t('settings.studioManagedProvider', '服务端托管')
                          : providerLabel(providerSettings, apiKey)}</strong>
                      </button>
                    )}
                  </label>
                  {isVideoSingleMode ? (
                    <label className="singleField">
                      <span>{t('params.videoModel', '视频模型')}</span>
                      <select value={hasVideoModels ? videoModel : ''} onChange={(event) => setVideoModel(event.target.value)} disabled={!hasVideoModels}>
                        {hasVideoModels ? videoModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>) : (
                          <option value="">{t('params.currentKeyNoVideo', '当前 Key 未开放视频模型')}</option>
                        )}
                      </select>
                    </label>
                  ) : (
                    <label className="singleField">
                      <span>{t('params.imageModel', '图片模型')}</span>
                      <select value={model} onChange={(event) => setModel(event.target.value)}>
                        {imageModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <label className="singlePromptBox">
                  <span>{t('single.promptLabel', '描述')}</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onPaste={handleComposerPromptPaste}
                    onKeyDown={handleSinglePromptKeyDown}
                    placeholder={isVideoSingleMode ? t('single.videoPromptPlaceholder', '描述你要生成的视频画面、镜头运动、节奏和风格...') : t('single.promptPlaceholder', '描述你想生成的图片，包含主体、场景、风格、光线和构图...')}
                  />
                </label>
                <div className="singleReferenceBlock">
                  <div className="singleBlockTitle">
                    <span>{t('references.title', '参考图')}</span>
                    <em>{singleReferenceCount}/{singleReferenceLimit}</em>
                  </div>
                  <label
                    className={`singleUploadDrop ${singleReferenceDropActive ? 'isDragging' : ''}`}
                    tabIndex={0}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (isVideoSingleMode) setVideoDropActive(true);
                      else setReferenceDropActive(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (isVideoSingleMode) setVideoDropActive(true);
                      else setReferenceDropActive(true);
                    }}
                    onDragLeave={() => {
                      setReferenceDropActive(false);
                      setVideoDropActive(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setReferenceDropActive(false);
                      setVideoDropActive(false);
                      if (isVideoSingleMode) appendVideoReferenceImage(event.dataTransfer?.files);
                      else appendReferenceImages(event.dataTransfer?.files);
                    }}
                    onPaste={isVideoSingleMode ? videoReferencePasteFiles : referencePasteFiles}
                  >
                    <Upload size={20} />
                    <span>{singleReferenceCount ? t('references.addMore', '继续添加 / 拖入更多') : t('references.upload', '拖拽 / 粘贴 / 上传参考图')}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple={!isVideoSingleMode}
                      onChange={(event) => {
                        if (isVideoSingleMode) appendVideoReferenceImage(event.target.files);
                        else appendReferenceImages(event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {singleReferencePreviews.length || selectedLibraryReferenceThumb ? (
                    <div className="singleReferenceThumbs">
                      {selectedLibraryReferenceThumb && !isVideoSingleMode ? (
                        <figure>
                          <button
                            type="button"
                            onClick={() => setPreviewImage({
                              url: selectedLibraryReferenceFull || selectedLibraryReferenceThumb,
                              fallbackSrc: selectedLibraryReferenceFallback,
                              index: 0,
                              downloadMeta: {
                                mode: 'library-reference',
                                providerId: model,
                                prompt: selectedCase?.prompt || selectedCase?.promptPreview || prompt.trim(),
                                createdAt: new Date().toISOString()
                              }
                            })}
                          >
                            <LazyImage src={selectedLibraryReferenceThumb} alt={selectedCase?.imageAlt || selectedLibraryReferenceTitle} />
                          </button>
                          <figcaption>{t('references.libraryPreview', '灵感图')}</figcaption>
                        </figure>
                      ) : null}
                      {singleReferencePreviews.map((url, index) => (
                        <figure key={url}>
                          <button
                            type="button"
                            onClick={() => setPreviewImage({
                              url,
                              index,
                              downloadMeta: {
                                mode: 'reference',
                                providerId: isVideoSingleMode ? videoModel : model,
                                prompt: prompt.trim(),
                                createdAt: new Date().toISOString()
                              }
                            })}
                          >
                            <LazyImage src={url} alt={singleReferenceFiles[index]?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })} />
                          </button>
                          <button
                            type="button"
                            className="singleReferenceRemove"
                            onClick={() => isVideoSingleMode ? removeVideoReferenceImage() : removeReferenceImage(index)}
                            aria-label={t('references.remove', '移除参考图')}
                          >
                            <X size={13} />
                          </button>
                          <figcaption>{singleReferenceFiles[index]?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })}</figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="singleParamsGrid">
                  {isVideoSingleMode ? (
                    <>
                      <label className="singleField">
                        <span>{t('params.videoAspect', '视频比例')}</span>
                        <select value={videoAspect} onChange={(event) => setVideoAspect(event.target.value)}>
                          {VIDEO_ASPECT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.duration', '时长')}</span>
                        <select value={videoDuration} onChange={(event) => setVideoDuration(Number(event.target.value))}>
                          {VIDEO_DURATIONS.map((item) => <option key={item} value={item}>{item}s</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.fps', '帧率')}</span>
                        <select value={videoFps} onChange={(event) => setVideoFps(Number(event.target.value))}>
                          {VIDEO_FPS_OPTIONS.map((item) => <option key={item} value={item}>{item} fps</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.motion', '镜头运动')}</span>
                        <select value={videoMotion} onChange={(event) => setVideoMotion(event.target.value)}>
                          {VIDEO_MOTIONS.map((item) => <option key={item.value} value={item.value}>{videoMotionLabel(item)}</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.style', '风格')}</span>
                        <select value={videoStyle} onChange={(event) => setVideoStyle(event.target.value)}>
                          {VIDEO_STYLES.map((item) => <option key={item.value} value={item.value}>{videoStyleLabel(item)}</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.videoQuality', '视频画质')}</span>
                        <select value={videoQuality} onChange={(event) => setVideoQuality(event.target.value)}>
                          {VIDEO_QUALITY.map((item) => <option key={item} value={item}>{item === 'auto' ? t('params.auto', '自动') : item === 'high' ? t('params.high', '高') : t('params.standard', '标准')}</option>)}
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="singleField">
                        <span>{t('params.aspect', '尺寸比例')}</span>
                        <select
                          value={aspect}
                          onChange={(event) => {
                            const nextAspect = event.target.value;
                            setAspect(nextAspect);
                            const matched = imageAspectOptions.find((item) => item.value === nextAspect);
                            if (matched?.size) setCustomSize(matched.size);
                          }}
                        >
                          {imageAspectOptions.map((item) => <option key={item.value} value={item.value}>{aspectLabel(item)}</option>)}
                        </select>
                      </label>
                      {aspect === 'custom' ? (
                        <label className="singleField">
                          <span>{t('params.apiSize', '接口尺寸')}</span>
                          <select value={customSize} onChange={(event) => setCustomSize(normalizeSize(event.target.value))}>
                            {customSizeOptions.map((item) => <option key={item.value} value={item.value}>{customSizeLabel(item)}</option>)}
                          </select>
                        </label>
                      ) : null}
                      <label className="singleField">
                        <span>{t('params.quality', '质量')}</span>
                        <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                          {imageQualityOptions.map((item) => <option key={item} value={item}>{qualityLabel(item)}</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.resolution', '分辨率')}</span>
                        <select value={resolutionTier} onChange={(event) => setResolutionTier(event.target.value)}>
                          {imageResolutionTierOptions.map((item) => <option key={item.value} value={item.value}>{resolutionTierLabel(item)}</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.format', '格式')}</span>
                        <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
                          {imageOutputFormatOptions.map((item) => <option key={item} value={item}>{OUTPUT_FORMAT_LABELS[item] || item}</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.moderation', '审核')}</span>
                        <select value={moderation} onChange={(event) => setModeration(event.target.value)}>
                          {MODERATION.map((item) => <option key={item} value={item}>{moderationLabel(item)}</option>)}
                        </select>
                      </label>
                      <label className="singleField">
                        <span>{t('params.imageCount', '图片数量')}</span>
                        <input
                          type="number"
                          min={imageCountRange.min}
                          max={imageCountRange.max}
                          value={countValue}
                          onChange={(event) => setCount(clampCountForProvider(event.target.value, currentImageProvider, normalizeCount))}
                        />
                      </label>
                    </>
                  )}
                </div>
                <div className="singleActionBar">
                  <button type="button" onClick={optimizeCurrentPrompt} disabled={optimizingPrompt}>
                    {optimizingPrompt ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}
                    {optimizingPrompt ? t('composer.optimizing', '优化中') : t('composer.optimize', '优化')}
                  </button>
                  <button type="button" className={`singleGenerateButton ${generationActionClass}`} onClick={handleGenerateAction} disabled={generationActionDisabled}>
                    {generationActionIcon}
                    {generationActionLabel}
                  </button>
                </div>
                </section>
                <section className="singleGenerationPanel singleStatusPanel">
                  <div className="singleGenerationHead">
                    <div>
                      <strong>{t('single.statusTitle', '生成状态')}</strong>
                      <span>{STUDIO_STANDALONE
                        ? t('single.serverGeneration', '图片生成')
                        : (timing?.routeLabel || confirmTaskRouteLabel || composerRouteLabel)}</span>
                    </div>
                    {isGenerating ? (
                      <button type="button" onClick={stopGeneration}>
                        <X size={14} />
                        {t('composer.stopWaiting', '停止')}
                      </button>
                    ) : null}
                  </div>
                  <ProgressBar progress={progress} active={status === 'loading' || status === 'success' || progress.stage === 'failed' || progress.stage === 'pending_review'} t={t} />
                  <GenerationTimingPanel timing={timing} t={t} />
                  {message ? <p className={`singleStatusLine ${status}`}>{message}</p> : null}
                </section>
              </div>
              <div className="singleGenerationSide">
                <section className={`singleGenerationPanel singleLatestResult ${hasPrimaryResult ? 'hasResult' : ''}`}>
                  <div className="singleGenerationHead">
                    <div>
                      <strong>{isVideoSingleMode ? t('canvas.videoResult', '视频结果') : t('composer.resultTitle', '生成结果')}</strong>
                      <span>{hasPrimaryResult ? t('composer.resultCount', '共 {count} 张', { count: singleResultCount }) : t('composer.pending', '待生成')}</span>
                    </div>
                  </div>
                  {isVideoSingleMode ? (
                    <VideoResultGrid urls={videoResults} downloadMeta={currentDownloadMeta} onPreview={(url, index) => setPreviewVideo({ url, index })} onShare={handleShareResult} t={t} />
                  ) : (
                    <ResultGrid urls={results} featured carousel outputFormat={outputFormat} downloadMeta={currentDownloadMeta} onPreview={(url, index) => setPreviewImage({ url, index })} onShare={handleShareResult} t={t} />
                  )}
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
      {workspaceFlowMode === 'canvas' ? (
        <>
      <aside className={`referenceSidePanel contextSidePanel ${layoutSections.references ? 'isOpen' : 'isCollapsed'} promptWorkspaceDocked`} aria-label={t('context.title', '创作上下文')}>
        {layoutSections.references ? (
          <>
            <div className="referenceSideHead">
              <div>
                <strong>{t('context.title', '创作上下文')}</strong>
                <span>{`${mode === 'mask' ? 'Mask / edits' : referenceFiles.length || videoReferenceFiles.length ? t('references.selected', '已选择 {count} 张', { count: mode === 'video' ? videoReferenceFiles.length : referenceFiles.length }) : t('references.sideHint', '拖拽、粘贴或上传')} · ${sidePromptText ? sidePromptSource : t('context.promptEmpty', '空')}`}</span>
              </div>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="rightContextStack">
              <section className="rightContextSection referenceContextSection isActive">
                <div className="rightContextSectionHead">
                  <span><Images size={15} />{t('references.title', '参考图')}</span>
                  <em>{referenceSideCount}/{referenceSideLimit}</em>
                </div>
                <>
                  {mode === 'mask' ? (
                      <div className="referenceSideBody maskReferenceSideBody">
                        <React.Suspense fallback={null}>
                          <MaskEditor
                            ref={maskEditorRef}
                            imageFile={maskSourceFile}
                            imagePreview={maskSourcePreview}
                            onUpload={(files) => {
                              const nextFile = supportedReferenceFiles(files, 1)[0];
                              if (!nextFile) {
                                setStatus('error');
                                setMessage(t('references.unsupportedFormat', '只支持 PNG / JPG / WebP 参考图。'));
                                return;
                              }
                              setReferenceItems([createReferenceItem(nextFile, 'identity')]);
                              if (maskExportUrl) {
                                URL.revokeObjectURL(maskExportUrl);
                                setMaskExportUrl('');
                              }
                              setStatus('idle');
                              setMessage('');
                            }}
                            onClearImage={clearReferenceImages}
                            onExportReady={handleMaskExportReady}
                            onError={(nextMessage) => {
                              setStatus('error');
                              setMessage(nextMessage);
                            }}
                            onGenerate={selectedCanvasNode ? generateMaskFromPanel : null}
                            generating={status === 'loading'}
                            t={t}
                          />
                        </React.Suspense>
                        {maskExportUrl ? (
                          <div className="maskExportPreview">
                            <img src={maskExportUrl} alt="已导出的 mask" />
                            <span>{t('references.exportedMask', '已导出 mask.png')}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : mode === 'video' ? (
                      <div className={`referenceSideBody ${videoReferencePreviews.length ? 'hasReferenceItems' : ''}`}>
                        <label
                          className={`uploadDrop sideUploadDrop ${videoDropActive ? 'isDragging' : ''}`}
                          tabIndex={0}
                          onDragEnter={(event) => {
                            event.preventDefault();
                            setVideoDropActive(true);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setVideoDropActive(true);
                          }}
                          onDragLeave={() => setVideoDropActive(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setVideoDropActive(false);
                            appendVideoReferenceImage(event.dataTransfer?.files);
                          }}
                          onPaste={videoReferencePasteFiles}
                        >
                          <Upload size={18} />
                          <span>{videoReferenceFiles.length ? t('references.replaceVideo', '更换 / 拖入更多') : t('references.optionalUpload', '拖拽 / 粘贴 / 上传参考图，可选')}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) => {
                              appendVideoReferenceImage(event.target.files);
                              event.target.value = '';
                            }}
                          />
                        </label>
                        {videoReferencePreviews.length ? (
                          <div className="referenceThumbs sideReferenceThumbs videoReferenceThumbs">
                            {videoReferencePreviews.map((url, index) => (
                              <figure key={url}>
                                <button
                                  type="button"
                                  className="referencePreviewButton"
                                  onClick={() => setPreviewImage({
                                    url,
                                    index,
                                    downloadMeta: {
                                      mode: 'image',
                                      providerId: mode === 'video' ? videoModel : model,
                                      prompt: prompt.trim(),
                                      createdAt: new Date().toISOString()
                                    }
                                  })}
                                  aria-label={t('references.preview', '查看参考图')}
                                >
                                  <LazyImage src={url} alt={videoReferenceFiles[index]?.name || t('references.videoReference', '视频参考图')} />
                                </button>
                                <button type="button" onClick={removeVideoReferenceImage} aria-label={t('references.remove', '移除参考图')}>
                                  <X size={13} />
                                </button>
                              </figure>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className={`referenceSideBody ${referencePreviews.length ? 'hasReferenceItems' : ''} ${selectedLibraryReferenceThumb ? 'hasLibraryReference' : ''}`}>
                        {selectedLibraryReferenceThumb ? (
                          <figure className="libraryReferencePreview">
                            <button
                              type="button"
                              className="referencePreviewButton"
                              onClick={() => setPreviewImage({
                                url: selectedLibraryReferenceFull || selectedLibraryReferenceThumb,
                                fallbackSrc: selectedLibraryReferenceFallback,
                                index: 0,
                                downloadMeta: {
                                  mode: 'library-reference',
                                  providerId: model,
                                  prompt: selectedCase?.prompt || selectedCase?.promptPreview || prompt.trim(),
                                  createdAt: new Date().toISOString()
                                }
                              })}
                              aria-label={t('references.preview', '查看参考图')}
                            >
                              <LazyImage src={selectedLibraryReferenceThumb} alt={selectedCase?.imageAlt || selectedLibraryReferenceTitle} />
                            </button>
                            <figcaption>
                              <span>{t('references.libraryPreview', '灵感图')}</span>
                              <strong>{selectedLibraryReferenceTitle}</strong>
                            </figcaption>
                          </figure>
                        ) : null}
                        <label
                          className={`uploadDrop sideUploadDrop ${referenceDropActive ? 'isDragging' : ''}`}
                          tabIndex={0}
                          onDragEnter={(event) => {
                            event.preventDefault();
                            setReferenceDropActive(true);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setReferenceDropActive(true);
                          }}
                          onDragLeave={() => setReferenceDropActive(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setReferenceDropActive(false);
                            appendReferenceImages(event.dataTransfer?.files);
                          }}
                          onPaste={referencePasteFiles}
                        >
                          <Upload size={18} />
                          <span>{referenceFiles.length ? t('references.addMore', '继续添加 / 拖入更多') : t('references.upload', '拖拽 / 粘贴 / 上传参考图')}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            onChange={(event) => {
                              appendReferenceImages(event.target.files);
                              event.target.value = '';
                            }}
                          />
                        </label>
                        {referencePreviews.length ? (
                          <div className="referenceThumbs sideReferenceThumbs">
                            {referencePreviews.map((url, index) => (
                              <figure key={url}>
                                <button
                                  type="button"
                                  className="referencePreviewButton"
                                  onClick={() => setPreviewImage({
                                    url,
                                    index,
                                    downloadMeta: {
                                      mode: 'reference',
                                      providerId: mode === 'video' ? videoModel : model,
                                      prompt: prompt.trim(),
                                      createdAt: new Date().toISOString()
                                    }
                                  })}
                                  aria-label={t('references.preview', '查看参考图')}
                                >
                                  <LazyImage src={url} alt={referenceItems[index]?.file?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })} />
                                </button>
                                <figcaption>
                                  <select
                                    value={referenceItems[index]?.role || 'identity'}
                                    onChange={(event) => updateReferenceRole(index, event.target.value)}
                                    aria-label={t('references.role', '参考图 {index} 角色', { index: index + 1 })}
                                  >
                                    {REFERENCE_ROLES.map((role) => (
                                      <option key={role.value} value={role.value}>{role.label}</option>
                                    ))}
                                  </select>
                                  <span>{index === 0 ? t('references.mainReference', '主参考') : t('references.referenceIndex', '参考 {index}', { index: index + 1 })}</span>
                                </figcaption>
                                <div className="referenceFileMeta">
                                  <strong>{referenceItems[index]?.file?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })}</strong>
                                  <span>{formatFileSize(referenceItems[index]?.file?.size) || t('references.preview', '查看参考图')}</span>
                                </div>
                                <div className="referenceThumbActions">
                                  <button type="button" onClick={() => moveReferenceImage(index, -1)} disabled={index === 0} aria-label={t('references.moveBefore', '前移参考图')}>
                                    <ArrowUp size={13} />
                                  </button>
                                  <button type="button" onClick={() => moveReferenceImage(index, 1)} disabled={index === referencePreviews.length - 1} aria-label={t('references.moveAfter', '后移参考图')}>
                                    <ArrowDown size={13} />
                                  </button>
                                  <button type="button" onClick={() => removeReferenceImage(index)} aria-label={t('references.remove', '移除参考图')}>
                                    <X size={13} />
                                  </button>
                                </div>
                              </figure>
                            ))}
                          </div>
                        ) : null}
                      </div>
                  )}
                </>
              </section>
              <section className="rightContextSection promptContextSection isActive">
                <div className="rightContextSectionHead">
                  <span><MessageSquareText size={15} />{t('context.prompt', '提示词')}</span>
                  <em>{sidePromptText ? sidePromptSource : t('context.promptEmpty', '空')}</em>
                </div>
                <div className="rightPromptBody">
                  {sidePromptText ? (
                    <>
                      <div className="rightPromptActions">
                        <button type="button" onClick={copySidePrompt}>
                          <Copy size={13} />
                          {t('composer.copy', '复制')}
                        </button>
                        {promptSuggestion ? (
                          <button type="button" onClick={replaceSuggestion}>{t('composer.putIntoInput', '放入输入框')}</button>
                        ) : null}
                        {promptSuggestion ? (
                          <button type="button" className="primary" onClick={useSuggestionForGenerate}>{t('suggestion.useThis', '用这版生成')}</button>
                        ) : null}
                      </div>
                      <PromptSectionList prompt={sidePromptText} t={t} />
                    </>
                  ) : (
                    <div className="rightPromptEmpty">
                      <MessageSquareText size={24} />
                      <strong>{t('context.promptEmptyTitle', '还没有提示词')}</strong>
                      <span>{t('context.promptEmptyHint', '在底部对话框输入想法，或从灵感库选用后会显示在这里。')}</span>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <button type="button" className="referenceSideCollapsed" onClick={() => toggleLayoutSection('references')}>
            <Images size={17} />
            <span>{t('context.title', '创作上下文')}</span>
          </button>
        )}
      </aside>
      <div className="deskPanel">
        {activeWorkspace === 'image' ? (
          <div className="modeTabs imageModeTabs">
            {DESK_MODES.map((item) => {
              const Icon = item.icon;
              return (
                <button type="button" className={mode === item.value ? 'active' : ''} key={item.value} onClick={() => setMode(item.value)}>
                  <Icon size={17} /> {deskModeLabel(item.value)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="workspaceTitleStrip">
            <Video size={17} />
            <span>{t('workspace.video', '视频创作')}</span>
          </div>
        )}
        {selectedCase && mode === 'image' ? (
          <div className="caseMeta">
            <span>{typeof selectedCase.id === 'number' ? `#${selectedCase.id}` : t('gallery.external', '外部')}</span>
            <h2>{selectedCase.title}</h2>
            <p>{[categoryLabel(selectedCase.category || selectedCase.section || '模板'), caseCardMeta(selectedCase)].filter(Boolean).join(' · ')}</p>
            {Array.isArray(selectedCase.riskTags) && selectedCase.riskTags.length ? (
              <div className="riskStrip">
                {selectedCase.riskTags.map((item) => <span key={item}>{riskLabel(item)}</span>)}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="presetChips">
          {visiblePromptPresets.map((item) => (
            <button type="button" key={item.id || item.title} onClick={() => applyPromptPreset(item)} disabled={caseResolving}>
              {item.title}
            </button>
          ))}
        </div>
        {mode !== 'video' ? (
          <CreativeRecipeBar
            recipes={CREATIVE_RECIPES}
            activeId={activeRecipeId}
            onApply={applyCreativeRecipe}
          />
        ) : null}
        {false && mode !== 'video' && mode !== 'mask' && layoutSections.references ? (
          <div className="referenceBox">
            <div className="miniPanelHead">
              <strong>{t('references.title', '参考图（可选）')}</strong>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <label
              className={`uploadDrop ${referenceDropActive ? 'isDragging' : ''}`}
              tabIndex={0}
              onDragEnter={(event) => {
                event.preventDefault();
                setReferenceDropActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setReferenceDropActive(true);
              }}
              onDragLeave={() => setReferenceDropActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setReferenceDropActive(false);
                appendReferenceImages(event.dataTransfer?.files);
              }}
              onPaste={referencePasteFiles}
            >
              <Upload size={18} />
              <span>{referenceFiles.length ? t('references.selected', '已选择 {count} 张', { count: referenceFiles.length }) : t('references.upload', '拖拽 / 粘贴 / 上传参考图')}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  appendReferenceImages(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            {referencePreviews.length ? (
              <div className="referenceThumbs">
                {referencePreviews.map((url, index) => (
                  <figure key={url}>
                    <LazyImage src={url} alt={referenceItems[index]?.file?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })} />
                    <figcaption>
                      <select
                        value={referenceItems[index]?.role || 'identity'}
                        onChange={(event) => updateReferenceRole(index, event.target.value)}
                        aria-label={t('references.role', '参考图 {index} 角色', { index: index + 1 })}
                      >
                        {REFERENCE_ROLES.map((role) => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                      <span>{index === 0 ? t('references.mainReference', '主参考') : t('references.referenceIndex', '参考 {index}', { index: index + 1 })}</span>
                    </figcaption>
                    <div className="referenceThumbActions">
                      <button type="button" onClick={() => moveReferenceImage(index, -1)} disabled={index === 0} aria-label={t('references.moveBefore', '前移参考图')}>
                        <ArrowUp size={13} />
                      </button>
                      <button type="button" onClick={() => moveReferenceImage(index, 1)} disabled={index === referencePreviews.length - 1} aria-label={t('references.moveAfter', '后移参考图')}>
                        <ArrowDown size={13} />
                      </button>
                      <button type="button" onClick={() => removeReferenceImage(index)} aria-label={t('references.remove', '移除参考图')}>
                        <X size={13} />
                      </button>
                    </div>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        ) : mode !== 'video' && mode !== 'mask' ? (
          <button type="button" className="collapsedWorkbenchBlock referenceCollapsedBlock" onClick={() => toggleLayoutSection('references')}>
            <Upload size={16} />
            <span>{referenceFiles.length ? t('references.collapsedSelected', '参考图已收起，共 {count} 张', { count: referenceFiles.length }) : t('references.collapsedEmpty', '参考图已收起，点击展开拖拽、粘贴或上传。')}</span>
          </button>
        ) : null}
        {false && mode === 'mask' && layoutSections.references ? (
          <div className="referenceBox maskReferenceBox">
            <div className="miniPanelHead">
              <strong>{t('references.maskTitle', '参考图与蒙版')}</strong>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <MaskEditor
              ref={maskEditorRef}
              imageFile={maskSourceFile}
              imagePreview={maskSourcePreview}
              onUpload={(files) => {
                const nextFile = supportedReferenceFiles(files, 1)[0];
                if (!nextFile) {
                  setStatus('error');
                  setMessage(t('statusMessages.referenceUnsupported', '只支持 PNG / JPG / WebP 参考图。'));
                  return;
                }
                setReferenceItems([createReferenceItem(nextFile, 'identity')]);
                if (maskExportUrl) {
                  URL.revokeObjectURL(maskExportUrl);
                  setMaskExportUrl('');
                }
                setStatus('idle');
                setMessage('');
              }}
              onClearImage={clearReferenceImages}
              onExportReady={handleMaskExportReady}
              onError={(nextMessage) => {
                setStatus('error');
                setMessage(nextMessage);
              }}
              onGenerate={selectedCanvasNode ? generateMaskFromPanel : null}
              generating={status === 'loading'}
            />
            {maskExportUrl ? (
              <div className="maskExportPreview">
                <img src={maskExportUrl} alt="已导出的 mask" />
                <span>{t('references.exportedMask', '已导出 mask.png')}</span>
              </div>
            ) : null}
          </div>
        ) : mode === 'mask' ? (
          <button type="button" className="collapsedWorkbenchBlock referenceCollapsedBlock" onClick={() => toggleLayoutSection('references')}>
            <Upload size={16} />
            <span>{t('references.maskCollapsed', '参考图与蒙版已收起，点击展开继续编辑。')}</span>
          </button>
        ) : null}
        {false && mode === 'video' && layoutSections.references ? (
          <div className="referenceBox">
            <div className="miniPanelHead">
              <strong>{t('references.title', '参考图（可选）')}</strong>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <label
              className={`uploadDrop ${videoDropActive ? 'isDragging' : ''}`}
              tabIndex={0}
              onDragEnter={(event) => {
                event.preventDefault();
                setVideoDropActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setVideoDropActive(true);
              }}
              onDragLeave={() => setVideoDropActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setVideoDropActive(false);
                appendVideoReferenceImage(event.dataTransfer?.files);
              }}
              onPaste={videoReferencePasteFiles}
            >
              <Upload size={18} />
              <span>{videoReferenceFiles.length ? t('references.selectedVideo', '已选择视频参考图') : t('references.optionalUpload', '拖拽 / 粘贴 / 上传参考图，可选')}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  appendVideoReferenceImage(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            {videoReferencePreviews.length ? (
              <div className="referenceThumbs videoReferenceThumbs">
                {videoReferencePreviews.map((url, index) => (
                  <figure key={url}>
                    <LazyImage src={url} alt={videoReferenceFiles[index]?.name || t('references.videoReference', '视频参考图')} />
                    <button type="button" onClick={removeVideoReferenceImage} aria-label={t('references.remove', '移除参考图')}>
                      <X size={13} />
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        ) : mode === 'video' ? (
          <button type="button" className="collapsedWorkbenchBlock referenceCollapsedBlock" onClick={() => toggleLayoutSection('references')}>
            <Upload size={16} />
            <span>{videoReferenceFiles.length ? t('references.collapsedVideoSelected', '参考图已收起，共 1 张') : t('references.collapsedSimple', '参考图已收起，点击展开。')}</span>
          </button>
        ) : null}
        {layoutSections.parameters && mode !== 'video' ? (
          <div className="routeStrip autoRouteStrip">
            <span><SlidersHorizontal size={15} /> {t('composer.routeLabel', '接口')}</span>
            <p>{composerRouteLabel}</p>
          </div>
        ) : layoutSections.parameters ? (
          <div className="routeStrip">
            <span><Video size={15} /> {t('composer.videoRouteLabel', '视频接口')}</span>
            <div><button type="button" className="active">{t('composer.videoTask', '任务')}</button></div>
          </div>
        ) : null}
        {layoutSections.parameters ? <div className="controlGrid">
          {mode === 'video' ? (
            <>
                <label className="controlField modelField">
                  <span>{t('params.videoModel', '视频模型')}</span>
                  <select value={hasVideoModels ? videoModel : ''} onChange={(event) => setVideoModel(event.target.value)} disabled={!hasVideoModels}>
                    {hasVideoModels ? videoModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>) : (
                      <option value="">{t('params.currentKeyNoVideo', '当前 Key 未开放视频模型')}</option>
                    )}
                  </select>
                </label>
              <div className="controlField">
                <span>{t('params.duration', '时长')}</span>
                <div className="optionSegment durationSegment">
                  {VIDEO_DURATIONS.map((item) => (
                    <button type="button" className={videoDuration === item ? 'active' : ''} key={item} onClick={() => setVideoDuration(item)}>
                      {item}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField wideControl">
                <span>{t('params.videoAspect', '视频比例')}</span>
                <div className="optionSegment videoSizeSegment">
                  {VIDEO_ASPECT_OPTIONS.map((item) => (
                    <button type="button" className={videoAspect === item.value ? 'active' : ''} key={item.value} onClick={() => setVideoAspect(item.value)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.fps', '帧率')}</span>
                <div className="optionSegment fpsSegment">
                  {VIDEO_FPS_OPTIONS.map((item) => (
                    <button type="button" className={videoFps === item ? 'active' : ''} key={item} onClick={() => setVideoFps(item)}>
                      {item} fps
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField videoSpecField">
                <span>{t('params.output', '输出')}</span>
                <strong>{videoSize.width} x {videoSize.height}</strong>
              </div>
              <div className="controlField wideControl">
                <span>{t('params.motion', '镜头运动')}</span>
                <div className="optionSegment motionSegment">
                  {VIDEO_MOTIONS.map((item) => (
                    <button type="button" className={videoMotion === item.value ? 'active' : ''} key={item.value} onClick={() => setVideoMotion(item.value)}>
                      {videoMotionLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.style', '风格')}</span>
                <div className="optionSegment videoStyleSegment">
                  {VIDEO_STYLES.map((item) => (
                    <button type="button" className={videoStyle === item.value ? 'active' : ''} key={item.value} onClick={() => setVideoStyle(item.value)}>
                      {videoStyleLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.videoQuality', '视频画质')}</span>
                <div className="optionSegment videoQualitySegment">
                  {VIDEO_QUALITY.map((item) => (
                    <button type="button" className={videoQuality === item ? 'active' : ''} key={item} onClick={() => setVideoQuality(item)}>
                      {item === 'auto' ? t('params.auto', '自动') : item === 'high' ? t('params.high', '高') : t('params.standard', '标准')}
                    </button>
                  ))}
                </div>
              </div>
              <label className="controlField wideControl negativePromptField">
                <span>{t('params.negativePrompt', '负面提示词')}</span>
                <input
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder={t('params.negativePromptPlaceholder', '例如：不要字幕、水印、畸变、闪烁、手部变形')}
                />
              </label>
            </>
          ) : (
            <>
              <label className="controlField modelField">
                <span>{t('params.imageModel', '图片模型')}</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {imageModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                </select>
              </label>
              <div className="controlField countField">
                <div className="fieldHead">
                  <span>{t('params.imageCount', '图片数量')}</span>
                  <strong>{countValue}</strong>
                </div>
                <input
                  type="range"
                  min={imageCountRange.min}
                  max={imageCountRange.max}
                  value={countValue}
                  onChange={(event) => setCount(clampCountForProvider(event.target.value, currentImageProvider, normalizeCount))}
                />
              </div>
              <div className="controlField wideControl">
                <span>{t('params.aspect', '尺寸比例')}</span>
                <div className="optionSegment sizeSegment">
                  {imageAspectOptions.map((item) => (
                    <button
                      type="button"
                      className={aspect === item.value ? 'active' : ''}
                      key={item.value}
                      onClick={() => {
                        setAspect(item.value);
                        if (item.value !== 'custom') setCustomSize(item.size);
                      }}
                    >
                      {aspectLabel(item)}
                    </button>
                  ))}
                </div>
                {aspect === 'custom' ? (
                  <>
                    <select className="compactSelect" aria-label={t('params.apiSize', '接口尺寸')} value={customSize} onChange={(event) => setCustomSize(normalizeSize(event.target.value))}>
                      {customSizeOptions.map((item) => <option key={item.value} value={item.value}>{customSizeLabel(item)}</option>)}
                    </select>
                  </>
                ) : null}
              </div>
              <div className="controlField">
                <span>{t('params.quality', '质量')}</span>
                <div className="optionSegment qualitySegment">
                  {imageQualityOptions.map((item) => (
                    <button type="button" className={quality === item ? 'active' : ''} key={item} onClick={() => setQuality(item)}>
                      {qualityLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.resolution', '分辨率')}</span>
                <div className="optionSegment resolutionSegment">
                  {imageResolutionTierOptions.map((item) => (
                    <button type="button" className={resolutionTier === item.value ? 'active' : ''} key={item.value} onClick={() => setResolutionTier(item.value)}>
                      {resolutionTierLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.format', '格式')}</span>
                <div className="optionSegment formatSegment">
                  {imageOutputFormatOptions.map((item) => (
                    <button type="button" className={outputFormat === item ? 'active' : ''} key={item} onClick={() => setOutputFormat(item)}>
                      {OUTPUT_FORMAT_LABELS[item] || item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.moderation', '审核')}</span>
                <div className="optionSegment moderationSegment">
                  {MODERATION.map((item) => (
                    <button type="button" className={moderation === item ? 'active' : ''} key={item} onClick={() => setModeration(item)}>
                      {moderationLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div> : (
          <button type="button" className="collapsedWorkbenchBlock" onClick={() => toggleLayoutSection('parameters')}>
            <SlidersHorizontal size={16} />
            <span>{mode === 'video' ? `${videoAspect} · ${videoDuration}s · ${videoFps}fps` : `${size} · ${RESOLUTION_TIER_LABELS[resolutionTier]} · ${qualityLabel(quality)}`}</span>
          </button>
        )}
        {layoutSections.parameters ? <div className="billingStrip">
          <span>{t('params.billingModelSource', '模型来源：{value}', {
            value: mode === 'video'
              ? (modelsStatus === 'loading' ? t('params.loadingVideoModels', '正在读取视频模型') : hasVideoModels ? t('params.availableVideoModels', '当前 Key 可用视频模型') : t('params.unavailableVideoModels', '当前 Key 未开放视频模型'))
              : modelsStatus === 'ready'
                ? t('params.availableModels', '当前 Key 可用模型')
                : modelsStatus === 'loading'
                  ? t('params.loadingModels', '正在读取模型')
                  : t('params.defaultModels', '默认模型')
          })}</span>
          <span>{t('params.billingUnit', '计费口径：{value}', { value: mode === 'video' ? modelBillingUnitLabel(activeVideoModelInfo, t('params.videoUnit', '段'), 1, t) : modelBillingLabel(activeModelInfo, countValue, t) })}</span>
          {mode === 'video' && videoTask?.task_id ? <span>{t('params.videoTask', '任务：{value}', { value: videoTask.task_id })}</span> : null}
          <span>{t('params.usage', '账户用量：{value}', { value: usageSummary || t('params.usageFallback', '生成后以后台记录为准') })}</span>
        </div> : null}
        <div className="deskActions">
          <button type="button" onClick={optimizeCurrentPrompt} disabled={optimizingPrompt}>
            {optimizingPrompt ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}
            {optimizingPrompt ? t('composer.optimizing', '优化中') : `AI ${t('composer.optimize', '优化')}`}
          </button>
          <button type="button" className={`primaryAction ${generationActionClass}`} onClick={handleGenerateAction} disabled={generationActionDisabled}>
            {generationActionIcon}
            {generationActionLabel}
          </button>
        </div>
        {!layoutSections.bottomComposer ? (
          <>
            <ProgressBar progress={progress} active={status === 'loading' || status === 'success' || progress.stage === 'failed' || progress.stage === 'pending_review'} t={t} />
            <GenerationTimingPanel timing={timing} t={t} />
            {message ? <p className={`statusLine ${status}`}>{message}</p> : null}
            {isGenerating ? (
              <button type="button" className="composerStopAction" onClick={stopGeneration}>
                <X size={14} />
                {t('composer.stopWaiting', '停止当前等待')}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <section className={`resultStage ${hasPrimaryResult ? 'hasResult' : ''}`}>
        <div className="resultStageHead">
          <strong>{mode === 'video' ? t('canvas.videoResult', '视频结果') : t('composer.resultTitle', '生成结果')}</strong>
          <span>{hasPrimaryResult ? t('composer.resultCount', '共 {count} 张', { count: mode === 'video' ? videoResults.length : results.length }) : t('composer.pending', '待生成')}</span>
        </div>
        {mode === 'video' ? (
          <VideoResultGrid urls={videoResults} downloadMeta={currentDownloadMeta} onPreview={(url, index) => setPreviewVideo({ url, index })} onShare={handleShareResult} t={t} />
        ) : (
          <ResultGrid urls={results} outputFormat={outputFormat} downloadMeta={currentDownloadMeta} onPreview={(url, index) => setPreviewImage({ url, index })} onShare={handleShareResult} t={t} />
        )}
      </section>
      <BottomComposerPanel
        composerFolded={composerFolded}
        composerRouteLabel={workspaceFlowMode === 'single' ? composerRouteLabel : ''}
        composerThreadHasContent={composerThreadHasContent}
        hasLiveStatus={workspaceFlowMode === 'single' && composerGenerationVisible}
        hasLineage={Boolean(selectedCanvasNode)}
        hasReferences={layoutSections.references}
        isOpen={layoutSections.bottomComposer}
        onClose={foldComposerPanel}
        onFoldToggle={toggleComposerFold}
        onOpen={openComposerPanel}
        paramsExpanded={layoutSections.composerParameters !== false}
        selectedCanvasNode={selectedCanvasNode}
        t={t}
      >
        {workspaceFlowMode === 'single' && layoutSections.bottomComposer && !composerFolded && composerGenerationVisible ? (
          <ComposerLiveStatus
            progress={progress}
            status={status}
            message={message}
            timing={timing}
            modelLabel={mode === 'video' ? videoModel : model}
            routeLabel={composerRouteLabel}
            isGenerating={isGenerating}
            onStop={stopGeneration}
            onRetry={openRegenerateDialog}
            now={composerNow}
            stallNoticeMs={GENERATION_STALL_NOTICE_MS}
            t={t}
          />
        ) : null}
        {layoutSections.bottomComposer && !composerFolded && composerThreadHasContent ? (
          <ComposerThread
            ref={composerThreadRef}
            messages={assistantMessages}
            onUseFinalPrompt={setPrompt}
            t={t}
          />
        ) : null}
        <ComposerPromptRow
          assistantDisabled={status === 'loading' || optimizingPrompt || caseResolving}
          generationActionClass={generationActionClass}
          generationActionDisabled={generationActionDisabled}
          generationActionIcon={compactGenerationActionIcon}
          generationActionLabel={generationActionLabel}
          isDroppingReference={referenceDropActive || videoDropActive}
          optimizingPrompt={optimizingPrompt}
          onAssistantAction={sendAssistantMessage}
          onChange={(event) => setPrompt(event.target.value)}
          onDragEnter={handleComposerReferenceDragEnter}
          onDragLeave={handleComposerReferenceDragLeave}
          onDragOver={handleComposerReferenceDragOver}
          onDrop={handleComposerReferenceDrop}
          onFocus={handleComposerPromptFocus}
          onGenerateAction={handleGenerateAction}
          onKeyDown={handleComposerPromptKeyDown}
          onPaste={handleComposerPromptPaste}
          placeholder={composerPromptPlaceholder}
          prompt={prompt}
          t={t}
        />
        {layoutSections.bottomComposer && !composerFolded ? (
          <ComposerParamShelf
            activeWorkspace={activeWorkspace}
            aspect={aspect}
            aspectLabel={aspectLabel}
            countValue={countValue}
            deskModeLabel={deskModeLabel}
            deskModes={DESK_MODES}
            hasVideoModels={hasVideoModels}
            imageAspectOptions={imageAspectOptions}
            imageCountRange={imageCountRange}
            imageCountSuffix={imageCountSuffix}
             imageModelOptions={imageModelOptions}
             imageQualityOptions={imageQualityOptions}
             imageResolutionTierOptions={imageResolutionTierOptions}
             layoutSections={layoutSections}
             mode={mode}
             model={model}
             providerProfiles={providerProfiles}
             activeProviderProfileId={activeProviderProfileId}
             onProviderChange={onSelectProvider}
             onAspectChange={setAspect}
            onCountChange={(value) => setCount(clampCountForProvider(value, currentImageProvider, normalizeCount))}
            onModeChange={setMode}
            onModelChange={setModel}
            onQualityChange={setQuality}
            onResolutionTierChange={setResolutionTier}
            onVideoAspectChange={setVideoAspect}
            onVideoDurationChange={setVideoDuration}
            onVideoModelChange={setVideoModel}
            quality={quality}
            qualityLabel={qualityLabel}
            resolutionTier={resolutionTier}
            resolutionTierLabel={resolutionTierLabel}
            resolutionTierLabels={RESOLUTION_TIER_LABELS}
            setCustomSize={setCustomSize}
            t={t}
            toggleLayoutSection={toggleLayoutSection}
            updateLayoutSections={updateLayoutSections}
            videoAspect={videoAspect}
            videoAspectOptions={VIDEO_ASPECT_OPTIONS}
            videoDuration={videoDuration}
            videoDurations={VIDEO_DURATIONS}
            videoModel={videoModel}
            videoModelOptions={videoModelOptions}
          />
        ) : null}
      </BottomComposerPanel>
        </>
      ) : null}
      {regenerateDialogOpen ? (
        <React.Suspense fallback={null}>
          <RegenerateDialog
            open={regenerateDialogOpen}
            mode={mode}
            prompt={prompt}
            progress={progress}
            status={status}
            message={message}
            isGenerating={isGenerating}
            imageAspectOptions={imageAspectOptions}
            imageCountRange={imageCountRange}
            imageModelOptions={imageModelOptions}
            imageQualityOptions={imageQualityOptions}
            imageResolutionTierOptions={imageResolutionTierOptions}
            aspect={aspect}
            aspectLabel={aspectLabel}
            countValue={countValue}
            model={model}
            onAspectChange={setAspect}
            onCountChange={(value) => setCount(clampCountForProvider(value, currentImageProvider, normalizeCount))}
            onConfirm={confirmRegenerate}
            onModelChange={setModel}
            onOpenBottomParams={openBottomParamShelf}
            onQualityChange={setQuality}
            onResolutionTierChange={setResolutionTier}
            onClose={() => setRegenerateDialogOpen(false)}
            quality={quality}
            qualityLabel={qualityLabel}
            resolutionTier={resolutionTier}
            resolutionTierLabel={resolutionTierLabel}
            t={t}
            videoAspect={videoAspect}
            videoAspectOptions={VIDEO_ASPECT_OPTIONS}
            videoDuration={videoDuration}
            videoDurations={VIDEO_DURATIONS}
            videoModel={videoModel}
            videoModelOptions={videoModelOptions}
            onVideoAspectChange={setVideoAspect}
            onVideoDurationChange={setVideoDuration}
            onVideoModelChange={setVideoModel}
          />
        </React.Suspense>
      ) : null}
      {generationConfirmOpen ? (
        <React.Suspense fallback={null}>
          <GenerationConfirmDialog
            open={generationConfirmOpen}
            billingLabel={generationConfirmTask?.mode === 'video'
              ? modelBillingUnitLabel(confirmTaskModelInfo, t('params.videoUnit', '段'), 1, t)
              : modelBillingLabel(confirmTaskModelInfo, generationConfirmTask?.count || 1, t)}
            confirmLabel={confirmTaskPrimaryLabel}
            countLabel={confirmTaskCountLabel}
            modeLabel={generationConfirmTask?.mode === 'video' ? t('workspace.video', '视频创作') : deskModeLabel(generationConfirmTask?.mode || mode)}
            modelLabel={generationConfirmTask?.mode === 'video' ? generationConfirmTask?.videoModel : generationConfirmTask?.model}
            onAdjustParams={adjustGenerationParams}
            onClose={closeGenerationConfirm}
            onConfirm={confirmGenerationAction}
            outputLabel={confirmTaskOutputLabel}
            prompt={generationConfirmTask?.prompt || ''}
            providerLabel={providerLabel(providerSettings, apiKey)}
            queueLabel={confirmTaskQueueLabel}
            referenceLabel={confirmTaskReferenceLabel}
            routeLabel={confirmTaskRouteLabel}
            t={t}
          />
        </React.Suspense>
      ) : null}
      <Lightbox
        url={previewImage?.url}
        fallbackSrc={previewImage?.fallbackSrc || ''}
        index={previewImage?.index || 0}
        outputFormat={outputFormat}
        downloadMeta={previewImage?.downloadMeta || currentDownloadMeta}
        t={t}
        onShare={handleShareResult}
        onClose={() => setPreviewImage(null)}
      />
      <VideoLightbox
        url={previewVideo?.url || previewVideo}
        index={previewVideo?.index || 0}
        downloadMeta={previewVideo?.downloadMeta || currentDownloadMeta}
        onClose={() => setPreviewVideo('')}
      />
    </section>
  );
}

function loadProviderWorkspaceState() {
  const legacySettings = loadProviderSettings();
  const library = loadProviderLibrary(legacySettings);
  const activeProfile = library.profiles.find((profile) => profile.id === library.activeProfileId) || library.profiles[0];
  const settings = activeProfile ? saveProviderSettings(providerSettingsFromProfile(activeProfile)) : legacySettings;
  return {
    library: activeProfile
      ? { ...library, activeProfileId: activeProfile.id }
      : library,
    settings,
    modelOptions: modelOptionsForProfile(activeProfile)
  };
}

function StudioApp() {
  const initialSession = useMemo(() => loadSession(), []);
  const initialCurrentSession = useMemo(() => (
    initialSession?.accessToken ? loadActiveCurrentSession() : loadCurrentSession()
  ), [initialSession?.accessToken]);
  const [siteData, setSiteData] = useState(null);
  const [session, setSession] = useState(() => initialSession);
  const [profile, setProfile] = useState(() => initialSession?.user || null);
  const [creditsEnabled, setCreditsEnabled] = useState(false);
  const [billingConfig, setBillingConfig] = useState({ credits: { enabled: false }, recharge: { enabled: false, creditCodeEnabled: false, shopUrl: '' } });
  const [billingOpen, setBillingOpen] = useState(false);
  const [providerConnections, setProviderConnections] = useState([]);
  const initialProviderWorkspaceRef = useRef(null);
  if (!initialProviderWorkspaceRef.current) initialProviderWorkspaceRef.current = loadProviderWorkspaceState();
  const initialProviderWorkspace = initialProviderWorkspaceRef.current;
  const [providerLibrary, setProviderLibrary] = useState(() => initialProviderWorkspace.library);
  const [providerSettings, setProviderSettings] = useState(() => initialProviderWorkspace.settings);
  const [client, setClient] = useState(() => createGatewayClient({ session: initialSession, providerSettings: initialProviderWorkspace.settings }));
  const [apiKey, setApiKey] = useState(null);
  const [keys, setKeys] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [favoriteTemplates, setFavoriteTemplates] = useState(() => loadTemplateFavorites());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const [firstRunRequest, setFirstRunRequest] = useState(null);
  const [inspirationUploadOpen, setInspirationUploadOpen] = useState(false);
  const [inspirationUploadDraft, setInspirationUploadDraft] = useState(null);
  const [bootError, setBootError] = useState('');
  const [historyItems, setHistoryItems] = useState(() => loadHistory());
  const [historyStatus, setHistoryStatus] = useState('idle');
  const [historyNextOffset, setHistoryNextOffset] = useState(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [modelOptions, setModelOptions] = useState(() => initialProviderWorkspace.modelOptions);
  const [modelsStatus, setModelsStatus] = useState('idle');
  const [modelSyncError, setModelSyncError] = useState(null);
  const [usageSummary, setUsageSummary] = useState('');
  const [theme, setTheme] = useState(() => loadTheme());
  const [language, setLanguage] = useState(() => loadStudioLanguage());
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(() => initialCurrentSession?.mode === 'video' ? 'video' : 'image');
  const [appendTemplateRequest, setAppendTemplateRequest] = useState(null);
  const [remoteSession, setRemoteSession] = useState(null);
  const [embeddedAuthStatus, setEmbeddedAuthStatus] = useState(() => (
    STUDIO_STANDALONE && isEmbeddedStudioLaunch() ? 'pending' : 'idle'
  ));
  const [remoteSessionReady, setRemoteSessionReady] = useState(() => !initialSession?.accessToken);
  const [currentSessionSnapshot, setCurrentSessionSnapshot] = useState(() => initialCurrentSession);
  const [deskSessionId, setDeskSessionId] = useState(() => initialCurrentSession?.sessionId || `desk-${Date.now()}`);
  const [canvasFocusSignal, setCanvasFocusSignal] = useState(0);
  const sessionSaveRef = useRef({ timer: null, lastPayload: '' });
  const isLibraryLocked = LIBRARY_AUTH_REQUIRED && !session?.accessToken;
  const t = useMemo(() => createTranslator(language), [language]);
  const persistenceKey = session?.accessToken || 'local-workspace';
  const assistantConfig = useMemo(() => assistantConfigForLibrary(providerLibrary), [providerLibrary]);
  const assistantProviderSettings = useMemo(() => {
    const selected = providerLibrary.profiles.find((item) => item.id === assistantConfig.providerProfileId);
    if (!selected) return providerSettings;
    return {
      ...providerSettingsFromProfile(selected),
      responsesModel: assistantConfig.model
    };
  }, [providerLibrary, assistantConfig.providerProfileId, assistantConfig.model, providerSettings]);
  const assistantClient = useMemo(() => createGatewayClient({
    session,
    providerSettings: assistantProviderSettings
  }), [session, assistantProviderSettings]);

  function historyScope() {
    return historyScopeFromIdentity(session, profile);
  }

  async function hydrateSession(options = {}) {
    const nextSession = loadSession();
    if (!nextSession?.accessToken) {
      if (!options.keepExisting) {
        setSession(null);
        setProfile(null);
        setApiKey(null);
        setKeys([]);
      }
      return false;
    }

    const nextClient = createGatewayClient({ session: nextSession, providerSettings });
    try {
      const nextProfile = await nextClient.profile().catch(() => nextClient.me());
      setClient(nextClient);
      setSession(nextSession);
      setProfile(nextProfile || nextSession.user || null);
      return true;
    } catch {
      if (STUDIO_STANDALONE) clearSession();
      if (!options.keepExisting || STUDIO_STANDALONE) {
        setSession(null);
        setProfile(null);
        setApiKey(null);
        setKeys([]);
      }
      return false;
    }
  }

  function handleProviderChange(nextSettings) {
    const savedSettings = saveProviderSettings(nextSettings);
    setProviderSettings(savedSettings);
    setClient((current) => {
      current.setProviderSettings(savedSettings);
      return current;
    });
    setProviderLibrary((current) => {
      const profileId = savedSettings.providerProfileId || current.activeProfileId;
      const currentProfile = current.profiles.find((profile) => profile.id === profileId);
      return upsertProviderProfile({ ...current, activeProfileId: profileId }, {
        id: profileId,
        name: currentProfile?.name,
        settings: savedSettings,
        modelOptions
      });
    });
  }

  function handleAssistantConfigChange(nextConfig) {
    setProviderLibrary((current) => saveProviderLibrary({
      ...current,
      assistant: {
        ...current.assistant,
        ...nextConfig
      }
    }));
  }

  async function handleBindProviderConnection(input) {
    const connection = await client.bindProviderConnection(input);
    if (connection) setProviderConnections((current) => [connection, ...current.filter((item) => item.id !== connection.id)]);
    return connection;
  }

  async function handleDeleteProviderConnection(connectionId) {
    await client.removeProviderConnection(connectionId);
    setProviderConnections((current) => current.filter((item) => item.id !== connectionId));
  }

  async function handleTestProviderConnection(connectionId) {
    const connection = await client.testProviderConnection(connectionId);
    if (connection) setProviderConnections((current) => current.map((item) => item.id === connection.id ? connection : item));
    return connection;
  }

  function handleSelectProvider(profileId) {
    const profile = providerLibrary.profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const nextSettings = saveProviderSettings(providerSettingsFromProfile(profile));
    const nextLibrary = saveProviderLibrary({ ...providerLibrary, activeProfileId: profile.id });
    setProviderLibrary(nextLibrary);
    setProviderSettings(nextSettings);
    setModelOptions(modelOptionsForProfile(profile));
    setClient((current) => {
      current.setProviderSettings(nextSettings);
      return current;
    });
  }

  function handleSaveProvider({ id, name, settings, modelOptions: cachedModelOptions, activate = true } = {}) {
    const profileId = id || createProviderProfileId();
    const nextLibrary = upsertProviderProfile({
      ...providerLibrary,
      activeProfileId: activate ? profileId : providerLibrary.activeProfileId
    }, {
      id: profileId,
      name,
      settings: { ...settings, providerProfileId: profileId },
      modelOptions: cachedModelOptions
    });
    setProviderLibrary(nextLibrary);
    if (!activate) return;
    const profile = nextLibrary.profiles.find((item) => item.id === profileId);
    const nextSettings = saveProviderSettings(providerSettingsFromProfile(profile));
    setProviderSettings(nextSettings);
    setModelOptions(modelOptionsForProfile(profile));
    setClient((current) => {
      current.setProviderSettings(nextSettings);
      return current;
    });
  }

  async function handleFirstRunComplete(input) {
    const reusableProfile = providerLibrary.profiles.length === 1
      && !providerLibrary.profiles[0].manualGatewayBaseUrl
      ? providerLibrary.profiles[0]
      : null;
    const profileId = reusableProfile?.id || createProviderProfileId();
    const settings = {
      providerProfileId: profileId,
      providerId: input.providerId,
      apiKeySource: 'manual',
      route: 'auto',
      manualApiKey: input.apiKey,
      manualGatewayBaseUrl: input.baseUrl,
      imageGenerationModel: input.imageGenerationModel,
      imageEditModel: input.imageEditModel || input.imageGenerationModel,
      videoModel: '',
      videoGatewayBaseUrl: '',
      responsesModel: '',
      partialImages: 2
    };
    handleSaveProvider({ id: profileId, settings, activate: true });
    saveFirstRunState('completed');
    setActiveWorkspace('image');
    setFirstRunOpen(false);
    setFirstRunRequest({
      id: `first-run-${Date.now()}`,
      prompt: input.prompt,
      model: input.imageGenerationModel
    });
  }

  function handleCloseFirstRun() {
    saveFirstRunState('dismissed');
    setFirstRunOpen(false);
  }

  function handleOpenFirstRun() {
    setSettingsOpen(false);
    setFirstRunOpen(true);
  }

  function handleDeleteProvider(profileId) {
    const nextLibrary = deleteProviderProfile(providerLibrary, profileId);
    setProviderLibrary(nextLibrary);
    if (providerLibrary.activeProfileId !== profileId) return;
    const nextProfile = nextLibrary.profiles[0];
    if (!nextProfile) return;
    const nextSettings = saveProviderSettings(providerSettingsFromProfile(nextProfile));
    setProviderSettings(nextSettings);
    setModelOptions(modelOptionsForProfile(nextProfile));
    setClient((current) => {
      current.setProviderSettings(nextSettings);
      return current;
    });
  }

  function syncProviderModels(options = {}) {
    setModelsStatus('loading');
    return syncGatewayModels({
      session,
      providerSettings,
      apiKey,
      signal: options.signal
    })
      .then((result) => {
        setModelOptions(result.modelOptions);
        setModelsStatus(result.modelsStatus);
        setModelSyncError(result.modelSyncError || null);
        setUsageSummary(result.usageSummary);
        setProviderLibrary((current) => {
          const profileId = current.activeProfileId || providerSettings.providerProfileId;
          const profile = current.profiles.find((item) => item.id === profileId);
          if (!profile) return current;
          return upsertProviderProfile(current, {
            id: profile.id,
            name: profile.name,
            settings: providerSettings,
            modelOptions: result.modelOptions
          });
        });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setModelOptions({ image: [], responses: [], video: [] });
        setModelsStatus('fallback');
        setModelSyncError({
          code: 'unknown',
          status: Number(error?.status || 0) || 0,
          message: String(error?.message || 'MODEL_SYNC_FAILED').slice(0, 320),
          endpoint: '',
          retryable: true,
          requestId: String(error?.requestId || '').slice(0, 160)
        });
        setUsageSummary('后台未开放消费接口');
      });
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('app.title', '创作工作台');
    saveStudioLanguage(language);
  }, [language, t]);

  useEffect(() => {
    if (!STUDIO_STANDALONE || embeddedAuthStatus !== 'pending') return;
    let active = true;
    bootstrapEmbeddedSession()
      .then((nextSession) => {
        if (!active) return;
        if (nextSession?.accessToken) {
          setSession(nextSession);
          setProfile(nextSession.user || null);
          setClient(createGatewayClient({ session: nextSession, providerSettings }));
        }
        setEmbeddedAuthStatus(nextSession?.accessToken ? 'ready' : 'failed');
      })
      .catch(() => {
        if (active) setEmbeddedAuthStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [embeddedAuthStatus, providerSettings]);

  useEffect(() => {
    if (STUDIO_STANDALONE && !session?.accessToken) {
      if (embeddedAuthStatus === 'pending') return;
      window.location.replace(getLoginUrl());
    }
  }, [session?.accessToken, embeddedAuthStatus]);

  useEffect(() => {
    if (!STUDIO_STANDALONE || firstRunOpen) return;
    if (shouldOpenFirstRun({
      authenticated: Boolean(session?.accessToken),
      connectionReady: connectionReady(providerSettings, apiKey, Boolean(session?.accessToken))
    })) {
      setFirstRunOpen(true);
    }
  }, [
    session?.accessToken,
    apiKey?.key,
    providerSettings.providerProfileId,
    providerSettings.apiKeySource,
    providerSettings.manualGatewayBaseUrl,
    providerSettings.manualApiKey,
    firstRunOpen
  ]);

  useEffect(() => {
    if (!session?.accessToken) {
      let active = true;
      setCreditsEnabled(false);
      setSiteData(null);
      loadStaticLibraryData()
        .then((nextSiteData) => {
          if (!active) return;
          setSiteData(nextSiteData);
          setSelectedCase(null);
        })
        .catch(() => {
          if (!active) return;
          setSiteData(EMPTY_SITE_DATA);
          setSelectedCase(null);
        });
      return () => {
        active = false;
      };
    }
    let active = true;
    const libraryClient = createHistoryClient({ session });
    setSiteData(null);
    libraryClient.listLibrary()
      .then((payload) => {
        if (!active) return;
        const nextSiteData = normalizeLibraryPayload(payload);
        if (!nextSiteData.cases.length) {
          return loadStaticLibraryData();
        }
        return nextSiteData;
      })
      .then((nextSiteData) => {
        if (!active) return;
        setSiteData(nextSiteData);
        const savedDraft = loadDraft();
        const cases = nextSiteData.cases || [];
        const draftedCase = savedDraft?.caseId ? cases.find((item) => String(item.id) === String(savedDraft.caseId)) : null;
        setSelectedCase(draftedCase || null);
      })
      .catch((error) => {
        if (!active) return;
        loadStaticLibraryData()
          .then((nextSiteData) => {
            if (!active) return;
            setSiteData(nextSiteData);
            setBootError('');
          })
          .catch(() => {
            if (!active) return;
            setSiteData(EMPTY_SITE_DATA);
            setBootError(error.message);
          });
      });
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    hydrateSession({ keepExisting: true });

    const sync = () => hydrateSession({ keepExisting: true });
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return;
    let active = true;
    const nextClient = createGatewayClient({ session, providerSettings });
    setClient(nextClient);
    Promise.all([
      nextClient.profile().catch(() => nextClient.me()),
      nextClient.ensureApiKey(),
      nextClient.listKeys().catch(() => []),
      STUDIO_STANDALONE ? nextClient.getStandaloneConfig().catch(() => null) : Promise.resolve(null),
      STUDIO_STANDALONE ? nextClient.listProviderConnections().catch(() => []) : Promise.resolve([])
    ]).then(([nextProfile, nextKey, nextKeys, standaloneConfig, nextProviderConnections]) => {
      if (!active) return;
      setProfile(nextProfile);
      setApiKey(nextKey);
      setKeys(nextKeys.length ? nextKeys : nextKey ? [nextKey] : []);
      setCreditsEnabled(STUDIO_STANDALONE && standaloneConfig?.credits?.enabled === true);
      if (standaloneConfig) setBillingConfig(standaloneConfig);
      setProviderConnections(nextProviderConnections);
    }).catch((error) => {
      if (!active) return;
      setBootError(error.message);
    });
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    const controller = new AbortController();
    syncProviderModels({ signal: controller.signal });
    return () => controller.abort();
  }, [
    providerSettings.providerId,
    providerSettings.apiKeySource,
    providerSettings.providerProfileId,
    providerSettings.manualApiKey,
    providerSettings.manualGatewayBaseUrl,
    apiKey?.key,
    session?.accessToken
  ]);

  useEffect(() => {
    if (modelsStatus !== 'ready') return;
    const imageModel = modelOptions.image?.[0]?.id || '';
    const videoModel = modelOptions.video?.[0]?.id || '';
    if (!imageModel && !videoModel) return;
    const patch = {};
    if (!String(providerSettings.imageGenerationModel || '').trim() && imageModel) patch.imageGenerationModel = imageModel;
    if (!String(providerSettings.imageEditModel || '').trim() && imageModel) patch.imageEditModel = imageModel;
    if (!String(providerSettings.videoModel || '').trim() && videoModel) patch.videoModel = videoModel;
    if (Object.keys(patch).length) {
      handleProviderChange({ ...providerSettings, ...patch });
    }
  }, [
    modelsStatus,
    modelOptions.image,
    modelOptions.responses,
    modelOptions.video,
    providerSettings.imageGenerationModel,
    providerSettings.imageEditModel,
    providerSettings.videoModel
  ]);

  useEffect(() => {
    let active = true;
    const historyClient = createHistoryClient({ session });
    const scope = historyScope();
    setHistoryStatus('loading');
    setHistoryNextOffset(null);
    Promise.all([
      historyClient.listRecords({ limit: HISTORY_PAGE_SIZE }),
      loadPersistedHistory(scope)
    ])
      .then(([{ records, nextOffset }, localRecords]) => {
        if (!active) return;
        const merged = mergeHistoryRecords(records, localRecords);
        setHistoryItems(merged);
        saveHistory(merged, scope);
        setHistoryNextOffset(nextOffset);
        setHistoryStatus('synced');
      })
      .catch(async () => {
        if (!active) return;
        const localRecords = await loadPersistedHistory(scope);
        if (!active) return;
        setHistoryItems(localRecords);
        setHistoryStatus(localRecords.length ? 'local' : 'idle');
      });
    return () => {
      active = false;
    };
  }, [persistenceKey, profile?.id, profile?.email, profile?.username]);

  function handleLoadMoreHistory() {
    if (historyNextOffset === null || historyLoadingMore) return;
    const historyClient = createHistoryClient({ session });
    const scope = historyScope();
    setHistoryLoadingMore(true);
    historyClient.listRecords({ limit: HISTORY_PAGE_SIZE, offset: historyNextOffset })
      .then(({ records, nextOffset }) => {
        const merged = mergeHistoryRecords(records, historyItems);
        setHistoryItems(merged);
        saveHistory(merged, scope);
        setHistoryNextOffset(nextOffset);
        setHistoryStatus('synced');
      })
      .catch(() => setHistoryStatus(historyItems.length ? 'local' : 'idle'))
      .finally(() => setHistoryLoadingMore(false));
  }

  useEffect(() => {
    let active = true;
    setRemoteSessionReady(false);
    // Local-first: the sessionId is the single source of truth here. We
    // seed the snapshot from localStorage so the desk renders instantly
    // (anonymous desk-* sessions have no remote counterpart), then layer
    // the remote snapshot on top if one exists — but we never rewrite
    // deskSessionId based on what the server returned. The previous
    // "adopt remote sessionId" branch was the root cause of canvas
    // cross-session bleed: a user clicks session B, the server (keyed on
    // user identity rather than sessionId) returns A's content, and we'd
    // bounce the user back to A while persisting A's canvas under B.
    const localSnapshot = loadCurrentSession(deskSessionId);
    if (localSnapshot) {
      setCurrentSessionSnapshot({ ...localSnapshot, sessionId: deskSessionId });
    }
    if (!session?.accessToken) {
      setRemoteSession(null);
      setRemoteSessionReady(true);
      return () => { active = false; };
    }
    const historyClient = createHistoryClient({ session });
    historyClient.getCurrentSession(deskSessionId)
      .then((snapshot) => snapshot ? historyClient.resolveSessionAssets(snapshot) : null)
      .then((snapshot) => {
        if (!active) return;
        if (snapshot) {
          // Stamp with the authoritative sessionId; do not adopt the
          // server's sessionId even if it differs — the user's click
          // decides which session is open.
          const remoteSnapshot = { ...snapshot, sessionId: deskSessionId };
          const remoteUpdated = Date.parse(remoteSnapshot.updatedAt || '') || 0;
          const localUpdated = Date.parse(localSnapshot?.updatedAt || '') || 0;
          if (localUpdated && localUpdated > remoteUpdated && hasMeaningfulSessionContent(localSnapshot)) {
            setCurrentSessionSnapshot({ ...localSnapshot, sessionId: deskSessionId });
          } else {
            const merged = saveCurrentSession({ ...remoteSnapshot, sessionId: deskSessionId });
            setCurrentSessionSnapshot(merged);
          }
        }
        setRemoteSession(snapshot ? { ...snapshot, sessionId: deskSessionId } : null);
        setRemoteSessionReady(true);
      })
      .catch(() => {
        if (!active) return;
        setRemoteSession(null);
        setRemoteSessionReady(true);
      });
    return () => {
      active = false;
    };
  }, [deskSessionId, persistenceKey, profile?.id, profile?.email, profile?.username]);

  // Derive the user's own top past work into inspiration cases and merge them
  // ahead of the community library, so the wall opens with "My Highlights"
  // pulled from real history rather than only bundled community prompts.
  const historyHighlightCases = useMemo(
    () => buildHistoryInspirationCases(historyItems, { t }),
    [historyItems, t]
  );
  const inspirationSourceCases = useMemo(
    () => mergeHistoryInspirationCases(siteData?.cases || [], historyHighlightCases),
    [siteData, historyHighlightCases]
  );
  const categoryGroups = useMemo(() => buildCategoryGroups(inspirationSourceCases), [inspirationSourceCases]);
  const visibleCases = useMemo(() => {
    const source = orderTemplates(inspirationSourceCases);
    const needle = query.trim().toLowerCase();
    return source.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category;
      const matchesQuery = !needle || `${item.title} ${categoryLabel(item.category)} ${item.sourceLabel} ${item.sourceName} ${item.promptPreview}`.toLowerCase().includes(needle);
      const matchesFavorite = !showFavoritesOnly || favoriteTemplates.has(templateKey(item));
      return matchesCategory && matchesQuery && matchesFavorite;
    });
  }, [inspirationSourceCases, query, category, favoriteTemplates, showFavoritesOnly]);

  const filteredHistoryItems = useMemo(() => {
    if (activeWorkspace === 'image') return historyItems.filter((item) => item.mode !== 'video' && item.kind !== 'video');
    if (activeWorkspace === 'video') return historyItems.filter((item) => item.mode === 'video' || item.kind === 'video');
    return historyItems;
  }, [historyItems, activeWorkspace]);
  const workspaceIsDesk = activeWorkspace === 'image' || activeWorkspace === 'video';
  const currentProject = useMemo(
    () => currentSessionProject(currentSessionSnapshot || remoteSession, CURRENT_PROJECT_QUEUE_STATUSES),
    [currentSessionSnapshot, remoteSession]
  );

  function handleWorkspaceChange(nextWorkspace, options = {}) {
    setSettingsOpen(false);
    setActiveWorkspace(nextWorkspace);
    setQuery('');
    setCategory('All');
    if ((nextWorkspace === 'image' || nextWorkspace === 'video') && selectedHistory && options.preserveHistory) {
      handleSelectHistory(selectedHistory, { openWorkspace: false, adoptSession: true });
    }
    if (nextWorkspace !== 'history' && !options.preserveHistory) {
      setSelectedHistory(null);
    }
    setSelectedCase((current) => {
      if (!current) return current;
      if (nextWorkspace === 'video') return current.kind === 'video-inspiration' ? current : null;
      if (nextWorkspace === 'image') return current.kind === 'video-inspiration' ? null : current;
      return current;
    });
  }

  function handleNewSession() {
    if (sessionSaveRef.current.timer) {
      window.clearTimeout(sessionSaveRef.current.timer);
      sessionSaveRef.current.timer = null;
    }
    sessionSaveRef.current.lastPayload = '';
    clearDraft();
    const previousDeskSessionId = deskSessionId;
    const nextDeskSessionId = `desk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearCurrentSessionCache(previousDeskSessionId);
    setCurrentSessionSnapshot(null);
    setRemoteSession(null);
    setSelectedCase(null);
    setSelectedHistory(null);
    setAppendTemplateRequest(null);
    setQuery('');
    setCategory('All');
    setActiveWorkspace('image');
    setDeskSessionId(nextDeskSessionId);
    const latestSession = loadSession() || session;
    const historyClient = createHistoryClient({ session: latestSession });
    historyClient.clearCurrentSession(nextDeskSessionId).catch(() => {});
  }

  async function refreshProfile() {
    if (!client || !session?.accessToken) return;
    const nextProfile = await client.profile().catch(() => profile);
    setProfile(nextProfile);
  }

  async function handleRequireLogin() {
    const ready = await hydrateSession();
    if (ready) return;
    window.location.href = getLoginUrl();
  }

  async function handleLogout() {
    try {
      await client?.logout?.();
    } catch {
      // Local session cleanup must still complete if the server is unavailable.
    }
    clearSession();
    setSession(null);
    setProfile(null);
    setApiKey(null);
    setKeys([]);
    setSiteData(EMPTY_SITE_DATA);
    setSelectedCase(null);
    setSelectedHistory(null);
    setHistoryItems(loadHistory('guest'));
    setHistoryStatus('idle');
    setModelOptions({ image: [], responses: [], video: [] });
    setModelsStatus('idle');
    setUsageSummary('');
  }

  function handleSelectKey(nextKey) {
    saveSelectedKeyId(nextKey.id);
    setApiKey(nextKey);
  }

  function handleLanguageToggle() {
    setLanguage((current) => nextLanguage(current));
  }

  function handleSelectCase(item) {
    setSelectedHistory(null);
    setSelectedCase(item);
  }

  async function handleAppendTemplate(item) {
    setSelectedHistory(null);
    const resolved = await resolveLibraryCase(item, { updateSelection: false }).catch(() => item);
    const nextPrompt = resolved?.prompt || resolved?.promptPreview || item?.prompt || item?.promptPreview || item?.summary || '';
    if (!nextPrompt) return;
    setSelectedCase(resolved || item);
    setActiveWorkspace(!STUDIO_STANDALONE && (resolved || item)?.kind === 'video-inspiration' ? 'video' : 'image');
    setAppendTemplateRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt: nextPrompt
    });
  }

  async function handleCreateCommunityPrompt(item) {
    const historyClient = createHistoryClient({ session });
    const created = await historyClient.createCommunityPrompt(item);
    if (!created) return;
    setSiteData((current) => ({
      ...(current || {}),
      totalCases: Math.max(Number(current?.totalCases || 0) + 1, (current?.cases || []).length + 1),
      categories: [...new Set([...(current?.categories || []), created.category].filter(Boolean))].sort(),
      cases: [created, ...((current?.cases || []).filter((caseItem) => String(caseItem.id) !== String(created.id)))]
    }));
    setCategory(created.category || 'Community Prompts');
    setActiveWorkspace('inspiration');
    setInspirationUploadOpen(false);
    setInspirationUploadDraft(null);
  }

  async function handleOpenCommunityShare(draft) {
    if (!session?.accessToken) {
      await handleRequireLogin();
      return;
    }
    setInspirationUploadDraft(draft || null);
    setInspirationUploadOpen(true);
  }

  async function handleReactTemplate(item, action) {
    if (action === 'copy') {
      const prompt = item.prompt || item.promptPreview || item.summary || '';
      if (prompt) await navigator.clipboard?.writeText(prompt).catch(() => {});
    }
    if (action === 'share') {
      const prompt = item.prompt || item.promptPreview || item.summary || '';
      const shareText = `${item.title || 'Prompt'}\n\n${prompt}`;
      if (navigator.share) await navigator.share({ title: item.title || 'Prompt', text: shareText }).catch(() => {});
      else if (prompt) await navigator.clipboard?.writeText(shareText);
    }
    if (!String(item?.id || '').startsWith('share-')) return;
    const historyClient = createHistoryClient({ session });
    const updated = await historyClient.reactCommunityPrompt(item.id, action).catch(() => null);
    if (!updated) return;
    setSiteData((current) => current?.cases ? ({
      ...current,
      cases: current.cases.map((caseItem) => String(caseItem.id) === String(updated.id) ? { ...caseItem, ...updated } : caseItem)
    }) : current);
  }

  function handleToggleTemplateFavorite(item) {
    const key = templateKey(item);
    if (!key) return;
    setFavoriteTemplates((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveTemplateFavorites(next);
      return next;
    });
  }

  async function resolveLibraryCase(item, options = {}) {
    const updateSelection = options.updateSelection !== false;
    if (!session?.accessToken || item?.prompt || item?.staticLibrary) return item;
    const historyClient = createHistoryClient({ session });
    if (item?.kind === 'video-inspiration') {
      const resolvedInspiration = await historyClient.getVideoInspiration(item.id);
      if (!resolvedInspiration) return item;
      const nextCase = { ...item, ...resolvedInspiration };
      setSiteData((current) => {
        if (!current?.videoInspirations) return current;
        return {
          ...current,
          videoInspirations: current.videoInspirations.map((inspiration) => String(inspiration.id) === String(nextCase.id) ? nextCase : inspiration)
        };
      });
      if (updateSelection) {
        setSelectedCase((current) => (current && String(current.id) === String(nextCase.id) ? nextCase : current));
      }
      return nextCase;
    }
    const resolvedCase = await historyClient.getLibraryCase(item.id);
    if (!resolvedCase) return item;
    const nextCase = { ...item, ...resolvedCase };
    setSiteData((current) => {
      if (!current?.cases) return current;
      return {
        ...current,
        cases: current.cases.map((caseItem) => String(caseItem.id) === String(nextCase.id) ? nextCase : caseItem)
      };
    });
    if (updateSelection) {
      setSelectedCase((current) => (current && String(current.id) === String(nextCase.id) ? nextCase : current));
    }
    return nextCase;
  }

  function handleSelectHistory(item, options = {}) {
    const { openWorkspace = true, adoptSession = openWorkspace } = options;
    const cases = siteData?.cases || [];
    const matchedCase = item.case?.id ? cases.find((caseItem) => caseItem.id === item.case.id) : null;
    setSelectedCase(matchedCase || item.case || null);
    setSelectedHistory(item);
    if (adoptSession && item.sessionId && item.sessionId !== deskSessionId) {
      if (sessionSaveRef.current.timer) {
        window.clearTimeout(sessionSaveRef.current.timer);
        sessionSaveRef.current.timer = null;
      }
      sessionSaveRef.current.lastPayload = '';
      setRemoteSession(null);
      // Seed the snapshot synchronously from localStorage BEFORE flipping
      // deskSessionId, so CreationDesk (keyed by deskSessionId) remounts
      // with the restored canvas already in hand. The Phase-1 effect will
      // still run to merge the remote counterpart, but the desk no longer
      // starts from an empty canvas and flashes the wrong content.
      const seeded = loadCurrentSession(item.sessionId);
      setCurrentSessionSnapshot(seeded ? { ...seeded, sessionId: item.sessionId } : null);
      setDeskSessionId(item.sessionId);
    }
    if (openWorkspace) {
      setActiveWorkspace(!STUDIO_STANDALONE && (item.mode === 'video' || item.kind === 'video') ? 'video' : 'image');
    }
  }

  function handleHistoryAdd(item) {
    setSelectedHistory(null);
    const normalizedItem = { ...item, sessionId: item.sessionId || deskSessionId };
    setHistoryItems((current) => {
      const nextItems = [normalizedItem, ...current.filter((historyItem) => historyItem.id !== normalizedItem.id)].slice(0, LOCAL_HISTORY_LIMIT);
      saveHistory(nextItems, historyScope());
      return nextItems;
    });
    const latestSession = loadSession() || session;
    if (latestSession?.accessToken) setSession(latestSession);
    const historyClient = createHistoryClient({ session: latestSession });
    historyClient.saveRecord(normalizedItem)
      .then((savedRecord) => historyClient.resolveRecordAssets(savedRecord))
      .then((savedRecord) => {
        setHistoryItems((current) => {
          const nextItems = mergeHistoryRecords([savedRecord], current.filter((historyItem) => historyItem.id !== normalizedItem.id && historyItem.id !== savedRecord.id));
          saveHistory(nextItems, historyScopeFromIdentity(latestSession, profile));
          return nextItems;
        });
        setHistoryStatus('synced');
      })
      .catch(() => setHistoryStatus('local'));
  }

  function handleSessionSnapshot(snapshot) {
    setCurrentSessionSnapshot(snapshot);
    if (!remoteSessionReady) return;
    const latestSession = loadSession() || session;
    const payload = prepareCurrentSessionForServer(snapshot);
    if (!payload) return;
    const encoded = sessionSnapshotComparePayload(snapshot);
    if (sessionSaveRef.current.lastPayload === encoded) return;
    sessionSaveRef.current.lastPayload = encoded;
    if (sessionSaveRef.current.timer) window.clearTimeout(sessionSaveRef.current.timer);
    sessionSaveRef.current.timer = window.setTimeout(() => {
      const historyClient = createHistoryClient({ session: latestSession });
      historyClient.saveCurrentSession(payload)
        .then((savedSession) => {
          setRemoteSession((current) => {
            const currentUpdated = Date.parse(current?.updatedAt || '') || 0;
            const savedUpdated = Date.parse(savedSession?.updatedAt || '') || 0;
            return savedUpdated >= currentUpdated ? savedSession : current;
          });
        })
        .catch(() => {
          sessionSaveRef.current.lastPayload = '';
        });
    }, 800);
  }

  function handleDeleteHistory(recordId) {
    if (recordId && typeof recordId === 'object') {
      const recordIds = recordId.recordIds || [recordId.id];
      recordIds.forEach((id) => handleDeleteHistory(id));
      return;
    }
    setHistoryItems((current) => {
      const nextItems = current.filter((item) => item.id !== recordId);
      saveHistory(nextItems, historyScope());
      return nextItems;
    });
    deletePersistedHistory(recordId, historyScope());
    if (selectedHistory?.id === recordId || selectedHistory?.sessionId === recordId || selectedHistory?.recordIds?.includes?.(recordId)) setSelectedHistory(null);
    const latestSession = loadSession() || session;
    const historyClient = createHistoryClient({ session: latestSession });
    historyClient.deleteRecord(recordId).catch(() => setHistoryStatus('local'));
  }

  function handleClearHistory() {
    const scope = historyScope();
    saveHistory([], scope);
    clearPersistedHistory(scope);
    setHistoryItems([]);
    setSelectedHistory(null);
    const latestSession = loadSession() || session;
    const historyClient = createHistoryClient({ session: latestSession });
    historyClient.clearRecords().catch(() => setHistoryStatus('local'));
  }

  if (bootError && !siteData) {
    return <main className="studioError">加载失败：{bootError}</main>;
  }

  if (STUDIO_STANDALONE && !session?.accessToken) {
    return <main className="studioError">正在前往登录...</main>;
  }

  return (
    <main>
      {isLibraryLocked ? (
        <div className="libraryLockNotice">
          <KeyRound size={15} />
          <span>{t('lock.protected', '受保护素材登录后加载，公开模板可继续使用。')}</span>
          <button type="button" onClick={handleRequireLogin}>{t('topbar.login', '登录')}</button>
        </div>
      ) : null}
      <Topbar
        profile={profile}
        apiKey={apiKey}
        providerSettings={providerSettings}
        isAuthenticated={Boolean(session?.accessToken)}
        activeWorkspace={activeWorkspace}
        onWorkspaceChange={handleWorkspaceChange}
        t={t}
        theme={theme}
        onLogin={handleRequireLogin}
        onLogout={handleLogout}
        onOpenSettings={() => setSettingsOpen(true)}
        onThemeToggle={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
        workspaces={WORKSPACES}
        studioBackUrl={STUDIO_BACK_URL}
        imageGenerationRouteLabel={IMAGE_GENERATION_ROUTE_LABEL}
      />
      <div className={`studioLayout ${railCollapsed ? 'railCollapsed' : ''}`}>
        <LeftRail
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={handleWorkspaceChange}
          onNewSession={handleNewSession}
          accountLabel={Boolean(session?.accessToken) ? (profile?.email || profile?.username || t('rail.loggedIn', '已登录用户')) : t('rail.notLoggedIn', '未登录')}
          accountDetail={Boolean(session?.accessToken)
            ? (STUDIO_STANDALONE
              ? (providerSettings.apiKeySource === 'manual'
                ? (providerSettings.manualGatewayBaseUrl ? t('rail.customProvider', '自定义接口') : t('rail.providerNotConfigured', '请配置 URL 与 Key'))
                : t('rail.serverManaged', 'Server managed'))
              : (apiKeyDisplay(apiKey) || t('rail.hiddenKey', 'Key 已隐藏')))
            : t('rail.notLoggedIn', '未登录')}
          accountCredits={STUDIO_STANDALONE && creditsEnabled && profile?.credits
            ? Number(profile.credits.balance || 0).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN')
            : null}
          isAdmin={STUDIO_STANDALONE && profile?.role === 'admin'}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenBilling={() => setBillingOpen(true)}
          onOpenAdmin={() => { window.location.href = STUDIO_ADMIN_URL; }}
          theme={theme}
          onThemeToggle={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
          currentLanguage={SUPPORTED_LANGUAGES.find((item) => item.value === language) || SUPPORTED_LANGUAGES[0]}
          onLanguageToggle={handleLanguageToggle}
          t={t}
          currentProject={currentProject}
          historyItems={historyItems}
          selectedHistoryId={selectedHistory?.id}
          onSelectHistory={handleSelectHistory}
          onDeleteHistory={handleDeleteHistory}
          onFocusCurrentProject={() => setCanvasFocusSignal((value) => value + 1)}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((value) => !value)}
        />
        {workspaceIsDesk ? (
          <CreationDesk
            key={deskSessionId}
            sessionId={deskSessionId}
            activeWorkspace={activeWorkspace}
            selectedCase={selectedCase}
            selectedHistory={selectedHistory}
            onResolveCase={resolveLibraryCase}
            apiKey={apiKey}
            client={client}
            assistantClient={assistantClient}
            assistantProviderSettings={assistantProviderSettings}
            providerSettings={providerSettings}
            onProviderChange={handleProviderChange}
            providerProfiles={providerLibrary.profiles}
            activeProviderProfileId={providerLibrary.activeProfileId}
            onSelectProvider={handleSelectProvider}
            modelOptions={modelOptions}
            modelsStatus={modelsStatus}
            usageSummary={usageSummary}
            isAuthenticated={Boolean(session?.accessToken)}
            onRequireLogin={handleRequireLogin}
            onOpenSettings={() => setSettingsOpen(true)}
            onProfileRefresh={refreshProfile}
            onHistoryAdd={handleHistoryAdd}
            remoteSession={remoteSession}
            remoteSessionReady={remoteSessionReady}
            persistenceKey={persistenceKey}
            onSessionSnapshot={handleSessionSnapshot}
            sessionSnapshot={currentSessionSnapshot}
            promptPresets={siteData?.promptPresets || PROMPT_PRESETS}
            appendTemplateRequest={appendTemplateRequest}
            onAppendTemplateConsumed={(requestId) => {
              setAppendTemplateRequest((current) => current?.id === requestId ? null : current);
            }}
            onOpenWorkspace={(workspace) => handleWorkspaceChange(workspace, { preserveHistory: true })}
            firstRunRequest={firstRunRequest}
            onFirstRunRequestConsumed={(requestId) => setFirstRunRequest((current) => current?.id === requestId ? null : current)}
            onShareResult={handleOpenCommunityShare}
            focusSignal={canvasFocusSignal}
            t={t}
          />
        ) : activeWorkspace === 'inspiration' ? (
          <React.Suspense fallback={null}>
            <GalleryWorkspacePanel
              type="inspiration"
              cases={visibleCases}
              categoryGroups={categoryGroups}
              selected={selectedCase}
              onSelect={handleSelectCase}
              query={query}
              setQuery={setQuery}
              category={category}
              setCategory={setCategory}
              totalCaseCount={siteData?.cases?.length || 0}
              loading={!siteData}
              videoInspirations={siteData?.videoInspirations || FALLBACK_VIDEO_INSPIRATIONS}
              historyItems={filteredHistoryItems}
              historyStatus={historyStatus}
              historyHasMore={historyNextOffset !== null}
              historyLoadingMore={historyLoadingMore}
              selectedHistoryId={selectedHistory?.id}
              onSelectHistory={handleSelectHistory}
              onDeleteHistory={handleDeleteHistory}
              onClearHistory={handleClearHistory}
              onLoadMoreHistory={handleLoadMoreHistory}
              favoriteTemplates={favoriteTemplates}
              showFavoritesOnly={showFavoritesOnly}
              onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
              onToggleTemplateFavorite={handleToggleTemplateFavorite}
              onReactTemplate={handleReactTemplate}
              onAppendTemplate={handleAppendTemplate}
              onOpenUpload={() => { setInspirationUploadDraft(null); setInspirationUploadOpen(true); }}
              onShareResult={handleOpenCommunityShare}
              licenseNotice={siteData?.license}
              onOpenWorkspace={(workspace) => handleWorkspaceChange(workspace, { preserveHistory: true })}
              t={t}
            />
          </React.Suspense>
        ) : (
          <React.Suspense fallback={null}>
            <GalleryWorkspacePanel
              type="history"
              cases={visibleCases}
              categoryGroups={categoryGroups}
              selected={selectedCase}
              onSelect={handleSelectCase}
              query={query}
              setQuery={setQuery}
              category={category}
              setCategory={setCategory}
              totalCaseCount={siteData?.cases?.length || 0}
              loading={!siteData}
              videoInspirations={siteData?.videoInspirations || FALLBACK_VIDEO_INSPIRATIONS}
              historyItems={filteredHistoryItems}
              historyStatus={historyStatus}
              historyHasMore={historyNextOffset !== null}
              historyLoadingMore={historyLoadingMore}
              selectedHistoryId={selectedHistory?.id}
              onSelectHistory={(item) => handleSelectHistory(item, { openWorkspace: false })}
              onDeleteHistory={handleDeleteHistory}
              onClearHistory={handleClearHistory}
              onLoadMoreHistory={handleLoadMoreHistory}
              favoriteTemplates={favoriteTemplates}
              showFavoritesOnly={showFavoritesOnly}
              onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
              onToggleTemplateFavorite={handleToggleTemplateFavorite}
              onReactTemplate={handleReactTemplate}
              onAppendTemplate={handleAppendTemplate}
              onOpenUpload={() => { setInspirationUploadDraft(null); setInspirationUploadOpen(true); }}
              onShareResult={handleOpenCommunityShare}
              licenseNotice={siteData?.license}
              onOpenWorkspace={(workspace) => handleWorkspaceChange(workspace, { preserveHistory: true })}
              t={t}
            />
          </React.Suspense>
        )}
      </div>
      {firstRunOpen ? (
        <React.Suspense fallback={null}>
          <FirstRunGuide
            open
            onClose={handleCloseFirstRun}
            onComplete={handleFirstRunComplete}
            t={t}
          />
        </React.Suspense>
      ) : null}
      {settingsOpen ? (
        <React.Suspense fallback={null}>
          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            apiKey={apiKey}
            keys={keys}
            onSelectKey={handleSelectKey}
            providerSettings={providerSettings}
            onProviderChange={handleProviderChange}
            providerProfiles={providerLibrary.profiles}
            activeProviderProfileId={providerLibrary.activeProfileId}
            assistantProviderProfileId={assistantConfig.providerProfileId}
            assistantModel={assistantConfig.model}
            onAssistantConfigChange={handleAssistantConfigChange}
            onSelectProvider={handleSelectProvider}
            onSaveProvider={handleSaveProvider}
            onDeleteProvider={handleDeleteProvider}
            providerConnections={providerConnections}
            providerConnectionsEnabled={billingConfig.providerConnections?.enabled === true}
            onBindProvider={handleBindProviderConnection}
            onDeleteProviderConnection={handleDeleteProviderConnection}
            onTestProviderConnection={handleTestProviderConnection}
            modelOptions={modelOptions}
            modelsStatus={modelsStatus}
            modelSyncError={modelSyncError}
            onSyncModels={syncProviderModels}
            onOpenOnboarding={handleOpenFirstRun}
            isAuthenticated={Boolean(session?.accessToken)}
            onLogin={handleRequireLogin}
            t={t}
          />
        </React.Suspense>
      ) : null}
      {billingOpen ? <AccountBillingDialog open onClose={() => setBillingOpen(false)} onRedeemed={(nextCredits) => setProfile((current) => ({ ...current, credits: nextCredits }))} client={client} credits={profile?.credits} recharge={billingConfig.recharge} /> : null}
      {inspirationUploadOpen ? (
        <React.Suspense fallback={null}>
          <InspirationUploadDialog
            open={inspirationUploadOpen}
            initialValue={inspirationUploadDraft}
            onClose={() => { setInspirationUploadOpen(false); setInspirationUploadDraft(null); }}
            onSubmit={handleCreateCommunityPrompt}
            t={t}
          />
        </React.Suspense>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('studio-root')).render(<StudioApp />);
