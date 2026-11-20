import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { Bot, InlineKeyboard } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import { validateInitData } from './auth.js';
import { TAXONOMY, CATEGORY_MAP } from './taxonomy.js';
import { checkContent, LIMITS } from './rules.js';

const {
  BOT_TOKEN, WEBAPP_URL, BOT_USERNAME, MINIAPP_SHORT_NAME,
  SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_IDS = '', PORT = 3000,
} = process.env;

for (const [k, v] of Object.entries({ BOT_TOKEN, WEBAPP_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const admins = new Set(ADMIN_IDS.split(',').map((s) => Number(s.trim())).filter(Boolean));
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const bot = new Bot(BOT_TOKEN);

const CATEGORIES = TAXONOMY.map((c) => c.key);
const T = {
  ru: {
    start: 'Duboard — доска объявлений Дубая 🇦🇪\nПокупайте, продавайте и находите услуги прямо в Telegram.',
    open: 'Открыть Duboard',
    approved: (t) => `✅ Ваше объявление «${t}» опубликовано.`,
    rejected: (t, r) => `❌ Объявление «${t}» отклонено${r ? `: ${r}` : '.'}`,
  },
  en: {
    start: 'Duboard — Dubai classifieds 🇦🇪\nBuy, sell and find services right inside Telegram.',
    open: 'Open Duboard',
    approved: (t) => `✅ Your listing "${t}" is now live.`,
    rejected: (t, r) => `❌ Your listing "${t}" was rejected${r ? `: ${r}` : '.'}`,
  },
};

// ---------- Bot ----------
bot.command('start', async (ctx) => {
  const lang = ctx.from?.language_code?.startsWith('ru') ? 'ru' : 'en';
  const payload = ctx.match; // e.g. listing_12
  const url = payload ? `${WEBAPP_URL}?startapp=${encodeURIComponent(payload)}` : WEBAPP_URL;
  await ctx.reply(T[lang].start, { reply_markup: new InlineKeyboard().webApp(T[lang].open, url) });
});
bot.catch((e) => console.error('bot error', e.error || e));

async function notify(tgId, lang, text) {
  try { await bot.api.sendMessage(tgId, text); } catch (e) { console.warn('notify failed', tgId, e.description || e.message); }
}

// ---------- API ----------
const app = express();
app.use(express.json({ limit: '100kb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } });

async function auth(req, res, next) {
  const u = validateInitData(req.get('x-init-data'), BOT_TOKEN);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  const lang = u.language_code?.startsWith('ru') ? 'ru' : 'en';
  const { data: existing } = await db.from('users').select('*').eq('tg_id', u.id).maybeSingle();
  if (existing?.is_banned) return res.status(403).json({ error: 'banned' });
  if (!existing) {
    await db.from('users').insert({ tg_id: u.id, username: u.username ?? null, first_name: u.first_name ?? null, lang });
  } else if (existing.username !== (u.username ?? null)) {
    await db.from('users').update({ username: u.username ?? null }).eq('tg_id', u.id);
  }
  req.user = { id: u.id, username: u.username, lang: existing?.lang ?? lang, isAdmin: admins.has(u.id) };
  next();
}
const adminOnly = (req, res, next) => (req.user.isAdmin ? next() : res.status(403).json({ error: 'forbidden' }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'server' }); });

const PUBLIC_FIELDS = 'id,title,description,price,category,subcategory,condition,brand,year,mileage,lang,photos,created_at,approved_at,views,status,owner_id';

app.get('/api/me', auth, wrap(async (req, res) => {
  res.json({ id: req.user.id, lang: req.user.lang, isAdmin: req.user.isAdmin, taxonomy: TAXONOMY, limits: { photos: 5 }, botUsername: BOT_USERNAME, shortName: MINIAPP_SHORT_NAME });
}));

app.post('/api/me/lang', auth, wrap(async (req, res) => {
  const lang = req.body?.lang === 'ru' ? 'ru' : 'en';
  await db.from('users').update({ lang }).eq('tg_id', req.user.id);
  res.json({ ok: true });
}));

app.get('/api/listings', auth, wrap(async (req, res) => {
  const { category, sub, brand, condition, price_min, price_max, year_min, lang, q, sort, offset = 0, limit = 20 } = req.query;
  const lim = Math.min(Number(limit) || 20, 50);
  const off = Math.max(Number(offset) || 0, 0);
  let query = db.from('listings').select(PUBLIC_FIELDS).eq('status', 'approved');
  if (sort === 'price_asc') query = query.not('price', 'is', null).order('price', { ascending: true }).order('id', { ascending: false });
  else if (sort === 'price_desc') query = query.not('price', 'is', null).order('price', { ascending: false }).order('id', { ascending: false });
  else query = query.order('approved_at', { ascending: false }).order('id', { ascending: false });
  query = query.range(off, off + lim - 1);
  if (category && CATEGORIES.includes(category)) {
    query = query.eq('category', category);
    if (sub && CATEGORY_MAP[category].subs.some((x) => x.key === sub)) query = query.eq('subcategory', sub);
  }
  if (brand) query = query.eq('brand', String(brand).slice(0, 40));
  if (condition === 'new' || condition === 'used') query = query.eq('condition', condition);
  if (price_min !== undefined && price_min !== '' && Number.isFinite(Number(price_min))) query = query.gte('price', Number(price_min));
  if (price_max !== undefined && price_max !== '' && Number.isFinite(Number(price_max))) query = query.lte('price', Number(price_max));
  if (year_min !== undefined && year_min !== '' && Number.isFinite(Number(year_min))) query = query.gte('year', Number(year_min));
  if (lang === 'ru' || lang === 'en') query = query.eq('lang', lang);
  if (q) {
    const s = String(q).slice(0, 60).replace(/[%,()]/g, ' ');
    query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  res.json(data);
}));

app.get('/api/listings/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { data } = await db.from('listings').select(PUBLIC_FIELDS + ',reject_reason').eq('id', id).maybeSingle();
  if (!data) return res.status(404).json({ error: 'not_found' });
  const mine = data.owner_id === req.user.id;
  if (data.status !== 'approved' && data.status !== 'sold' && !mine && !req.user.isAdmin) return res.status(404).json({ error: 'not_found' });
  const { data: owner } = await db.from('users').select('username').eq('tg_id', data.owner_id).maybeSingle();
  const { data: fav } = await db.from('favorites').select('listing_id').eq('user_id', req.user.id).eq('listing_id', id).maybeSingle();
  if (!mine) db.from('listings').update({ views: data.views + 1 }).eq('id', id).then(() => {});
  res.json({ ...data, ownerUsername: owner?.username ?? null, mine, favorite: !!fav });
}));

app.post('/api/photos', auth, upload.array('photos', 5), wrap(async (req, res) => {
  const urls = [];
  for (const f of req.files || []) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.mimetype)) return res.status(400).json({ error: 'bad_image' });
    const ext = f.mimetype === 'image/png' ? 'png' : f.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const key = `${req.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from('listings').upload(key, f.buffer, { contentType: f.mimetype });
    if (error) throw error;
    urls.push(db.storage.from('listings').getPublicUrl(key).data.publicUrl);
  }
  res.json({ urls });
}));

app.post('/api/listings', auth, wrap(async (req, res) => {
  const { title, description = '', price, category, subcategory, condition, brand, year, mileage, lang, photos = [] } = req.body || {};
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 100) return res.status(400).json({ error: 'title' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'category' });
  const cat = CATEGORY_MAP[category];
  if (cat.subs.length && !cat.subs.some((x) => x.key === subcategory)) return res.status(400).json({ error: 'subcategory' });
  if (lang !== 'ru' && lang !== 'en') return res.status(400).json({ error: 'lang' });
  if (!req.user.username) return res.status(400).json({ error: 'no_username' }); // buyers contact via @username
  const p = price === '' || price == null ? null : Number(price);
  if (p != null && (!Number.isFinite(p) || p < 0 || p > 1e9)) return res.status(400).json({ error: 'price' });

  // extra fields, only those the category supports
  const extra = { subcategory: cat.subs.length ? subcategory : null, condition: null, brand: null, year: null, mileage: null };
  if (cat.condition && (condition === 'new' || condition === 'used')) extra.condition = condition;
  if (cat.brands && brand && cat.brands.includes(brand)) extra.brand = brand;
  if (cat.year && year !== '' && year != null) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1950 || y > new Date().getFullYear() + 1) return res.status(400).json({ error: 'year' });
    extra.year = y;
  }
  if (cat.mileage && mileage !== '' && mileage != null) {
    const m = Number(mileage);
    if (!Number.isInteger(m) || m < 0 || m > 2_000_000) return res.status(400).json({ error: 'mileage' });
    extra.mileage = m;
  }

  // anti-spam: content rules
  const bad = checkContent(title, description);
  if (bad) return res.status(400).json({ error: bad });

  // anti-spam: limits (admins are exempt)
  if (!req.user.isAdmin) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: day } = await db.from('listings').select('id', { count: 'exact', head: true }).eq('owner_id', req.user.id).gte('created_at', since);
    if ((day ?? 0) >= LIMITS.perDay) return res.status(429).json({ error: 'daily_limit' });
    const { count: pend } = await db.from('listings').select('id', { count: 'exact', head: true }).eq('owner_id', req.user.id).eq('status', 'pending');
    if ((pend ?? 0) >= LIMITS.pendingMax) return res.status(429).json({ error: 'pending_limit' });
    const { data: dup } = await db.from('listings').select('id').eq('owner_id', req.user.id).eq('title', title.trim()).in('status', ['pending', 'approved']).limit(1);
    if (dup?.length) return res.status(409).json({ error: 'duplicate' });
  }

  const photoList = (Array.isArray(photos) ? photos : []).filter((u) => typeof u === 'string' && u.startsWith(SUPABASE_URL)).slice(0, 5);
  const { data, error } = await db.from('listings').insert({
    owner_id: req.user.id, title: title.trim(), description: String(description).slice(0, 2000),
    price: p, category, lang, photos: photoList, ...extra,
  }).select('id').single();
  if (error) throw error;
  for (const a of admins) notify(a, 'ru', `🆕 На модерации: «${title.trim()}» (#${data.id})`);
  res.json({ id: data.id });
}));

app.post('/api/listings/:id/status', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (!['sold', 'archived'].includes(status)) return res.status(400).json({ error: 'status' });
  const { data } = await db.from('listings').update({ status }).eq('id', id).eq('owner_id', req.user.id).select('id');
  res.json({ ok: !!data?.length });
}));

