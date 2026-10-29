import * as S from './store.js';
import * as nav from './nav.js';
import { el, clear, promptName, confirmBox } from './ui.js';
import { applySettings } from './theme.js';
import * as bestiary from './pages/bestiary.js';
import * as encounters from './pages/encounters.js';
import * as initiative from './pages/initiative.js';
import * as players from './pages/players.js';
import * as settings from './pages/settings.js';
import * as rules from './pages/rules.js';

const PAGES = { bestiary, encounters, initiative, players, settings, rules };
const TITLES = { bestiary: 'Bestiary', encounters: 'Encounters', initiative: 'Initiative', players: 'Players', settings: 'Settings', rules: 'Rules & Conditions' };
const CAMP_PAGES = ['players', 'initiative', 'encounters'];

const $page = document.getElementById('page');
const $title = document.getElementById('title');
const $drawer = document.getElementById('drawer');
const $scrim = document.getElementById('scrim');
const $menuBtn = document.getElementById('menu-btn');
let cleanup = null;

function openDrawer(v) {
  $drawer.classList.toggle('open', v);
  $scrim.classList.toggle('open', v);
  $drawer.setAttribute('aria-hidden', String(!v));
  $menuBtn.setAttribute('aria-expanded', String(v));
}
$menuBtn.addEventListener('click', () => { buildMenu(); openDrawer(!$drawer.classList.contains('open')); });
$scrim.addEventListener('click', () => openDrawer(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') openDrawer(false); });

function modeField(value) {
  const sel = el('select', { 'aria-label': 'Monster initiative' }, S.INIT_MODES.map(([v, l]) => el('option', { value: v, text: l, selected: v === value })));
  return { sel, field: el('label', null, 'Monster initiative', sel, el('span', { class: 'muted small', text: 'How monsters are grouped when rolling initiative in this campaign.' })) };
}
function newCampaign() {
  const mode = modeField('individual');
  promptName({
    title: 'New campaign', label: 'Campaign name', okLabel: 'Create', extra: mode.field,
    onSubmit: name => { const c = S.newCampaign(name, mode.sel.value); S.get().menuOpen = c.id; nav.go('players', c.id); },
  });
}
function editCampaign(c) {
  const mode = modeField(c.initMode || 'individual');
  promptName({
    title: 'Edit campaign', label: 'Campaign name', value: c.name, extra: mode.field,
    extraActions: [{ label: 'Delete', kind: 'danger', keepOpen: true, onClick: async close => {
      close();
      if (await confirmBox('Delete “' + c.name + '” with its players, encounters and initiative?')) { S.deleteCampaign(c.id); nav.go('bestiary'); }
    } }],
    onSubmit: name => { c.name = name; c.initMode = mode.sel.value; S.save(); render(); },
  });
}
nav.hooks.newCampaign = newCampaign;

function buildMenu() {
  const st = S.get();
  const view = st.last.view;
  clear($drawer);
  const item = (label, v, cid, active) => el('button', { class: 'menu-item' + (active ? ' active' : ''), text: label, on: { click: () => { nav.go(v, cid); openDrawer(false); } } });
  const open = id => st.menuOpen === id;
  const toggle = id => { st.menuOpen = open(id) ? null : id; S.save(); buildMenu(); };

  $drawer.append(el('div', { class: 'drawer-head' }, el('span', { class: 'brand', text: 'DM Toolkit' }),
    el('button', { class: 'icon-btn', 'aria-label': 'Close menu', text: '✕', on: { click: () => openDrawer(false) } })));
  const scroll = el('nav', { class: 'drawer-scroll', 'aria-label': 'Main' });

  scroll.append(el('div', { class: 'menu-title' }, el('span', { text: 'Campaigns' }), el('button', { class: 'btn plus', text: '+', 'aria-label': 'New campaign', title: 'New campaign', on: { click: () => { openDrawer(false); newCampaign(); } } })));
  if (!st.campaigns.length) scroll.append(el('p', { class: 'muted small pad', text: 'No campaigns yet.' }));
  for (const c of st.campaigns) {
    const isOpen = open(c.id);
    scroll.append(el('div', { class: 'menu-group indent' },
      el('div', { class: 'menu-row' },
        el('button', { class: 'menu-item head' + (st.activeCampaign === c.id ? ' current' : ''), 'aria-expanded': String(isOpen), on: { click: () => { st.activeCampaign = c.id; toggle(c.id); } } },
          el('span', { class: 'chev', text: isOpen ? '▾' : '▸' }), c.name, st.activeCampaign === c.id ? el('span', { class: 'dot', title: 'Active campaign' }) : null),
        isOpen ? el('button', { class: 'btn small', text: 'Edit', on: { click: () => { openDrawer(false); editCampaign(c); } } }) : null),
      isOpen ? el('div', { class: 'submenu' }, CAMP_PAGES.map(v => item(TITLES[v], v, c.id, view === v && st.activeCampaign === c.id))) : null));
  }

  scroll.append(el('div', { class: 'menu-group ref' },
    el('div', { class: 'menu-row' }, el('button', { class: 'menu-item head menu-title-btn', 'aria-expanded': String(open('ref')), on: { click: () => toggle('ref') } }, el('span', { class: 'chev', text: open('ref') ? '▾' : '▸' }), 'Reference')),
    open('ref') ? el('div', { class: 'submenu' }, item('Bestiary', 'bestiary', undefined, view === 'bestiary'), item('Rules & Conditions', 'rules', undefined, view === 'rules')) : null));
  $drawer.append(scroll, el('div', { class: 'drawer-foot' }, el('button', { class: 'gear' + (view === 'settings' ? ' active' : ''), 'aria-label': 'Settings', title: 'Settings', on: { click: () => { nav.go('settings'); openDrawer(false); } } }, '⚙ ', el('span', { text: 'Settings' }))));
}

function render() {
  const st = S.get();
  applySettings();
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  let view = st.last.view;
  if (!PAGES[view]) view = 'bestiary';
  if (CAMP_PAGES.includes(view) && !S.campaign()) view = 'bestiary';
  const c = S.campaign();
  $title.textContent = CAMP_PAGES.includes(view) && c ? c.name + ' · ' + TITLES[view] : TITLES[view];
  document.title = $title.textContent + ' — DM Toolkit';
  clear($page);
  window.scrollTo(0, 0);
  const ret = PAGES[view].mount($page);
  if (typeof ret === 'function') cleanup = ret;
  buildMenu();
}
nav.registerRender(render);
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
