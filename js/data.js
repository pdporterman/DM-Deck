// Bestiary loading and lookup. data/bestiary.json is built from 5etools by tools/build_bestiary.py.
import { crLabel } from './calc.js';
import { loadStored } from './updater.js';

let list = [];
let byId = new Map();
let byName = new Map();
let loading = null;
export let meta = { built: '', count: 0 };

function ingest(j) {
  list = j.monsters;
  byId = new Map(); byName = new Map();
  for (const m of list) {
    m.id = m.name + '|' + m.source;
    m.crl = crLabel(m.crn);
    m.typeName = cap(m.t || 'unknown');
    m._s = (m.name + ' ' + (m.aka || []).join(' ')).toLowerCase();
    byId.set(m.id, m);
    byName.set(m.name.toLowerCase(), m);
  }
  meta = { built: j.built, count: list.length, updated: !!j.updated };
}

// Uses the file shipped with the app, or the copy the in-app updater saved on this device if that is as new or newer.
export function loadBestiary() {
  if (loading) return loading;
  const bundled = fetch('data/bestiary.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch(() => null);
  loading = Promise.all([bundled, loadStored()]).then(([b, st]) => {
    const j = st && (!b || (st.built || '') >= (b.built || '')) ? st : b;
    if (!j) throw new Error('no data');
    ingest(j);
    return list;
  }).catch(e => { loading = null; throw e; });
  return loading;
}

// Called after the in-app updater has saved new data.
export function useData(j) { ingest(j); loading = Promise.resolve(list); }

export const all = () => list;
export const isLoaded = () => list.length > 0;
export function lookup(name, source) {
  return byId.get(name + '|' + source) || byName.get((name || '').toLowerCase()) || null;
}

export function search(q, limit = 8) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const starts = [], has = [];
  for (const m of list) {
    const i = m._s.indexOf(q);
    if (i === 0) starts.push(m); else if (i > 0) has.push(m);
    if (starts.length >= limit) break;
  }
  return starts.concat(has).slice(0, limit);
}

export const cap = s => s.replace(/(^|[\s/-])(\w)/g, (_, a, b) => a + b.toUpperCase());

export const SIZE = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
export const TYPE_ICON = {
  aberration: '👁', beast: '🐾', celestial: '☀', construct: '⚙', dragon: '🐉', elemental: '🔥', fey: '🧚',
  fiend: '😈', giant: '⛰', humanoid: '🧍', monstrosity: '🦂', ooze: '💧', plant: '🌿', undead: '💀',
};
