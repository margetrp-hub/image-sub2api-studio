import { useEffect, useRef, useState } from 'react';
import { loadSession, StudioHistoryClient } from '../../aiGatewayClient.js';
import {
  displayResultUrl,
  enqueueProtectedImageTask,
  isProtectedStudioAsset
} from '../util/assets.js';

function isPublicLibraryAsset(value) {
  return String(value || '').startsWith('/studio-api/library-assets/');
}

function ProtectedStudioMedia({ src, fallbackSrc = '', alt = '', fallback = null, rootMargin = '420px', mediaType = 'image' }) {
  const holderRef = useRef(null);
  const [shouldResolve, setShouldResolve] = useState(() => {
    const value = String(src || '');
    return Boolean(value && (!isProtectedStudioAsset(value) || isPublicLibraryAsset(value)));
  });
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    const value = String(src || '');
    return value && (!isProtectedStudioAsset(value) || isPublicLibraryAsset(value)) ? displayResultUrl(value) : '';
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const candidates = [src, fallbackSrc]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!candidates.some((value) => isProtectedStudioAsset(value) && !isPublicLibraryAsset(value))) {
      setShouldResolve(true);
      return undefined;
    }

    setShouldResolve(false);
    if (!('IntersectionObserver' in window)) {
      const timer = window.setTimeout(() => setShouldResolve(true), 150);
      return () => window.clearTimeout(timer);
    }

    const node = holderRef.current?.parentElement || holderRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldResolve(true);
        observer.disconnect();
      }
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [src, fallbackSrc, rootMargin]);

  useEffect(() => {
    let active = true;
    const objectUrls = [];
    const candidates = [src, fallbackSrc]
      .map((value) => String(value || '').trim())
      .filter((value, index, list) => value && list.indexOf(value) === index);

    async function resolveCandidate(value) {
      if (isPublicLibraryAsset(value)) return displayResultUrl(value);
      if (!isProtectedStudioAsset(value)) return displayResultUrl(value);
      const session = loadSession();
      if (!session?.accessToken) return '';
      const historyClient = new StudioHistoryClient({ session });
      return await enqueueProtectedImageTask(() => historyClient.resolveAssetUrl(value)) || '';
    }

    async function resolveImage() {
      for (const value of candidates) {
        try {
          const url = await resolveCandidate(value);
          if (active && url) {
            if (url.startsWith('blob:')) objectUrls.push(url);
            setCandidateIndex(candidates.indexOf(value));
            setResolvedSrc(url);
            return;
          }
          if (!active && url?.startsWith('blob:')) URL.revokeObjectURL(url);
        } catch {
          // Try the next candidate before showing the empty-state icon.
        }
      }
      if (active) {
        setResolvedSrc('');
        setFailed(true);
      }
    }

    setFailed(false);
    setCandidateIndex(0);
    setResolvedSrc(candidates[0] && (!isProtectedStudioAsset(candidates[0]) || isPublicLibraryAsset(candidates[0])) ? displayResultUrl(candidates[0]) : '');
    if (!shouldResolve) return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    resolveImage();

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [src, fallbackSrc, shouldResolve]);

  if (!src || failed || !resolvedSrc) {
    return (
      <span
        ref={holderRef}
        className={`protectedStudioImage ${failed ? 'isFailed' : 'isLoading'}`}
        aria-busy={!failed && Boolean(src)}
      >
        {fallback}
      </span>
    );
  }
  return (
    <span ref={holderRef} className="protectedStudioImage isLoaded">
      {mediaType === 'video' ? <video
        src={resolvedSrc}
        aria-label={alt}
        controls
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
      /> : <img
        src={resolvedSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={(event) => {
          const candidates = [src, fallbackSrc]
            .map((value) => String(value || '').trim())
            .filter((value, index, list) => value && list.indexOf(value) === index);
          const next = candidates[candidateIndex + 1];
          if (next && (!isProtectedStudioAsset(next) || isPublicLibraryAsset(next))) {
            setCandidateIndex((value) => value + 1);
            setResolvedSrc(displayResultUrl(next));
            return;
          }
          event.currentTarget.hidden = true;
          setFailed(true);
        }}
      />}
    </span>
  );
}

export function ProtectedStudioImage(props) {
  return <ProtectedStudioMedia {...props} />;
}

export function ProtectedStudioVideo(props) {
  return <ProtectedStudioMedia {...props} mediaType="video" />;
}

export function ProtectedHistoryThumb(props) {
  return <ProtectedStudioImage {...props} />;
}

export function LazyImage({ src, alt, className = '', onError, ...props }) {
  return (
    <img
      {...props}
      className={className || undefined}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={onError}
    />
  );
}
