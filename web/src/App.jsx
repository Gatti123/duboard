import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api.js';
import { dict } from './i18n.js';
import { compressImage } from './compress.js';
import { tg, haptic, hapticNotify, fmt, timeAgo, confirmDialog, registerToast, toast, loadDraft, saveDraft, clearDraft } from './utils.js';

const MAX_PHOTOS = 5;
const PAGE = 20;

const L = (o, t) => o?.[t.lang] ?? '';
const flag = (l) => (l === 'ru' ? '🇷🇺' : '🇬🇧');

function priceText(t, p) {
  if (p == null) return t.negotiable;
  if (Number(p) === 0) return t.free;
  return `${fmt(p)} ${t.aed}`;
}

function tagsOf(l, tax, t) {
  const cat = tax.find((c) => c.key === l.category);
  const sub = cat?.subs.find((s) => s.key === l.subcategory);
  const out = [];
  if (sub) out.push(L(sub, t));
  if (l.condition) out.push(t.cond[l.condition]);
  if (l.brand) out.push(l.brand);
  if (l.year) out.push(String(l.year));
  if (l.mileage != null) out.push(`${fmt(l.mileage)} km`);
  return out;
}

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
        <div key={i}>
          <div className="sk" style={{ aspectRatio: '1' }} />
          <div className="sk" style={{ height: 14, marginTop: 8, width: '55%' }} />
          <div className="sk" style={{ height: 12, marginTop: 6, width: '85%' }} />
        </div>
      ))}
    </div>
  );
}

function Card({ l, t, tax, onOpen }) {
  const cat = tax.find((c) => c.key === l.category);
  const small = tagsOf(l, tax, t).slice(0, 2).join(' · ');
  return (
    <div className="card" onClick={() => { haptic('light'); onOpen(l.id); }}>
      <div className={`ph ${l.photos?.[0] ? '' : 'none'}`} style={l.photos?.[0] ? { backgroundImage: `url(${l.photos[0]})` } : {}}>
        {!l.photos?.[0] && cat?.icon}
        <span className="fl">{flag(l.lang)}</span>
        {l.photos?.length > 1 && <span className="cnt">📷 {l.photos.length}</span>}
      </div>
      <div className="pr">{priceText(t, l.price)}</div>
      <div className="t">{l.title}</div>
      <div className="meta">{[small, timeAgo(l.approved_at || l.created_at, t.lang)].filter(Boolean).join(' · ')}</div>
    </div>
  );
}

function ListView({ items, t, tax, onOpen, empty }) {
  if (!items) return <Skeletons />;
  if (!items.length) return empty;
  return <div className="grid">{items.map((l) => <Card key={l.id} l={l} t={t} tax={tax} onOpen={onOpen} />)}</div>;
}

/* ---------------- Feed ---------------- */

const EMPTY_F = { brand: '', condition: '', priceMin: '', priceMax: '', yearMin: '' };

function Feed({ t, me, onOpen, onPost }) {
  const tax = me.taxonomy;
  const [category, setCategory] = useState('');
  const [sub, setSub] = useState('');
  const [lang, setLang] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [f, setF] = useState(EMPTY_F);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef(null);
  const cat = tax.find((c) => c.key === category);

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
  if (f.yearMin) params.year_min = f.yearMin;
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

  const pickCategory = (k) => { haptic('light'); setCategory(k); setSub(''); setF(EMPTY_F); };
  const setField = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const active = Object.values(f).filter(Boolean).length;
  const filtered = !!(category || sub || lang || q || active);
  const resetAll = () => { setCategory(''); setSub(''); setLang(''); setQ(''); setF(EMPTY_F); };

  return (
    <>
      <div className="search">
        <div className="field">
          <span>🔍</span>
          <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="fbtn" onClick={() => setOpen(!open)} aria-label={t.filters}>
          ⚙️{active > 0 && <i className="dot" />}
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
        <div className="chips">
          <span className={`chip ${sub === '' ? 'on' : ''}`} onClick={() => setSub('')}>{t.allSubs}</span>
          {cat.subs.map((s) => (
            <span key={s.key} className={`chip ${sub === s.key ? 'on' : ''}`} onClick={() => setSub(s.key)}>{L(s, t)}</span>
          ))}
        </div>
      )}

      {open && (
        <div className="panel">
          <div className="row" style={{ marginTop: 0 }}>
            <input inputMode="decimal" placeholder={t.priceMin} value={f.priceMin} onChange={setField('priceMin')} />
            <input inputMode="decimal" placeholder={t.priceMax} value={f.priceMax} onChange={setField('priceMax')} />
          </div>
          {cat?.brands && (
            <>
              <label>{t.brand}</label>
              <select value={f.brand} onChange={setField('brand')}>
                <option value="">{t.anyBrand}</option>
                {cat.brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </>
          )}
          {cat?.condition && (
            <>
              <label>{t.condition}</label>
              <select value={f.condition} onChange={setField('condition')}>
                <option value="">{t.anyCond}</option>
                <option value="new">{t.cond.new}</option>
                <option value="used">{t.cond.used}</option>
              </select>
            </>
          )}
          {cat?.year && (
            <>
              <label>{t.yearMin}</label>
              <input inputMode="numeric" placeholder="2015" value={f.yearMin} onChange={setField('yearMin')} />
            </>
          )}
          <label>{t.adLang}</label>
          <div className="seg">
            <button className={lang === '' ? 'on' : ''} onClick={() => setLang('')}>{t.allLangs}</button>
            <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>🇷🇺</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>🇬🇧</button>
          </div>
          <div className="row"><button className="ghost" onClick={() => setF(EMPTY_F)}>{t.reset}</button></div>
        </div>
      )}

      <div className="toolbar">
        <span className="hint">{items ? '' : ''}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(t.sort).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <ListView
        items={items} t={t} tax={tax} onOpen={onOpen}
        empty={filtered
          ? <Empty icon="🔎" title={t.noResults} hint={t.noResultsHint} action={t.reset} onAction={resetAll} />
          : <Empty icon="🛍️" title={t.empty} action={t.add} onAction={onPost} />}
      />
      {more && <div ref={sentinel} style={{ height: 40 }} />}
      {loadingMore && <div className="center">…</div>}
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
      {photos.length > 1 && <span className="counter">{i + 1} / {photos.length}</span>}
    </div>
  );
}

