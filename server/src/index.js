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
import { TAXONOMY, CATEGORY_MAP, LOCATIONS, LOCATION_MAP, validLocation, subOf, isVehicle, brandsOf, cleanAttrs } from './taxonomy.js';
import { cleanParams, sigOf, matchesSearch } from './searches.js';
import { checkContent, checkCategoryRules, LIMITS } from './rules.js';

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
const REMIND_DAYS = 14;               // ask the seller "still relevant?" after this many days
const ARCHIVE_AFTER_REMIND_DAYS = 4;  // archive if there was no answer
const MAX_SAVED_SEARCHES = 5;
const DAY = 24 * 3600 * 1000;
const T = {
  ru: {
    start: 'Duboard — доска объявлений Дубая 🇦🇪\nПокупайте, продавайте и находите услуги прямо в Telegram.',
    open: 'Открыть Duboard',
    approved: (t) => `✅ Ваше объявление «${t}» опубликовано.`,
    rejected: (t, r) => `❌ Объявление «${t}» отклонено${r ? `: ${r}` : '.'}`,
    remind: (t) => `⏰ Объявление «${t}» всё ещё актуально?\n\nЕсли не ответить, через ${ARCHIVE_AFTER_REMIND_DAYS} дня оно уйдёт в архив.`,
    btnRenew: '✅ Актуально', btnSold: '💰 Продано', btnOff: '🗑 Снять',
    renewed: (t) => `✅ «${t}» продлено ещё на ${REMIND_DAYS} дней.`,
    soldDone: (t) => `💰 «${t}» отмечено как проданное. Поздравляем!`,
    offDone: (t) => `🗑 «${t}» снято с публикации.`,
    expired: (t) => `📦 Объявление «${t}» убрано в архив: не было ответа на напоминание. Подать заново можно в приложении.`,
    subHit: (t, price, place) => `🔔 Новое по вашей подписке:\n${t}\n${price}${place ? ` · 📍 ${place}` : ''}`,
    openAd: 'Открыть объявление',
  },
  en: {
    start: 'Duboard — Dubai classifieds 🇦🇪\nBuy, sell and find services right inside Telegram.',
    open: 'Open Duboard',
    approved: (t) => `✅ Your listing "${t}" is now live.`,
    rejected: (t, r) => `❌ Your listing "${t}" was rejected${r ? `: ${r}` : '.'}`,
    remind: (t) => `⏰ Is your listing "${t}" still available?\n\nIf you don't reply, it will be archived in ${ARCHIVE_AFTER_REMIND_DAYS} days.`,
    btnRenew: '✅ Still available', btnSold: '💰 Sold', btnOff: '🗑 Remove',
    renewed: (t) => `✅ "${t}" renewed for another ${REMIND_DAYS} days.`,
    soldDone: (t) => `💰 "${t}" marked as sold. Congratulations!`,
    offDone: (t) => `🗑 "${t}" has been unpublished.`,
    expired: (t) => `📦 Your listing "${t}" was archived because there was no reply to the reminder. You can post it again in the app.`,
    subHit: (t, price, place) => `🔔 New match for your saved search:\n${t}\n${price}${place ? ` · 📍 ${place}` : ''}`,
    openAd: 'Open listing',
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
// ---------- Broadcast (admins only) ----------
// /broadcast [ru|en|all] text   -> preview with Send / Cancel buttons
const pendingBroadcast = new Map(); // adminId -> { text, lang }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
bot.command('broadcast', async (ctx) => {
  if (!admins.has(ctx.from?.id) || ctx.chat?.type !== 'private') return;
  let rest = (ctx.match || '').trim();
  let lang = 'all';
  const m = rest.match(/^(ru|en|all)\s+/i);
  if (m) { lang = m[1].toLowerCase(); rest = rest.slice(m[0].length).trim(); }
  if (!rest) return ctx.reply('Usage: /broadcast [ru|en|all] text\nExample: /broadcast ru Новые категории уже в приложении!');
  let q = db.from('users').select('tg_id', { count: 'exact', head: true }).eq('is_banned', false);
  if (lang !== 'all') q = q.eq('lang', lang);
  const { count } = await q;
  pendingBroadcast.set(ctx.from.id, { text: rest, lang });
  await ctx.reply(`Preview (${lang}, ~${count ?? '?'} recipients):\n\n${rest}`, {
    reply_markup: new InlineKeyboard().text('✅ Send', 'bc_send').text('✖ Cancel', 'bc_cancel'),
  });
});
bot.callbackQuery('bc_cancel', async (ctx) => {
  pendingBroadcast.delete(ctx.from.id);
  await ctx.answerCallbackQuery({ text: 'Cancelled' });
  await ctx.editMessageReplyMarkup().catch(() => {});
});
bot.callbackQuery('bc_send', async (ctx) => {
  if (!admins.has(ctx.from.id)) return ctx.answerCallbackQuery();
  const job = pendingBroadcast.get(ctx.from.id);
  if (!job) return ctx.answerCallbackQuery({ text: 'Nothing to send' });
  pendingBroadcast.delete(ctx.from.id);
  await ctx.answerCallbackQuery({ text: 'Sending…' });
  await ctx.editMessageReplyMarkup().catch(() => {});
  let sent = 0, failed = 0, from = 0;
  const page = 500;
  const kb = new InlineKeyboard().webApp(job.lang === 'ru' ? 'Открыть Duboard' : 'Open Duboard', WEBAPP_URL);
  for (;;) {
    let q = db.from('users').select('tg_id').eq('is_banned', false).order('tg_id').range(from, from + page - 1);
    if (job.lang !== 'all') q = q.eq('lang', job.lang);
    const { data } = await q;
    if (!data?.length) break;
    for (const u of data) {
      try { await bot.api.sendMessage(u.tg_id, job.text, { reply_markup: kb }); sent++; }
      catch (e) {
        if (e.error_code === 429) { await sleep(((e.parameters?.retry_after) || 5) * 1000); try { await bot.api.sendMessage(u.tg_id, job.text, { reply_markup: kb }); sent++; } catch { failed++; } }
        else failed++; // blocked the bot / deactivated
      }
      await sleep(50); // ~20 msg/s, under Telegram's ~30/s limit
    }
    from += page;
  }
  await bot.api.sendMessage(ctx.from.id, `Broadcast done: ${sent} delivered, ${failed} failed.`);
});


async function notify(tgId, lang, text, extra) {
  try { await bot.api.sendMessage(tgId, text, extra); return true; } catch (e) { console.warn('notify failed', tgId, e.description || e.message); return false; }
}
const userLang = async (tgId) => {
  const { data } = await db.from('users').select('lang').eq('tg_id', tgId).maybeSingle();
  return data?.lang === 'ru' ? 'ru' : 'en';
};
const placeName = (l, lang) => {
  const e = LOCATION_MAP[l.emirate];
  const ar = e?.areas.find((x) => x.key === l.area);
  return [ar?.[lang], e?.[lang]].filter(Boolean).join(', ');
};
const priceStr = (p, lang) => (p == null ? (lang === 'ru' ? 'Договорная' : 'Negotiable') : Number(p) === 0 ? (lang === 'ru' ? 'Бесплатно' : 'Free') : `${Number(p).toLocaleString('en-US')} AED`);

// "Still relevant?" buttons under the reminder message.
bot.callbackQuery(/^rel:(\d+):(renew|sold|off)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const act = ctx.match[2];
  const lang = await userLang(ctx.from.id);
  const tt = T[lang];
  const patch = act === 'renew' ? { renewed_at: new Date().toISOString(), reminded_at: null } : { status: act === 'sold' ? 'sold' : 'archived' };
  const { data } = await db.from('listings').update(patch).eq('id', id).eq('owner_id', ctx.from.id).eq('status', 'approved').select('title').maybeSingle();
  if (!data) { await ctx.answerCallbackQuery(); return ctx.editMessageReplyMarkup().catch(() => {}); }
  await ctx.answerCallbackQuery();
  const text = act === 'renew' ? tt.renewed(data.title) : act === 'sold' ? tt.soldDone(data.title) : tt.offDone(data.title);
  await ctx.editMessageText(text).catch(() => {});
});

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
  req.user = { id: u.id, username: u.username, lang: existing?.lang ?? lang, isAdmin: admins.has(u.id), accepted: !!existing?.accepted_terms_at };
  next();
}
const adminOnly = (req, res, next) => (req.user.isAdmin ? next() : res.status(403).json({ error: 'forbidden' }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'server' }); });

