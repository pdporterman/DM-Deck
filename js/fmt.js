// Turns 5etools monster JSON (with {@tag ...} markup) into a readable stat block.
import { el, esc, fmtNum } from './ui.js';
import { SIZE, cap } from './data.js';
import { xpForCr, crLabel, proficiency } from './calc.js';

const ABIL = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const sign = n => (n >= 0 ? '+' : '−') + Math.abs(n);
const sgn = s => (/^[+-−]/.test(String(s)) ? String(s).replace('-', '−') : '+' + s);

// ---- {@tag text|a|b} -> html ----
const TAG = /\{@(\w+)(?:\s+([^{}]*))?\}/g;
function oneTag(t, a) {
  const p = a.split('|');
  switch (t) {
    case 'atk': return '<i>' + p[0].split(',').map(x => ({ mw: 'Melee Weapon', rw: 'Ranged Weapon', ms: 'Melee Spell', rs: 'Ranged Spell' }[x] || x)).join(' or ') + ' Attack:</i>';
    case 'atkr': return '<i>' + p[0].split(',').map(x => ({ m: 'Melee', r: 'Ranged' }[x] || x)).join(' or ') + ' Attack Roll:</i>';
    case 'hit': return sgn(p[0]);
    case 'd20': return sgn(p[0]);
    case 'h': return '<i>Hit:</i> ';
    case 'hom': return '<i>Hit or Miss:</i> ';
    case 'm': return '<i>Miss:</i> ';
    case 'dc': return 'DC ' + p[0];
    case 'damage': return p[0];
    case 'dice': return p[1] || p[0];
    case 'scaledamage': case 'scaledice': return p[2] || p[0];
    case 'chance': return p[0] + '%';
    case 'recharge': return '(Recharge ' + (p[0] && p[0] !== '6' ? p[0] + '–6' : '6') + ')';
    case 'b': case 'bold': return '<b>' + p[0] + '</b>';
    case 'i': case 'italic': return '<i>' + p[0] + '</i>';
    case 'actSave': return '<i>' + p[0].split(',').map(x => ABIL[x.trim()] || cap(x)).join(' or ') + ' Saving Throw:</i>';
    case 'actSaveFail': return '<i>Failure:</i>' + (p[0] && /^\d/.test(p[0]) ? '' : '');
    case 'actSaveSuccess': return '<i>Success:</i>';
    case 'actSaveSuccessOrFail': return '<i>Success or Failure:</i>';
    case 'actTrigger': return '<i>Trigger:</i>';
    case 'actResponse': return '<i>Response:</i>';
    case 'note': case 'u': case 's': case 'strike': case 'sup': case 'sub': case 'color': return p[0];
    default: return p[2] || p[0];
  }
}
export function tags(s) {
  s = esc(s).replace(/\{@(\w+)\$1/g, '{@$1 ');
  let prev;
  do { prev = s; s = s.replace(TAG, (_, t, a) => oneTag(t, a || '')); } while (s !== prev && s.includes('{@'));
  return s;
}
export const plain = s => tags(String(s)).replace(/<[^>]+>/g, '');

// ---- entries ----
export function entryNodes(e, depth = 0) { return entryNodes0(e, depth).filter(Boolean); }
function entryNodes0(e, depth = 0) {
  if (e == null) return [];
  if (typeof e === 'string') return [el('p', { html: tags(e) })];
  if (Array.isArray(e)) return e.flatMap(x => entryNodes(x, depth));
  switch (e.type) {
    case 'list': return [el('ul', null, (e.items || []).map(it => {
      if (typeof it === 'string') return el('li', { html: tags(it) });
      if (it.type === 'item') return el('li', { html: (it.name ? '<b>' + tags(it.name) + '.</b> ' : '') + tags(it.entry || (it.entries || []).join(' ')) });
      return el('li', null, entryNodes(it, depth + 1));
    }))];
    case 'table': {
      const t = el('table', { class: 'mini-table' });
      if (e.colLabels) t.append(el('tr', null, e.colLabels.map(c => el('th', { html: tags(String(c)) }))));
      for (const r of e.rows || []) t.append(el('tr', null, r.map(c => el('td', { html: tags(typeof c === 'string' || typeof c === 'number' ? String(c) : (c.roll ? (c.roll.exact ?? c.roll.min + '–' + c.roll.max) : '')) }))));
      return [e.caption ? el('p', { html: '<b>' + tags(e.caption) + '</b>' }) : null, t];
    }
    case 'item': return [el('p', { html: '<b>' + tags(e.name || '') + '.</b> ' + tags(e.entry || (e.entries || []).filter(x => typeof x === 'string').join(' ')) })];
    case 'entries': case 'inset': case 'insetReadaloud': case 'section': {
      const kids = entryNodes(e.entries, depth + 1);
      if (e.name && kids.length && kids[0].tagName === 'P') {
        kids[0].innerHTML = '<b><i>' + tags(e.name) + '.</i></b> ' + kids[0].innerHTML;
        return kids;
      }
      return [e.name ? el('p', { html: '<b><i>' + tags(e.name) + '.</i></b>' }) : null, ...kids];
    }
    default: return e.entries ? entryNodes(e.entries, depth + 1) : [];
  }
}

function namedBlock(a) {
  // trait / action: {name, entries}
  const kids = entryNodes(a.entries || []);
  const wrap = el('div', { class: 'sb-entry' });
  if (kids.length && kids[0].tagName === 'P') {
    kids[0].innerHTML = '<b><i>' + tags(a.name || '') + '.</i></b> ' + kids[0].innerHTML;
  } else if (a.name) wrap.append(el('p', { html: '<b><i>' + tags(a.name) + '.</i></b>' }));
  wrap.append(...kids);
  return wrap;
}

const ORD = n => (n === '0' ? 'Cantrips' : n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n] || 'th') + ' level');
function spellcasting(sc) {
  const w = el('div', { class: 'sb-entry' });
  w.append(el('p', { html: '<b><i>' + tags(sc.name || 'Spellcasting') + '.</i></b> ' + (sc.headerEntries || []).map(tags).join(' ') }));
  const line = (label, arr) => {
    const vis = arr.filter(x => !(x && x.hidden)).map(x => (typeof x === 'string' ? x : x.entry || ''));
    if (vis.length) w.append(el('p', { class: 'sc-line', html: '<b>' + label + '</b> ' + vis.map(tags).join(', ') }));
  };
  if (sc.constant) line('Constant:', sc.constant);
  if (sc.will) line('At Will:', sc.will);
  for (const [k, v] of Object.entries(sc.daily || {})) line(k.replace('e', '') + '/Day' + (k.includes('e') ? ' Each' : '') + ':', v);
  for (const [k, v] of Object.entries(sc.rest || {})) line(k.replace('e', '') + '/Rest' + (k.includes('e') ? ' Each' : '') + ':', v);
  for (const [k, v] of Object.entries(sc.weekly || {})) line(k.replace('e', '') + '/Week' + (k.includes('e') ? ' Each' : '') + ':', v);
  for (const [lvl, v] of Object.entries(sc.spells || {})) {
    const lab = lvl === '0' ? 'Cantrips (at will):' : ORD(lvl) + (v.slots ? ' (' + v.slots + ' slot' + (v.slots > 1 ? 's' : '') + '):' : v.lower ? ' (at will):' : ':');
    line(lab, v.spells || []);
  }
  if (sc.footerEntries) w.append(...entryNodes(sc.footerEntries));
  return w;
}

