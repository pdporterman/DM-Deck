// In-app bestiary updater: a browser port of tools/build_bestiary.py.
// Downloads the latest 5etools bestiary, resolves "copy" creatures, keeps the newest book for duplicates,
// and stores the result on this device (IndexedDB). data.js uses it when it is newer than the bundled file.
const RAW = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/';

// ---------- device storage ----------
const DB = 'dmapp-data', STORE = 'kv', KEY = 'bestiary';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function loadStored() {
  try {
    const db = await idb();
    return await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); });
  } catch (e) { return null; }
}
export async function saveStored(data) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(data, KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function clearStored() {
  try {
    const db = await idb();
    await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  } catch (e) { /* ignore */ }
}

// ---------- download ----------
async function getJson(rel) {
  const r = await fetch(RAW + rel, { cache: 'no-cache' });
  if (!r.ok) throw new Error(rel + ': HTTP ' + r.status);
  return r.json();
}

// ---------- copy resolution ----------
const DROP_ON_COPY = ['srd', 'srd52', 'basicRules', 'basicRules2024', 'reprintedAs', 'otherSources', 'isReprinted',
  'hasToken', 'hasFluff', 'hasFluffImages', 'altArt', 'soundClip', 'tokenCustom', 'page', 'familiar', 'group'];
const asList = x => (Array.isArray(x) ? x : [x]);
const clone = o => JSON.parse(JSON.stringify(o));

function walkStrings(o, fn) {
  if (typeof o === 'string') return fn(o);
  if (Array.isArray(o)) return o.map(x => walkStrings(x, fn));
  if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = walkStrings(o[k], fn); return r; }
  return o;
}
const flags = f => { let s = 'g'; for (const c of (f || '')) if ('ims'.includes(c) && !s.includes(c)) s += c; return s; };

export function crNum(cr) {
  if (cr == null) return null;
  if (typeof cr === 'object') cr = cr.cr;
  if (cr == null || cr === 'Unknown' || cr === '--') return null;
  if (String(cr).includes('/')) { const [a, b] = String(cr).split('/'); return Number(a) / Number(b); }
  const n = Number(cr);
  return Number.isNaN(n) ? null : n;
}

function applyMod(mon, prop, mod, unknown) {
  if (prop === '*') {
    if (mod.mode === 'replaceTxt') {
      const rx = new RegExp(mod.replace, flags(mod.flags));
      for (const k of Object.keys(mon)) {
        if (k === 'name' || k === 'source' || k === '_copy') continue;
        if (mod.props && !mod.props.includes(k)) continue;
        mon[k] = walkStrings(mon[k], s => s.replace(rx, mod.with));
      }
    } else unknown.add('*:' + mod.mode);
    return;
  }
  if (typeof mod === 'string') { if (mod === 'remove') delete mon[prop]; return; }
  const mode = mod.mode, arr = mon[prop];
  if (mode === 'appendArr') mon[prop] = (arr || []).concat(asList(mod.items));
  else if (mode === 'prependArr') mon[prop] = asList(mod.items).concat(arr || []);
  else if (mode === 'insertArr') { const a = arr || [], i = mod.index || 0; mon[prop] = [...a.slice(0, i), ...asList(mod.items), ...a.slice(i)]; }
  else if (mode === 'appendIfNotExistsArr') {
    const a = [...(arr || [])];
    for (const it of asList(mod.items)) if (!a.some(x => JSON.stringify(x) === JSON.stringify(it))) a.push(it);
    mon[prop] = a;
  } else if (mode === 'replaceArr' || mode === 'replaceOrAppendArr') {
    let a = [...(arr || [])];
    const rep = mod.replace;
    let idx = -1;
    if (rep && typeof rep === 'object' && 'index' in rep) idx = rep.index;
    else idx = a.findIndex(x => (x && typeof x === 'object' ? x.name : x) === rep);
    const items = asList(mod.items);
    if (idx < 0) { if (mode === 'replaceOrAppendArr') a = a.concat(items); } else a = [...a.slice(0, idx), ...items, ...a.slice(idx + 1)];
    mon[prop] = a;
  } else if (mode === 'removeArr') {
    const names = mod.names ?? mod.items;
    const ns = names == null ? [] : asList(names);
    mon[prop] = (arr || []).filter(x => !ns.includes(x && typeof x === 'object' ? x.name : x));
  } else if (mode === 'replaceTxt') {
    const rx = new RegExp(mod.replace, flags(mod.flags));
    if (arr !== undefined) mon[prop] = walkStrings(arr, s => s.replace(rx, mod.with));
  } else if (mode === 'setProp') {
    const path = mod.prop.split('.');
    let o = mon;
    for (const p of path.slice(0, -1)) o = (o[p] = o[p] || {});
    o[path[path.length - 1]] = mod.value;
  } else if (mode === 'addSenses') {
    mon.senses = [...(mon.senses || []), ...asList(mod.senses).map(it => it.type + ' ' + it.val + ' ft.')];
  } else if (mode === 'addSkills' || mode === 'addSaves') {
    const key = mode === 'addSkills' ? 'skill' : 'save';
    const d = { ...(mon[key] || {}) };
    const n = crNum(mon.cr);
    const pb = n != null ? 2 + Math.floor((Math.max(n, 1) - 1) / 4) : 2;
    const src = mod[key + 's'] || mod.skills || mod.saves || {};
    const ab = { athletics: 'str', acrobatics: 'dex', stealth: 'dex', 'sleight of hand': 'dex' };
    for (const [k, mult] of Object.entries(src)) {
      const stat = key === 'save' ? k : (ab[k] || 'wis');
      const m = Math.floor(((mon[stat] ?? 10) - 10) / 2) + pb * mult;
      d[k] = (m >= 0 ? '+' : '') + m;
    }
    mon[key] = d;
  } else unknown.add(prop + ':' + mode);
}