const PUBLIC_FIELDS = 'id,title,description,price,category,subcategory,condition,brand,year,mileage,lang,photos,created_at,approved_at,views,status,owner_id,emirate,area,attrs';

app.get('/api/me', auth, wrap(async (req, res) => {
  res.json({ id: req.user.id, lang: req.user.lang, isAdmin: req.user.isAdmin, accepted: req.user.accepted, taxonomy: TAXONOMY, locations: LOCATIONS, limits: { photos: 5 }, botUsername: BOT_USERNAME, shortName: MINIAPP_SHORT_NAME });
}));

// Consent to Terms and Privacy Policy (recorded with a timestamp).
app.post('/api/me/accept', auth, wrap(async (req, res) => {
  await db.from('users').update({ accepted_terms_at: new Date().toISOString() }).eq('tg_id', req.user.id);
  res.json({ ok: true });
}));

// Delete the account and all personal data: listings, favorites, reports, photos.
app.post('/api/me/delete', auth, wrap(async (req, res) => {
  const id = req.user.id;
  const { data: files } = await db.storage.from('listings').list(String(id), { limit: 1000 });
  if (files?.length) await db.storage.from('listings').remove(files.map((f) => `${id}/${f.name}`));
  await db.from('users').delete().eq('tg_id', id);
  res.json({ ok: true });
}));

