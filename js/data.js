// Bestiary loading and lookup. data/bestiary.json is built from 5etools by tools/build_bestiary.py.
import { crLabel } from './calc.js';

let list = [];
let byId = new Map();
let byName = new Map();
let loading = null;
export let meta = { built: '', count: 0 };

export function loadBestiary() {
  if (loading) return loading;
  loading = fetch('data/bestiary.json').then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(j => {
    list = j.monsters;
    for (const m of list) {
      m.id = m.name + '|' + m.source;
      m.crl = crLabel(m.crn);
      m.typeName = cap(m.t || 'unknown');
      m._s = (m.name + ' ' + (m.aka || []).join(' ')).toLowerCase();
      byId.set(m.id, m);
      byName.set(m.name.toLowerCase(), m);
    }
    meta = { built: j.built, count: list.length };
    return list;
  }).catch(e => { loading = null; throw e; });
  return loading;
}

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
