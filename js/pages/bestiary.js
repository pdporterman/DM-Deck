import * as S from '../store.js';
import * as D from '../data.js';
import { el, clear, modal, toast, fmtNum } from '../ui.js';
import { statBlock, acNum, hpText, speedText, sizeText } from '../fmt.js';
import { addToEncounterPopup } from '../addpopup.js';
import { crLabel, xpForCr } from '../calc.js';
import * as nav from '../nav.js';

const CRS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
const CHUNK = 90;

export function showStatBlock(m, withAdd = true) {
  const acts = [{ label: 'Close' }];
  if (withAdd) acts.unshift({ label: '＋ Add to encounter', kind: 'primary', keepOpen: true, onClick: () => addToEncounterPopup(m) });
  modal({ title: m.name, body: statBlock(m), actions: acts, wide: true });
}

export function creatureCard(m, { onAdd, onOpen } = {}) {
  const icon = D.TYPE_ICON[(m.t || '').split('/')[0]] || '❖';
  const card = el('article', { class: 'card creature', tabIndex: 0, 'aria-label': m.name + ', CR ' + m.crl },
    el('span', { class: 'glyph', 'aria-hidden': 'true', text: icon }),
    el('div', { class: 'card-top' }, el('h3', { text: m.name }), el('span', { class: 'cr', title: xpForCr(m.crn) + ' XP', text: m.crn == null ? 'CR —' : 'CR ' + m.crl })),
    el('p', { class: 'card-sub', text: [sizeText(m), m.typeName].filter(Boolean).join(' ') }),
    el('dl', { class: 'card-stats' },
      el('div', null, el('dt', { text: 'AC' }), el('dd', { text: acNum(m) ?? '—' })),
      el('div', null, el('dt', { text: 'HP' }), el('dd', { text: m.hp?.average ?? '—' })),
      el('div', { class: 'wide' }, el('dt', { text: 'Speed' }), el('dd', { text: speedText(m) }))),
    el('div', { class: 'card-foot' },
      el('span', { class: 'src', text: m.source }),
      el('button', { class: 'btn small', text: '＋ Add', 'aria-label': 'Add ' + m.name + ' to an encounter', on: { click: e => { e.stopPropagation(); (onAdd || addToEncounterPopup)(m); } } })));
  const open = () => (onOpen || (x => showStatBlock(x)))(m);
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return card;
}