app.post('/api/me/lang', auth, wrap(async (req, res) => {
  const lang = req.body?.lang === 'ru' ? 'ru' : 'en';
  await db.from('users').update({ lang }).eq('tg_id', req.user.id);
  res.json({ ok: true });
}));

app.get('/api/listings', auth, wrap(async (req, res) => {
  const { category, sub, brand, condition, price_min, price_max, year_min, year_max, mileage_max, lang, q, emirate, area, sort, offset = 0, limit = 20 } = req.query;
  const lim = Math.min(Number(limit) || 20, 50);
  const off = Math.max(Number(offset) || 0, 0);
  let query = db.from('listings').select(PUBLIC_FIELDS).eq('status', 'approved');
  if (sort === 'price_asc') query = query.not('price', 'is', null).order('price', { ascending: true }).order('id', { ascending: false });
  else if (sort === 'price_desc') query = query.not('price', 'is', null).order('price', { ascending: false }).order('id', { ascending: false });
  else if (sort === 'old') query = query.order('approved_at', { ascending: true }).order('id', { ascending: true });
  else if (sort === 'year_asc') query = query.not('year', 'is', null).order('year', { ascending: true }).order('id', { ascending: false });
  else if (sort === 'mileage_desc') query = query.not('mileage', 'is', null).order('mileage', { ascending: false }).order('id', { ascending: false });
  else if (sort === 'year_desc') query = query.not('year', 'is', null).order('year', { ascending: false }).order('id', { ascending: false });
  else if (sort === 'mileage_asc') query = query.not('mileage', 'is', null).order('mileage', { ascending: true }).order('id', { ascending: false });
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
  if (year_max !== undefined && year_max !== '' && Number.isFinite(Number(year_max))) query = query.lte('year', Number(year_max));
  if (mileage_max !== undefined && mileage_max !== '' && Number.isFinite(Number(mileage_max))) query = query.lte('mileage', Number(mileage_max));
  // category-specific fields: a_<key>=value (e.g. a_specs=gcc, a_model=land)
  if (category && CATEGORY_MAP[category]?.fields && isVehicle(CATEGORY_MAP[category], sub || 'cars')) {
    for (const f of CATEGORY_MAP[category].fields) {
      const v = req.query[`a_${f.key}`];
      if (!v) continue;
      if (f.type === 'select' && f.options.some((o) => o.key === v)) query = query.eq(`attrs->>${f.key}`, v);
      else if (f.type === 'text') query = query.ilike(`attrs->>${f.key}`, `%${String(v).slice(0, 40).replace(/[%,()_]/g, ' ')}%`);
    }
  }
  if (lang === 'ru' || lang === 'en') query = query.eq('lang', lang);
  if (emirate && LOCATION_MAP[emirate]) {
    query = query.eq('emirate', emirate);
    if (area && validLocation(emirate, area)) query = query.eq('area', area);
  }
  if (q) {
    const s = String(q).slice(0, 60).replace(/[%,()]/g, ' ');
    query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  res.json(data);
}));

// Trust badges are switched off for now; set to true to bring them back.
const SHOW_BADGES = false;

// Seller trust data: counts + badges computed from the listing history.
async function sellerStats(ownerId) {
  const { data: rows } = await db.from('listings').select('id,status,approved_at').eq('owner_id', ownerId).in('status', ['approved', 'sold', 'archived']).not('approved_at', 'is', null);
  const list = rows || [];
  const sold = list.filter((x) => x.status === 'sold').length;
  const active = list.filter((x) => x.status === 'approved').length;
  let reports = 0;
  if (list.length) {
    const { count } = await db.from('reports').select('id', { count: 'exact', head: true }).in('listing_id', list.map((x) => x.id));
    reports = count || 0;
  }
  const badges = [];
  if (SHOW_BADGES && list.length >= 3 && reports < 2) badges.push('verified');
  if (SHOW_BADGES && sold >= 5) badges.push('top');
  return { total: list.length, sold, active, badges };
}

app.get('/api/sellers/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) return res.status(404).json({ error: 'not_found' });
  const { data: u } = await db.from('users').select('tg_id,username,first_name,created_at,is_banned').eq('tg_id', id).maybeSingle();
  if (!u || u.is_banned) return res.status(404).json({ error: 'not_found' });
  const stats = await sellerStats(id);
  const { data: listings } = await db.from('listings').select(PUBLIC_FIELDS).eq('owner_id', id).eq('status', 'approved').order('approved_at', { ascending: false }).limit(50);
  res.json({ id: u.tg_id, name: u.first_name || u.username || '', username: u.username, since: u.created_at, sold: stats.sold, active: stats.active, badges: stats.badges, listings: listings || [] });
}));

