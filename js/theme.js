import * as S from './store.js';
export function applySettings() {
  const s = S.get().settings;
  const root = document.documentElement;
  root.dataset.theme = s.night ? 'dark' : 'light';
  root.style.setProperty('--fs', s.fontSize + 'px');
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = s.night ? '#14110f' : '#f3ead8';
}
