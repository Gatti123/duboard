import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { dict } from './i18n.js';

const tg = window.Telegram?.WebApp;

function priceText(t, p) {
  if (p == null) return t.negotiable;
  if (Number(p) === 0) return t.free;
  return `${Number(p).toLocaleString('en-US')} ${t.aed}`;
}

function Card({ l, t, onOpen }) {
  return (
    <div className="card" onClick={() => onOpen(l.id)}>
      <div className="ph" style={l.photos?.[0] ? { backgroundImage: `url(${l.photos[0]})` } : {}} />
      <span className="flag">{l.lang === 'ru' ? '🇷🇺' : '🇬🇧'}</span>
      <div className="in">
        <div className="price">{priceText(t, l.price)}</div>
        <div className="t">{l.title}</div>
      </div>
    </div>
  );
}

function Grid({ items, t, onOpen }) {
  if (!items) return <div className="center">{t.loading}</div>;
  if (!items.length) return <div className="center">{t.empty}</div>;
  return <div className="grid">{items.map((l) => <Card key={l.id} l={l} t={t} onOpen={onOpen} />)}</div>;
}

function Feed({ t, me, onOpen }) {
  const [items, setItems] = useState(null);
  const [category, setCategory] = useState('');
  const [lang, setLang] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    setItems(null);
    const h = setTimeout(() => {
      const p = {};
      if (category) p.category = category;
      if (lang) p.lang = lang;
      if (q) p.q = q;
      api.listings(p).then(setItems).catch(() => setItems([]));
    }, q ? 300 : 0);
    return () => clearTimeout(h);
  }, [category, lang, q]);
  return (
    <>
      <div className="top"><input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chips">
        <span className={`chip ${lang === '' ? 'on' : ''}`} onClick={() => setLang('')}>{t.allLangs}</span>
        <span className={`chip ${lang === 'ru' ? 'on' : ''}`} onClick={() => setLang('ru')}>🇷🇺</span>
        <span className={`chip ${lang === 'en' ? 'on' : ''}`} onClick={() => setLang('en')}>🇬🇧</span>
      </div>
      <div className="chips">
        <span className={`chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>{t.all}</span>
        {me.categories.map((c) => (
          <span key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>{t.cats[c]}</span>
        ))}
      </div>
      <Grid items={items} t={t} onOpen={onOpen} />
    </>
  );
}

function Detail({ id, t, me, onBack }) {
  const [l, setL] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.listing(id).then(setL).catch(() => onBack()); }, [id]);
  useEffect(() => {
    if (!tg) return;
    tg.BackButton.show();
    tg.BackButton.onClick(onBack);
    return () => { tg.BackButton.offClick(onBack); tg.BackButton.hide(); };
  }, [onBack]);
  if (!l) return <div className="center">{t.loading}</div>;

  const shareUrl = me.botUsername && me.shortName
    ? `https://t.me/${me.botUsername}/${me.shortName}?startapp=listing_${l.id}`
    : `https://t.me/${me.botUsername}?start=listing_${l.id}`;
  const share = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(l.title)}`;
    tg ? tg.openTelegramLink(url) : window.open(url);
  };
  const write = () => {
    const url = `https://t.me/${l.ownerUsername}`;
    tg ? tg.openTelegramLink(url) : window.open(url);
  };
  const fav = async () => { const r = await api.toggleFav(l.id); setL({ ...l, favorite: r.favorite }); };
  const setStatus = async (s) => { await api.setStatus(l.id, s); onBack(); };

  return (
    <div>
      {l.photos?.length > 0 && <div className="photos">{l.photos.map((u) => <img key={u} src={u} alt="" />)}</div>}
      <h2 style={{ margin: '12px 0 4px' }}>{l.title}</h2>
      <div className="price" style={{ fontSize: 20 }}>{priceText(t, l.price)}</div>
      <div className="hint" style={{ margin: '6px 0' }}>
        {l.lang === 'ru' ? '🇷🇺' : '🇬🇧'} · {t.cats[l.category]} · {l.views} {t.views}
      </div>
      {l.status !== 'approved' && <span className="badge">{t.status[l.status]}{l.reject_reason ? `: ${l.reject_reason}` : ''}</span>}
      <p style={{ whiteSpace: 'pre-wrap' }}>{l.description}</p>
      {l.mine ? (
        <div className="row">
          {l.status === 'approved' && <button onClick={() => setStatus('sold')}>{t.markSold}</button>}
          {l.status === 'approved' && <button className="ghost" onClick={() => setStatus('archived')}>{t.archive}</button>}
        </div>
      ) : (
        <>
          {l.ownerUsername && <button className="block" onClick={write}>{t.write}</button>}
          <div className="row">
            <button className="ghost" onClick={fav}>{l.favorite ? '★' : '☆'} {t.favs}</button>
            <button className="ghost" onClick={share}>{t.share}</button>
          </div>
          <div className="row">
            <button className="ghost small" onClick={async () => { await api.report(l.id); setMsg(t.reported); }}>{t.report}</button>
          </div>
          {msg && <div className="hint">{msg}</div>}
        </>
      )}
    </div>
  );
}