app.get('/api/listings/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { data } = await db.from('listings').select(PUBLIC_FIELDS + ',reject_reason').eq('id', id).maybeSingle();
  if (!data) return res.status(404).json({ error: 'not_found' });
  const mine = data.owner_id === req.user.id;
  if (data.status !== 'approved' && data.status !== 'sold' && !mine && !req.user.isAdmin) return res.status(404).json({ error: 'not_found' });
  const { data: owner } = await db.from('users').select('username').eq('tg_id', data.owner_id).maybeSingle();
  const { data: fav } = await db.from('favorites').select('listing_id').eq('user_id', req.user.id).eq('listing_id', id).maybeSingle();
  if (!mine && data.status === 'approved') db.rpc('bump_view', { p_listing: id, p_user: req.user.id }).then(() => {}, () => {});
  const seller = mine ? null : await sellerStats(data.owner_id);
  res.json({ ...data, ownerUsername: owner?.username ?? null, mine, favorite: !!fav, ownerBadges: seller?.badges ?? [] });
}));

// Similar listings: same category (and subcategory), scored by brand / place / price closeness.
app.get('/api/listings/:id/similar', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { data: base } = await db.from('listings').select('id,category,subcategory,brand,price,emirate,area,status').eq('id', id).maybeSingle();
  if (!base) return res.json([]);
  let q = db.from('listings').select(PUBLIC_FIELDS).eq('status', 'approved').eq('category', base.category).neq('id', id)
    .order('approved_at', { ascending: false }).limit(40);
  if (base.subcategory) q = q.eq('subcategory', base.subcategory);
  const { data } = await q;
  const score = (x) => {
    let n = 0;
    if (base.brand && x.brand === base.brand) n += 3;
    if (base.emirate && x.emirate === base.emirate) n += 1;
    if (base.area && x.area === base.area) n += 2;
    if (base.price && x.price && x.price >= base.price * 0.5 && x.price <= base.price * 1.5) n += 2;
    return n;
  };
  const out = (data || []).map((x, i) => ({ x, s: score(x), i })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 8).map((o) => o.x);
  res.json(out);
}));

