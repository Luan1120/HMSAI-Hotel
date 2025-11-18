import React, { useCallback, useEffect, useRef, useState } from 'react';

const LANG_STORAGE_KEY = 'hms-language-code';
const LANGUAGES = [
  { code: 'vi', label: 'Tiếng Việt (mặc định)' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'fr', label: 'French' }
];

function ensureHiddenContainer() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('google_translate_container')) {
    const container = document.createElement('div');
    container.id = 'google_translate_container';
    const slot = document.createElement('div');
    slot.id = 'google_translate_element';
    container.appendChild(slot);
    document.body.appendChild(container);
  }
}

function ensureTranslateStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('google_translate_custom_styles')) return;
  const style = document.createElement('style');
  style.id = 'google_translate_custom_styles';
  style.innerHTML = `
    .goog-te-banner-frame.skiptranslate { display: none !important; }
    .goog-te-banner-frame { display: none !important; }
    body { top: 0 !important; }
    #google_translate_container { position: fixed !important; bottom: -9999px !important; right: 0 !important; width: 1px !important; height: 1px !important; overflow: hidden !important; }
    .goog-logo-link { display: none !important; }
    .goog-te-gadget { height: 0 !important; overflow: hidden !important; }
    .goog-te-spinner-pos { display: none !important; }
  `;
  document.head.appendChild(style);
}

function loadGoogleTranslateElement() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Chức năng chỉ hỗ trợ trên trình duyệt'));
  }
  ensureHiddenContainer();
  ensureTranslateStyles();
  if (window.__googleTranslateElement) {
    return Promise.resolve(window.__googleTranslateElement);
  }
  if (window.google && window.google.translate && window.google.translate.TranslateElement) {
    window.__googleTranslateElement = new window.google.translate.TranslateElement({ pageLanguage: 'vi', autoDisplay: false }, 'google_translate_element');
    return Promise.resolve(window.__googleTranslateElement);
  }
  if (window.__googleTranslateScriptPromise) {
    return window.__googleTranslateScriptPromise;
  }
  window.__googleTranslateInitCallbacks = window.__googleTranslateInitCallbacks || [];
  window.__googleTranslateScriptPromise = new Promise((resolve, reject) => {
    window.__googleTranslateInitCallbacks.push(() => {
      if (!window.__googleTranslateElement && window.google && window.google.translate) {
        window.__googleTranslateElement = new window.google.translate.TranslateElement({ pageLanguage: 'vi', autoDisplay: false }, 'google_translate_element');
      }
      resolve(window.__googleTranslateElement);
    });
    if (!window.googleTranslateElementInit) {
      window.googleTranslateElementInit = () => {
        if (!window.__googleTranslateElement && window.google && window.google.translate) {
          window.__googleTranslateElement = new window.google.translate.TranslateElement({ pageLanguage: 'vi', autoDisplay: false }, 'google_translate_element');
        }
        if (Array.isArray(window.__googleTranslateInitCallbacks)) {
          window.__googleTranslateInitCallbacks.forEach((cb) => { try { cb(); } catch { /* ignore */ } });
        }
        window.__googleTranslateInitCallbacks = [];
      };
    }
    if (!document.querySelector('script[data-google-translate]')) {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      script.dataset.googleTranslate = 'true';
      script.onerror = () => {
        delete window.__googleTranslateScriptPromise;
        window.__googleTranslateInitCallbacks = [];
        reject(new Error('Không thể tải Google Translate'));
      };
      document.body.appendChild(script);
    }
  });
  return window.__googleTranslateScriptPromise;
}

function waitForCombo() {
  return new Promise((resolve) => {
    const immediate = document.querySelector('.goog-te-combo');
    if (immediate) {
      resolve(immediate);
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      const combo = document.querySelector('.goog-te-combo');
      if (combo || attempts >= 40) {
        clearInterval(timer);
        resolve(combo || null);
      }
      attempts += 1;
    }, 200);
  });
}

async function applyGoogleTranslate(code) {
  await loadGoogleTranslateElement();
  const combo = await waitForCombo();
  if (!combo) {
    throw new Error('Không tìm thấy bộ chọn ngôn ngữ');
  }
  const target = String(code || '').trim();
  if (combo.value !== target) {
    combo.value = target;
  }
  let event;
  try {
    event = new Event('change', { bubbles: true, cancelable: true });
  } catch {
    event = document.createEvent('HTMLEvents');
    event.initEvent('change', true, true);
  }
  combo.dispatchEvent(event);
  if (document.documentElement) {
    document.documentElement.setAttribute('lang', target || 'vi');
  }
  return target;
}

export default function LanguageSwitcher() {
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(() => {
    if (typeof window === 'undefined') return 'vi';
    try {
      return window.localStorage.getItem(LANG_STORAGE_KEY) || 'vi';
    } catch {
      return 'vi';
    }
  });

  useEffect(() => {
    ensureHiddenContainer();
    ensureTranslateStyles();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = (() => {
      try { return window.localStorage.getItem(LANG_STORAGE_KEY); } catch { return null; }
    })();
    if (saved && saved !== 'vi') {
      applyGoogleTranslate(saved).then(() => {
        setCurrent(saved);
      }).catch(() => {
        setCurrent('vi');
      });
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('lang', current || 'vi');
  }, [current]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(async (code) => {
    setError('');
    setLoading(true);
    try {
      const applied = await applyGoogleTranslate(code);
      setCurrent(applied || 'vi');
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, applied || 'vi');
      } catch { /* ignore */ }
      setOpen(false);
    } catch (err) {
      setError(err && err.message ? err.message : 'Không thể đổi ngôn ngữ');
    } finally {
      setLoading(false);
    }
  }, []);

  const activeLabel = LANGUAGES.find((lang) => lang.code === current)?.label || 'Tiếng Việt (mặc định)';

  return (
    <div className="language-switcher" ref={wrapperRef}>
      <button
        type="button"
        className="home-header-icon language-switcher-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ngon ngu hien tai: ${activeLabel}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <img src="/icon-language.png" alt="Language" className="home-header-icon-img" />
      </button>
      {open && (
        <div className="language-switcher-menu" role="menu" aria-label="Chọn ngôn ngữ">
          {loading && <div className="lang-status">Đang tải...</div>}
          {!loading && <div className="lang-status">Đang chọn: {activeLabel}</div>}
          {error && <div className="lang-error">{error}</div>}
          <ul className="language-switcher-list">
            {LANGUAGES.map((lang) => {
              const isActive = current === lang.code;
              return (
                <li key={lang.code} role="none">
                  <button
                    type="button"
                    className={isActive ? 'active' : ''}
                    onClick={() => handleSelect(lang.code)}
                    disabled={loading}
                    role="menuitemradio"
                    aria-checked={isActive}
                  >
                    <span>{lang.label}</span>
                    {isActive && <span className="lang-active-flag">Active</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="language-switcher-menu-footer">Dịch bởi Google Translate</div>
        </div>
      )}
    </div>
  );
}