function Detail({ id, t, me, onBack }) {
  const [l, setL] = useState(null);
  const [viewer, setViewer] = useState(null);
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
    haptic('light');
    toast(r.favorite ? t.favAdded : t.favRemoved);
  };
  const setStatus = async (s) => { await api.setStatus(l.id, s); hapticNotify('success'); onBack(); };
  const report = async () => { await api.report(l.id); toast(t.reported); };

  return (
    <div style={{ paddingBottom: 70 }}>
      {l.photos?.length > 0
        ? <Gallery photos={l.photos} onOpen={setViewer} />
        : <div className="nophoto">{cat?.icon}</div>}
      <div className="d-price">{priceText(t, l.price)}</div>
      <div className="d-title">{l.title}</div>
      <div className="badges">
        <span className="badge">{cat?.icon} {L(cat, t)}</span>
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

      <div className="bar">
        {l.mine ? (
          <>
            {l.status === 'approved' && <button className="grow" onClick={() => setStatus('sold')}>{t.markSold}</button>}
            {l.status === 'approved' && <button className="ghost" onClick={() => setStatus('archived')}>{t.archive}</button>}
            {l.status !== 'approved' && <button className="ghost grow" onClick={onBack}>OK</button>}
          </>
        ) : (
          <>
            <button className="ghost sq" onClick={fav} aria-label={t.favs}>{l.favorite ? '★' : '☆'}</button>
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

function NewListing({ t, me, lang, onDone, onMy }) {
  const tax = me.taxonomy;
  const blank = () => ({ title: '', description: '', price: '', category: tax[0].key, subcategory: tax[0].subs[0]?.key || '', condition: '', brand: '', year: '', mileage: '', lang });
  const [f, setF] = useState(() => {
    const d = loadDraft();
    return d && tax.some((c) => c.key === d.category) ? { ...blank(), ...d } : blank();
  });
  const [restored] = useState(() => !!loadDraft());
  const [showRestored, setShowRestored] = useState(restored);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const cat = tax.find((c) => c.key === f.category);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setCat = (e) => {
    const c = tax.find((x) => x.key === e.target.value);
    setF({ ...f, category: c.key, subcategory: c.subs[0]?.key || '', condition: '', brand: '', year: '', mileage: '' });
  };

  useEffect(() => {
    const h = setTimeout(() => { if (f.title || f.description) saveDraft(f); }, 500);
    return () => clearTimeout(h);
  }, [f]);

  const reset = () => { clearDraft(); setF(blank()); setPhotos([]); setOk(false); setErr(''); setShowRestored(false); };

  const submit = async () => {
    setErr('');
    if (f.title.trim().length < 3) { hapticNotify('error'); return setErr(t.errTitle); }
    setBusy(true);
    try {
      let urls = [];
      if (photos.length) urls = (await api.uploadPhotos(photos.map((p) => p.file))).urls;
      await api.create({ ...f, photos: urls });
      clearDraft();
      hapticNotify('success');
      setOk(true);
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
          <select value={f.subcategory} onChange={set('subcategory')}>
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
      {cat.brands && (
        <>
          <label>{t.brand}</label>
          <select value={f.brand} onChange={set('brand')}>
            <option value="">{t.choose}</option>
            {cat.brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </>
      )}
      {(cat.year || cat.mileage) && (
        <div className="row" style={{ marginTop: 0 }}>
          {cat.year && <div><label>{t.year}</label><input inputMode="numeric" placeholder="2018" value={f.year} onChange={set('year')} /></div>}
          {cat.mileage && <div><label>{t.mileage}</label><input inputMode="numeric" value={f.mileage} onChange={set('mileage')} /></div>}
        </div>
      )}

      <label>{t.price}</label>
      <div className="suffix">
        <input inputMode="decimal" value={f.price} onChange={set('price')} />
        <span>{f.price !== '' && Number(f.price) > 0 ? `${fmt(f.price)} AED` : 'AED'}</span>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>{t.priceHint}</div>

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

/* ---------------- My / Favorites ---------------- */

function My({ t, me, onOpen, onPost }) {
  const [tab, setTab] = useState('mine');
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    (tab === 'mine' ? api.myListings() : api.myFavs()).then(setItems).catch(() => setItems([]));
  }, [tab]);
  const tax = me.taxonomy;
  return (
    <>
      <div className="seg" style={{ display: 'flex', margin: '4px 0 8px' }}>
        <button style={{ flex: 1 }} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>{t.my}</button>
        <button style={{ flex: 1 }} className={tab === 'favs' ? 'on' : ''} onClick={() => setTab('favs')}>{t.favs}</button>
      </div>
      {tab === 'mine' ? (
        !items ? <Skeletons /> : !items.length
          ? <Empty icon="📭" title={t.emptyMy} action={t.add} onAction={onPost} />
          : items.map((l) => {
            const cat = tax.find((c) => c.key === l.category);
            return (
              <div key={l.id} className="li" onClick={() => onOpen(l.id)}>
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
        <ListView items={items} t={t} tax={tax} onOpen={onOpen} empty={<Empty icon="⭐" title={t.emptyFavs} />} />
      )}
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
  return (
    <div className="item">
      <div onClick={() => onOpen(l.id)}>
        {l.photos?.[0] && <img className="cover" src={l.photos[0]} alt="" />}
        <b>{l.title}</b> <span className="hint">{flag(l.lang)} · {priceText(t, l.price)}</span>
        <div className="hint">{[L(me.taxonomy.find((c) => c.key === l.category), t), ...tags].join(' · ')}</div>
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

/* ---------------- App shell ---------------- */

function Toast() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let h;
    registerToast((m) => { setMsg(m); clearTimeout(h); h = setTimeout(() => setMsg(''), 2000); });
    return () => clearTimeout(h);
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}

export default function App() {
  const [me, setMe] = useState(null);
  const [lang, setLang] = useState('ru');
  const [tab, setTab] = useState('feed');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const dark = tg?.colorScheme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    try { tg?.setHeaderColor?.('bg_color'); tg?.setBackgroundColor?.('bg_color'); } catch { /* ignore */ }
    api.me().then((m) => {
      setMe(m); setLang(m.lang);
      const sp = tg?.initDataUnsafe?.start_param || '';
      const mt = sp.match(/^listing_(\d+)$/);
      if (mt) setOpenId(Number(mt[1]));
    }).catch((e) => setError(e.code === 'banned' ? 'banned' : true));
  }, []);

  const back = useCallback(() => setOpenId(null), []);
  if (error === 'banned') return <div className="center">Account blocked.<br />Аккаунт заблокирован.</div>;
  if (error) return <div className="center">Open Duboard from Telegram.<br />Откройте Duboard из Telegram.</div>;
  if (!me) return <div className="center">…</div>;
  const t = { ...dict[lang], lang };

  const switchLang = (n) => {
    if (n === lang) return;
    haptic('light');
    setLang(n);
    api.setLang(n).catch(() => {});
  };
  const go = (k) => { setOpenId(null); setTab(k); window.scrollTo({ top: 0 }); };
  const tabs = [['feed', '🏠', t.feed], ['add', '+', t.add], ['my', '👤', t.my]];
  if (me.isAdmin) tabs.push(['admin', '🛡️', t.admin]);

  return (
    <div className="app">
      <div className="head">
        <div className="logo">Du<i>board</i></div>
        <div className="seg">
          <button className={lang === 'ru' ? 'on' : ''} onClick={() => switchLang('ru')}>RU</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => switchLang('en')}>EN</button>
        </div>
      </div>
      {openId ? (
        <Detail id={openId} t={t} me={me} onBack={back} />
      ) : (
        <>
          {tab === 'feed' && <Feed t={t} me={me} onOpen={setOpenId} onPost={() => go('add')} />}
          {tab === 'add' && <NewListing t={t} me={me} lang={lang} onMy={() => go('my')} />}
          {tab === 'my' && <My t={t} me={me} onOpen={setOpenId} onPost={() => go('add')} />}
          {tab === 'admin' && me.isAdmin && <Admin t={t} me={me} onOpen={setOpenId} />}
        </>
      )}
      {!openId && (
        <div className="tabs">
          {tabs.map(([k, icon, label]) => (
            <button key={k} className={`${tab === k ? 'on' : ''} ${k === 'add' ? 'plus' : ''}`} onClick={() => go(k)}>
              <span className="ti">{icon}</span>{label}
            </button>
          ))}
        </div>
      )}
      <Toast />
    </div>
  );
}
