// Bestiary loading and lookup. data/bestiary.json is built from 5etools by tools/build_bestiary.py.
import { crLabel } from './calc.js';
import { loadStored } from './updater.js';

let list = [];
let byId = new Map();
let byName = new Map();
let loading = null;
let customList = [];
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
  registerCustom();
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

// ---- custom creatures (made by the DM, stored in the app state, kept apart from the bestiary) ----
const crNumOf = s => { s = String(s); if (s.includes('/')) { const [a, b] = s.split('/'); return a / b; } return Number(s); };
// One entry per line; start a line with "Name. " to give it a bold title.
function blocks(text) {
  const out = [];
  for (const line of String(text || '').split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = /^([^.:]{1,40})[.:]\s+(.+)$/.exec(line);
    if (m) out.push({ name: m[1].trim(), entries: [m[2]] });
    else if (out.length) out[out.length - 1].entries.push(line);
    else out.push({ name: 'Note', entries: [line] });
  }
  return out;
}
export function toMonster(c) {
  const crn = crNumOf(c.cr ?? '0');
  const speed = {};
  for (const k of ['walk', 'fly', 'swim', 'climb']) if (c[k] > 0) speed[k] = c[k];
  const t = c.type || 'humanoid';
  const m = {
    custom: true, cid: c.id, name: c.name, source: 'Custom', size: [c.size || 'M'], type: t, t,
    ac: [c.ac || 10], hp: { average: c.hp || 1, ...(c.hitDice ? { formula: c.hitDice } : {}) }, speed,
    str: c.str ?? 10, dex: c.dex ?? 10, con: c.con ?? 10, int: c.int ?? 10, wis: c.wis ?? 10, cha: c.cha ?? 10,
    cr: String(c.cr ?? '0'), crn, trait: blocks(c.traits), action: blocks(c.actions), bonus: blocks(c.bonus), reaction: blocks(c.reactions),
  };
  m.id = m.name + '|Custom'; m.crl = crLabel(crn); m.typeName = cap(t); m._s = m.name.toLowerCase();
  return m;
}
function registerCustom() {
  for (const m of customList) { byId.set(m.id, m); if (!byName.has(m.name.toLowerCase())) byName.set(m.name.toLowerCase(), m); }
}
export function setCustom(arr) {
  for (const m of customList) { byId.delete(m.id); if (byName.get(m.name.toLowerCase()) === m) byName.delete(m.name.toLowerCase()); }
  customList = (arr || []).map(toMonster);
  registerCustom();
}
export const customs = () => customList;

// Matches in the DM's custom creatures come before bestiary matches.
export function search(q, limit = 8) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const starts = [], has = [];
  outer: for (const arr of [customList, list]) {
    for (const m of arr) {
      const i = m._s.indexOf(q);
      if (i === 0) starts.push(m); else if (i > 0) has.push(m);
      if (starts.length >= limit) break outer;
    }
  }
  return starts.concat(has).slice(0, limit);
}

export const cap = s => s.replace(/(^|[\s/-])(\w)/g, (_, a, b) => a + b.toUpperCase());

export const SIZE = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
export const TYPE_ICON = {
  aberration: '👁', beast: '🐾', celestial: '☀', construct: '⚙', dragon: '🐉', elemental: '🔥', fey: '🧚',
  fiend: '😈', giant: '⛰', humanoid: '🧍', monstrosity: '🦂', ooze: '💧', plant: '🌿', undead: '💀',
};
