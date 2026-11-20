const tg = window.Telegram?.WebApp;
const initData = tg?.initData || '';

async function req(path, opts = {}) {
  const headers = { 'x-init-data': initData, ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(`/api${path}`, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'error'), { code: data.error, status: r.status });
  return data;
}

export const api = {
  me: () => req('/me'),
  setLang: (lang) => req('/me/lang', { method: 'POST', body: { lang } }),
  listings: (p) => req(`/listings?${new URLSearchParams(p)}`),
  listing: (id) => req(`/listings/${id}`),
  create: (body) => req('/listings', { method: 'POST', body }),
  uploadPhotos: (files) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f));
    return req('/photos', { method: 'POST', body: fd });
  },
  setStatus: (id, status) => req(`/listings/${id}/status`, { method: 'POST', body: { status } }),
  toggleFav: (id) => req(`/favorites/${id}`, { method: 'POST' }),
  myListings: () => req('/my/listings'),
  myFavs: () => req('/my/favorites'),
  report: (id) => req(`/listings/${id}/report`, { method: 'POST', body: {} }),
  pending: () => req('/admin/pending'),
  ban: (tgId) => req(`/admin/users/${tgId}/ban`, { method: 'POST' }),
  moderate: (id, action, reason) => req(`/admin/${id}/${action}`, { method: 'POST', body: { reason } }),
};
