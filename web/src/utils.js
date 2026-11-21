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

const LOC_KEY = 'duboard_loc_v1';        // feed location filter
const POSTLOC_KEY = 'duboard_postloc_v1'; // last location used when posting
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
export const loadFeedLoc = () => readJson(LOC_KEY) || { emirate: '', area: '' };
export const saveFeedLoc = (v) => writeJson(LOC_KEY, v);
export const loadPostLoc = () => readJson(POSTLOC_KEY) || readJson(LOC_KEY) || { emirate: '', area: '' };
export const savePostLoc = (v) => writeJson(POSTLOC_KEY, v);

// Ask Telegram for permission to message the user (bot notifications). Resolves true/false.
export const askWriteAccess = () => new Promise((resolve) => {
  try {
    if (!tg?.requestWriteAccess || !tg.isVersionAtLeast?.('6.9')) return resolve(true);
    tg.requestWriteAccess((ok) => resolve(!!ok));
  } catch { resolve(true); }
});

const DRAFT_KEY = 'duboard_draft_v1';
export const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
export const saveDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } };
export const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