// ---- header bits ----
function typeText(m) {
  let t = m.type;
  if (!t) return '';
  let base = typeof t === 'string' ? t : t.type;
  if (base && typeof base === 'object') base = (base.choose || []).join(' or ');
  const tg = (typeof t === 'object' && t.tags) ? t.tags.map(x => typeof x === 'string' ? x : (x.prefix ? x.prefix + ' ' : '') + x.tag) : [];
  return base + (tg.length ? ' (' + tg.join(', ') + ')' : '');
}
function alignText(m) {
  const a = m.alignment;
  if (!a) return '';
  const M = { L: 'lawful', N: 'neutral', C: 'chaotic', G: 'good', E: 'evil', U: 'unaligned', A: 'any alignment', NX: 'neutral', NY: 'neutral' };
  const flat = a.flatMap(x => typeof x === 'string' ? [x] : (x.alignment || []));
  let s;
  if (flat.includes('A') || flat.length > 2) s = 'any alignment';
  else if (flat.length === 2 && flat[0] === 'N' && flat[1] === 'N') s = 'neutral';
  else s = flat.map(x => M[x] || x).join(' ');
  return (m.alignmentPrefix || '') + s;
}
export const sizeText = m => (m.size || []).map(s => SIZE[s] || s).join(' or ');
export function acText(m) {
  if (!m.ac) return '—';
  return m.ac.map(a => {
    if (typeof a === 'number') return String(a);
    if (a.special) return plain(a.special);
    const from = a.from ? ' (' + a.from.map(plain).join(', ') + ')' : '';
    return a.ac + from + (a.condition ? ' ' + plain(a.condition) : '');
  }).join(', ');
}
export const acNum = m => { const a = m.ac && m.ac[0]; return a == null ? null : typeof a === 'number' ? a : a.ac ?? null; };
export function hpText(m) {
  if (!m.hp) return '—';
  if (m.hp.special) return plain(m.hp.special);
  return m.hp.average + (m.hp.formula ? ' (' + m.hp.formula + ')' : '');
}
export function speedText(m) {
  const s = m.speed;
  if (!s) return '—';
  if (typeof s === 'number') return s + ' ft.';
  const out = [];
  for (const [k, v] of Object.entries(s)) {
    if (k === 'canHover' || k === 'choose') continue;
    if (k === 'alternate') {
      for (const [t, arr] of Object.entries(v)) for (const a of arr) out.push((t === 'walk' ? '' : t + ' ') + a.number + ' ft.' + (a.condition ? ' ' + plain(a.condition) : ''));
      continue;
    }
    const num = typeof v === 'object' ? v.number : v;
    const cond = typeof v === 'object' && v.condition ? ' ' + plain(v.condition) : '';
    out.push((k === 'walk' ? '' : k + ' ') + num + ' ft.' + cond);
  }
  if (s.canHover && !out.some(x => /hover/.test(x))) { const i = out.findIndex(x => x.startsWith('fly')); if (i >= 0) out[i] += ' (hover)'; }
  return out.join(', ') || '—';
}
function dmgList(arr) {
  if (!arr) return '';
  const parts = arr.map(x => {
    if (typeof x === 'string') return plain(x);
    const inner = x.resist || x.immune || x.vulnerable || x.conditionImmune || [];
    if (x.special) return plain(x.special);
    return (x.preNote ? x.preNote + ' ' : '') + dmgList(inner) + (x.note ? ' ' + plain(x.note) : '') + (typeof x.cond === 'string' ? ' ' + plain(x.cond) : '');
  });
  return parts.join(arr.some(x => typeof x === 'object') ? '; ' : ', ');
}
const modOf = s => Math.floor((s - 10) / 2);
export function initText(m) {
  const mod = modOf(m.dex ?? 10);
  const pb = proficiency(m.crn);
  let v = mod;
  if (m.initiative && typeof m.initiative === 'object') {
    if (m.initiative.initiative != null) v = m.initiative.initiative;
    else if (m.initiative.proficiency) v = mod + pb * m.initiative.proficiency;
  }
  return { value: v, text: sign(v) + ' (' + (10 + v) + ')' };
}
export const initMod = m => initText(m).value;

