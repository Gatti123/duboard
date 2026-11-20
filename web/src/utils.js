export const tg = window.Telegram?.WebApp;

export const haptic = (style = 'light') => { try { tg?.HapticFeedback?.impactOccurred(style); } catch { /* ignore */ } };
export const hapticNotify = (type = 'success') => { try { tg?.HapticFeedback?.notificationOccurred(type); } catch { /* ignore */ } };

export const fmt = (n) => Number(n).toLocaleString('en-US');

export function timeAgo(iso, lang) {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / (86400 * 30)), 'month');
}

// Telegram's WebView may block window.confirm, so use the native dialog when available.
export function confirmDialog(text) {
  return new Promise((resolve) => {
    if (tg?.showConfirm) {
      try { tg.showConfirm(text, (ok) => resolve(!!ok)); return; } catch { /* fall through */ }
    }
    resolve(window.confirm(text));
  });
}

let toastFn = () => {};
export const registerToast = (fn) => { toastFn = fn; };
export const toast = (msg) => toastFn(msg);

const DRAFT_KEY = 'duboard_draft_v1';
export const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
export const saveDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } };
export const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