app.post('/api/favorites/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { data } = await db.from('favorites').select('listing_id').eq('user_id', req.user.id).eq('listing_id', id).maybeSingle();
  if (data) await db.from('favorites').delete().eq('user_id', req.user.id).eq('listing_id', id);
  else await db.from('favorites').insert({ user_id: req.user.id, listing_id: id });
  res.json({ favorite: !data });
}));

app.get('/api/my/listings', auth, wrap(async (req, res) => {
  const { data } = await db.from('listings').select(PUBLIC_FIELDS + ',reject_reason').eq('owner_id', req.user.id).order('created_at', { ascending: false });
  res.json(data);
}));

app.get('/api/my/favorites', auth, wrap(async (req, res) => {
  const { data: favs } = await db.from('favorites').select('listing_id').eq('user_id', req.user.id).order('created_at', { ascending: false });
  const ids = (favs || []).map((f) => f.listing_id);
  if (!ids.length) return res.json([]);
  const { data } = await db.from('listings').select(PUBLIC_FIELDS).in('id', ids).eq('status', 'approved');
  res.json(data);
}));

app.post('/api/listings/:id/report', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  // one report per user per listing (unique constraint); duplicates are ignored
  await db.from('reports').upsert(
    { listing_id: id, reporter_id: req.user.id, reason: String(req.body?.reason || '').slice(0, 300) },
    { onConflict: 'listing_id,reporter_id', ignoreDuplicates: true },
  );
  const { count } = await db.from('reports').select('id', { count: 'exact', head: true }).eq('listing_id', id);
  if ((count ?? 0) >= LIMITS.reportsToHide) {
    // send back to moderation until an admin looks at it
    const { data } = await db.from('listings').update({ status: 'pending' }).eq('id', id).eq('status', 'approved').select('title').maybeSingle();
    if (data) for (const a of admins) notify(a, 'ru', `🚩 ${count} жалоб, объявление «${data.title}» (#${id}) снято на повторную модерацию`);
  }
  res.json({ ok: true });
}));