function resolve(m, table, cache, unknown, stack = []) {
  const key = m.name + '|' + m.source;
  if (cache.has(key)) return cache.get(key);
  if (!m._copy) { cache.set(key, m); return m; }
  const c = m._copy, bkey = c.name + '|' + c.source;
  const base = table.get(bkey) || table.get('ci|' + c.name.toLowerCase() + '|' + c.source);
  if (!base || stack.includes(bkey)) {
    unknown.add('missing-base:' + bkey);
    const out = { ...m }; delete out._copy;
    cache.set(key, out);
    return out;
  }
  const b = resolve(base, table, cache, unknown, [...stack, key]);
  const out = clone(b);
  const preserve = c._preserve || {};
  for (const k of DROP_ON_COPY) if (!preserve[k] && !preserve['*']) delete out[k];
  for (const [k, v] of Object.entries(m)) if (k !== '_copy') out[k] = v;
  for (const [prop, mod] of Object.entries(c._mod || {})) for (const one of asList(mod)) applyMod(out, prop, one, unknown);
  cache.set(key, out);
  return out;
}

// ---------- slimming ----------
const KEEP = ['name', 'source', 'page', 'size', 'type', 'alignment', 'alignmentPrefix', 'ac', 'hp', 'speed',
  'str', 'dex', 'con', 'int', 'wis', 'cha', 'save', 'skill', 'senses', 'passive', 'resist', 'immune',
  'vulnerable', 'conditionImmune', 'languages', 'cr', 'pbNote', 'initiative', 'gear', 'trait', 'action',
  'actionNote', 'bonus', 'reaction', 'reactionHeader', 'legendary', 'legendaryHeader', 'legendaryActions',
  'legendaryActionsLair', 'mythic', 'mythicHeader', 'spellcasting', 'environment', 'isNpc',
  'isNamedCreature', 'shortName', 'summonedBySpell', 'level'];

function mtype(m) {
  let t = m.type;
  if (t && typeof t === 'object') t = t.type;
  if (t && typeof t === 'object') t = (t.choose || []).join('/');
  return t || '';
}

/** Download and build. onProgress(done, total, label) is called as files arrive. */
export async function buildBestiary(onProgress = () => {}) {
  onProgress(0, 1, 'Reading the creature list…');
  const [index, books, adv, lgf] = await Promise.all([
    getJson('bestiary/index.json'), getJson('books.json'), getJson('adventures.json'), getJson('bestiary/legendarygroups.json')]);
  const files = [...new Set(Object.values(index))];
  const mons = [];
  let done = 0;
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const j = await getJson('bestiary/' + f);
      mons.push(...(j.monster || []));
      onProgress(++done, files.length, 'Downloading books…');
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  onProgress(files.length, files.length, 'Merging duplicates…');
  await new Promise(r => setTimeout(r, 0));

  const published = {};
  for (const b of books.book || []) published[b.source] = b.published || '';
  for (const a of adv.adventure || []) published[a.source] = a.published || '';
  const lg = new Map((lgf.legendaryGroup || []).map(g => [g.name + '|' + g.source, g]));

  const table = new Map();
  for (const m of mons) table.set(m.name + '|' + m.source, m);
  for (const m of mons) { const k = 'ci|' + m.name.toLowerCase() + '|' + m.source; if (!table.has(k)) table.set(k, m); }
  const cache = new Map(), unknown = new Set();
  const resolved = mons.map(m => resolve(m, table, cache, unknown));
  const byId = new Map(resolved.map(m => [m.name + '|' + m.source, m]));

  // reprinted under a new name in a newer book -> drop the old one, remember its name
  const dropped = new Set(), aka = new Map();
  for (const m of resolved) {
    for (const r of m.reprintedAs || []) {
      const uid = typeof r === 'string' ? r : (r.uid || '');
      const i = uid.indexOf('|');
      const tgt = i < 0 ? uid + '|' : uid;
      const so = i < 0 ? '' : uid.slice(i + 1);
      if (byId.has(tgt) && tgt !== m.name + '|' + m.source && (published[so] || '') >= (published[m.source] || '')) {
        dropped.add(m.name + '|' + m.source);
        if (!aka.has(tgt)) aka.set(tgt, new Set());
        aka.get(tgt).add(m.name);
      }
    }
  }
  const kept = resolved.filter(m => !dropped.has(m.name + '|' + m.source));

  // same name: newest book wins
  const best = new Map();
  for (const m of kept) {
    const k = m.name.toLowerCase(), cur = best.get(k);
    if (!cur || (published[m.source] || '') > (published[cur.source] || '')) best.set(k, m);
  }
  const final = [...best.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const out = final.map(m => {
    const s = {};
    for (const k of KEEP) if (k in m) s[k] = m[k];
    const g = m.legendaryGroup && lg.get(m.legendaryGroup.name + '|' + m.legendaryGroup.source);
    if (g) for (const k of ['lairActions', 'regionalEffects', 'mythicEncounter']) if (k in g) s[k] = g[k];
    s.crn = crNum(m.cr);
    s.t = mtype(m);
    const a = aka.get(m.name + '|' + m.source);
    if (a) { a.delete(m.name); if (a.size) s.aka = [...a].sort(); }
    return s;
  });
  const d = new Date();
  const built = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { built, monsters: out, updated: true };
}
