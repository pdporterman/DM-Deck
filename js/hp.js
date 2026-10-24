// Hit point widget shared by the encounter tracker and the initiative tracker.
import { el, modal, clickPrimary } from './ui.js';

// holder: any object with numeric hp and max. onChange(holder) is called after every change.
export function hpWidget(holder, onChange) {
  const bar = el('div', { class: 'hp-bar' }, el('i'));
  const txt = el('button', { class: 'hp-text', title: 'Tap to set current HP', 'aria-label': 'Current hit points' });
  const amt = el('input', { type: 'number', min: 0, inputMode: 'numeric', placeholder: '#', 'aria-label': 'Amount' });
  const draw = () => {
    const pct = holder.max > 0 ? Math.max(0, Math.min(100, (holder.hp / holder.max) * 100)) : 0;
    bar.firstChild.style.width = pct + '%';
    bar.dataset.level = holder.hp <= 0 ? 'down' : pct <= 25 ? 'low' : pct <= 60 ? 'mid' : 'ok';
    txt.textContent = holder.hp + ' / ' + holder.max;
  };
  const apply = d => {
    holder.hp = Math.max(0, Math.min(holder.max, holder.hp + d));
    draw(); onChange && onChange(holder);
  };
  const take = sgn => () => {
    const v = parseInt(amt.value, 10);
    if (!v) { amt.focus(); return; }
    apply(sgn * Math.abs(v)); amt.value = '';
  };
  txt.addEventListener('click', () => {
    const inp = el('input', { type: 'number', min: 0, value: holder.hp, inputMode: 'numeric', 'aria-label': 'Current HP' });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clickPrimary(); } });
    modal({
      title: 'Set current HP', body: el('div', { class: 'form' }, el('label', null, 'Current HP (max ' + holder.max + ')', inp)),
      actions: [{ label: 'Cancel' }, { label: 'Set', kind: 'primary', onClick: () => {
        const n = parseInt(inp.value, 10);
        if (!Number.isNaN(n)) { holder.hp = Math.max(0, Math.min(holder.max, n)); draw(); onChange && onChange(holder); }
      } }],
    });
    setTimeout(() => inp.select(), 40);
  });
  amt.addEventListener('keydown', e => { if (e.key === 'Enter') take(-1)(); });
  const root = el('div', { class: 'hp' },
    el('div', { class: 'hp-top' },
      el('button', { class: 'btn small icon', text: '−', 'aria-label': 'Lose 1 HP', on: { click: () => apply(-1) } }), txt,
      el('button', { class: 'btn small icon', text: '+', 'aria-label': 'Gain 1 HP', on: { click: () => apply(1) } })),
    bar,
    el('div', { class: 'hp-amt' }, amt,
      el('button', { class: 'btn small danger', text: 'Damage', on: { click: take(-1) } }),
      el('button', { class: 'btn small good', text: 'Heal', on: { click: take(1) } })));
  draw();
  return root;
}
