import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Download, ImageIcon, Share2, Video, X } from 'lucide-react';
import '../../styles/studio.prompt-lightbox.css';
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

export function Lightbox({ url, fallbackSrc = '', promptOnly = false, index, outputFormat = 'png', downloadMeta, onClose, onShare, onUse, t = (key, fallback) => fallback || key }) {
  if (!url && !promptOnly) return null;
  const isReferencePreview = downloadMeta?.mode === 'reference' || downloadMeta?.mode === 'library-reference';
  const extension = resultExtension(url || 'prompt.txt', outputFormat);
  const downloadName = buildStudioDownloadFilename({
    ...(downloadMeta || {}),
    mode: 'image',
    index,
    extension
  });
  const promptText = downloadMeta?.generationPrompt || downloadMeta?.prompt || '';
  const displayUrl = url ? displayResultUrl(url) : '';
  const meta = [
    downloadMeta?.model || downloadMeta?.providerId,
    downloadMeta?.aspectRatio || downloadMeta?.aspect,
    downloadMeta?.size,
    downloadMeta?.resolutionTier ? RESOLUTION_TIER_LABELS[downloadMeta.resolutionTier] || downloadMeta.resolutionTier : '',
    downloadMeta?.quality || '',
    downloadMeta?.outputFormat?.toUpperCase?.() || '',
    downloadMeta?.createdAt ? formatHistoryTime(downloadMeta.createdAt) : ''
  ].filter(Boolean);
  const referenceLabel = downloadMeta?.title || downloadMeta?.label || t('references.referenceIndex', '参考 {index}', { index: index + 1 });
  return (
    <div className="lightboxOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <figure className="lightboxPanel">
        <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>
          <X size={18} />
        </button>
        <div className="lightboxImageStage">
          {displayUrl && !promptOnly ? (
            <div className="lightboxMediaActions">
              <a href={displayUrl} download={downloadName} aria-label={t('canvas.download', '下载')} title={t('canvas.download', '下载')}>
                <Download size={17} />
              </a>
              {onShare ? (
                <button type="button" onClick={() => onShare(url, index, downloadMeta)} aria-label={t('canvas.shareResult', '分享到灵感库')} title={t('canvas.shareResult', '分享到灵感库')}>
                  <Share2 size={17} />
                </button>
              ) : null}
            </div>
          ) : null}
          {promptOnly ? (
            <div className="lightboxPromptOnlyStage">
              <ImageIcon size={26} />
              <strong>{t('gallery.promptZone', '提示词专区')}</strong>
              <p>{t('gallery.promptOnlyHint', '这条灵感暂时没有可用图片，但提示词仍可预览和选用。')}</p>
            </div>
          ) : (
            <ProtectedStudioImage
              src={url}
              fallbackSrc={fallbackSrc}
              alt={`${isReferencePreview ? t('references.title', '参考图') : t('lightbox.imageAlt', '生成结果')} ${index + 1}`}
              fallback={<ImageIcon size={24} />}
              rootMargin="0px"
            />
          )}
        </div>
        <aside className="lightboxPromptPanel">
          <div className="lightboxPromptHead">
            <div>
              <span>{isReferencePreview ? t('references.preview', '查看参考图') : t('lightbox.promptLabel', '完整提示词')}</span>
              <strong>{isReferencePreview ? referenceLabel : `#${index + 1}`}</strong>
            </div>
            <div className="lightboxPromptActions">
            {promptText ? (
              <button type="button" onClick={() => navigator.clipboard?.writeText(promptText)}>
                <Copy size={14} />
                {t('lightbox.copyPrompt', '复制')}
              </button>
            ) : null}
            {onUse ? (
              <button type="button" className="primaryAction lightboxUseButton" onClick={onUse}>
                <Check size={14} />
                {t('gallery.useTemplate', '使用')}
              </button>
            ) : null}
            </div>
          </div>
          {meta.length ? (
            <div className="lightboxMetaChips">
              {meta.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
          <PromptSectionList prompt={promptText} t={t} />
        </aside>
        <figcaption>
          <span>{isReferencePreview ? referenceLabel : `#${index + 1}`}</span>
        </figcaption>
      </figure>
    </div>
  );
}

export function VideoLightbox({ url, index = 0, downloadMeta, onClose, t = (key, fallback) => fallback || key }) {
  if (!url) return null;
  const extension = resultVideoExtension(url);
  const downloadName = buildStudioDownloadFilename({
    ...(downloadMeta || {}),
    mode: 'video',
    index,
    extension
  });
  return (
    <div className="lightboxOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <figure className="lightboxPanel videoLightboxPanel">
        <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>
          <X size={18} />
        </button>
        <video src={url} controls playsInline />
        <figcaption>
          <span>{t('canvas.videoResult', '视频结果')}</span>
          <a href={url} download={downloadName}>
            <Download size={16} />
            {t('canvas.download', '下载')}
          </a>
        </figcaption>
      </figure>
    </div>
  );
}

export function ResultGrid({ urls, featured = false, carousel = false, outputFormat = 'png', downloadMeta, onPreview, onShare, t = (key, fallback) => fallback || key }) {
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
          <button type="button" className="resultPreviewButton" onClick={() => onPreview(url, index)}>
            <img src={url} alt={`${t('lightbox.imageAlt', '生成结果')} ${index + 1}`} />
          </button>
          <div className="resultMediaActions">
            <a className="resultDownloadButton" href={url} download={buildStudioDownloadFilename({
              ...(downloadMeta || {}),
              mode: 'image',
              index,
              extension: resultExtension(url, outputFormat)
            })} aria-label={t('canvas.download', '下载')} title={t('canvas.download', '下载')}>
              <Download size={16} />
            </a>
            {onShare ? (
              <button
                type="button"
                className="resultShareButton"
                onClick={(event) => {
                  event.stopPropagation();
                  onShare(url, index, downloadMeta);
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

export function VideoResultGrid({ urls, downloadMeta, onPreview, onShare, t = (key, fallback) => fallback || key }) {
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
          <button type="button" className="resultPreviewButton" onClick={() => onPreview(url, index)}>
            <video src={url} muted playsInline preload="metadata" />
          </button>
          <div className="resultMediaActions">
            <a className="resultDownloadButton" href={url} download={buildStudioDownloadFilename({
              ...(downloadMeta || {}),
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
                  onShare(url, index, downloadMeta);
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
