'use client';

import { useEffect, useId, useRef } from 'react';

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.turnstile) resolve();
      else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Turnstile load failed')), { once: true });
      }
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile load failed'));
    document.head.appendChild(script);
  });
}

/**
 * Cloudflare Turnstile widget — mobile-friendly (flexible width).
 * Requires NEXT_PUBLIC_TURNSTILE_SITE_KEY.
 */
export default function TurnstileCaptcha({
  onToken,
  onExpire,
  onError,
  resetKey = 0,
  theme = 'light',
  className = '',
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const hostRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onToken, onExpire, onError });
  const reactId = useId().replace(/:/g, '');

  useEffect(() => {
    callbacksRef.current = { onToken, onExpire, onError };
  }, [onToken, onExpire, onError]);

  useEffect(() => {
    if (!siteKey || !hostRef.current) return undefined;
    let cancelled = false;

    const mount = async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !hostRef.current || !window.turnstile) return;

        if (widgetIdRef.current != null) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }

        hostRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          theme,
          size: 'flexible',
          appearance: 'always',
          callback: (token) => callbacksRef.current.onToken?.(token),
          'expired-callback': () => {
            callbacksRef.current.onToken?.('');
            callbacksRef.current.onExpire?.();
          },
          'error-callback': () => {
            callbacksRef.current.onToken?.('');
            callbacksRef.current.onError?.();
          },
        });
      } catch {
        if (!cancelled) callbacksRef.current.onError?.();
      }
    };

    mount();

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, resetKey]);

  if (!siteKey) return null;

  return (
    <div className={`w-full min-h-[65px] ${className}`}>
      <div
        ref={hostRef}
        id={`turnstile-${reactId}`}
        className="cf-turnstile w-full overflow-hidden rounded-2xl"
      />
    </div>
  );
}

export function isTurnstileConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
