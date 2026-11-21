import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';
import { dict } from './i18n.js';
import { compressImage } from './compress.js';
import { LEGAL, UPDATED, fillLegal } from './legal.js';
import { tg, haptic, hapticNotify, fmt, timeAgo, confirmDialog, registerToast, toast, loadDraft, saveDraft, clearDraft, loadFeedLoc, saveFeedLoc, loadPostLoc, savePostLoc, askWriteAccess } from './utils.js';

const MAX_PHOTOS = 5;
const PAGE = 20;

const L = (o, t) => o?.[t.lang] ?? '';
const flag = (l) => (l === 'ru' ? '🇷🇺' : '🇬🇧');

function priceText(t, p) {
  if (p == null) return t.negotiable;
  if (Number(p) === 0) return t.free;
  return `${fmt(p)} ${t.aed}`;
}

/* ---------- taxonomy helpers (the server sends the taxonomy, these just read it) ---------- */
const subOf = (cat, sub) => cat?.subs.find((s) => s.key === sub);
const isVeh = (cat, sub) => !!(cat?.fields && subOf(cat, sub)?.veh);
const brandsOf = (cat, sub) => subOf(cat, sub)?.brands || cat?.brands;
const optLabel = (field, key, t) => L(field.options?.find((o) => o.key === key), t) || key;

function areaOf(l, locs) {
  const e = locs.find((x) => x.key === l.emirate);
  return { e, a: e?.areas.find((x) => x.key === l.area) };
}
const placeOf = (l, locs, t) => { const { e, a } = areaOf(l, locs); return a ? `${L(a, t)}, ${L(e, t)}` : ''; };
const areaName = (l, locs, t) => { const { a } = areaOf(l, locs); return a ? L(a, t) : ''; };
const locOk = (locs, e, a) => !!locs.find((x) => x.key === e)?.areas.some((x) => x.key === a);

function tagsOf(l, tax, t) {
  const cat = tax.find((c) => c.key === l.category);
  const sub = subOf(cat, l.subcategory);
  const out = [];
  if (sub) out.push(L(sub, t));
  if (l.condition) out.push(t.cond[l.condition]);
  if (l.brand) out.push(l.brand);
  for (const f of cat?.fields || []) {
    const v = l.attrs?.[f.key];
    if (v) out.push(f.type === 'select' ? optLabel(f, v, t) : v);
  }
  if (l.year) out.push(String(l.year));
  if (l.mileage != null) out.push(`${fmt(l.mileage)} km`);
  return out;
}

// short line under the title on the card: vehicles show year / km / specs, everything else subcategory / condition
function cardTags(l, tax, t) {
  const cat = tax.find((c) => c.key === l.category);
  if (l.year || l.mileage != null) {
    const specs = cat?.fields?.find((f) => f.key === 'specs');
    return [l.year, l.mileage != null && `${fmt(l.mileage)} km`, l.attrs?.specs && specs && optLabel(specs, l.attrs.specs, t)].filter(Boolean).join(' · ');
  }
  return tagsOf(l, tax, t).slice(0, 2).join(' · ');
}

function describeSearch(p, tax, locs, t) {
  const parts = [];
  const cat = tax.find((c) => c.key === p.category);
  if (p.q) parts.push(`«${p.q}»`);
  if (cat) parts.push(`${cat.icon} ${L(cat, t)}`);
  const sub = subOf(cat, p.sub);
  if (sub) parts.push(L(sub, t));
  if (p.brand) parts.push(p.brand);
  for (const f of cat?.fields || []) {
    const v = p[`a_${f.key}`];
    if (v) parts.push(f.type === 'select' ? optLabel(f, v, t) : v);
  }
  if (p.condition) parts.push(t.cond[p.condition]);
  if (p.price_min) parts.push(`${t.priceFrom} ${fmt(p.price_min)}`);
  if (p.price_max) parts.push(`${t.priceTo} ${fmt(p.price_max)} ${t.aed}`);
  if (p.year_min) parts.push(`${t.yearFrom} ${p.year_min}`);
  if (p.year_max) parts.push(`${t.yearUpTo} ${p.year_max}`);
  if (p.mileage_max) parts.push(`${t.mileageUpTo} ${fmt(p.mileage_max)} km`);
  if (p.lang) parts.push(flag(p.lang));
  const e = locs.find((x) => x.key === p.emirate);
  const a = e?.areas.find((x) => x.key === p.area);
  if (e) parts.push(`📍 ${a ? `${L(a, t)}, ` : ''}${L(e, t)}`);
  return parts.join(' · ') || t.anything;
}

/* ---------- small UI pieces ---------- */

function Empty({ icon, title, hint, action, onAction }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <b>{title}</b>
      {hint && <div>{hint}</div>}
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="cardsk">
          <div className="sk" style={{ aspectRatio: '1' }} />
          <div className="sk" style={{ height: 14, margin: '10px 10px 0', width: '50%' }} />
          <div className="sk" style={{ height: 12, margin: '8px 10px 12px', width: '80%' }} />
        </div>
      ))}
    </div>
  );
}