app.post('/api/photos', auth, upload.fields([{ name: 'photos', maxCount: 5 }, { name: 'thumbs', maxCount: 5 }]), wrap(async (req, res) => {
  const photos = req.files?.photos || [];
  const thumbs = req.files?.thumbs || [];
  const urls = [];
  for (let i = 0; i < photos.length; i++) {
    const f = photos[i];
    if (!/^image\/(jpeg|png|webp)$/.test(f.mimetype)) return res.status(400).json({ error: 'bad_image' });
    const ext = f.mimetype === 'image/png' ? 'png' : f.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const base = `${req.user.id}/${crypto.randomUUID()}`;
    const { error } = await db.storage.from('listings').upload(`${base}.${ext}`, f.buffer, { contentType: f.mimetype });
    if (error) throw error;
    // Optional feed thumbnail stored as <base>_t.jpg (clients fall back to the full photo if it is missing).
    const th = thumbs.length === photos.length ? thumbs[i] : null;
    if (th && th.mimetype === 'image/jpeg' && th.size <= 300 * 1024) {
      const { error: te } = await db.storage.from('listings').upload(`${base}_t.jpg`, th.buffer, { contentType: 'image/jpeg' });
      if (te) console.warn('thumb upload failed', te.message);
    }
    urls.push(db.storage.from('listings').getPublicUrl(`${base}.${ext}`).data.publicUrl);
  }
  res.json({ urls });
}));

// Shared validation for create and edit. Returns { error } or { title, description, p, lang, category, emirate, area, extra }.
function validateListing(body, user) {
  const { title, description = '', price, category, subcategory, condition, brand, year, mileage, lang, emirate, area, attrs, photos = [] } = body || {};
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 100) return { error: 'title' };
  if (!CATEGORIES.includes(category)) return { error: 'category' };
  const cat = CATEGORY_MAP[category];
  if (cat.subs.length && !cat.subs.some((x) => x.key === subcategory)) return { error: 'subcategory' };
  if (lang !== 'ru' && lang !== 'en') return { error: 'lang' };
  if (!validLocation(emirate, area)) return { error: 'location' };
  if (!user.username) return { error: 'no_username' }; // buyers contact via @username
  const p = price === '' || price == null ? null : Number(price);
  if (p != null && (!Number.isFinite(p) || p < 0 || p > 1e9)) return { error: 'price' };

  // extra fields, only those the category supports
  const extra = { subcategory: cat.subs.length ? subcategory : null, condition: null, brand: null, year: null, mileage: null, attrs: {} };
  const veh = isVehicle(cat, subcategory);
  if (cat.condition && (condition === 'new' || condition === 'used')) extra.condition = condition;
  const brandList = brandsOf(cat, subcategory);
  if (brandList && brand && brandList.includes(brand)) extra.brand = brand;
  if (veh) extra.attrs = cleanAttrs(cat, attrs);
  if (cat.year && veh && year !== '' && year != null) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1950 || y > new Date().getFullYear() + 1) return { error: 'year' };
    extra.year = y;
  }
  if (cat.mileage && veh && mileage !== '' && mileage != null) {
    const m = Number(mileage);
    if (!Number.isInteger(m) || m < 0 || m > 2_000_000) return { error: 'mileage' };
    extra.mileage = m;
  }

  // anti-spam: content rules
  const bad = checkContent(title, description, extra.attrs.model) || checkCategoryRules(category, title, description, extra.attrs.model);
  if (bad) return { error: bad };
  return { title: title.trim(), description: String(description).slice(0, 2000), p, lang, category, emirate, area, extra, photos };
}

app.post('/api/listings', auth, wrap(async (req, res) => {
  if (!req.user.accepted) return res.status(403).json({ error: 'terms' });
  const v = validateListing(req.body, req.user);
  if (v.error) return res.status(400).json({ error: v.error });
  const { title, description, p, lang, category, emirate, area, extra } = v;
  const photos = v.photos;
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
    owner_id: req.user.id, title, description,
    price: p, category, lang, emirate, area, photos: photoList, ...extra,
  }).select('id').single();
  if (error) throw error;
  for (const a of admins) notify(a, 'ru', `🆕 На модерации: «${title}» (#${data.id})`);
  res.json({ id: data.id });
}));