function NewListing({ t, me, lang, onDone }) {
  const [f, setF] = useState({ title: '', description: '', price: '', category: me.categories[0], lang });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr('');
    if (f.title.trim().length < 3) return setErr(t.errTitle);
    setBusy(true);
    try {
      let photos = [];
      if (files.length) photos = (await api.uploadPhotos(files)).urls;
      await api.create({ ...f, photos });
      setOk(true);
      setTimeout(onDone, 1500);
    } catch (e) {
      setErr(e.code === 'no_username' ? t.needUsername : t.errGeneric);
    } finally { setBusy(false); }
  };

  if (ok) return <div className="center">{t.submitted}</div>;
  return (
    <div>
      <label>{t.title}</label>
      <input value={f.title} maxLength={100} onChange={set('title')} />
      <label>{t.category}</label>
      <select value={f.category} onChange={set('category')}>
        {me.categories.map((c) => <option key={c} value={c}>{t.cats[c]}</option>)}
      </select>
      <label>{t.price}</label>
      <input inputMode="decimal" value={f.price} onChange={set('price')} />
      <label>{t.adLang}</label>
      <select value={f.lang} onChange={set('lang')}>
        <option value="ru">{t.langName.ru}</option>
        <option value="en">{t.langName.en}</option>
      </select>
      <label>{t.description}</label>
      <textarea value={f.description} maxLength={2000} onChange={set('description')} />
      <label>{t.photos}</label>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles([...e.target.files].slice(0, 5))} />
      {err && <div style={{ color: '#d33', marginTop: 8 }}>{err}</div>}
      <button className="block" disabled={busy} onClick={submit}>{busy ? t.loading : t.submit}</button>
    </div>
  );
}

function My({ t, onOpen }) {
  const [tab, setTab] = useState('mine');
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    (tab === 'mine' ? api.myListings() : api.myFavs()).then(setItems).catch(() => setItems([]));
  }, [tab]);
  return (
    <>
      <div className="chips">
        <span className={`chip ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}>{t.my}</span>
        <span className={`chip ${tab === 'favs' ? 'on' : ''}`} onClick={() => setTab('favs')}>{t.favs}</span>
      </div>
      {items && tab === 'mine'
        ? (items.length ? items.map((l) => (
          <div key={l.id} className="item" onClick={() => onOpen(l.id)}>
            <div className="price">{l.title}</div>
            <span className="badge">{t.status[l.status]}</span>
          </div>
        )) : <div className="center">{t.empty}</div>)
        : <Grid items={items} t={t} onOpen={onOpen} />}
    </>
  );
}

function Admin({ t, onOpen }) {
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.pending().then(setItems).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load]);
  const act = async (id, action) => {
    let reason;
    if (action === 'reject') { reason = window.prompt(t.rejectReason) || ''; }
    await api.moderate(id, action, reason);
    load();
  };
  if (!items) return <div className="center">{t.loading}</div>;
  if (!items.length) return <div className="center">{t.empty}</div>;
  return items.map((l) => (
    <div key={l.id} className="item">
      <div onClick={() => onOpen(l.id)}>
        {l.photos?.[0] && <img src={l.photos[0]} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: 220, objectFit: 'cover' }} />}
        <b>{l.title}</b> <span className="hint">{l.lang === 'ru' ? '🇷🇺' : '🇬🇧'} · {t.cats[l.category]} · {priceText(t, l.price)}</span>
        <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{l.description}</p>
      </div>
      <div className="row">
        <button onClick={() => act(l.id, 'approve')}>{t.approve}</button>
        <button className="ghost" onClick={() => act(l.id, 'reject')}>{t.reject}</button>
      </div>
    </div>
  ));
}

export default function App() {
  const [me, setMe] = useState(null);
  const [lang, setLang] = useState('ru');
  const [tab, setTab] = useState('feed');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.me().then((m) => {
      setMe(m); setLang(m.lang);
      const sp = tg?.initDataUnsafe?.start_param || '';
      const mt = sp.match(/^listing_(\d+)$/);
      if (mt) setOpenId(Number(mt[1]));
    }).catch(() => setError(true));
  }, []);

  const back = useCallback(() => setOpenId(null), []);
  if (error) return <div className="center">Open Duboard from Telegram.<br />Откройте Duboard из Telegram.</div>;
  if (!me) return <div className="center">…</div>;
  const t = dict[lang];

  const switchLang = () => {
    const n = lang === 'ru' ? 'en' : 'ru';
    setLang(n);
    api.setLang(n).catch(() => {});
  };
  const tabs = [['feed', t.feed], ['add', t.add], ['my', t.my]];
  if (me.isAdmin) tabs.push(['admin', t.admin]);

  return (
    <div className="app">
      <div className="top" style={{ justifyContent: 'space-between' }}>
        <b style={{ fontSize: 18 }}>Duboard</b>
        <button className="ghost small" onClick={switchLang}>{lang === 'ru' ? '🇬🇧 EN' : '🇷🇺 RU'}</button>
      </div>
      {openId ? (
        <Detail id={openId} t={t} me={me} onBack={back} />
      ) : (
        <>
          {tab === 'feed' && <Feed t={t} me={me} onOpen={setOpenId} />}
          {tab === 'add' && <NewListing t={t} me={me} lang={lang} onDone={() => setTab('my')} />}
          {tab === 'my' && <My t={t} onOpen={setOpenId} />}
          {tab === 'admin' && me.isAdmin && <Admin t={t} onOpen={setOpenId} />}
        </>
      )}
      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k && !openId ? 'on' : ''} onClick={() => { setOpenId(null); setTab(k); }}>{label}</button>
        ))}
      </div>
    </div>
  );
}