export function crText(m) {
  const c = m.cr;
  if (c == null) return '—';
  const cr = typeof c === 'object' ? c.cr : c;
  const xp = typeof c === 'object' && c.xp != null ? c.xp : xpForCr(m.crn);
  let s = 'CR ' + cr + ' (XP ' + fmtNum(xp);
  if (typeof c === 'object' && (c.xpLair != null || c.lair)) s += '; or ' + fmtNum(c.xpLair ?? xpForCr(Number(c.lair))) + ' in lair';
  return s + ')';
}

const none = () => document.createDocumentFragment();
function line(label, value) { return value ? el('p', { class: 'sb-line', html: '<b>' + label + '</b> ' + esc(value) }) : none(); }
function lineHtml(label, html) { return html ? el('p', { class: 'sb-line', html: '<b>' + label + '</b> ' + html }) : none(); }

export function statBlock(m) {
  const root = el('div', { class: 'statblock' });
  root.append(el('h3', { text: m.name }),
    el('p', { class: 'sb-sub', text: [sizeText(m), typeText(m)].filter(Boolean).join(' ') + (alignText(m) ? ', ' + alignText(m) : '') }));
  root.append(el('hr'));
  const ini = initText(m);
  root.append(lineHtml('AC', esc(acText(m)) + ' &nbsp; <b>Initiative</b> ' + ini.text), line('HP', hpText(m)), line('Speed', speedText(m)));
  root.append(el('hr'));
  const ab = el('table', { class: 'abil' });
  ab.append(el('tr', null, ['', 'Score', 'Mod', 'Save'].map(h => el('th', { text: h }))));
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    const sc = m[k] ?? 10, mo = modOf(sc);
    ab.append(el('tr', null, el('td', { text: k.toUpperCase() }), el('td', { text: sc }), el('td', { text: sign(mo) }), el('td', { text: m.save && m.save[k] ? sgn(m.save[k]) : sign(mo) })));
  }
  root.append(ab, el('hr'));
  if (m.skill) root.append(line('Skills', Object.entries(m.skill).flatMap(([k, v]) => {
    if (k === 'other') return v.map(o => o.oneOf ? 'one of ' + Object.entries(o.oneOf).map(([a, b]) => cap(a) + ' ' + sgn(b)).join(' or ') : '');
    return [cap(k) + ' ' + sgn(v)];
  }).filter(Boolean).join(', ')));
  root.append(line('Vulnerabilities', dmgList(m.vulnerable)), line('Resistances', dmgList(m.resist)), line('Immunities', [dmgList(m.immune), dmgList(m.conditionImmune)].filter(Boolean).join('; ')));
  if (m.gear) root.append(line('Gear', m.gear.map(g => plain(String(typeof g === 'string' ? g : g.item || '').split('|')[0])).join(', ')));
  root.append(line('Senses', [...(m.senses || []).map(plain), 'Passive Perception ' + (m.passive ?? 10 + modOf(m.wis ?? 10))].join(', ')));
  root.append(line('Languages', (m.languages || []).map(plain).join(', ') || '—'));
  root.append(line('Challenge', crText(m).replace(/^CR /, '')), line('Proficiency Bonus', '+' + proficiency(m.crn)));

  const sc = m.spellcasting || [];
  const scFor = k => sc.filter(s => (s.displayAs || 'trait') === k).map(spellcasting);
  const sect = (title, items, header) => {
    if (!items.length && !header) return;
    root.append(el('h4', { text: title }));
    if (header) root.append(...header);
    root.append(...items);
  };
  sect('Traits', [...scFor('trait'), ...(m.trait || []).map(namedBlock)]);
  sect('Actions', [...(m.action || []).map(namedBlock), ...scFor('action')], m.actionNote ? [el('p', { html: tags(m.actionNote) })] : null);
  sect('Bonus Actions', [...(m.bonus || []).map(namedBlock), ...scFor('bonus')]);
  sect('Reactions', [...(m.reaction || []).map(namedBlock), ...scFor('reaction')], m.reactionHeader ? entryNodes(m.reactionHeader) : null);
  if (m.legendary) {
    const n = m.legendaryActions ?? 3;
    const head = m.legendaryHeader ? entryNodes(m.legendaryHeader)
      : [el('p', { text: 'Legendary Action Uses: ' + n + (m.legendaryActionsLair ? ' (' + m.legendaryActionsLair + ' in Lair)' : '') + '. Immediately after another creature’s turn, the ' + (m.shortName && typeof m.shortName === 'string' ? m.shortName : 'creature') + ' can expend a use to take one of the following actions. It regains all expended uses at the start of its turn.' })];
    sect('Legendary Actions', m.legendary.map(namedBlock), head);
  }
  if (m.mythic) sect('Mythic Actions', m.mythic.map(namedBlock), m.mythicHeader ? entryNodes(m.mythicHeader) : null);
  for (const [k, title] of [['lairActions', 'Lair Actions'], ['regionalEffects', 'Regional Effects']]) {
    if (m[k]) {
      const d = el('details', { class: 'sb-more' }, el('summary', { text: title }));
      d.append(...entryNodes(m[k]));
      root.append(d);
    }
  }
  root.append(el('p', { class: 'sb-src', text: m.source + (m.page ? ', p. ' + m.page : '') }));
  return root;
}
