import { TAXONOMY, CATEGORY_MAP, LOCATION_MAP, validLocation } from './taxonomy.js';

const CATEGORIES = TAXONOMY.map((c) => c.key);
const SEARCH_KEYS = ['category', 'sub', 'brand', 'condition', 'price_min', 'price_max', 'year_min', 'lang', 'q', 'emirate', 'area'];

export function cleanParams(raw = {}) {
  const o = {};
  for (const k of SEARCH_KEYS) {
    const v = raw[k];
    if (v === undefined || v === null || v === '') continue;
    o[k] = String(v).slice(0, 60);
  }
  if (o.category && !CATEGORIES.includes(o.category)) { delete o.category; delete o.sub; }
  if (o.sub && !CATEGORY_MAP[o.category]?.subs.some((x) => x.key === o.sub)) delete o.sub;
  if (o.condition && !['new', 'used'].includes(o.condition)) delete o.condition;
  if (o.lang && !['ru', 'en'].includes(o.lang)) delete o.lang;
  for (const k of ['price_min', 'price_max', 'year_min']) if (o[k] !== undefined && !Number.isFinite(Number(o[k]))) delete o[k];
  if (o.emirate && !LOCATION_MAP[o.emirate]) { delete o.emirate; delete o.area; }
  if (o.area && !validLocation(o.emirate, o.area)) delete o.area;
  return o;
}
export const sigOf = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));

export function matchesSearch(l, p) {
  if (p.category && l.category !== p.category) return false;
  if (p.sub && l.subcategory !== p.sub) return false;
  if (p.brand && l.brand !== p.brand) return false;
  if (p.condition && l.condition !== p.condition) return false;
  if (p.lang && l.lang !== p.lang) return false;
  if (p.emirate && l.emirate !== p.emirate) return false;
  if (p.area && l.area !== p.area) return false;
  if (p.price_min !== undefined && !(l.price != null && Number(l.price) >= Number(p.price_min))) return false;
  if (p.price_max !== undefined && !(l.price != null && Number(l.price) <= Number(p.price_max))) return false;
  if (p.year_min !== undefined && !(l.year != null && l.year >= Number(p.year_min))) return false;
  if (p.q) {
    const hay = `${l.title} ${l.description || ''}`.toLowerCase();
    if (!hay.includes(p.q.toLowerCase())) return false;
  }
  return true;
}

