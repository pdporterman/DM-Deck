// Persistent app state (localStorage). Everything the DM creates lives here.
const KEY = 'dmapp.v1';

const defaults = () => ({
  settings: { night: false, fontSize: 16, rules: '2024', groupHeadings: true },
  campaigns: [],
  activeCampaign: null,
  last: { view: 'bestiary' },
  bestiary: { sort: 'name', dir: 1, types: null, crMin: '0', crMax: '30', q: '' },
  menuOpen: null,
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaults();
      return {
        ...d, ...s,
        settings: { ...d.settings, ...(s.settings || {}) },
        bestiary: { ...d.bestiary, ...(s.bestiary || {}) },
      };
    }
  } catch (e) { /* storage blocked or corrupt: start fresh */ }
  return defaults();
}

export const get = () => state;
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export function replaceAll(obj) {
  const d = defaults();
  state = { ...d, ...obj, settings: { ...d.settings, ...(obj.settings || {}) }, bestiary: { ...d.bestiary, ...(obj.bestiary || {}) } };
  save();
}

export function campaign(id) {
  id = id || state.activeCampaign;
  return state.campaigns.find(c => c.id === id) || null;
}

export const INIT_MODES = [
  ['individual', 'Each creature rolls on its own (default)'],
  ['type', 'Same creature shares one initiative (all spiders together, giant spiders separate)'],
  ['all', 'All monsters share one initiative'],
];

export function newCampaign(name, initMode = 'individual') {
  const c = { id: uid(), name, initMode, players: [], encounters: [], selEnc: null, init: { round: 1, curId: null, list: [] } };
  state.campaigns.push(c);
  state.activeCampaign = c.id;
  save();
  return c;
}

export function deleteCampaign(id) {
  state.campaigns = state.campaigns.filter(c => c.id !== id);
  if (state.activeCampaign === id) state.activeCampaign = state.campaigns[0]?.id || null;
  if (state.menuOpen === id) state.menuOpen = null;
  save();
}
