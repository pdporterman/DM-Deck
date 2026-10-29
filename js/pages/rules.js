// Reference: conditions, combat actions and core rules (grapple, shove, cover…), from data/rules.json.
import * as S from '../store.js';
import { el, clear } from '../ui.js';
import { entryNodes, plain } from '../fmt.js';

let cache = null;
const load = () => cache ? Promise.resolve(cache) : fetch('data/rules.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(j => (cache = j));

const QUICK = ['Grapple', 'Shove', 'Cover', 'Opportunity', 'Prone', 'Concentration', 'Advantage', 'Surprised'];
const strip = s => String(s).replace(/\{@\w+ ([^{}|]*)[^{}]*\}/g, '$1');
const flat = e => (typeof e === 'string' ? strip(e) : Array.isArray(e) ? e.map(flat).join(' ') : e && typeof e === 'object' ? [e.name, flat(e.entries), flat(e.items), flat(e.entry)].filter(Boolean).join(' ') : '');

export function mount(root) {
  const st = S.get();
  if (!st.rulesEd) st.rulesEd = st.settings.rules === '2014' ? '2014' : '2024';
  const wrap = el('div', { class: 'page rules' });
  root.append(wrap);
  wrap.append(el('p', { class: 'muted', text: 'Loading rules…' }));
  load().then(build).catch(() => {
    clear(wrap).append(el('p', { class: 'error', text: 'Could not load the rules data. Connect once so it can be saved for offline use.' }));
  });

  function build(data) {
    clear(wrap);
    let q = '';
    const input = el('input', { type: 'search', placeholder: 'Search rules, e.g. grapple, shove, prone…', 'aria-label': 'Search rules' });
    const tabs = el('div', { class: 'tabs', role: 'tablist' });
    const quick = el('div', { class: 'tabs quick' }, QUICK.map(w => el('button', { class: 'chip', text: w, on: { click: () => { input.value = w; q = w.toLowerCase(); draw(); } } })));
    const body = el('div', { class: 'rule-list' });
    wrap.append(el('div', { class: 'page-head' }, el('h2', { text: 'Rules & Conditions' })), tabs,
      el('div', { class: 'toolbar' }, input), quick, body);

    const drawTabs = () => {
      clear(tabs);
      for (const ed of ['2024', '2014']) tabs.append(el('button', { class: 'chip' + (st.rulesEd === ed ? ' active' : ''), role: 'tab', 'aria-selected': String(st.rulesEd === ed), text: ed + ' rules', on: { click: () => { st.rulesEd = ed; S.save(); drawTabs(); draw(); } } }));
    };

    function draw() {
      clear(body);
      const groups = data.editions[st.rulesEd];
      let shown = 0;
      for (const [title, items] of Object.entries(groups)) {
        let list = items.map(it => ({ it, hay: (it.name + ' ' + (it.keys || '')).toLowerCase(), text: flat(it.entries).toLowerCase() }));
        if (q) {
          list = list.filter(x => x.hay.includes(q) || x.text.includes(q));
          list.sort((a, b) => (b.hay.includes(q) - a.hay.includes(q)));
        }
        if (!list.length) continue;
        shown += list.length;
        body.append(el('h3', { class: 'group-head rule-group' }, title, el('span', { class: 'muted', text: ' ' + list.length })));
        for (const x of list) body.append(rule(x.it, q && (x.hay.includes(q) || list.length <= 3)));
      }
      if (!shown) body.append(el('p', { class: 'muted', text: 'Nothing matches “' + input.value + '”.' }));
    }

    function rule(it, open) {
      const sub = [it.time, it.source + (it.page ? ' p. ' + it.page : '')].filter(Boolean).join(' · ');
      const d = el('details', { class: 'rule', open: !!open },
        el('summary', null, el('span', { class: 'rule-name', text: it.name }), el('span', { class: 'muted small', text: sub })),
        el('div', { class: 'rule-body' }, entryNodes(it.entries)));
      return d;
    }

    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = input.value.trim().toLowerCase(); draw(); }, 120); });
    drawTabs(); draw();
  }
}