function Pills({ options, value, onChange, clearable = true }) {
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o.key} type="button" className={`pl ${value === o.key ? 'on' : ''}`}
          onClick={() => { haptic('light'); onChange(value === o.key && clearable ? '' : o.key); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Bottom sheet with slide-up animation. body/footer are functions that receive an animated close().
function Sheet({ title, onClose, body, footer }) {
  const [out, setOut] = useState(false);
  const close = useCallback(() => { setOut(true); setTimeout(onClose, 200); }, [onClose]);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  // rendered into <body> so no animated/transformed ancestor can become its containing block
  return createPortal(
    <div className={`sheet-wrap ${out ? 'out' : ''}`}>
      <div className="backdrop" onClick={close} />
      <div className="sheet" role="dialog">
        <div className="grab" />
        <div className="sh-head"><b>{title}</b><button className="x" onClick={close} aria-label="close">×</button></div>
        <div className="sh-body">{body(close)}</div>
        {footer && <div className="sh-foot">{footer(close)}</div>}
      </div>
    </div>,
    document.body,
  );
}

function Card({ l, i, t, tax, locs, onOpen }) {
  const cat = tax.find((c) => c.key === l.category);
  const small = cardTags(l, tax, t);
  const area = areaName(l, locs, t);
  return (
    <div className="card" style={{ '--i': i % 10 }} onClick={() => { haptic('light'); onOpen(l.id); }}>
      <div className={`ph ${l.photos?.[0] ? '' : 'none'}`}>
        {l.photos?.[0]
          ? <img src={l.photos[0]} alt="" loading="lazy" ref={(el) => { if (el?.complete) el.classList.add('ld'); }} onLoad={(e) => e.currentTarget.classList.add('ld')} />
          : <span className="ico">{cat?.icon}</span>}
        <span className="fl">{flag(l.lang)}</span>
        {l.photos?.length > 1 && <span className="cnt">📷 {l.photos.length}</span>}
      </div>
      <div className="cb">
        <div className="pr">{priceText(t, l.price)}</div>
        <div className="t">{l.title}</div>
        {small && <div className="meta">{small}</div>}
        <div className="meta">{[area && `📍 ${area}`, timeAgo(l.approved_at || l.created_at, t.lang)].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

function ListView({ items, t, tax, locs, onOpen, empty }) {
  if (!items) return <Skeletons />;
  if (!items.length) return empty;
  return <div className="grid">{items.map((l, i) => <Card key={l.id} l={l} i={i} t={t} tax={tax} locs={locs} onOpen={onOpen} />)}</div>;
}

/* ---------------- Filters ---------------- */

const EMPTY_F = { brand: '', condition: '', priceMin: '', priceMax: '', yearMin: '', yearMax: '', mileageMax: '', attrs: {} };

function FilterSheet({ t, cat, sub, f, lang, onApply, onClose }) {
  const [d, setD] = useState(f);
  const [dl, setDl] = useState(lang);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const veh = cat?.fields && (!sub || isVeh(cat, sub));
  const brands = brandsOf(cat, sub);
  const setAttr = (k, v) => setD({ ...d, attrs: { ...d.attrs, [k]: v } });
  const reset = () => { setD(EMPTY_F); setDl(''); };
  return (
    <Sheet title={t.filters} onClose={onClose}
      body={() => (
        <>
          <label className="sh-label">{t.priceRange}</label>
          <div className="row" style={{ marginTop: 0 }}>
            <input inputMode="decimal" placeholder={t.priceMin} value={d.priceMin} onChange={set('priceMin')} />
            <input inputMode="decimal" placeholder={t.priceMax} value={d.priceMax} onChange={set('priceMax')} />
          </div>

          {!cat && <div className="hintbox">{t.pickCatHint}</div>}

          {brands && (
            <>
              <label className="sh-label">{t.brand}</label>
              <Pills options={brands.map((b) => ({ key: b, label: b }))} value={d.brand} onChange={(v) => setD({ ...d, brand: v })} />
            </>
          )}
          {cat?.condition && (
            <>
              <label className="sh-label">{t.condition}</label>
              <Pills options={[{ key: 'new', label: t.cond.new }, { key: 'used', label: t.cond.used }]} value={d.condition} onChange={(v) => setD({ ...d, condition: v })} />
            </>
          )}
          {veh && (
            <>
              <label className="sh-label">{t.yearRange}</label>
              <div className="row" style={{ marginTop: 0 }}>
                <input inputMode="numeric" placeholder={t.yearMin} value={d.yearMin} onChange={set('yearMin')} />
                <input inputMode="numeric" placeholder={t.yearTo} value={d.yearMax} onChange={set('yearMax')} />
              </div>
              <label className="sh-label">{t.mileageMax}</label>
              <input inputMode="numeric" placeholder="100000" value={d.mileageMax} onChange={set('mileageMax')} />
              {cat.fields.map((fl) => (
                <div key={fl.key}>
                  <label className="sh-label">{L(fl, t)}</label>
                  {fl.type === 'select'
                    ? <Pills options={fl.options.map((o) => ({ key: o.key, label: L(o, t) }))} value={d.attrs[fl.key] || ''} onChange={(v) => setAttr(fl.key, v)} />
                    : <input placeholder={fl.placeholder} maxLength={fl.max} value={d.attrs[fl.key] || ''} onChange={(e) => setAttr(fl.key, e.target.value)} />}
                </div>
              ))}
            </>
          )}
          <label className="sh-label">{t.adLang}</label>
          <Pills options={[{ key: 'ru', label: '🇷🇺 RU' }, { key: 'en', label: '🇬🇧 EN' }]} value={dl} onChange={setDl} />
        </>
      )}
      footer={(close) => (
        <div className="row" style={{ marginTop: 0 }}>
          <button className="ghost" style={{ flex: '0 0 auto' }} onClick={reset}>{t.reset}</button>
          <button onClick={() => { onApply(d, dl); close(); }}>{t.show}</button>
        </div>
      )}
    />
  );
}

function LocationSheet({ t, locs, loc, onPick, onClose }) {
  const [em, setEm] = useState(loc.emirate);
  const cur = locs.find((e) => e.key === em);
  return (
    <Sheet title={t.searchWhere} onClose={onClose}
      body={(close) => (
        <>
          <div className="pills">
            <button className={`pl ${!em ? 'on' : ''}`} onClick={() => { haptic('light'); onPick({ emirate: '', area: '' }); close(); }}>{t.allUAE}</button>
            {locs.map((e) => (
              <button key={e.key} className={`pl ${em === e.key ? 'on' : ''}`} onClick={() => { haptic('light'); setEm(e.key); }}>{L(e, t)}</button>
            ))}
          </div>
          {cur && (
            <>
              <label className="sh-label">{t.area}</label>
              <div className="pills fade-in" key={cur.key}>
                <button className={`pl ${loc.emirate === em && !loc.area ? 'on' : ''}`} onClick={() => { haptic('light'); onPick({ emirate: em, area: '' }); close(); }}>{t.allEmirate}</button>
                {cur.areas.map((a) => (
                  <button key={a.key} className={`pl ${loc.emirate === em && loc.area === a.key ? 'on' : ''}`} onClick={() => { haptic('light'); onPick({ emirate: em, area: a.key }); close(); }}>{L(a, t)}</button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    />
  );
}

/* ---------------- Feed ---------------- */

function Feed({ t, me, onOpen, onPost }) {
  const tax = me.taxonomy;
  const locs = me.locations;
  const [category, setCategory] = useState('');
  const [sub, setSub] = useState('');
  const [lang, setLang] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [f, setF] = useState(EMPTY_F);
  const [sheet, setSheet] = useState(null); // 'filters' | 'loc' | null
  const [loc, setLoc] = useState(() => { const s = loadFeedLoc(); return locs.some((e) => e.key === s.emirate) ? s : { emirate: '', area: '' }; });
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef(null);
  const cat = tax.find((c) => c.key === category);
  const vehOn = !!(cat?.fields && (!sub || isVeh(cat, sub)));

  const params = {};
  if (category) params.category = category;
  if (sub) params.sub = sub;
  if (lang) params.lang = lang;
  if (q.trim()) params.q = q.trim();
  if (sort !== 'new') params.sort = sort;
  if (f.brand) params.brand = f.brand;
  if (f.condition) params.condition = f.condition;
  if (f.priceMin) params.price_min = f.priceMin;
  if (f.priceMax) params.price_max = f.priceMax;
  if (vehOn) {
    if (f.yearMin) params.year_min = f.yearMin;
    if (f.yearMax) params.year_max = f.yearMax;
    if (f.mileageMax) params.mileage_max = f.mileageMax;
    for (const [k, v] of Object.entries(f.attrs)) if (v) params[`a_${k}`] = v;
  }
  if (loc.emirate) params.emirate = loc.emirate;
  if (loc.emirate && loc.area) params.area = loc.area;
  const key = JSON.stringify(params);

  useEffect(() => {
    let dead = false;
    setItems(null);
    const h = setTimeout(() => {
      api.listings({ ...params, limit: PAGE, offset: 0 })
        .then((d) => { if (!dead) { setItems(d); setMore(d.length === PAGE); } })
        .catch(() => { if (!dead) { setItems([]); setMore(false); } });
    }, 250);
    return () => { dead = true; clearTimeout(h); };
  }, [key]);

  const loadMore = useCallback(() => {
    if (!items || !more || loadingMore) return;
    setLoadingMore(true);
    api.listings({ ...params, limit: PAGE, offset: items.length })
      .then((d) => { setItems((p) => [...p, ...d.filter((x) => !p.some((y) => y.id === x.id))]); setMore(d.length === PAGE); })
      .catch(() => setMore(false))
      .finally(() => setLoadingMore(false));
  }, [items, more, loadingMore, key]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const changeLoc = (v) => { setLoc(v); saveFeedLoc(v); };
  const pickCategory = (k) => { haptic('light'); setCategory(k); setSub(''); setF(EMPTY_F); if (sort === 'year_desc' || sort === 'mileage_asc') setSort('new'); };
  const pickSub = (k) => {
    haptic('light');
    setSub(k);
    // brand lists differ per sub; vehicle-only fields do not apply to non-vehicle subs
    setF((p) => ({ ...p, brand: '', ...(k && !isVeh(cat, k) ? { yearMin: '', yearMax: '', mileageMax: '', attrs: {} } : {}) }));
  };
  const resetAll = () => { setCategory(''); setSub(''); setLang(''); setQ(''); setF(EMPTY_F); changeLoc({ emirate: '', area: '' }); };

  // removable chips for every active filter
  const chips = [];
  if (f.brand) chips.push([f.brand, () => setF({ ...f, brand: '' })]);
  if (f.condition) chips.push([t.cond[f.condition], () => setF({ ...f, condition: '' })]);
  if (f.priceMin || f.priceMax) chips.push([[f.priceMin && `${t.priceFrom} ${fmt(f.priceMin)}`, f.priceMax && `${t.priceTo} ${fmt(f.priceMax)}`].filter(Boolean).join(' ') + ` ${t.aed}`, () => setF({ ...f, priceMin: '', priceMax: '' })]);
  if (vehOn) {
    if (f.yearMin || f.yearMax) chips.push([[f.yearMin && `${t.priceFrom} ${f.yearMin}`, f.yearMax && `${t.priceTo} ${f.yearMax}`].filter(Boolean).join(' ') + ' ' + t.year.toLowerCase(), () => setF({ ...f, yearMin: '', yearMax: '' })]);
    if (f.mileageMax) chips.push([`≤ ${fmt(f.mileageMax)} km`, () => setF({ ...f, mileageMax: '' })]);
    for (const fl of cat.fields) {
      const v = f.attrs[fl.key];
      if (v) chips.push([fl.type === 'select' ? optLabel(fl, v, t) : v, () => setF({ ...f, attrs: { ...f.attrs, [fl.key]: '' } })]);
    }
  }
  if (lang) chips.push([flag(lang), () => setLang('')]);
  const filtered = !!(category || sub || lang || q || chips.length || loc.emirate);

  const curEmirate = locs.find((e) => e.key === loc.emirate);
  const locLabel = curEmirate ? (loc.area ? L(curEmirate.areas.find((a) => a.key === loc.area), t) : L(curEmirate, t)) : t.allUAE;
  const sortKeys = Object.keys(t.sort).filter((k) => (k !== 'year_desc' && k !== 'mileage_asc') || (category === 'cars'));

  const subscribe = async () => {
    haptic('light');
    if (!(await askWriteAccess())) return toast(t.subNeedWrite);
    try {
      const { sort: _s, ...subParams } = params;
      const r = await api.saveSearch(subParams);
      hapticNotify('success');
      toast(r.existed ? t.subExists : t.subSaved);
    } catch (e) { hapticNotify('error'); toast(t.errors[e.code] || t.errGeneric); }
  };

  return (
    <>
      <div className="search">
        <div className="field">
          <span>🔍</span>
          <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="fbtn" onClick={() => { haptic('light'); setSheet('filters'); }} aria-label={t.filters}>
          ⚙️{chips.length > 0 && <i className="dot">{chips.length}</i>}
        </button>
      </div>

      <div className="tiles">
        <div className={`tile ${category === '' ? 'on' : ''}`} onClick={() => pickCategory('')}>
          <div className="ic">✨</div><div className="lb">{t.all}</div>
        </div>
        {tax.map((c) => (
          <div key={c.key} className={`tile ${category === c.key ? 'on' : ''}`} onClick={() => pickCategory(c.key)}>
            <div className="ic">{c.icon}</div><div className="lb">{L(c, t)}</div>
          </div>
        ))}
      </div>

      {cat?.subs.length > 0 && (
        <div className="chips fade-in" key={cat.key}>
          <span className={`chip ${sub === '' ? 'on' : ''}`} onClick={() => pickSub('')}>{t.allSubs}</span>
          {cat.subs.map((s) => (
            <span key={s.key} className={`chip ${sub === s.key ? 'on' : ''}`} onClick={() => pickSub(s.key)}>{L(s, t)}</span>
          ))}
        </div>
      )}

      {chips.length > 0 && (
        <div className="chips act fade-in">
          {chips.map(([label, clear]) => (
            <span key={label} className="chip fx" onClick={() => { haptic('light'); clear(); }}>{label} <b>×</b></span>
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className="tbl">
          <button className={`pill ${loc.emirate ? 'on' : ''}`} onClick={() => { haptic('light'); setSheet('loc'); }}>📍 {locLabel}</button>
          {filtered && <button className="pill bell" onClick={subscribe} aria-label={t.subscribe}>🔔</button>}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {sortKeys.map((k) => <option key={k} value={k}>{t.sort[k]}</option>)}
        </select>
      </div>

      <ListView
        items={items} t={t} tax={tax} locs={locs} onOpen={onOpen}
        empty={filtered
          ? <Empty icon="🔎" title={t.noResults} hint={t.noResultsHint} action={t.clearAll} onAction={resetAll} />
          : <Empty icon="🛍️" title={t.empty} action={t.add} onAction={onPost} />}
      />
      {more && <div ref={sentinel} style={{ height: 40 }} />}
      {loadingMore && <div className="center">…</div>}

      {sheet === 'filters' && (
        <FilterSheet t={t} cat={cat} sub={sub} f={f} lang={lang} onClose={() => setSheet(null)}
          onApply={(nf, nl) => { setF(nf); setLang(nl); }} />
      )}
      {sheet === 'loc' && <LocationSheet t={t} locs={locs} loc={loc} onClose={() => setSheet(null)} onPick={changeLoc} />}
    </>
  );
}

/* ---------------- Detail ---------------- */

function Viewer({ photos, start, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo({ left: ref.current.clientWidth * start }); }, [start]);
  return (
    <div className="viewer">
      <div className="vs" ref={ref}>{photos.map((u) => <img key={u} src={u} alt="" />)}</div>
      <button className="close" onClick={onClose}>×</button>
    </div>
  );
}

function Gallery({ photos, onOpen }) {
  const [i, setI] = useState(0);
  return (
    <div className="gallery">
      <div className="slides" onScroll={(e) => setI(Math.round(e.target.scrollLeft / e.target.clientWidth))}>
        {photos.map((u, k) => <img key={u} src={u} alt="" loading={k ? 'lazy' : 'eager'} onClick={() => onOpen(k)} />)}
      </div>
      {photos.length > 1 && (
        <div className="dots">{photos.map((u, k) => <i key={u} className={k === i ? 'on' : ''} />)}</div>
      )}
    </div>
  );
}

function Detail({ id, t, me, onBack }) {
  const [l, setL] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [pop, setPop] = useState(false);
  useEffect(() => { api.listing(id).then(setL).catch(() => onBack()); }, [id]);
  useEffect(() => {
    if (!tg) return;
    tg.BackButton.show();
    tg.BackButton.onClick(onBack);
    return () => { tg.BackButton.offClick(onBack); tg.BackButton.hide(); };
  }, [onBack]);
  if (!l) return <div className="center">{t.loading}</div>;

  const cat = me.taxonomy.find((c) => c.key === l.category);
  const shareUrl = me.botUsername && me.shortName
    ? `https://t.me/${me.botUsername}/${me.shortName}?startapp=listing_${l.id}`
    : `https://t.me/${me.botUsername}?start=listing_${l.id}`;
  const open = (url) => (tg ? tg.openTelegramLink(url) : window.open(url));
  const share = () => open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(l.title)}`);
  const write = () => open(`https://t.me/${l.ownerUsername}`);
  const fav = async () => {
    const r = await api.toggleFav(l.id);
    setL({ ...l, favorite: r.favorite });
    setPop(true); setTimeout(() => setPop(false), 400);
    haptic('light');
    toast(r.favorite ? t.favAdded : t.favRemoved);
  };
  const setStatus = async (s) => { await api.setStatus(l.id, s); hapticNotify('success'); onBack(); };
  const report = async () => { await api.report(l.id); toast(t.reported); };
  const adminRemove = async () => {
    if (!(await confirmDialog(`${t.adminRemove}?`))) return;
    await api.moderate(l.id, 'reject', '');
    hapticNotify('warning');
    onBack();
  };

  return (
    <div className="detail" style={{ paddingBottom: 80 }}>
      {l.photos?.length > 0
        ? <Gallery photos={l.photos} onOpen={setViewer} />
        : <div className="nophoto">{cat?.icon}</div>}
      <div className="d-price">{priceText(t, l.price)}</div>
      <div className="d-title">{l.title}</div>
      <div className="badges">
        <span className="badge">{cat?.icon} {L(cat, t)}</span>
        {placeOf(l, me.locations, t) && <span className="badge">📍 {placeOf(l, me.locations, t)}</span>}
        {tagsOf(l, me.taxonomy, t).map((x) => <span key={x} className="badge">{x}</span>)}
        {l.status !== 'approved' && <span className={`badge ${l.status}`}>{t.status[l.status]}</span>}
      </div>
      {l.reject_reason && l.status === 'rejected' && <div className="err">{l.reject_reason}</div>}
      <div className="hint">{flag(l.lang)} · {timeAgo(l.approved_at || l.created_at, t.lang)} · {l.views} {t.views}</div>
      {l.description && <div className="desc">{l.description}</div>}
      {!l.mine && l.ownerUsername && (
        <div className="seller">
          <div className="avatar">{l.ownerUsername[0]}</div>
          <div><div className="hint">{t.seller}</div><b>@{l.ownerUsername}</b></div>
        </div>
      )}
      {!l.mine && <button className="link" onClick={report}>🚩 {t.report}</button>}
      {me.isAdmin && !l.mine && l.status === 'approved' && (
        <div><button className="danger small" onClick={adminRemove}>{t.adminRemove}</button></div>
      )}

      <div className="bar">
        {l.mine ? (
          <>
            {l.status === 'approved' && <button className="grow" onClick={() => setStatus('sold')}>{t.markSold}</button>}
            {l.status === 'approved' && <button className="ghost" onClick={() => setStatus('archived')}>{t.archive}</button>}
            {l.status !== 'approved' && <button className="ghost grow" onClick={onBack}>OK</button>}
          </>
        ) : (
          <>
            <button className={`ghost sq ${pop ? 'pop' : ''} ${l.favorite ? 'faved' : ''}`} onClick={fav} aria-label={t.favs}>{l.favorite ? '★' : '☆'}</button>
            <button className="ghost sq" onClick={share} aria-label={t.share}>↗</button>
            {l.ownerUsername && <button className="grow" onClick={write}>💬 {t.write}</button>}
          </>
        )}
      </div>
      {viewer !== null && <Viewer photos={l.photos} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

/* ---------------- New listing ---------------- */

function PhotoPicker({ t, photos, setPhotos, setErr }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e) => {
    const picked = [...e.target.files].slice(0, MAX_PHOTOS - photos.length);
    e.target.value = '';
    if (!picked.length) return;
    setBusy(true);
    setErr('');
    const added = [];
    for (const file of picked) {
      try {
        const small = await compressImage(file);
        added.push({ file: small, url: URL.createObjectURL(small) });
      } catch {
        setErr(t.errors.bad_image);
      }
    }
    setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
    setBusy(false);
  };
  const remove = (i) => setPhotos((p) => { URL.revokeObjectURL(p[i].url); return p.filter((_, j) => j !== i); });

  return (
    <>
      <label className="counter-row"><span>{t.photos}</span><span>{t.photosCount(photos.length, MAX_PHOTOS)}</span></label>
      <div className="thumbs">
        {photos.map((p, i) => (
          <div key={p.url} className="thumb" style={{ backgroundImage: `url(${p.url})` }}>
            {i === 0 && <span className="cover">{t.photoCover}</span>}
            <button className="x" onClick={() => remove(i)}>×</button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <div className="thumb add" onClick={() => !busy && input.current.click()}>{busy ? '…' : '+'}</div>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={onPick} />
      <div className="hint" style={{ marginTop: 6 }}>{busy ? t.processing : t.photoTip}</div>
    </>
  );
}

function NewListing({ t, me, lang, onMy }) {
  const tax = me.taxonomy;
  const locs = me.locations;
  const prefLoc = () => { const p = loadPostLoc(); return locOk(locs, p.emirate, p.area) ? p : { emirate: p.emirate && locs.some((e) => e.key === p.emirate) ? p.emirate : '', area: '' }; };
  const blank = () => ({ title: '', description: '', price: '', category: tax[0].key, subcategory: tax[0].subs[0]?.key || '', condition: '', brand: '', year: '', mileage: '', attrs: {}, lang, ...prefLoc() });
  const [f, setF] = useState(() => {
    const d = loadDraft();
    if (!(d && tax.some((c) => c.key === d.category))) return blank();
    const m = { ...blank(), ...d };
    if (!m.attrs || typeof m.attrs !== 'object') m.attrs = {};
    if (!locOk(locs, m.emirate, m.area)) Object.assign(m, prefLoc());
    return m;
  });
  const [restored] = useState(() => !!loadDraft());
  const [showRestored, setShowRestored] = useState(restored);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const cat = tax.find((c) => c.key === f.category);
  const veh = isVeh(cat, f.subcategory);
  const brands = brandsOf(cat, f.subcategory);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setCat = (e) => {
    const c = tax.find((x) => x.key === e.target.value);
    setF({ ...f, category: c.key, subcategory: c.subs[0]?.key || '', condition: '', brand: '', year: '', mileage: '', attrs: {} });
  };
  const setSub = (e) => {
    const k = e.target.value;
    setF({ ...f, subcategory: k, brand: '', ...(isVeh(cat, k) ? {} : { year: '', mileage: '', attrs: {} }) });
  };
  const setAttr = (k, v) => setF({ ...f, attrs: { ...f.attrs, [k]: v } });

  useEffect(() => {
    const h = setTimeout(() => { if (f.title || f.description) saveDraft(f); }, 500);
    return () => clearTimeout(h);
  }, [f]);

  const reset = () => { clearDraft(); setF(blank()); setPhotos([]); setOk(false); setErr(''); setShowRestored(false); };

  const submit = async () => {
    setErr('');
    if (f.title.trim().length < 3) { hapticNotify('error'); return setErr(t.errTitle); }
    if (!locOk(locs, f.emirate, f.area)) { hapticNotify('error'); return setErr(t.errLocation); }
    setBusy(true);
    try {
      let urls = [];
      if (photos.length) urls = (await api.uploadPhotos(photos.map((p) => p.file))).urls;
      await api.create({ ...f, photos: urls });
      clearDraft();
      savePostLoc({ emirate: f.emirate, area: f.area });
      hapticNotify('success');
      setOk(true);
      askWriteAccess(); // so the bot can tell the seller about moderation and reminders
    } catch (e) {
      hapticNotify('error');
      setErr(e.code === 'no_username' ? t.needUsername : t.errors[e.code] || t.errGeneric);
    } finally { setBusy(false); }
  };

  if (ok) {
    return (
      <div className="success">
        <div className="ok">✓</div>
        <h2 style={{ margin: '0 0 6px' }}>{t.submitted}</h2>
        <div className="hint">{t.submittedHint}</div>
        <div className="row" style={{ marginTop: 24 }}>
          <button className="ghost" onClick={reset}>{t.postAnother}</button>
          <button onClick={onMy}>{t.goMy}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showRestored && (
        <div className="banner">
          <span>📝 {t.draftRestored}</span>
          <button onClick={reset}>{t.clearDraft}</button>
        </div>
      )}
      <PhotoPicker t={t} photos={photos} setPhotos={setPhotos} setErr={setErr} />

      <label>{t.title}</label>
      <input value={f.title} maxLength={100} onChange={set('title')} />

      <label>{t.category}</label>
      <select value={f.category} onChange={setCat}>
        {tax.map((c) => <option key={c.key} value={c.key}>{c.icon} {L(c, t)}</option>)}
      </select>
      {cat.subs.length > 0 && (
        <>
          <label>{t.subcategory}</label>
          <select value={f.subcategory} onChange={setSub}>
            {cat.subs.map((s) => <option key={s.key} value={s.key}>{L(s, t)}</option>)}
          </select>
        </>
      )}
      {cat.condition && (
        <>
          <label>{t.condition}</label>
          <div className="seg" style={{ display: 'flex' }}>
            {['new', 'used'].map((c) => (
              <button key={c} style={{ flex: 1 }} className={f.condition === c ? 'on' : ''} onClick={() => setF({ ...f, condition: f.condition === c ? '' : c })}>{t.cond[c]}</button>
            ))}
          </div>
        </>
      )}
      {brands && (
        <>
          <label>{t.brand}</label>
          <select value={f.brand} onChange={set('brand')}>
            <option value="">{t.choose}</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </>
      )}
      {veh && (
        <>
          {cat.fields.filter((fl) => fl.type === 'text').map((fl) => (
            <div key={fl.key}>
              <label>{L(fl, t)}</label>
              <input placeholder={fl.placeholder} maxLength={fl.max} value={f.attrs[fl.key] || ''} onChange={(e) => setAttr(fl.key, e.target.value)} />
            </div>
          ))}
          {(cat.year || cat.mileage) && (
            <div className="row" style={{ marginTop: 0 }}>
              {cat.year && <div><label>{t.year}</label><input inputMode="numeric" placeholder="2018" value={f.year} onChange={set('year')} /></div>}
              {cat.mileage && <div><label>{t.mileage}</label><input inputMode="numeric" value={f.mileage} onChange={set('mileage')} /></div>}
            </div>
          )}
          {cat.fields.filter((fl) => fl.type === 'select').map((fl) => (
            <div key={fl.key}>
              <label>{L(fl, t)}</label>
              <Pills options={fl.options.map((o) => ({ key: o.key, label: L(o, t) }))} value={f.attrs[fl.key] || ''} onChange={(v) => setAttr(fl.key, v)} />
            </div>
          ))}
        </>
      )}

      <label>{t.price}</label>
      <div className="suffix">
        <input inputMode="decimal" value={f.price} onChange={set('price')} />
        <span>{f.price !== '' && Number(f.price) > 0 ? `${fmt(f.price)} AED` : 'AED'}</span>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>{t.priceHint}</div>

      <label>{t.where}</label>
      <div className="row" style={{ marginTop: 0 }}>
        <select value={f.emirate} onChange={(e) => setF({ ...f, emirate: e.target.value, area: '' })}>
          <option value="">{t.chooseEmirate}</option>
          {locs.map((e) => <option key={e.key} value={e.key}>{L(e, t)}</option>)}
        </select>
        <select value={f.area} disabled={!f.emirate} onChange={set('area')}>
          <option value="">{t.chooseArea}</option>
          {(locs.find((e) => e.key === f.emirate)?.areas || []).map((a) => <option key={a.key} value={a.key}>{L(a, t)}</option>)}
        </select>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>{t.locHint}</div>

      <label className="counter-row"><span>{t.description}</span><span>{f.description.length}/2000</span></label>
      <textarea value={f.description} maxLength={2000} onChange={set('description')} />

      <label>{t.adLang}</label>
      <div className="seg" style={{ display: 'flex' }}>
        {['ru', 'en'].map((c) => (
          <button key={c} style={{ flex: 1 }} className={f.lang === c ? 'on' : ''} onClick={() => setF({ ...f, lang: c })}>{flag(c)} {t.langName[c]}</button>
        ))}
      </div>

      {err && <div className="err">{err}</div>}
      <button className="block" style={{ marginTop: 20 }} disabled={busy} onClick={submit}>{busy ? t.loading : t.submit}</button>
    </div>
  );
}

/* ---------------- My / Favorites / Alerts ---------------- */

function My({ t, me, onOpen, onPost, onLegal, onDelete }) {
  const [tab, setTab] = useState('mine');
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    (tab === 'mine' ? api.myListings() : tab === 'favs' ? api.myFavs() : api.searches()).then(setItems).catch(() => setItems([]));
  }, [tab]);
  const dropSearch = async (id) => {
    await api.deleteSearch(id).catch(() => {});
    setItems((p) => p.filter((x) => x.id !== id));
    toast(t.subRemoved);
  };
  const tax = me.taxonomy;
  return (
    <>
      <div className="seg wide" style={{ display: 'flex', margin: '4px 0 8px' }}>
        <button style={{ flex: 1 }} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>{t.my}</button>
        <button style={{ flex: 1 }} className={tab === 'favs' ? 'on' : ''} onClick={() => setTab('favs')}>{t.favs}</button>
        <button style={{ flex: 1 }} className={tab === 'subs' ? 'on' : ''} onClick={() => setTab('subs')}>🔔 {t.subTab}</button>
      </div>
      {tab === 'subs' ? (
        !items ? <Skeletons /> : !items.length
          ? <Empty icon="🔔" title={t.emptySubs} hint={t.emptySubsHint} />
          : items.map((s, i) => (
            <div key={s.id} className="li" style={{ '--i': i, cursor: 'default', alignItems: 'center' }}>
              <div className="in"><div style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>{describeSearch(s.params, tax, me.locations, t)}</div></div>
              <button className="ghost small" onClick={() => dropSearch(s.id)} aria-label="delete">✕</button>
            </div>
          ))
      ) : tab === 'mine' ? (
        !items ? <Skeletons /> : !items.length
          ? <Empty icon="📭" title={t.emptyMy} action={t.add} onAction={onPost} />
          : items.map((l, i) => {
            const cat = tax.find((c) => c.key === l.category);
            return (
              <div key={l.id} className="li" style={{ '--i': i }} onClick={() => onOpen(l.id)}>
                <div className="im" style={l.photos?.[0] ? { backgroundImage: `url(${l.photos[0]})` } : {}}>{!l.photos?.[0] && cat?.icon}</div>
                <div className="in">
                  <div className="t">{l.title}</div>
                  <div style={{ fontWeight: 700 }}>{priceText(t, l.price)}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${l.status}`}>{t.status[l.status]}</span>
                    {l.status === 'approved' && <span className="hint"> · 👁 {l.views}</span>}
                  </div>
                </div>
              </div>
            );
          })
      ) : (
        <ListView items={items} t={t} tax={tax} locs={me.locations} onOpen={onOpen} empty={<Empty icon="⭐" title={t.emptyFavs} />} />
      )}
      <div className="foot">
        <button className="link" onClick={() => onLegal('terms')}>{t.legalTerms}</button>
        <button className="link" onClick={() => onLegal('privacy')}>{t.legalPrivacy}</button>
        <button className="link" style={{ color: 'var(--danger)' }} onClick={onDelete}>{t.deleteAccount}</button>
      </div>
    </>
  );
}

/* ---------------- Admin ---------------- */

function AdminItem({ l, t, me, onOpen, reload }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const act = async (action) => {
    await api.moderate(l.id, action, reason);
    hapticNotify(action === 'approve' ? 'success' : 'warning');
    reload();
  };
  const ban = async () => {
    if (!(await confirmDialog(t.banConfirm))) return;
    await api.ban(l.owner_id);
    reload();
  };
  const tags = tagsOf(l, me.taxonomy, t);
  const place = placeOf(l, me.locations, t);
  return (
    <div className="item">
      <div onClick={() => onOpen(l.id)}>
        {l.photos?.[0] && <img className="cover" src={l.photos[0]} alt="" />}
        <b>{l.title}</b> <span className="hint">{flag(l.lang)} · {priceText(t, l.price)}</span>
        <div className="hint">{[L(me.taxonomy.find((c) => c.key === l.category), t), ...tags, place && `📍 ${place}`].filter(Boolean).join(' · ')}</div>
        <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{l.description}</p>
      </div>
      {rejecting ? (
        <>
          <input placeholder={t.rejectReason} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row">
            <button className="ghost" onClick={() => setRejecting(false)}>←</button>
            <button className="danger" onClick={() => act('reject')}>{t.reject}</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button onClick={() => act('approve')}>{t.approve}</button>
          <button className="ghost" onClick={() => setRejecting(true)}>{t.reject}</button>
        </div>
      )}
      <div className="row"><button className="ghost small" onClick={ban}>{t.banAuthor}</button></div>
    </div>
  );
}

function Admin({ t, me, onOpen }) {
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.pending().then(setItems).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  if (!items) return <Skeletons />;
  if (!items.length) return <Empty icon="✅" title={t.emptyAdmin} />;
  return items.map((l) => <AdminItem key={l.id} l={l} t={t} me={me} onOpen={onOpen} reload={load} />);
}

/* ---------------- Legal / consent ---------------- */

function Legal({ kind, t, me, onBack }) {
  useEffect(() => {
    if (!tg) return;
    tg.BackButton.show();
    tg.BackButton.onClick(onBack);
    return () => { tg.BackButton.offClick(onBack); tg.BackButton.hide(); };
  }, [onBack]);
  const doc = LEGAL[kind][t.lang];
  return (
    <div className="legal">
      <h2>{doc.title}</h2>
      <div className="hint">{t.updated} {UPDATED}</div>
      {doc.sections.map(([h, p], i) => (
        <div key={h}>
          <h3>{i + 1}. {h}</h3>
          <p>{fillLegal(p, me.botUsername)}</p>
        </div>
      ))}
      <button className="ghost block" style={{ marginTop: 20 }} onClick={onBack}>{t.back}</button>
    </div>
  );
}

function Consent({ t, onLegal, onAccept }) {
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try { await onAccept(); } finally { setBusy(false); }
  };
  return (
    <div className="success">
      <div className="ok">👋</div>
      <h2 style={{ margin: '0 0 8px' }}>{t.consentTitle}</h2>
      <div className="hint" style={{ marginBottom: 16 }}>{t.consentText}</div>
      <div className="hint">
        {t.consentLead}{' '}
        <button className="link" style={{ padding: 0 }} onClick={() => onLegal('terms')}>{t.legalTerms}</button>
        {' '}{t.consentAnd}{' '}
        <button className="link" style={{ padding: 0 }} onClick={() => onLegal('privacy')}>{t.legalPrivacy}</button>
      </div>
      <button className="block" style={{ marginTop: 20 }} disabled={busy} onClick={accept}>{t.consentBtn}</button>
    </div>
  );
}

/* ---------------- App shell ---------------- */

function Toast() {
  const [msg, setMsg] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let h;
    registerToast((m) => { setMsg(m); setN((x) => x + 1); clearTimeout(h); h = setTimeout(() => setMsg(''), 2200); });
    return () => clearTimeout(h);
  }, []);
  return msg ? <div key={n} className="toast">{msg}</div> : null;
}

export default function App() {
  const [me, setMe] = useState(null);
  const [lang, setLang] = useState('ru');
  const [tab, setTab] = useState('feed');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(false);
  const [legal, setLegal] = useState(null);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const dark = tg?.colorScheme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    try { tg?.setHeaderColor?.('bg_color'); tg?.setBackgroundColor?.('bg_color'); } catch { /* ignore */ }
    api.me().then((m) => {
      setMe(m); setLang(m.lang);
      const sp = tg?.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('startapp') || '';
      const mt = sp.match(/^listing_(\d+)$/);
      if (mt) setOpenId(Number(mt[1]));
    }).catch((e) => setError(e.code === 'banned' ? 'banned' : true));
  }, []);

  const back = useCallback(() => setOpenId(null), []);
  if (error === 'banned') return <div className="center">Account blocked.<br />Аккаунт заблокирован.</div>;
  if (error) return <div className="center">Open Duboard from Telegram.<br />Откройте Duboard из Telegram.</div>;
  if (!me) return <div className="splash"><div className="mark">D</div></div>;
  const t = { ...dict[lang], lang };

  const switchLang = (n) => {
    if (n === lang) return;
    haptic('light');
    setLang(n);
    api.setLang(n).catch(() => {});
  };
  const acceptTerms = async () => { await api.accept(); setMe({ ...me, accepted: true }); hapticNotify('success'); };
  const deleteAccount = async () => {
    if (!(await confirmDialog(t.deleteConfirm))) return;
    try { await api.deleteMe(); hapticNotify('warning'); setDeleted(true); } catch { toast(t.errGeneric); }
  };
  const go = (k) => { setOpenId(null); setTab(k); window.scrollTo({ top: 0 }); };
  const tabs = [['feed', '🏠', t.feed], ['add', '+', t.add], ['my', '👤', t.my]];
  if (me.isAdmin) tabs.push(['admin', '🛡️', t.admin]);

  return (
    <div className="app">
      <div className="bgfx" aria-hidden="true" />
      <div className="head">
        <div className="logo"><span className="mark">D</span><span>Du<i>board</i></span></div>
        <div className="seg">
          <button className={lang === 'ru' ? 'on' : ''} onClick={() => switchLang('ru')}>RU</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => switchLang('en')}>EN</button>
        </div>
      </div>
      {deleted ? (
        <div className="success"><div className="ok">✓</div><h2>{t.deleted}</h2><div className="hint">{t.deletedHint}</div></div>
      ) : legal ? (
        <Legal kind={legal} t={t} me={me} onBack={() => setLegal(null)} />
      ) : !me.accepted ? (
        <Consent t={t} onLegal={setLegal} onAccept={acceptTerms} />
      ) : openId ? (
        <Detail id={openId} t={t} me={me} onBack={back} />
      ) : (
        <div className="view" key={tab}>
          {tab === 'feed' && <Feed t={t} me={me} onOpen={setOpenId} onPost={() => go('add')} />}
          {tab === 'add' && <NewListing t={t} me={me} lang={lang} onMy={() => go('my')} />}
          {tab === 'my' && <My t={t} me={me} onOpen={setOpenId} onPost={() => go('add')} onLegal={setLegal} onDelete={deleteAccount} />}
          {tab === 'admin' && me.isAdmin && <Admin t={t} me={me} onOpen={setOpenId} />}
        </div>
      )}
      {!openId && !legal && !deleted && me.accepted && (
        <div className="tabs">
          {tabs.map(([k, icon, label]) => (
            <button key={k} className={`${tab === k ? 'on' : ''} ${k === 'add' ? 'plus' : ''}`} onClick={() => { haptic('light'); go(k); }}>
              <span className="ti">{icon}</span>{label}
            </button>
          ))}
        </div>
      )}
      <Toast />
    </div>
  );
}
