import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy } from 'lucide-react';
import '../../styles/studio.modal.css';

export function StudioModal({ open, onClose, title, className = '', overlayClassName = '', onKeyDown, children }) {
  const returnFocus = useRef(null);
  const panelRef = useRef(null);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={`studioModalOverlay ${overlayClassName}`}>
          <Dialog.Content
            ref={panelRef}
            className={`studioModalPanel ${className}`}
            aria-describedby={undefined}
            onKeyDown={onKeyDown}
            onOpenAutoFocus={(event) => {
              returnFocus.current = document.activeElement;
              const close = panelRef.current?.querySelector('.studioModalClose');
              if (close) { event.preventDefault(); close.focus(); }
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (returnFocus.current?.isConnected) returnFocus.current.focus();
            }}
          >
            <Dialog.Title className="studioModalAccessibleTitle">{title}</Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CopyTextButton({ text, t = (key, fallback) => fallback || key }) {
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);
  const currentText = useRef(text);
  currentText.current = text;
  useEffect(() => {
    setStatus('idle');
    return () => window.clearTimeout(timer.current);
  }, [text]);
  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      if (currentText.current === text) setStatus('copied');
    } catch {
      if (currentText.current === text) setStatus('failed');
    }
    timer.current = window.setTimeout(() => setStatus('idle'), 1600);
  };
  return (
    <button type="button" className="studioModalCopy" onClick={copy} aria-live="polite">
      {status === 'copied' ? <Check size={14} /> : <Copy size={14} />}
      {status === 'copied' ? t('lightbox.copiedPrompt', '已复制') : status === 'failed' ? t('lightbox.copyFailed', '复制失败') : t('lightbox.copyPrompt', '复制')}
    </button>
  );
}
