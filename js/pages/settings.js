import * as S from '../store.js';
import * as D from '../data.js';
import { el, toast, confirmBox } from '../ui.js';
import * as nav from '../nav.js';
import { applySettings } from '../theme.js';
import { buildBestiary, saveStored, clearStored } from '../updater.js';

export function mount(root) {
  const st = S.get(), set = st.settings;
  const wrap = el('div', { class: 'page settings' });
  root.append(wrap);

  const row = (title, desc, control) => el('div', { class: 'set-row' }, el('div', null, el('b', { text: title }), desc ? el('p', { class: 'muted small', text: desc }) : null), control);

  const night = el('input', { type: 'checkbox', role: 'switch', checked: set.night, 'aria-label': 'Night mode', on: { change: e => { set.night = e.target.checked; S.save(); applySettings(); } } });
  const size = el('input', { type: 'range', min: 13, max: 24, step: 1, value: set.fontSize, 'aria-label': 'Text size', on: { input: e => { set.fontSize = +e.target.value; S.save(); applySettings(); sizeLbl.textContent = set.fontSize + ' px'; } } });
  const sizeLbl = el('span', { class: 'muted', text: set.fontSize + ' px' });
  const rules = el('select', { 'aria-label': 'Encounter difficulty rules', on: { change: e => { set.rules = e.target.value; S.save(); } } },
    el('option', { value: '2024', text: '2024 rules (XP budget)', selected: set.rules === '2024' }),
    el('option', { value: '2014', text: '2014 rules (thresholds × multiplier)', selected: set.rules === '2014' }));

  wrap.append(el('h2', { text: 'Settings' }),
    el('section', { class: 'panel' },
      row('Night mode', 'Dark colors for dim rooms.', night),
      row('Text size', null, el('div', { class: 'size-ctl' }, size, sizeLbl)),
      row('Encounter difficulty', 'How encounters are rated. 2024 is the default.', rules)),
    el('section', { class: 'panel' },
      el('h3', { text: 'Your data' }),
      el('p', { class: 'muted small', text: 'Campaigns, players, encounters and HP are saved on this device. Export a backup to move them to another device.' }),
      el('div', { class: 'toolbar wrap' },
        el('button', { class: 'btn', text: 'Export backup', on: { click: exportData } }),
        el('label', { class: 'btn', text: 'Import backup' }, el('input', { type: 'file', accept: 'application/json', hidden: true, on: { change: importData } })))),
    el('section', { class: 'panel' }, el('h3', { text: 'Bestiary' }),
      el('p', { class: 'muted small', id: 'bst-info', text: 'Loading…' }),
      el('div', { class: 'toolbar wrap' },
        el('button', { class: 'btn', id: 'bst-update', text: 'Update monsters from 5etools', on: { click: updateBestiary } }),
        el('button', { class: 'btn', id: 'bst-reset', text: 'Use built-in list', hidden: true, on: { click: resetBestiary } })),
      el('p', { class: 'muted small', id: 'bst-status', role: 'status', text: '' })));

  const info = () => {
    const n = D.meta.count.toLocaleString();
    document.getElementById('bst-info').textContent = n + ' creatures from 5etools (' + (D.meta.updated ? 'updated on this device ' : 'built ') + D.meta.built + '). Duplicates use the newest book.';
    document.getElementById('bst-reset').hidden = !D.meta.updated;
  };
  D.loadBestiary().then(info).catch(() => { document.getElementById('bst-info').textContent = 'Not loaded yet.'; });

  async function updateBestiary() {
    const btn = document.getElementById('bst-update'), status = document.getElementById('bst-status');
    const before = D.meta.count;
    btn.disabled = true;
    try {
      const j = await buildBestiary((done, total, label) => { status.textContent = label + (total > 1 ? ' ' + done + ' / ' + total : ''); });
      if (!j.monsters.length) throw new Error('empty');
      await saveStored(j);
      D.useData(j);
      info();
      const diff = j.monsters.length - before;
      status.textContent = 'Done: ' + j.monsters.length.toLocaleString() + ' creatures' + (diff ? ' (' + (diff > 0 ? '+' : '') + diff + ' since the last list)' : ', no change in count') + '. Saved on this device.';
    } catch (err) {
      status.textContent = 'Could not update. Check your connection and try again (' + (err.message || 'error') + ').';
    }
    btn.disabled = false;
  }
  async function resetBestiary() {
    await clearStored();
    location.reload();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(S.get(), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'dm-app-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.append(a); a.click(); a.remove();
  }
  async function importData(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!Array.isArray(obj.campaigns)) throw new Error('bad file');
      if (await confirmBox('Replace everything on this device with this backup?', 'Replace')) { S.replaceAll(obj); applySettings(); nav.go('settings'); toast('Backup restored'); }
    } catch (err) { toast('That file is not a valid backup'); }
  }
}
