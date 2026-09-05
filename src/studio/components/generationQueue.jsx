import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Redo2, X } from 'lucide-react';
import { StudioModal, CopyTextButton } from './studioModal.jsx';

const QUEUE_DOCK_STORAGE_KEY = 'image-agent-studio:generation-queue-dock:v1';

function queueStatusLabel(status, t) {
  if (status === 'running') return t('composer.queueStatusRunning', 'Generating');
  if (status === 'done') return t('composer.queueStatusDone', 'Done');
  if (status === 'failed') return t('composer.queueStatusFailed', 'Failed');
  if (status === 'canceled') return t('composer.queueStatusCanceled', 'Canceled');
  if (status === 'unknown') return t('composer.queueStatusUnknown', 'Unknown result');
  return t('composer.queueStatusQueued', 'Queued');
}

function queueSummary(item, t, formatError) {
  if (item?.status === 'failed' && item?.error && typeof formatError === 'function') {
    const message = formatError({
      ...item.error,
      message: item.error.message || item.summary || 'GENERATION_JOB_FAILED',
      status: item.error.status,
      requestId: item.error.requestId || item.requestIds?.[0] || ''
    }, t);
    if (message) return message;
  }
  return item?.summary || '';
}

function queueHeadline(items, t, concurrency = 0) {
  const countStatus = (status) => items.filter((item) => item?.status === status).length;
  const running = countStatus('running');
  const queued = countStatus('queued');
  const failed = countStatus('failed');
  const unknown = countStatus('unknown');
  const done = countStatus('done');
  const parts = [];
  parts.push(running
    ? concurrency > 0
      ? t('composer.queueRunning', '{count}/{limit} running', { count: running, limit: concurrency })
      : t('composer.queueRunningUnlimited', '{count} running without a Workbench cap', { count: running })
    : t('composer.queueIdle', 'Queue'));
  if (queued) parts.push(t('composer.queueWaiting', '{count} waiting', { count: queued }));
  if (failed + unknown) parts.push(t('composer.queueNeedsReview', '{count} to review', { count: failed + unknown }));
  if (done) parts.push(t('composer.queueDoneNotice', '{count} done', { count: done }));
  return parts.join(' / ');
}

function loadDockLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem(QUEUE_DOCK_STORAGE_KEY) || 'null');
    const x = Number(stored?.x);
    const y = Number(stored?.y);
    return {
      collapsed: stored?.collapsed === true,
      position: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
    };
  } catch {
    return { collapsed: false, position: null };
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function GenerationQueueDock({
  items,
  t,
  formatError,
  onAcknowledge,
  onCancel,
  onRetry,
  concurrency = 0
}) {
  const queueItems = Array.isArray(items) ? items : [];
  const [dockLayout, setDockLayout] = useState(loadDockLayout);
  const [expandedErrorId, setExpandedErrorId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dockRef = useRef(null);
  const dragRef = useRef(null);
  const positionRef = useRef(dockLayout.position);

  useEffect(() => {
    positionRef.current = dockLayout.position;
    try {
      localStorage.setItem(QUEUE_DOCK_STORAGE_KEY, JSON.stringify({
        collapsed: dockLayout.collapsed,
        x: dockLayout.position?.x ?? null,
        y: dockLayout.position?.y ?? null
      }));
    } catch {
      // Layout persistence is optional.
    }
  }, [dockLayout]);

  useEffect(() => {
    if (!dragging) return undefined;
    const move = (event) => {
      const drag = dragRef.current;
      const dock = dockRef.current;
      const parent = drag?.parent || dock?.offsetParent;
      if (!drag || !dock || !parent) return;
      const parentRect = parent.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      const maxX = Math.max(8, parentRect.width - dockRect.width - 8);
      const maxY = Math.max(8, parentRect.height - dockRect.height - 8);
      const next = {
        x: clamp(drag.x + event.clientX - drag.startX, 8, maxX),
        y: clamp(drag.y + event.clientY - drag.startY, 8, maxY)
      };
      setDockLayout((current) => ({ ...current, position: next }));
    };
    const end = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging]);

  if (!queueItems.length) return null;
  const errorItem = queueItems.find((item) => item.id === expandedErrorId);
  const errorText = errorItem ? [...new Set([
    queueSummary(errorItem, t, formatError),
    errorItem.error?.message,
    errorItem.error?.code,
    errorItem.error?.status ? `HTTP ${errorItem.error.status}` : '',
    errorItem.error?.requestId || errorItem.requestIds?.[0] || ''
  ].filter(Boolean))].join('\n\n') : '';

  const handleDragStart = (event) => {
    if (event.button > 0 || event.target.closest('button')) return;
    const dock = dockRef.current;
    const parent = dock?.offsetParent || dock?.parentElement;
    if (!dock || !parent) return;
    const parentRect = parent.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const current = positionRef.current || {
      x: dockRect.left - parentRect.left,
      y: dockRect.top - parentRect.top
    };
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: current.x,
      y: current.y,
      parent
    };
    setDragging(true);
    event.preventDefault();
    event.stopPropagation();
  };

  const renderQueueItems = () => queueItems.slice(0, 6).map((item, index) => {
    const canCancel = item.status === 'queued' || item.status === 'running';
    const canRetry = item.status === 'failed' && !item.remote && item.restorable !== false;
    const canAcknowledge = item.status === 'failed'
      || item.status === 'unknown'
      || item.status === 'canceled'
      || item.status === 'done';
    const cancelLabel = item.status === 'running'
      ? t('composer.cancelRunningTask', 'Stop this task')
      : t('composer.cancelQueuedTask', 'Cancel queued task');

    const summary = queueSummary(item, t, formatError);
    const isError = item.status === 'failed' || item.status === 'unknown';
    const summaryNode = isError && summary ? (
      <button
        type="button"
        className="canvasQueueErrorSummary"
        onClick={() => setExpandedErrorId(item.id)}
        aria-haspopup="dialog"
        title={t('composer.viewErrorDetail', '查看错误详情')}
      >
        {t('composer.viewErrorDetail', '查看详情')}
      </button>
    ) : <p>{summary}</p>;
    return (
      <div className={`canvasQueueItem ${item.status}`} key={item.id}>
        <b>#{index + 1}</b>
        <span>{queueStatusLabel(item.status, t)}</span>
        {summaryNode}
        {canCancel ? (
          <button type="button" onClick={() => onCancel(item.id)} aria-label={cancelLabel} title={cancelLabel}>
            <X size={13} />
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            className="retryQueueAction"
            onClick={() => onRetry(item.id)}
            aria-label={t('composer.regenerateTask', 'Retry this task')}
            title={t('composer.regenerateTask', 'Retry this task')}
          >
            <Redo2 size={13} />
          </button>
        ) : null}
        {canAcknowledge ? (
          <button
            type="button"
            onClick={() => onAcknowledge(item.id)}
            aria-label={t('composer.dismissQueueNotice', 'Dismiss queue notice')}
            title={t('composer.dismissQueueNotice', 'Dismiss queue notice')}
          >
            <X size={13} />
          </button>
        ) : null}
      </div>
    );
  });

  const positionStyle = dockLayout.position
    ? {
        '--canvas-queue-left': `${dockLayout.position.x}px`,
        '--canvas-queue-top': `${dockLayout.position.y}px`
      }
    : undefined;

  return (
    <>
    <div
      ref={dockRef}
      className={`canvasQueueDock ${dockLayout.position ? 'isPositioned' : ''} ${dragging ? 'isDragging' : ''}`}
      aria-label={t('composer.queuePanel', 'Generation queue')}
      onPointerDown={(event) => event.stopPropagation()}
      style={positionStyle}
    >
      <div
        className="canvasQueueHead"
        onPointerDown={handleDragStart}
        title={t('composer.queueDragHint', 'Drag to move the queue panel')}
      >
        <GripVertical size={14} aria-hidden="true" />
        <strong>{t('composer.queuePanel', 'Generation queue')}</strong>
        <span>{queueHeadline(queueItems, t, concurrency)}</span>
        <button
          type="button"
          className="canvasQueueCollapse"
          onClick={() => setDockLayout((current) => ({ ...current, collapsed: !current.collapsed }))}
          aria-expanded={!dockLayout.collapsed}
          aria-label={dockLayout.collapsed
            ? t('composer.expandQueue', 'Expand generation queue')
            : t('composer.collapseQueue', 'Collapse generation queue')}
          title={dockLayout.collapsed
            ? t('composer.expandQueue', 'Expand generation queue')
            : t('composer.collapseQueue', 'Collapse generation queue')}
        >
          {dockLayout.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {!dockLayout.collapsed ? <div className="canvasQueueList">{renderQueueItems()}</div> : null}
    </div>
    <StudioModal open={Boolean(errorItem)} onClose={() => setExpandedErrorId(null)} title={t('composer.viewErrorDetail', '查看错误详情')} className="studioErrorDialog">
      <header>
        <strong>{t('composer.viewErrorDetail', '查看错误详情')}</strong>
        <CopyTextButton text={errorText} t={t} />
        <button type="button" className="studioModalClose" onClick={() => setExpandedErrorId(null)} aria-label={t('settings.close', '关闭')}><X size={18} /></button>
      </header>
      <pre>{errorText}</pre>
    </StudioModal>
    </>
  );
}
