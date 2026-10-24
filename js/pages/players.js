import * as S from '../store.js';
import { el, clear, modal, confirmBox, clickPrimary } from '../ui.js';
import * as nav from '../nav.js';

export function mount(root) {
  const camp = S.campaign();
  if (!camp) { nav.go('bestiary'); return; }
  const wrap = el('div', { class: 'page players' });
  root.append(wrap);

  function levelSelect(cur, onChange) {
    const sel = el('select', { 'aria-label': 'Level' }, Array.from({ length: 20 }, (_, i) => el('option', { value: i + 1, text: 'Level ' + (i + 1), selected: i + 1 === cur })));
    sel.addEventListener('change', () => onChange(+sel.value));
    return sel;
  }

  function addPlayer() {
    const name = el('input', { type: 'text', placeholder: 'Character name', maxLength: 40 });
    const lvl = levelSelect(1, () => {});
    const go = () => {
      const n = name.value.trim();
      if (!n) { name.focus(); return false; }
      camp.players.push({ id: S.uid(), name: n, level: +lvl.value });
      S.save(); draw();
    };
    name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clickPrimary(); } });
    modal({ title: 'Add a character', body: el('div', { class: 'form' }, el('label', null, 'Name', name), el('label', null, 'Level', lvl)), actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: go }] });
  }

  function draw() {
    clear(wrap);
    const avg = camp.players.length ? (camp.players.reduce((a, p) => a + p.level, 0) / camp.players.length) : 0;
    wrap.append(el('div', { class: 'page-head' }, el('h2', { text: camp.name + ' · Players' }),
      el('button', { class: 'btn primary', text: '＋ Add character', on: { click: addPlayer } })));
    if (!camp.players.length) {
      wrap.append(el('div', { class: 'empty' }, el('p', { text: 'No characters yet.' }), el('p', { class: 'muted small', text: 'Add each player’s character name and level. Encounter difficulty and the initiative tracker use this list.' })));
      return;
    }
    wrap.append(el('p', { class: 'muted', text: camp.players.length + ' character' + (camp.players.length === 1 ? '' : 's') + ' · average level ' + (Math.round(avg * 10) / 10) }));
    wrap.append(el('div', { class: 'rows' }, camp.players.map(p => {
      const name = el('input', { type: 'text', value: p.name, maxLength: 40, 'aria-label': 'Character name' });
      name.addEventListener('change', () => { p.name = name.value.trim() || p.name; name.value = p.name; S.save(); });
      return el('article', { class: 'row-card player' }, name, levelSelect(p.level, v => { p.level = v; S.save(); draw(); }),
        el('button', { class: 'btn small danger', text: 'Remove', 'aria-label': 'Remove ' + p.name, on: { click: async () => { if (await confirmBox('Remove ' + p.name + ' from ' + camp.name + '?', 'Remove')) { camp.players = camp.players.filter(x => x !== p); S.save(); draw(); } } } }));
    })));
  }
  draw();
}
