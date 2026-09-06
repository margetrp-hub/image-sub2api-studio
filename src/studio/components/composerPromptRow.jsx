import React from 'react';
import { LoaderCircle, SendHorizontal } from 'lucide-react';
import { PROMPT_MAX_LENGTH, promptLengthError } from '../util/promptLimits.js';

export function ComposerPromptRow({
  assistantDisabled,
  generationActionClass,
  generationActionDisabled,
  generationActionIcon,
  generationActionLabel,
  isDroppingReference,
  optimizingPrompt,
  onAssistantAction,
  onChange,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onFocus,
  onGenerateAction,
  onKeyDown,
  onPaste,
  placeholder,
  prompt,
  t = (key, fallback) => fallback || key
}) {
  const lengthError = promptLengthError(prompt, t);
  return (
    <div
      className={`composerPromptRow ${isDroppingReference ? 'isDroppingReference' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <label className="bottomComposerInput">
        <textarea
          value={prompt}
          onChange={onChange}
          onPaste={onPaste}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-invalid={Boolean(lengthError)}
          aria-describedby={lengthError ? 'composer-prompt-length' : undefined}
        />
        {String(prompt || '').length > 12000 ? <small id="composer-prompt-length" role={lengthError ? 'alert' : undefined}>{lengthError || `${prompt.length.toLocaleString()} / ${PROMPT_MAX_LENGTH.toLocaleString()}`}</small> : null}
      </label>
      <div className="composerActionGroup">
        <button
          type="button"
          className="composerAssistantAction"
          onClick={onAssistantAction}
            disabled={assistantDisabled || Boolean(lengthError)}
          aria-label={t('composer.send', '优化提示词，会调用对话模型并使用当前 Key 额度，不会直接生成图片')}
          title={t('composer.send', '优化提示词，会调用对话模型并使用当前 Key 额度，不会直接生成图片')}
        >
          {optimizingPrompt ? <LoaderCircle className="spin" size={16} /> : <SendHorizontal size={16} />}
          <span>{t('composer.optimize', '优化')}</span>
        </button>
        <button
          type="button"
          className={`composerGenerateAction ${generationActionClass}`}
          onClick={onGenerateAction}
          disabled={generationActionDisabled || Boolean(lengthError)}
        >
          {generationActionIcon}
          <span>{generationActionLabel}</span>
        </button>
      </div>
    </div>
  );
}
