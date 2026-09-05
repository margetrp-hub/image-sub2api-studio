import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, ImageIcon, Share2, Video, X } from 'lucide-react';
import '../../styles/studio.prompt-lightbox.css';
import { StudioModal, CopyTextButton } from './studioModal.jsx';
import { PromptSectionList } from './promptTools.jsx';
import { ProtectedStudioImage } from './media.jsx';
import {
  buildStudioDownloadFilename,
  formatHistoryTime,
  RESOLUTION_TIER_LABELS,
  resultExtension,
  resultVideoExtension
} from '../util/resultFiles.js';
import { displayResultUrl } from '../util/assets.js';

function navigatePreview(event, onPrevious, onNext) {
  if (event.defaultPrevented || event.target.closest('input, textarea, video, [contenteditable="true"]')) return;
  const action = event.key === 'ArrowLeft' ? onPrevious : event.key === 'ArrowRight' ? onNext : null;
  if (action) {
    event.preventDefault();
    action();
  }
}

function PreviewNavigation({ onPrevious, onNext, t }) {
  return <>
    {onPrevious ? <button type="button" className="lightboxNavButton lightboxNavPrevious" onClick={onPrevious} aria-label={t('canvas.previousResult', '上一张')} title={t('canvas.previousResult', '上一张')}><ChevronLeft size={22} /></button> : null}
    {onNext ? <button type="button" className="lightboxNavButton lightboxNavNext" onClick={onNext} aria-label={t('canvas.nextResult', '下一张')} title={t('canvas.nextResult', '下一张')}><ChevronRight size={22} /></button> : null}
  </>;
}

function PreviewToolbar({ url, downloadName, onShare, onClose, title, t }) {
  return (
    <header className="lightboxToolbar">
      <span>{title}</span>
      <div className="lightboxMediaActions">
        {url ? <a href={url} download={downloadName} aria-label={t('canvas.download', '下载')} title={t('canvas.download', '下载')}><Download size={17} /></a> : null}
        {url && onShare ? <button type="button" onClick={onShare} aria-label={t('canvas.shareResult', '分享到灵感库')} title={t('canvas.shareResult', '分享到灵感库')}><Share2 size={17} /></button> : null}
        <button type="button" className="iconButton studioModalClose" onClick={onClose} aria-label={t('settings.close', '关闭')} title={t('settings.close', '关闭')}><X size={18} /></button>
      </div>
    </header>
  );
}

export function Lightbox({ url, fallbackSrc = '', promptOnly = false, index = 0, total, outputFormat = 'png', downloadMeta, onClose, onShare, onUse, onPrevious, onNext, t = (key, fallback) => fallback || key }) {
  const isOpen = Boolean(url || promptOnly);
  const isReferencePreview = downloadMeta?.mode === 'reference' || downloadMeta?.mode === 'library-reference';
  const isVideoPreview = downloadMeta?.mode === 'video';
  const promptText = downloadMeta?.generationPrompt || downloadMeta?.prompt || '';
  const position = total > 0 ? `#${index + 1} / ${total}` : `#${index + 1}`;
  const title = promptOnly ? t('lightbox.promptLabel', '完整提示词') : isReferencePreview ? t('references.preview', '查看参考图') : t('lightbox.preview', '预览');
  const downloadName = buildStudioDownloadFilename({ ...(downloadMeta || {}), mode: isVideoPreview ? 'video' : 'image', index, extension: isVideoPreview ? resultVideoExtension(url) : resultExtension(url || 'prompt.txt', outputFormat) });
  const meta = [
    downloadMeta?.model || downloadMeta?.providerId,
    downloadMeta?.aspectRatio || downloadMeta?.aspect,
    downloadMeta?.size,
    downloadMeta?.resolutionTier ? RESOLUTION_TIER_LABELS[downloadMeta.resolutionTier] || downloadMeta.resolutionTier : '',
    downloadMeta?.quality || '',
    downloadMeta?.outputFormat?.toUpperCase?.() || '',
    downloadMeta?.createdAt ? formatHistoryTime(downloadMeta.createdAt) : ''
  ].filter(Boolean);
  return (
    <StudioModal open={isOpen} onClose={onClose} title={title} overlayClassName="lightboxOverlay" className={`lightboxPanel ${promptOnly ? 'promptOnlyLightboxPanel' : ''}`} onKeyDown={(event) => navigatePreview(event, onPrevious, onNext)}>
      <PreviewToolbar title={title} url={promptOnly ? '' : displayResultUrl(url)} downloadName={downloadName} onShare={onShare ? () => onShare(url, index, downloadMeta) : undefined} onClose={onClose} t={t} />
      {!promptOnly ? <div className="lightboxImageStage">
        <PreviewNavigation onPrevious={onPrevious} onNext={onNext} t={t} />
        {isVideoPreview ? <video src={url} controls playsInline /> : <ProtectedStudioImage src={url} fallbackSrc={fallbackSrc} alt={`${isReferencePreview ? t('references.title', '参考图') : t('lightbox.imageAlt', '生成结果')} ${index + 1}`} fallback={<ImageIcon size={24} />} rootMargin="0px" />}
      </div> : null}
      <aside className="lightboxPromptPanel">
        <div className="lightboxPromptHead">
          <div><span>{promptOnly ? downloadMeta?.title || '' : t('lightbox.promptLabel', '完整提示词')}</span><strong>{position}</strong></div>
          <div className="lightboxPromptActions">
            {promptText ? <CopyTextButton text={promptText} t={t} /> : null}
            {onUse ? <button type="button" className="primaryAction lightboxUseButton" onClick={onUse}><Check size={14} />{t('gallery.useTemplate', '使用')}</button> : null}
          </div>
        </div>
        <div className="lightboxMetaChips">{[...new Set(meta)].map((item) => <span key={item}>{item}</span>)}</div>
        <PromptSectionList prompt={promptText} t={t} />
      </aside>
    </StudioModal>
  );
}