// Storage object paths (<owner>/<uuid>.<ext> and its _t.jpg thumb) behind a list of public photo URLs.
const storagePaths = (urls) => urls.flatMap((u) => {
  const m = String(u).match(/\/listings\/(.+)$/);
  if (!m) return [];
  const path = decodeURIComponent(m[1]);
  return [path, path.replace(/\.[a-z]+$/i, '_t.jpg')];
});

// Edit own listing. Text/photo/category changes send it back to moderation; price/location/details do not.
app.patch('/api/listings/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { data: old } = await db.from('listings').select('*').eq('id', id).eq('owner_id', req.user.id).maybeSingle();
  if (!old) return res.status(404).json({ error: 'not_found' });
  if (!['approved', 'pending', 'rejected'].includes(old.status)) return res.status(400).json({ error: 'not_editable' });
  const v = validateListing(req.body, req.user);
  if (v.error) return res.status(400).json({ error: v.error });
  const photoList = (Array.isArray(v.photos) ? v.photos : [])
    .filter((u) => typeof u === 'string' && (old.photos.includes(u) || (u.startsWith(SUPABASE_URL) && u.includes(`/listings/${req.user.id}/`)))).slice(0, 5);
  const changedPhotos = photoList.length !== old.photos.length || photoList.some((u, i) => u !== old.photos[i]);
  const review = old.status !== 'approved'
    || v.title !== old.title || v.description !== old.description
    || v.category !== old.category || v.extra.subcategory !== old.subcategory || changedPhotos;
  const status = old.status === 'approved' && !review ? 'approved' : 'pending';
  const { error } = await db.from('listings').update({
    title: v.title, description: v.description, price: v.p, category: v.category, lang: v.lang,
    emirate: v.emirate, area: v.area, photos: photoList, ...v.extra,
    status, reject_reason: status === 'pending' ? null : old.reject_reason,
  }).eq('id', id).eq('owner_id', req.user.id);
  if (error) throw error;
  const dropped = old.photos.filter((u) => !photoList.includes(u));
  if (dropped.length) db.storage.from('listings').remove(storagePaths(dropped)).then(() => {}, () => {});
  if (status === 'pending' && old.status !== 'pending') for (const a of admins) notify(a, 'ru', `✏️ Изменено, на модерации: «${v.title}» (#${id})`);
  res.json({ ok: true, status });
}));

// Delete own listing (not while it is live: unpublish first).
app.delete('/api/listings/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { data: old } = await db.from('listings').select('id,status,photos').eq('id', id).eq('owner_id', req.user.id).maybeSingle();
  if (!old) return res.status(404).json({ error: 'not_found' });
  if (old.status === 'approved') return res.status(400).json({ error: 'unpublish_first' });
  const { error } = await db.from('listings').delete().eq('id', id).eq('owner_id', req.user.id);
  if (error) throw error;
  if (old.photos?.length) db.storage.from('listings').remove(storagePaths(old.photos)).then(() => {}, () => {});
  res.json({ ok: true });
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
    ? { status: 'approved', approved_at: new Date().toISOString(), renewed_at: new Date().toISOString(), reminded_at: null, reject_reason: null }
    : { status: 'rejected', reject_reason: String(req.body?.reason || '').slice(0, 300) || null };
  const { data } = await db.from('listings').update(patch).eq('id', id).select(PUBLIC_FIELDS + ',reject_reason').maybeSingle();
  if (!data) return res.status(404).json({ error: 'not_found' });
  const { data: owner } = await db.from('users').select('lang').eq('tg_id', data.owner_id).maybeSingle();
  const l = owner?.lang === 'ru' ? 'ru' : 'en';
  notify(data.owner_id, l, action === 'approve' ? T[l].approved(data.title) : T[l].rejected(data.title, data.reject_reason));
  if (action === 'approve') notifySubscribers(data).catch((e) => console.warn('subscribers', e.message));
  res.json({ ok: true });
}));