// ---- Admin ----
app.get('/api/admin/pending', auth, adminOnly, wrap(async (req, res) => {
  const { data } = await db.from('listings').select(PUBLIC_FIELDS).eq('status', 'pending').order('created_at');
  res.json(data);
}));

// Ban an author: blocks the account and removes all of their live/pending listings.
app.post('/api/admin/users/:tgId/ban', auth, adminOnly, wrap(async (req, res) => {
  const tgId = Number(req.params.tgId);
  if (admins.has(tgId)) return res.status(400).json({ error: 'cannot_ban_admin' });
  await db.from('users').update({ is_banned: true }).eq('tg_id', tgId);
  await db.from('listings').update({ status: 'archived' }).eq('owner_id', tgId).in('status', ['pending', 'approved']);
  res.json({ ok: true });
}));

app.post('/api/admin/:id/:action', auth, adminOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.params;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action' });
  const patch = action === 'approve'
    ? { status: 'approved', approved_at: new Date().toISOString(), reject_reason: null }
    : { status: 'rejected', reject_reason: String(req.body?.reason || '').slice(0, 300) || null };
  const { data } = await db.from('listings').update(patch).eq('id', id).select('title,owner_id,reject_reason').maybeSingle();
  if (!data) return res.status(404).json({ error: 'not_found' });
  const { data: owner } = await db.from('users').select('lang').eq('tg_id', data.owner_id).maybeSingle();
  const l = owner?.lang === 'ru' ? 'ru' : 'en';
  notify(data.owner_id, l, action === 'approve' ? T[l].approved(data.title) : T[l].rejected(data.title, data.reject_reason));
  res.json({ ok: true });
}));

// ---- Static web app ----
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Duboard server on :${PORT}`));
bot.start({ onStart: (me) => console.log(`Bot @${me.username} started`) });
