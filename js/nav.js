// Tiny router shared by the pages (kept separate from main.js to avoid import cycles).
import * as S from './store.js';

let renderFn = () => {};
export const registerRender = fn => { renderFn = fn; };
export const rerender = () => renderFn();

export function go(view, campaignId) {
  const st = S.get();
  if (campaignId !== undefined) st.activeCampaign = campaignId;
  st.last = { view };
  S.save();
  renderFn();
}

// Hooks other modules can call (set by main.js).
export const hooks = {};
