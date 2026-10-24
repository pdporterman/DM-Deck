// Encounter creature records and numbering ("Goblin 1", "Goblin 2").
import * as S from './store.js';
import * as D from './data.js';

export function makeCreature(m, existing) {
  const same = existing.filter(c => c.mkey === m.id);
  const n = same.reduce((a, c) => Math.max(a, c.n || 1), 0) + 1;
  const hp = m.hp?.average ?? 1;
  return { id: S.uid(), mkey: m.id, name: m.name, src: m.source, n, hp, max: hp, crn: m.crn ?? null, note: '' };
}

export function dupCreature(c, list) {
  const same = list.filter(x => x.mkey === c.mkey);
  const n = same.reduce((a, x) => Math.max(a, x.n || 1), 0) + 1;
  return { ...c, id: S.uid(), n, hp: c.max, label: '' };
}

export function displayName(c, list) {
  if (c.label) return c.label;
  const same = list.filter(x => x.mkey === c.mkey).length;
  return same > 1 || (c.n || 1) > 1 ? c.name + ' ' + (c.n || 1) : c.name;
}

export const monsterOf = c => D.lookup(c.name, c.src);

export function rollDice(formula) {
  const m = /^(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?$/.exec((formula || '').trim());
  if (!m) return null;
  let t = 0;
  for (let i = 0; i < +m[1]; i++) t += 1 + Math.floor(Math.random() * +m[2]);
  if (m[3]) t += (m[3] === '-' ? -1 : 1) * +m[4];
  return Math.max(1, t);
}
