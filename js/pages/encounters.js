import * as S from '../store.js';
import * as D from '../data.js';
import { el, clear, modal, toast, confirmBox, promptName, fmtNum } from '../ui.js';
import { difficulty, crLabel, xpForCr } from '../calc.js';
import { makeCreature, dupCreature, displayName, monsterOf, rollDice } from '../creatures.js';
import { hpWidget } from '../hp.js';
import { showStatBlock } from './bestiary.js';
import { acNum } from '../fmt.js';
import * as nav from '../nav.js';

export function mount(root) {
  const camp = S.campaign();
  if (!camp) { nav.go('bestiary'); return; }
  const wrap = el('div', { class: 'page encounters' });
  root.append(wrap);
  D.loadBestiary().then(() => draw()).catch(() => draw());
  draw();

  function enc() { return camp.encounters.find(e => e.id === camp.selEnc) || camp.encounters[0] || null; }

  function newEncounter() {
    promptName({
      title: 'New encounter', label: 'Encounter name', okLabel: 'Create',
      onSubmit: name => { const e = { id: S.uid(), name, creatures: [] }; camp.encounters.push(e); camp.selEnc = e.id; S.save(); draw(); },
    });
  }

  function editEncounter(e) {
    const del = { label: 'Delete', kind: 'danger', onClick: async close => {
      close();
      if (await confirmBox('Delete “' + e.name + '” and all its creatures?')) {
        camp.encounters = camp.encounters.filter(x => x.id !== e.id); camp.selEnc = camp.encounters[0]?.id || null; S.save(); draw();
      }
      return false;
    }, keepOpen: true };
    const dup = { label: 'Duplicate', onClick: () => {
      const copy = { id: S.uid(), name: e.name + ' (copy)', creatures: e.creatures.map(c => ({ ...c, id: S.uid(), hp: c.max })) };
      camp.encounters.push(copy); camp.selEnc = copy.id; S.save(); draw();
    } };
    promptName({
      title: 'Edit encounter', label: 'Encounter name', value: e.name, okLabel: 'Save', extraActions: [del, dup],
      onSubmit: name => { e.name = name; S.save(); draw(); },
    });
  }

  function editCreature(e, c) {
    const m = monsterOf(c);
    const label = el('input', { type: 'text', value: c.label || '', placeholder: displayName({ ...c, label: '' }, e.creatures), maxLength: 40 });
    const max = el('input', { type: 'number', min: 1, value: c.max, inputMode: 'numeric' });
    const cur = el('input', { type: 'number', min: 0, value: c.hp, inputMode: 'numeric' });
    const note = el('input', { type: 'text', value: c.note || '', placeholder: 'e.g. prone, concentrating', maxLength: 80 });
    const roll = m?.hp?.formula ? el('button', { class: 'btn small', text: 'Roll HP (' + m.hp.formula + ')', on: { click: () => { const v = rollDice(m.hp.formula); if (v) { max.value = v; cur.value = v; } } } }) : null;
    modal({
      title: 'Edit ' + displayName(c, e.creatures),
      body: el('div', { class: 'form' },
        el('label', null, 'Custom name (optional)', label),
        el('div', { class: 'row' }, el('label', null, 'Max HP', max), el('label', null, 'Current HP', cur)), roll,
        el('label', null, 'Note', note)),
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: () => {
        c.label = label.value.trim();
        c.max = Math.max(1, parseInt(max.value, 10) || c.max);
        const hv = parseInt(cur.value, 10);
        c.hp = Math.max(0, Math.min(c.max, Number.isNaN(hv) ? c.hp : hv));
        c.note = note.value.trim();
        S.save(); draw();
      } }],
    });
  }

  function summary(e) {
    const rules = S.get().settings.rules;
    const levels = camp.players.map(p => p.level);
    const d = difficulty(levels, e.creatures.map(c => c.crn ?? monsterOf(c)?.crn ?? null), rules);
    const box = el('section', { class: 'diff' });
    const lab = d.label.toLowerCase();
    box.append(el('div', { class: 'diff-head' },
      el('span', { class: 'diff-badge d-' + lab, text: d.label }),
      el('span', { class: 'diff-xp', html: '<b>' + fmtNum(d.total) + ' XP</b> from ' + d.count + ' creature' + (d.count === 1 ? '' : 's') + (d.rules === '2014' && d.count ? ' · adjusted <b>' + fmtNum(d.adjusted) + '</b> (×' + d.mult + ')' : '') })));
    if (!d.party) {
      box.append(el('p', { class: 'muted' }, 'Add players to the campaign to rate this encounter. ',
        el('button', { class: 'link', text: 'Add players', on: { click: () => nav.go('players') } })));
      return box;
    }
    const top = d.thresholds[d.thresholds.length - 1];
    const bar = el('div', { class: 'diff-bar', role: 'img', 'aria-label': 'XP compared with the difficulty budgets' }, el('i', { style: 'width:' + Math.min(100, (d.adjusted / top) * 100) + '%' }));
    d.thresholds.forEach((t, i) => bar.append(el('b', { style: 'left:' + Math.min(100, (t / top) * 100) + '%', title: d.names[i] })));
    box.append(bar, el('div', { class: 'diff-legend' }, d.names.map((n, i) => el('span', { class: i === d.names.indexOf(d.label) ? 'on' : '' }, n + ' ' + fmtNum(d.thresholds[i])))),
      el('p', { class: 'muted small', text: (d.rules === '2024' ? '2024 rules' : '2014 rules') + ' · ' + d.party + ' player' + (d.party === 1 ? '' : 's') + ' (levels ' + levels.join(', ') + ')' }));
    return box;
  }

  function searchAdd(e) {
    const input = el('input', { type: 'search', placeholder: D.isLoaded() ? 'Search a creature to add…' : 'Loading creatures…', disabled: !D.isLoaded(), 'aria-label': 'Search a creature to add' });
    const qty = el('input', { type: 'number', min: 1, max: 50, value: 1, class: 'qty', inputMode: 'numeric', 'aria-label': 'How many' });
    const results = el('ul', { class: 'results', hidden: true });
    const add = m => {
      const n = Math.max(1, Math.min(50, parseInt(qty.value, 10) || 1));
      for (let i = 0; i < n; i++) e.creatures.push(makeCreature(m, e.creatures));
      S.save(); draw();
      toast('Added ' + (n > 1 ? n + ' × ' : '') + m.name);
    };
    const upd = () => {
      const r = D.search(input.value, 8);
      clear(results);
      results.hidden = !r.length;
      r.forEach(m => results.append(el('li', null, el('button', { class: 'result', on: { click: () => add(m) } },
        el('span', { text: m.name }), el('span', { class: 'muted', text: ' ' + m.typeName + ' · CR ' + m.crl + ' · ' + m.source })))));
    };
    input.addEventListener('input', upd);
    input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { const m = D.search(input.value, 1)[0]; if (m) add(m); } });
    return el('div', { class: 'add-row' }, el('div', { class: 'search-wrap' }, input, results), el('label', { class: 'qty-label' }, '×', qty));
  }

  function creatureRow(e, c) {
    const m = monsterOf(c);
    const row = el('article', { class: 'row-card' + (c.hp <= 0 ? ' down' : '') });
    const name = displayName(c, e.creatures);
    row.append(
      el('div', { class: 'rc-main' },
        el('h3', { text: name }),
        el('p', { class: 'muted small', text: [c.crn == null ? 'CR —' : 'CR ' + crLabel(c.crn) + ' · ' + fmtNum(xpForCr(c.crn)) + ' XP', m ? 'AC ' + (acNum(m) ?? '—') : null, m?.typeName].filter(Boolean).join(' · ') }),
        c.note ? el('p', { class: 'note', text: c.note }) : null),
      hpWidget(c, h => { row.classList.toggle('down', h.hp <= 0); S.save(); }),
      el('div', { class: 'rc-actions' },
        el('button', { class: 'btn small', text: 'Info', disabled: !m, on: { click: () => showStatBlock(m, false) } }),
        el('button', { class: 'btn small', text: 'Duplicate', on: { click: () => { const i = e.creatures.indexOf(c); e.creatures.splice(i + 1, 0, dupCreature(c, e.creatures)); S.save(); draw(); } } }),
        el('button', { class: 'btn small', text: 'Edit', on: { click: () => editCreature(e, c) } }),
        el('button', { class: 'btn small danger', text: 'Remove', 'aria-label': 'Remove ' + name, on: { click: () => { e.creatures = e.creatures.filter(x => x !== c); S.save(); draw(); } } })));
    return row;
  }

  function draw() {
    clear(wrap);
    const cur = enc();
    if (cur) camp.selEnc = cur.id;
    const tabs = el('div', { class: 'tabs', role: 'tablist' }, camp.encounters.map(e =>
      el('button', { class: 'chip' + (cur && e.id === cur.id ? ' active' : ''), role: 'tab', 'aria-selected': String(!!cur && e.id === cur.id), text: e.name, on: { click: () => { camp.selEnc = e.id; S.save(); draw(); } } })));
    wrap.append(el('div', { class: 'tabs-row' }, tabs, el('button', { class: 'btn plus', text: '+', 'aria-label': 'New encounter', title: 'New encounter', on: { click: newEncounter } })));
    if (!cur) {
      wrap.append(el('div', { class: 'empty' }, el('p', { text: 'No encounters yet in ' + camp.name + '.' }),
        el('button', { class: 'btn primary', text: 'Create an encounter', on: { click: newEncounter } }),
        el('p', { class: 'muted small', text: 'You can also press ＋ Add on any creature in the bestiary.' })));
      return;
    }
    wrap.append(el('div', { class: 'enc-head' }, el('h2', { text: cur.name }),
      el('div', { class: 'enc-actions' },
        el('button', { class: 'btn small', text: 'Edit', on: { click: () => editEncounter(cur) } }),
        el('button', { class: 'btn small', text: 'Reset HP', on: { click: () => { cur.creatures.forEach(c => { c.hp = c.max; }); S.save(); draw(); } } }),
        el('button', { class: 'btn small', text: 'Clear defeated', on: { click: () => { cur.creatures = cur.creatures.filter(c => c.hp > 0); S.save(); draw(); } } }),
        el('button', { class: 'btn small primary', text: 'Send to initiative', on: { click: () => { sendToInitiative(camp, cur); nav.go('initiative'); } } }))));
    wrap.append(summary(cur), searchAdd(cur));
    if (!cur.creatures.length) wrap.append(el('p', { class: 'muted', text: 'No creatures yet. Search above, or add them from the bestiary.' }));
    wrap.append(el('div', { class: 'rows' }, cur.creatures.map(c => creatureRow(cur, c))));
  }
  return () => {};
}

export function sendToInitiative(camp, e) {
  const init = camp.init;
  const have = new Set(init.list.map(x => x.cid).filter(Boolean));
  let added = 0;
  for (const c of e.creatures) {
    if (c.hp > 0 && !have.has(c.id)) { init.list.push({ id: S.uid(), kind: 'mon', encId: e.id, cid: c.id, init: null }); added++; }
  }
  S.save();
  toast(added ? 'Added ' + added + ' to initiative' : 'Already in initiative');
}
