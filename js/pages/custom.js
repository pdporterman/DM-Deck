// Reference: the DM's own creatures. Kept apart from the bestiary, but they show up when searching to add to an encounter.
import * as S from '../store.js';
import * as D from '../data.js';
import { el, clear, modal, confirmBox, toast } from '../ui.js';
import { statBlock } from '../fmt.js';
import { addToEncounterPopup } from '../addpopup.js';
import { creatureCard } from './bestiary.js';
import * as nav from '../nav.js';

const SIZES = [['T', 'Tiny'], ['S', 'Small'], ['M', 'Medium'], ['L', 'Large'], ['H', 'Huge'], ['G', 'Gargantuan']];
const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const int = (v, d) => { const n = parseInt(v, 10); return Number.isNaN(n) ? d : n; };

function saveAll() {
  S.save();
  D.setCustom(S.get().custom);
}

export function editCustom(existing) {
  const c = existing || { size: 'M', type: 'humanoid', cr: '1', ac: 12, hp: 20, walk: 30, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const text = (v, ph, max = 60) => el('input', { type: 'text', value: v || '', placeholder: ph || '', maxLength: max });
  const num = (v, min, max, ph = '') => el('input', { type: 'number', min, max, inputMode: 'numeric', value: v ?? '', placeholder: ph });
  const sel = (opts, cur) => el('select', null, opts.map(([v, l]) => el('option', { value: v, text: l, selected: v === cur })));
  const area = (v, ph) => el('textarea', { rows: 3, value: v || '', placeholder: ph });

  const f = {
    name: text(c.name, 'e.g. Hobgoblin Warlord', 50),
    size: sel(SIZES, c.size),
    type: sel(Object.keys(D.TYPE_ICON).map(t => [t, D.cap(t)]), c.type),
    cr: sel(CRS.map(x => [x, x]), String(c.cr)),
    ac: num(c.ac, 1, 40), hp: num(c.hp, 1, 9999), hitDice: text(c.hitDice, 'optional, e.g. 6d8+12', 20),
    walk: num(c.walk, 0, 999, '30'), fly: num(c.fly, 0, 999, '—'), swim: num(c.swim, 0, 999, '—'), climb: num(c.climb, 0, 999, '—'),
    traits: area(c.traits, 'Keen Smell. The creature has advantage on Wisdom (Perception) checks that rely on smell.'),
    actions: area(c.actions, 'Multiattack. The creature makes two attacks.\nBite. Melee Attack Roll: +4, reach 5 ft. Hit: 7 (1d8 + 3) piercing damage.'),
    bonus: area(c.bonus, 'optional'), reactions: area(c.reactions, 'optional'),
  };
  for (const k of ABIL) f[k] = num(c[k] ?? 10, 1, 30);
  const err = el('p', { class: 'error', role: 'alert' });
  const lab = (t, inp, extra) => el('label', null, t, inp, extra);

  const body = el('div', { class: 'form' }, lab('Name', f.name),
    el('div', { class: 'row' }, lab('Size', f.size), lab('Type', f.type)),
    el('div', { class: 'row' }, lab('Challenge rating', f.cr), lab('Armor Class', f.ac), lab('Hit points', f.hp)),
    lab('Hit dice (optional)', f.hitDice),
    el('div', { class: 'row-4' }, lab('Walk (ft.)', f.walk), lab('Fly', f.fly), lab('Swim', f.swim), lab('Climb', f.climb)),
    el('div', { class: 'abil-grid' }, ABIL.map(k => lab(k.toUpperCase(), f[k]))),
    lab('Traits', f.traits), lab('Actions', f.actions), lab('Bonus actions', f.bonus), lab('Reactions', f.reactions),
    el('p', { class: 'muted small', text: 'Put one entry per line. Start a line with its name and a period (“Bite. Melee Attack Roll: …”) to give it a bold title.' }),
    err);

  modal({
    title: existing ? 'Edit ' + existing.name : 'New custom creature', body, wide: true,
    actions: [{ label: 'Cancel' }, {
      label: existing ? 'Save' : 'Create', kind: 'primary',
      onClick: () => {
        const name = f.name.value.trim();
        const list = S.get().custom;
        if (!name) { err.textContent = 'Give the creature a name.'; f.name.focus(); return false; }
        if (list.some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'You already have a custom creature with that name.'; f.name.focus(); return false; }
        const rec = {
          id: c.id || S.uid(), name, size: f.size.value, type: f.type.value, cr: f.cr.value,
          ac: Math.max(1, int(f.ac.value, 10)), hp: Math.max(1, int(f.hp.value, 1)), hitDice: f.hitDice.value.trim(),
          walk: int(f.walk.value, 0), fly: int(f.fly.value, 0), swim: int(f.swim.value, 0), climb: int(f.climb.value, 0),
          traits: f.traits.value, actions: f.actions.value, bonus: f.bonus.value, reactions: f.reactions.value,
        };
        for (const k of ABIL) rec[k] = Math.max(1, Math.min(30, int(f[k].value, 10)));
        if (existing) list[list.indexOf(existing)] = rec; else list.push(rec);
        saveAll();
        toast((existing ? 'Saved ' : 'Created ') + name);
        nav.rerender();
      },
    }],
  });
}

function openCustom(m) {
  const rec = S.get().custom.find(x => x.id === m.cid);
  modal({
    title: m.name, body: statBlock(m), wide: true,
    actions: [
      { label: 'Delete', kind: 'danger', keepOpen: true, onClick: async close => {
        if (await confirmBox('Delete “' + m.name + '”? Copies already in encounters stay there, without their stat block.')) {
          const st = S.get(); st.custom = st.custom.filter(x => x.id !== m.cid); saveAll(); close(); nav.rerender();
        }
      } },
      { label: 'Edit', keepOpen: true, onClick: close => { close(); editCustom(rec); } },
      { label: '＋ Add to encounter', kind: 'primary', keepOpen: true, onClick: () => addToEncounterPopup(m) },
    ],
  });
}

export function mount(root) {
  const wrap = el('div', { class: 'page custom' });
  root.append(wrap);
  const list = S.get().custom;
  wrap.append(el('div', { class: 'page-head' }, el('h2', { text: 'Custom creatures' }),
    el('button', { class: 'btn primary', text: '＋ New creature', on: { click: () => editCustom(null) } })));
  if (!list.length) {
    wrap.append(el('div', { class: 'empty' }, el('p', { text: 'No custom creatures yet.' }),
      el('p', { class: 'muted small', text: 'Make your own monsters, NPCs and homebrew enemies. They stay separate from the bestiary but come up when you search to add a creature to an encounter or the initiative tracker.' })));
    return;
  }
  const grid = el('div', { class: 'card-grid' });
  const cards = D.customs().slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const m of cards) grid.append(creatureCard(m, { onOpen: openCustom }));
  wrap.append(grid);
}
