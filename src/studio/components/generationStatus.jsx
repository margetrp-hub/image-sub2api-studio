import { useState } from 'react';
import { Clock, Redo2, X } from 'lucide-react';

function formatDuration(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return '--';
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function progressText(progress, fallbackMessage, t = (key, fallback) => fallback || key) {
  if (!progress || progress.stage === 'idle') return fallbackMessage || '';
  if (progress.stage === 'request') return t('progress.submitted', 'Submitted');
  if (progress.stage === 'connected') return t('progress.connected', 'Connected');
  if (progress.stage === 'queued') return t('progress.queued', 'Queued');
  if (progress.stage === 'dispatching') return t('progress.dispatching', 'Dispatching');
  if (progress.stage === 'gateway') return t('progress.gateway', 'Waiting for gateway');
  if (progress.stage === 'upstream') return t('progress.generating', 'Generating');
  if (progress.stage === 'video') return t('progress.videoGenerating', 'Generating video');
  if (progress.stage === 'partial') return t('progress.preview', 'Preview {count}', { count: progress.partials || 1 });
  if (progress.stage === 'pending_review') return t('progress.review', 'Review needed');
  if (progress.stage === 'image') return t('progress.imageReceived', 'Image {completed}/{total}', {
    completed: progress.completed || 1,
    total: progress.total || 1
  });
  if (progress.stage === 'saving') return t('progress.saving', 'Saving');
  if (progress.stage === 'completed' || progress.stage === 'succeeded') return t('progress.completed', 'Done');
  if (progress.stage === 'canceled') return t('progress.canceled', 'Canceled');
  if (progress.stage === 'failed') return t('progress.failed', 'Failed');
  return fallbackMessage || '';
}

export function ProgressBar({ progress, active, t = (key, fallback) => fallback || key }) {
  if (!progress) return null;
  if (!active && progress.stage !== 'completed' && progress.stage !== 'failed' && progress.stage !== 'pending_review') return null;
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const steps = [
    { key: 'request', label: t('progress.stepSubmit', 'Submit') },
    { key: 'queued', label: t('progress.stepQueue', 'Queue') },
    { key: 'gateway', label: t('progress.stepGateway', 'Gateway') },
    { key: 'saving', label: t('progress.stepSave', 'Save') },
    { key: 'completed', label: t('progress.stepDone', 'Done') }
  ];
  const stageOrder = {
    idle: -1,
    request: 0,
    connected: 0,
    queued: 1,
    dispatching: 1,
    gateway: 2,
    upstream: 2,
    video: 2,
    partial: 2,
    image: 3,
    saving: 3,
    completed: 4,
    succeeded: 4,
    canceled: 2,
    failed: 2,
    pending_review: 3
  };
  const activeIndex = stageOrder[progress.stage] ?? 0;
  const currentPhase = String(Math.max(1, activeIndex + 1));
  const totalPhases = String(steps.length);
  const phaseLabel = progress.stage === 'completed' || progress.stage === 'succeeded'
    ? '100%'
    : progress.stage === 'failed' || progress.stage === 'canceled'
      ? t('progress.stoppedShort', 'Stopped')
      : progress.stage === 'image' && Number(progress.total || 0) > 1
        ? `${Math.max(1, Number(progress.completed || 1))}/${Math.max(1, Number(progress.total || 1))}`
        : t('progress.phaseValue', `Stage ${currentPhase}/${totalPhases}`, {
          current: currentPhase,
          total: totalPhases
        });
  return (
    <div className={`generationProgress ${progress.stage === 'failed' ? 'failed' : ''} ${progress.stage === 'pending_review' ? 'pendingReview' : ''}`} aria-label={t('progress.aria', 'Generation progress')}>
      <div>
        <span>{progressText(progress, '', t)}</span>
        <strong>{phaseLabel}</strong>
      </div>
      <div className="progressTrack">
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="progressSteps" aria-hidden="true">
        {steps.map((step, index) => (
          <span className={index <= activeIndex ? 'active' : ''} key={step.key}>{step.label}</span>
        ))}
      </div>
    </div>
  );
}

export function GenerationTimingPanel({ timing, t = (key, fallback) => fallback || key }) {
  if (!timing) return null;
  const firstMs = timing.firstByteAt ? timing.firstByteAt - timing.startedAt : null;
  const totalMs = (timing.completedAt || Date.now()) - timing.startedAt;
  const gatewayMs = timing.gatewayAt && timing.responseAt ? timing.responseAt - timing.gatewayAt : null;
  const saveMs = timing.savingAt && timing.savedAt ? timing.savedAt - timing.savingAt : null;
  const title = timing.status === 'running'
    ? t('timing.running', 'Generation timer')
    : timing.status === 'failed'
      ? t('timing.failed', 'Generation stopped')
      : t('timing.done', 'Generation done');
  return (
    <div className="generationTimingPanel">
      <div>
        <Clock size={15} />
        <strong>{title}</strong>
        <span>{t('timing.hint', 'Response is time to first upstream byte. Total is from click to current status.')}</span>
      </div>
      <dl>
        <div>
          <dt>{t('timing.response', 'Response')}</dt>
          <dd>{firstMs === null ? t('timing.waiting', 'Waiting') : formatDuration(firstMs)}</dd>
        </div>
        <div>
          <dt>{t('timing.total', 'Total')}</dt>
          <dd>{formatDuration(totalMs)}</dd>
        </div>
        {gatewayMs !== null ? (
          <div>
            <dt>{t('timing.gatewayWait', 'Gateway')}</dt>
            <dd>{formatDuration(gatewayMs)}</dd>
          </div>
        ) : null}
        {saveMs !== null ? (
          <div>
            <dt>{t('timing.save', 'Save')}</dt>
            <dd>{formatDuration(saveMs)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('params.model', 'Model')}</dt>
          <dd>{timing.model || '--'}</dd>
        </div>
        <div>
          <dt>{t('timing.spec', 'Spec')}</dt>
          <dd>{timing.spec || '--'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ComposerLiveStatus({
  progress,
  status,
  message,
  timing,
  modelLabel,
  routeLabel,
  isGenerating,
  onStop,
  onRetry,
  now,
  stallNoticeMs = 90 * 1000,
  t = (key, fallback) => fallback || key
}) {
  const [errorOpen, setErrorOpen] = useState(false);
  const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  const elapsedMs = timing?.startedAt ? Math.max(0, (timing.completedAt || now || Date.now()) - timing.startedAt) : null;
  const stageKey = progress?.stage || 'idle';
  const activeWaiting = status === 'loading' || isGenerating;
  const slowWaiting = status === 'loading' && elapsedMs !== null && elapsedMs >= stallNoticeMs;
  const verySlowWaiting = status === 'loading' && elapsedMs !== null && elapsedMs >= stallNoticeMs * 3;
  const displayPercent = status === 'loading' && stageKey === 'request' && elapsedMs !== null
    ? Math.max(percent, Math.min(22, 8 + Math.floor(elapsedMs / 15000) * 2))
    : percent;
  const displayProgress = {
    ...progress,
    percent: displayPercent,
    stage: slowWaiting && stageKey === 'request' ? 'queued' : stageKey
  };
  const stage = verySlowWaiting
    ? t('composer.liveVerySlowStage', 'Still waiting upstream')
    : slowWaiting
      ? t('composer.liveSlowStage', 'Upstream queued or generating')
      : progressText(displayProgress, status === 'error' ? t('composer.statusError', 'Generation issue') : t('composer.status', 'Generation status'), t);
  const isReview = progress?.stage === 'pending_review';
  const isFailed = status === 'error' || progress?.stage === 'failed';
  const liveHint = activeWaiting
    ? verySlowWaiting
      ? t('composer.liveVerySlowHint', 'This page is still listening. Check History later before leaving.')
      : slowWaiting
        ? t('composer.liveSlowHint', 'Still waiting for upstream. This does not mean the request failed.')
        : t('composer.liveListeningHint', 'Listening for upstream results')
    : isReview
      ? t('composer.liveReviewHint', 'Check History or the current canvas before regenerating.')
      : status === 'success'
        ? t('composer.liveDoneHint', 'Result was added to the current canvas')
        : isFailed
          ? t('composer.liveFailedHint', 'This generation did not return a usable result')
          : t('composer.liveIdleHint', 'Waiting for the next generation');
  const showErrorDetail = Boolean((isFailed || isReview) && message);
  return (
    <div className={`composerLiveStatus ${status} ${activeWaiting ? 'isRunning' : ''} ${slowWaiting ? 'isSlowWaiting' : ''} ${isReview ? 'needsReview' : ''}`} aria-live="polite">
      <div className="composerLiveMain">
        <div className="composerLiveHeader">
          <span className="composerLivePulse" aria-hidden="true" />
          <strong>
            {activeWaiting
              ? t('composer.statusGenerating', 'Generating')
              : status === 'success'
                ? t('composer.statusDone', 'Done')
                : isReview
                  ? t('composer.statusReview', 'Review needed')
                  : isFailed
                    ? t('composer.statusError', 'Generation issue')
                    : t('composer.status', 'Generation status')}
          </strong>
          <em>{stage}</em>
        </div>
        <ProgressBar progress={displayProgress} active t={t} />
        <div className="composerLiveMeta">
          <span>{elapsedMs === null ? t('timing.waiting', 'Waiting') : t('composer.liveElapsed', 'Waiting {time}', { time: formatDuration(elapsedMs) })}</span>
          <span>{liveHint}</span>
          <span>{modelLabel || '--'}</span>
          <span>{routeLabel}</span>
        </div>
        {showErrorDetail ? (
          <button type="button" className={`composerLiveErrorText ${errorOpen ? 'isExpanded' : ''}`} onClick={() => setErrorOpen((value) => !value)} aria-expanded={errorOpen}>
            <span>{t('composer.viewErrorDetail', '查看错误详情')}</span>
            <em>{errorOpen ? message : String(message).slice(0, 96)}{!errorOpen && String(message).length > 96 ? '…' : ''}</em>
          </button>
        ) : message ? (
          <p className={`statusLine ${status}`}>{message}</p>
        ) : null}
      </div>
      <div className="composerLiveActions">
        {isGenerating ? (
          <button type="button" className="composerStopAction" onClick={onStop}>
            <X size={14} />
            <span>{t('composer.stopWaiting', 'Stop waiting')}</span>
          </button>
        ) : isFailed || isReview ? (
          <button type="button" className="composerRetryAction" onClick={onRetry}>
            <Redo2 size={14} />
            <span>{isReview ? t('composer.confirmRegenerate', '确认重新生成') : t('composer.regenerate', '重新生成')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