export function VideoLightbox({ url, index = 0, total, downloadMeta, onClose, onShare, onPrevious, onNext, t = (key, fallback) => fallback || key }) {
  const downloadName = buildStudioDownloadFilename({ ...(downloadMeta || {}), mode: 'video', index, extension: resultVideoExtension(url) });
  const title = `${t('canvas.videoResult', '视频结果')} · ${total > 0 ? `${index + 1} / ${total}` : index + 1}`;
  return (
    <StudioModal open={Boolean(url)} onClose={onClose} title={title} overlayClassName="lightboxOverlay" className="lightboxPanel videoLightboxPanel" onKeyDown={(event) => navigatePreview(event, onPrevious, onNext)}>
      <PreviewToolbar title={title} url={url} downloadName={downloadName} onShare={onShare ? () => onShare(url, index, downloadMeta) : undefined} onClose={onClose} t={t} />
      <div className="lightboxImageStage">
        <video src={url} controls playsInline />
        <PreviewNavigation onPrevious={onPrevious} onNext={onNext} t={t} />
      </div>
    </StudioModal>
  );
}

export function ResultGrid({ urls, featured = false, carousel = false, outputFormat = 'png', downloadMeta, resultMetadata, onPreview, onShare, t = (key, fallback) => fallback || key }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (carousel) setActiveIndex(Math.max(0, urls.length - 1));
  }, [carousel, urls]);

  if (!urls.length) {
    return (
      <div className="emptyResult">
        <ImageIcon size={32} />
        <p>{t('composer.resultTitle', '生成结果')}</p>
      </div>
    );
  }
  const currentIndex = Math.min(activeIndex, urls.length - 1);
  const visibleResults = carousel
    ? [{ url: urls[currentIndex], index: currentIndex }]
    : urls.map((url, index) => ({ url, index }));
  const carouselEnabled = carousel && urls.length > 1;
  return (
    <div className={`resultGrid${featured ? ' resultGridFeatured' : ''}${carouselEnabled ? ' resultGridCarousel' : ''}`}>
      {visibleResults.map(({ url, index }) => (
        <figure key={`${url}-${index}`}>
          <button type="button" className="resultPreviewButton" onClick={() => onPreview(url, index)} aria-label={`${t('lightbox.preview', '预览')} ${index + 1}`} title={t('lightbox.preview', '预览')}>
            <img src={url} alt={`${t('lightbox.imageAlt', '生成结果')} ${index + 1}`} />
          </button>
          <div className="resultMediaActions">
            <a className="resultDownloadButton" href={url} download={buildStudioDownloadFilename({
              ...(resultMetadata?.[index] || downloadMeta || {}),
              mode: 'image',
              index,
              extension: resultExtension(url, resultMetadata?.[index]?.outputFormat || outputFormat)
            })} aria-label={t('canvas.download', '下载')} title={t('canvas.download', '下载')}>
              <Download size={16} />
            </a>
            {onShare ? (
              <button
                type="button"
                className="resultShareButton"
                onClick={(event) => {
                  event.stopPropagation();
                  onShare(url, index, resultMetadata?.[index] || downloadMeta);
                }}
                aria-label={t('canvas.shareResult', '分享到灵感库')}
                title={t('canvas.shareResult', '分享到灵感库')}
              >
                <Share2 size={16} />
              </button>
            ) : null}
          </div>
        </figure>
      ))}
      {carouselEnabled ? (
        <>
          <button
            type="button"
            className="resultCarouselButton resultCarouselPrevious"
            onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
            disabled={currentIndex === 0}
            aria-label={t('canvas.previousResult', '上一张')}
            title={t('canvas.previousResult', '上一张')}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="resultCarouselButton resultCarouselNext"
            onClick={() => setActiveIndex((index) => Math.min(urls.length - 1, index + 1))}
            disabled={currentIndex === urls.length - 1}
            aria-label={t('canvas.nextResult', '下一张')}
            title={t('canvas.nextResult', '下一张')}
          >
            <ChevronRight size={20} />
          </button>
          <div className="resultCarouselPosition" aria-live="polite">
            <span>{currentIndex + 1} / {urls.length}</span>
            {currentIndex === urls.length - 1 ? <em>{t('canvas.latestResult', '最新')}</em> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function VideoResultGrid({ urls, downloadMeta, resultMetadata, onPreview, onShare, t = (key, fallback) => fallback || key }) {
  if (!urls.length) {
    return (
      <div className="emptyResult">
        <Video size={32} />
        <p>{t('canvas.videoResult', '视频结果')}</p>
      </div>
    );
  }
  return (
    <div className="resultGrid videoResultGrid">
      {urls.map((url, index) => (
        <figure key={`${url}-${index}`}>
          <button type="button" className="resultPreviewButton" onClick={() => onPreview(url, index)} aria-label={`${t('lightbox.preview', '预览')} ${index + 1}`} title={t('lightbox.preview', '预览')}>
            <video src={url} muted playsInline preload="metadata" />
          </button>
          <div className="resultMediaActions">
            <a className="resultDownloadButton" href={url} download={buildStudioDownloadFilename({
              ...(resultMetadata?.[index] || downloadMeta || {}),
              mode: 'video',
              index,
              extension: resultVideoExtension(url)
            })} aria-label={t('canvas.download', '下载')} title={t('canvas.download', '下载')}>
              <Download size={16} />
            </a>
            {onShare ? (
              <button
                type="button"
                className="resultShareButton"
                onClick={(event) => {
                  event.stopPropagation();
                  onShare(url, index, resultMetadata?.[index] || downloadMeta);
                }}
                aria-label={t('canvas.shareResult', '分享到灵感库')}
                title={t('canvas.shareResult', '分享到灵感库')}
              >
                <Share2 size={16} />
              </button>
            ) : null}
          </div>
        </figure>
      ))}
    </div>
  );
}

export function WorkPreviewResultActions({ url, index = 0, outputFormat = 'png', isVideo = false, downloadMeta, onPreview, onShare, t = (key, fallback) => fallback || key }) {
  if (!url) return null;
  const extension = isVideo ? resultVideoExtension(url) : resultExtension(url, outputFormat);
  const downloadName = buildStudioDownloadFilename({
    ...(downloadMeta || {}),
    mode: isVideo ? 'video' : 'image',
    index,
    extension
  });
  return (
    <div className="workPreviewActions">
      <button type="button" onClick={onPreview}>
        {isVideo ? <Video size={15} /> : <ImageIcon size={15} />}
        预览
      </button>
      <a href={url} download={downloadName}>
        <Download size={15} />
        下载
      </a>
      {onShare ? (
        <button type="button" onClick={() => onShare(url, index, downloadMeta)} aria-label={t('canvas.shareResult', '分享生成结果')} title={t('canvas.shareResult', '分享生成结果')}>
          <Share2 size={15} />
          {t('lightbox.share', '分享')}
        </button>
      ) : null}
    </div>
  );
}
