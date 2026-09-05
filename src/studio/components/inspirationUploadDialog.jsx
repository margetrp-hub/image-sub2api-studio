import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import { StudioModal } from './studioModal.jsx';
import { ProtectedStudioImage, ProtectedStudioVideo } from './media.jsx';
import '../../styles/studio.inspiration-share.css';

const PARAMETER_LABELS = {
  duration: '时长',
  fps: '帧率',
  model: '模型',
  providerId: '提供方',
  routeLabel: '接口',
  size: '尺寸',
  aspectRatio: '比例',
  quality: '画质',
  resolutionTier: '分辨率',
  outputFormat: '格式',
  moderation: '审核',
  count: '数量',
  referenceCount: '参考图',
  width: '宽度',
  height: '高度',
  videoMotion: '运镜',
  videoStyle: '视频风格',
  videoQuality: '视频画质'
};

export function InspirationUploadDialog({ open, initialValue = null, onClose, onSubmit, t = (key, fallback) => fallback || key }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Community Prompts');
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = prompt.trim().length >= 8;
  const parameterEntries = useMemo(() => Object.entries(initialValue?.generation || {})
    .filter(([key, value]) => PARAMETER_LABELS[key] && String(value ?? '').trim()), [initialValue]);

  useEffect(() => {
    if (!open) return;
    setTitle(initialValue?.title || '');
    setCategory(initialValue?.category || 'Community Prompts');
    setPrompt(initialValue?.prompt || '');
    setNote(initialValue?.note || '');
    setError('');
  }, [open, initialValue?.draftKey]);

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        title: title.trim() || prompt.trim().slice(0, 52),
        category: category.trim() || 'Community Prompts',
        prompt: prompt.trim(),
        generationPrompt: initialValue?.generationPrompt || prompt.trim(),
        note: note.trim(),
        image: initialValue?.image || '',
        imageAlt: initialValue?.imageAlt || title.trim() || prompt.trim().slice(0, 80),
        generation: initialValue?.generation || {}
      });
      setTitle('');
      setCategory('Community Prompts');
      setPrompt('');
      setNote('');
    } catch (failure) {
      setError(failure?.message || t('gallery.shareFailed', '分享失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StudioModal open={open} onClose={onClose} title={t('gallery.shareToLibrary', '分享到灵感库')} overlayClassName="inspirationUploadOverlay" className="inspirationUploadPanel">
      <form className="inspirationUploadForm" onSubmit={submit}>
        <div className="settingsHeader">
          <div>
            <span>{initialValue?.image ? t('gallery.shareToLibrary', '分享到灵感库') : t('gallery.uploadInspiration', '上传灵感')}</span>
            <h2>{initialValue?.image ? t('gallery.shareCreationTitle', '分享这张生成作品') : t('gallery.uploadTitle', '分享一个好提示词')}</h2>
            <p>{initialValue?.image ? t('gallery.shareCreationHint', '作品、完整提示词和生成参数会一起保存到你的用户灵感库。') : t('gallery.uploadHint', '先保存到你的个人灵感广场，后续可以再做公开审核和精选。')}</p>
          </div>
          <button type="button" className="iconButton studioModalClose" onClick={onClose} aria-label={t('settings.close', '关闭')}>
            <X size={18} />
          </button>
        </div>
        <div className="inspirationShareBody">
        {initialValue?.image ? (
          <div className="inspirationSharePreview">
            {initialValue.generation?.mode === 'video'
              ? <ProtectedStudioVideo src={initialValue.image} alt={initialValue.imageAlt || title} />
              : <ProtectedStudioImage src={initialValue.image} alt={initialValue.imageAlt || title || t('gallery.sharePreview', '待分享作品')} />}
            <div>
              <strong>{t('gallery.sharedContent', '将一并分享')}</strong>
              <span>{t('gallery.sharedImage', '生成作品')}</span>
              <span>{t('gallery.sharedPrompt', '完整提示词')}</span>
              <span>{t('gallery.sharedParameters', '生成参数')}</span>
            </div>
          </div>
        ) : null}
        {parameterEntries.length ? (
          <div className="inspirationParameterSummary" aria-label={t('gallery.sharedParameters', '生成参数')}>
            {parameterEntries.map(([key, value]) => (
              <span key={key}><small>{t(`shareParameters.${key}`, PARAMETER_LABELS[key])}</small>{String(value)}</span>
            ))}
          </div>
        ) : null}
        <label>
          <span>{t('gallery.promptTitle', '标题')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('gallery.promptTitlePlaceholder', '例如：电商主图质感提示词')} />
        </label>
        <label>
          <span>{t('gallery.promptCategory', '分类')}</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Community Prompts" />
        </label>
        <label>
          <span>{t('gallery.promptContent', '提示词')}</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={8} placeholder={t('gallery.promptContentPlaceholder', '粘贴你觉得值得复用的完整提示词...')} />
        </label>
        <label>
          <span>{t('gallery.promptNote', '说明')}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder={t('gallery.promptNotePlaceholder', '适合什么场景、需要注意什么，可选')} />
        </label>
        {error ? <p className="inspirationShareError" role="alert">{error}</p> : null}
        </div>
        <div className="settingsActions">
          <button type="button" onClick={onClose}>{t('settings.cancel', '取消')}</button>
          <button type="submit" className="primaryAction" disabled={!canSubmit || submitting}>
            {submitting ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
            {initialValue?.image ? t('gallery.confirmShare', '确认分享到灵感库') : t('gallery.publishPrompt', '保存到广场')}
          </button>
        </div>
      </form>
    </StudioModal>
  );
}
