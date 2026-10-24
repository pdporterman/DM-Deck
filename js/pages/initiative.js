import * as S from '../store.js';
import * as D from '../data.js';
import { el, clear, modal, toast } from '../ui.js';
import { displayName, monsterOf, makeCreature, rollDice } from '../creatures.js';
import { hpWidget } from '../hp.js';
import { initMod } from '../fmt.js';
import { showStatBlock } from './bestiary.js';
import { crLabel } from '../calc.js';
import * as nav from '../nav.js';

export function mount(root) {
  const camp = S.campaign();
  if (!camp) { nav.go('bestiary'); return; }
  const init = camp.init;
  const wrap = el('div', { class: 'page initiative' });
  root.append(wrap);
  D.loadBestiary().then(() => draw()).catch(() => {});

  // ---- helpers ----
  function creatureOf(c) {
    const e = camp.encounters.find(x => x.id === c.encId);
    const cr = e && e.creatures.find(x => x.id === c.cid);
    return cr ? { cr, list: e.creatures } : null;
  }
  // Keep the list in step with the campaign: every player present, no stale entries.
  function sync() {
    const pids = new Set(camp.players.map(p => p.id));
    init.list = init.list.filter(c => c.kind === 'pc' ? pids.has(c.pid) : (c.cid ? !!creatureOf(c) : true));
    for (const p of camp.players) if (!init.list.some(c => c.kind === 'pc' && c.pid === p.id)) init.list.push({ id: S.uid(), kind: 'pc', pid: p.id, init: null });
    if (init.curId && !init.list.some(c => c.id === init.curId)) init.curId = null;
  }
  function parts(c) {
    // returns {name, holder|null, mon|null, sub}
    if (c.kind === 'pc') {
      const p = camp.players.find(x => x.id === c.pid);
      return { name: p.name, sub: 'Level ' + p.level, holder: null, mon: null };
    }
    if (c.cid) {
      const r = creatureOf(c);
      const m = monsterOf(r.cr);
      return { name: displayName(r.cr, r.list), holder: r.cr, mon: m, sub: r.cr.note || '' };
    }
    const m = D.lookup(c.name, c.src);
    const same = init.list.filter(x => x.kind === 'mon' && !x.cid && x.mkey === c.mkey);
    const label = same.length > 1 || (c.n || 1) > 1 ? c.name + ' ' + (c.n || 1) : c.name;
    return { name: label, holder: c, mon: m, sub: '' };
  }
  const isDown = c => c.kind === 'mon' && parts(c).holder.hp <= 0;

  function addAdHoc(m) {
    const same = init.list.filter(x => x.kind === 'mon' && !x.cid && x.mkey === m.id);
    const base = makeCreature(m, same.map(x => ({ mkey: x.mkey, n: x.n })));
    init.list.push({ id: S.uid(), kind: 'mon', mkey: m.id, name: m.name, src: m.source, n: base.n, hp: base.hp, max: base.max, init: null });
    S.save();
  }

  // ---- actions ----
  function advance(dir) {
    const L = init.list;
    if (!L.length) return;
    let i = L.findIndex(c => c.id === init.curId);
    if (i < 0) { i = dir > 0 ? -1 : 0; if (dir > 0) init.round = init.round || 1; }
    for (let step = 0; step < L.length; step++) {
      const ni = i + dir;
      if (ni >= L.length) { i = -1; init.round++; continue; }
      if (ni < 0) { i = L.length; init.round = Math.max(1, init.round - 1); continue; }
      i = ni;
      if (!isDown(L[i])) { init.curId = L[i].id; S.save(); draw(); return; }
    }
  }
  function sortByInit() {
    const withIdx = init.list.map((c, i) => ({ c, i }));
    withIdx.sort((a, b) => ((b.c.init ?? -999) - (a.c.init ?? -999)) || a.i - b.i);
    init.list = withIdx.map(x => x.c);
    S.save(); draw();
  }
  function rollMonsters() {
    for (const c of init.list) {
      if (c.kind !== 'mon') continue;
      const m = parts(c).mon;
      c.init = 1 + Math.floor(Math.random() * 20) + (m ? initMod(m) : 0);
    }
    sortByInit();
  }
  function move(c, d) {
    const i = init.list.indexOf(c), j = i + d;
    if (j < 0 || j >= init.list.length) return;
    [init.list[i], init.list[j]] = [init.list[j], init.list[i]];
    S.save(); draw();
  }

  function addEncounterPopup() {
    if (!camp.encounters.length) { toast('Create an encounter first'); return; }
    const sel = el('select', null, camp.encounters.map(e => el('option', { value: e.id, text: e.name + ' (' + e.creatures.length + ')', selected: e.id === camp.selEnc })));
    modal({
      title: 'Add an encounter', body: el('div', { class: 'form' }, el('label', null, 'Encounter', sel)),
      actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: () => {
        const e = camp.encounters.find(x => x.id === sel.value);
        const have = new Set(init.list.map(x => x.cid).filter(Boolean));
        e.creatures.forEach(c => { if (c.hp > 0 && !have.has(c.id)) init.list.push({ id: S.uid(), kind: 'mon', encId: e.id, cid: c.id, init: null }); });
        S.save(); draw();
      } }],
    });
  }
  function addMonsterPopup() {
    const input = el('input', { type: 'search', placeholder: 'Search a creature…', 'aria-label': 'Search a creature' });
    const results = el('ul', { class: 'results inline' });
    let mdl;
    const upd = () => {
      clear(results);
      D.search(input.value, 10).forEach(m => results.append(el('li', null, el('button', { class: 'result', on: { click: () => { addAdHoc(m); toast('Added ' + m.name); draw(); } } },
        el('span', { text: m.name }), el('span', { class: 'muted', text: ' CR ' + m.crl + ' · ' + m.source })))));
    };
    input.addEventListener('input', upd);
    mdl = modal({ title: 'Add a monster', body: el('div', { class: 'form' }, input, results, el('p', { class: 'muted small', text: 'Tap a result to add it. It stays open so you can add more.' })), actions: [{ label: 'Done', kind: 'primary' }] });
  }

  // ---- drag to reorder ----
  // Drag: the row follows the pointer with a transform (the DOM is not reshuffled mid-drag, which would
  // drop pointer capture); the new position is applied on release.
  function dragStart(e, listEl, c) {
    e.preventDefault();
    const handle = e.currentTarget;
    const rowEl = handle.closest('.init-row');
    const rows = [...listEl.querySelectorAll('.init-row')];
    const others = rows.filter(r => r !== rowEl);
    const startY = e.clientY;
    rowEl.classList.add('dragging');
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    let target = null; // row to drop before; null = end of list
    const mark = () => { others.forEach(r => r.classList.remove('drop-before')); listEl.classList.remove('drop-end'); if (target) target.classList.add('drop-before'); else listEl.classList.add('drop-end'); };
    const move = ev => {
      rowEl.style.transform = 'translateY(' + (ev.clientY - startY) + 'px)';
      target = null;
      for (const r of others) { const b = r.getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { target = r; break; } }
      mark();
    };
    const up = ev => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      if (ev.type === 'pointerup') {
        const rest = init.list.filter(x => x !== c);
        const idx = target ? rest.findIndex(x => x.id === target.dataset.id) : rest.length;
        rest.splice(idx, 0, c);
        init.list = rest;
        S.save();
      }
      draw();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function row(c, listEl) {
    const p = parts(c);
    const initIn = el('input', { type: 'number', class: 'init-in', value: c.init ?? '', placeholder: '–', inputMode: 'numeric', 'aria-label': 'Initiative for ' + p.name });
    initIn.addEventListener('change', () => { c.init = initIn.value === '' ? null : parseInt(initIn.value, 10); S.save(); });
    const r = el('article', { class: 'init-row' + (c.id === init.curId ? ' current' : '') + (c.kind === 'pc' ? ' pc' : ' mon') + (isDown(c) ? ' down' : ''), 'data-id': c.id });
    const handle = el('button', { class: 'handle', 'aria-label': 'Drag to reorder ' + p.name, title: 'Drag to reorder', text: '⠿' });
    handle.addEventListener('pointerdown', e => dragStart(e, listEl, c));
    r.append(
      handle,
      el('div', { class: 'arrows' }, el('button', { text: '▲', 'aria-label': 'Move up', on: { click: () => move(c, -1) } }), el('button', { text: '▼', 'aria-label': 'Move down', on: { click: () => move(c, 1) } })),
      initIn,
      el('div', { class: 'init-name' }, el('h3', { text: p.name }),
        el('p', { class: 'muted small', text: [c.kind === 'pc' ? p.sub : (p.mon ? 'CR ' + p.mon.crl + ' · ' + p.mon.typeName : ''), c.kind === 'mon' ? p.sub : ''].filter(Boolean).join(' · ') })));
    if (p.holder) {
      r.append(hpWidget(p.holder, h => { r.classList.toggle('down', h.hp <= 0); S.save(); }),
        el('div', { class: 'init-actions' },
          el('button', { class: 'btn small', text: 'Info', disabled: !p.mon, on: { click: () => showStatBlock(p.mon, false) } }),
          el('button', { class: 'btn small danger', text: 'Remove', 'aria-label': 'Remove ' + p.name, on: { click: () => { init.list = init.list.filter(x => x !== c); if (init.curId === c.id) init.curId = null; S.save(); draw(); } } })));
    }
    return r;
  }

  function draw() {
    sync(); S.save();
    clear(wrap);
    const cur = init.list.find(c => c.id === init.curId);
    wrap.append(el('div', { class: 'page-head' }, el('h2', { text: camp.name + ' · Initiative' })));
    wrap.append(el('div', { class: 'turn-bar' },
      el('div', { class: 'round' }, el('span', { class: 'muted', text: 'Round' }), el('b', { text: init.round || 1 })),
      el('div', { class: 'now' }, el('span', { class: 'muted', text: 'Up now' }), el('b', { text: cur ? parts(cur).name : '—' })),
      el('div', { class: 'turn-btns' },
        el('button', { class: 'btn', text: '◀ Prev', on: { click: () => advance(-1) } }),
        el('button', { class: 'btn primary', text: cur ? 'Next ▶' : 'Start ▶', on: { click: () => advance(1) } }))));
    wrap.append(el('div', { class: 'toolbar wrap' },
      el('button', { class: 'btn small', text: 'Sort by initiative', on: { click: sortByInit } }),
      el('button', { class: 'btn small', text: 'Roll for monsters', on: { click: rollMonsters } }),
      el('button', { class: 'btn small', text: '＋ Encounter', on: { click: addEncounterPopup } }),
      el('button', { class: 'btn small', text: '＋ Monster', on: { click: addMonsterPopup } }),
      el('button', { class: 'btn small danger', text: 'New combat', title: 'Reset the round, clear all initiative values and remove monsters', on: { click: () => { init.list = init.list.filter(c => c.kind === 'pc'); init.list.forEach(c => { c.init = null; }); init.round = 1; init.curId = null; S.save(); draw(); } } })));
    if (!camp.players.length && !init.list.length) wrap.append(el('div', { class: 'empty' }, el('p', { text: 'No players or monsters yet.' }), el('button', { class: 'btn', text: 'Add players', on: { click: () => nav.go('players') } })));
    const listEl = el('div', { class: 'init-list' });
    init.list.forEach(c => listEl.append(row(c, listEl)));
    wrap.append(listEl);
  }
  draw();
}