export function mount(root) {
  const st = S.get();
  const ui = st.bestiary;
  const collapsed = new Set();
  let observer = null;
  const wrap = el('div', { class: 'page bestiary' });
  root.append(wrap);

  const status = el('p', { class: 'muted', text: 'Loading bestiary…' });
  wrap.append(status);

  D.loadBestiary().then(() => build()).catch(() => {
    clear(wrap).append(el('p', { class: 'error', text: 'Could not load the bestiary data. Connect once so it can be saved for offline use.' }),
      el('button', { class: 'btn', text: 'Try again', on: { click: () => nav.rerender() } }));
  });

  function build() {
    clear(wrap);
    const q = el('input', { type: 'search', placeholder: 'Search creatures…', value: ui.q, 'aria-label': 'Search creatures' });
    const sort = el('select', { 'aria-label': 'Sort by' }, [['name', 'Name'], ['type', 'Creature type'], ['cr', 'CR']].map(([v, l]) => el('option', { value: v, text: 'Sort: ' + l, selected: ui.sort === v })));
    const dir = el('button', { class: 'btn icon', 'aria-label': 'Toggle sort direction', title: 'Toggle direction' });
    const filterBtn = el('button', { class: 'btn', on: { click: openFilters } });
    const count = el('span', { class: 'muted count' });
    const list = el('div', { class: 'card-grid' });
    const sentinel = el('div', { class: 'sentinel' });
    const tip = !st.campaigns.length ? el('div', { class: 'tip' }, el('b', { text: 'Tip: ' }), 'open the menu (top left) and press ＋ next to Campaigns to start one, then add creatures to encounters from here.') : null;
    if (tip) wrap.append(tip);
    wrap.append(el('div', { class: 'toolbar' }, q, sort, dir, filterBtn), el('div', { class: 'toolbar-sub' }, count), list, sentinel);

    let items = [], shown = 0;

    function typesAll() { return [...new Set(D.all().map(m => m.typeName))].sort(); }
    function filtered() {
      const ql = ui.q.trim().toLowerCase();
      const lo = Number(ui.crMin), hi = Number(ui.crMax);
      const ts = ui.types ? new Set(ui.types) : null;
      return D.all().filter(m => {
        if (ql && !m._s.includes(ql)) return false;
        if (ts && !ts.has(m.typeName)) return false;
        const c = m.crn;
        if (c == null) return lo === 0 && hi === 30 && true;
        return c >= lo && c <= hi;
      });
    }
    function plan() {
      const arr = filtered();
      const d = ui.dir;
      const nameCmp = (a, b) => a.name.localeCompare(b.name);
      if (ui.sort === 'cr') arr.sort((a, b) => ((a.crn == null) - (b.crn == null)) || (((a.crn ?? 0) - (b.crn ?? 0)) * d) || nameCmp(a, b));
      else if (ui.sort === 'type') arr.sort((a, b) => (a.typeName.localeCompare(b.typeName) * d) || nameCmp(a, b));
      else arr.sort((a, b) => nameCmp(a, b) * d);
      const key = m => ui.sort === 'cr' ? (m.crn == null ? 'No CR' : 'CR ' + m.crl) : ui.sort === 'type' ? m.typeName : (/^[a-z]/i.test(m.name) ? m.name[0].toUpperCase() : '#');
      items = [];
      let cur = null, curCount = 0, headIdx = -1;
      for (const m of arr) {
        const k = key(m);
        if (k !== cur) { cur = k; headIdx = items.length; items.push({ h: k, n: 0 }); }
        items[headIdx].n++;
        if (!collapsed.has(k)) items.push({ m });
      }
      count.textContent = fmtNum(arr.length) + ' of ' + fmtNum(D.all().length) + ' creatures';
      const nF = (ui.types ? 1 : 0) + (ui.crMin !== '0' || ui.crMax !== '30' ? 1 : 0);
      filterBtn.textContent = nF ? 'Filters (' + nF + ')' : 'Filters';
      dir.textContent = d === 1 ? '↑' : '↓';
    }
    function renderMore() {
      const end = Math.min(items.length, shown + CHUNK);
      for (; shown < end; shown++) {
        const it = items[shown];
        if (it.h) {
          const isC = collapsed.has(it.h);
          list.append(el('button', { class: 'group-head', 'aria-expanded': String(!isC), on: { click: () => { isC ? collapsed.delete(it.h) : collapsed.add(it.h); redraw(); } } },
            el('span', { class: 'chev', text: isC ? '▸' : '▾' }), it.h, el('span', { class: 'muted', text: ' ' + it.n })));
        } else list.append(creatureCard(it.m));
      }
    }
    function redraw() {
      plan(); clear(list); shown = 0; renderMore();
    }
    observer = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && shown < items.length) renderMore(); }, { rootMargin: '600px' });
    observer.observe(sentinel);

    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { ui.q = q.value; S.save(); redraw(); }, 120); });
    sort.addEventListener('change', () => { ui.sort = sort.value; collapsed.clear(); S.save(); redraw(); });
    dir.addEventListener('click', () => { ui.dir *= -1; S.save(); redraw(); });

    function openFilters() {
      const types = typesAll();
      const sel = new Set(ui.types || types);
      const boxes = types.map(t => { const cb = el('input', { type: 'checkbox', checked: sel.has(t), on: { change: () => { cb.checked ? sel.add(t) : sel.delete(t); } } }); return { t, cb, row: el('label', { class: 'check' }, cb, t) }; });
      const all = el('button', { class: 'btn small', text: 'Select all', on: { click: () => boxes.forEach(b => { b.cb.checked = true; sel.add(b.t); }) } });
      const none = el('button', { class: 'btn small', text: 'Clear', on: { click: () => boxes.forEach(b => { b.cb.checked = false; sel.delete(b.t); }) } });
      const opt = (v, cur) => el('option', { value: v, text: v === 0 ? '0' : crLabel(v), selected: String(v) === String(cur) });
      const lo = el('select', null, CRS.map(v => opt(v, ui.crMin)));
      const hi = el('select', null, CRS.map(v => opt(v, ui.crMax)));
      modal({
        title: 'Filters',
        body: el('div', { class: 'form' },
          el('div', { class: 'row' }, el('label', null, 'CR from', lo), el('label', null, 'CR to', hi)),
          el('div', { class: 'row between' }, el('b', { text: 'Creature type' }), el('span', null, all, ' ', none)),
          el('div', { class: 'check-grid' }, boxes.map(b => b.row))),
        actions: [
          { label: 'Reset', onClick: () => { ui.types = null; ui.crMin = '0'; ui.crMax = '30'; S.save(); collapsed.clear(); redraw(); } },
          { label: 'Apply', kind: 'primary', onClick: () => {
            ui.types = sel.size === types.length ? null : [...sel];
            ui.crMin = lo.value; ui.crMax = hi.value;
            if (Number(ui.crMin) > Number(ui.crMax)) [ui.crMin, ui.crMax] = [ui.crMax, ui.crMin];
            S.save(); collapsed.clear(); redraw();
          } }],
      });
    }
    redraw();
  }
  return () => observer && observer.disconnect();
}