// ---- Saved searches ----
app.get('/api/searches', auth, wrap(async (req, res) => {
  const { data } = await db.from('saved_searches').select('id,params,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false });
  res.json(data || []);
}));

app.post('/api/searches', auth, wrap(async (req, res) => {
  const params = cleanParams(req.body?.params);
  if (!Object.keys(params).length) return res.status(400).json({ error: 'empty_search' });
  const sig = sigOf(params);
  const { data: all } = await db.from('saved_searches').select('id,sig').eq('user_id', req.user.id);
  const dup = (all || []).find((x) => x.sig === sig);
  if (dup) return res.json({ id: dup.id, existed: true });
  if ((all?.length ?? 0) >= MAX_SAVED_SEARCHES) return res.status(429).json({ error: 'subs_limit' });
  const { data, error } = await db.from('saved_searches').insert({ user_id: req.user.id, params, sig }).select('id').single();
  if (error) throw error;
  res.json({ id: data.id });
}));

app.delete('/api/searches/:id', auth, wrap(async (req, res) => {
  await db.from('saved_searches').delete().eq('id', Number(req.params.id)).eq('user_id', req.user.id);
  res.json({ ok: true });
}));

// Called when a listing is approved: message every user whose saved search matches (once per user).
async function notifySubscribers(l) {
  const { data: subs } = await db.from('saved_searches').select('user_id,params');
  const targets = new Set();
  for (const s of subs || []) if (s.user_id !== l.owner_id && matchesSearch(l, s.params)) targets.add(s.user_id);
  for (const uid of targets) {
    const lang = await userLang(uid);
    const url = `${WEBAPP_URL}?startapp=listing_${l.id}`;
    await notify(uid, lang, T[lang].subHit(l.title, priceStr(l.price, lang), placeName(l, lang)), { reply_markup: new InlineKeyboard().webApp(T[lang].openAd, url) });
  }
}

// ---- Listing lifecycle: "still relevant?" reminder, then archive ----
async function lifecycleTick() {
  const now = Date.now();
  // 1) remind sellers whose listing hasn't been confirmed for REMIND_DAYS (claim rows first so a second instance can't double-send)
  const { data: due } = await db.from('listings').select('id').eq('status', 'approved').is('reminded_at', null).lt('renewed_at', new Date(now - REMIND_DAYS * DAY).toISOString()).limit(50);
  if (due?.length) {
    const { data: claimed } = await db.from('listings').update({ reminded_at: new Date().toISOString() }).in('id', due.map((x) => x.id)).is('reminded_at', null).select('id,title,owner_id');
    for (const l of claimed || []) {
      const lang = await userLang(l.owner_id);
      const tt = T[lang];
      await notify(l.owner_id, lang, tt.remind(l.title), {
        reply_markup: new InlineKeyboard().text(tt.btnRenew, `rel:${l.id}:renew`).row().text(tt.btnSold, `rel:${l.id}:sold`).text(tt.btnOff, `rel:${l.id}:off`),
      });
    }
  }
  // 2) archive those that ignored the reminder
  const { data: expired } = await db.from('listings').update({ status: 'archived' }).eq('status', 'approved').not('reminded_at', 'is', null).lt('reminded_at', new Date(now - ARCHIVE_AFTER_REMIND_DAYS * DAY).toISOString()).select('id,title,owner_id');
  for (const l of expired || []) {
    const lang = await userLang(l.owner_id);
    await notify(l.owner_id, lang, T[lang].expired(l.title));
  }
}
const runTick = () => lifecycleTick().catch((e) => console.warn('lifecycle', e.message));
setTimeout(runTick, Number(process.env.FIRST_TICK_MS) || 30 * 1000);
setInterval(runTick, Number(process.env.TICK_MS) || 60 * 60 * 1000);

// ---- Static web app ----
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Duboard server on :${PORT}`));
// During a redeploy the old instance may still be polling (409). Retry instead of crashing.
(async function startBot() {
  for (let i = 0; i < 20; i++) {
    try { await bot.start({ onStart: (me) => console.log(`Bot @${me.username} started`) }); return; } catch (e) {
      if (e?.error_code !== 409) { console.error('bot stopped', e); return; }
      console.warn('409 conflict, retrying in 5s');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
})();
