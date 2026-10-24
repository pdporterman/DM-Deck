// "Add to encounter" popup used from the bestiary and stat blocks.
import * as S from './store.js';
import { el, modal, toast, promptName } from './ui.js';
import * as nav from './nav.js';
import { makeCreature } from './creatures.js';

export function addToEncounterPopup(m) {
  const st = S.get();
  if (!st.campaigns.length) {
    modal({
      title: 'Create a campaign first',
      body: el('p', { text: 'Encounters live inside a campaign so the difficulty can use your party’s levels.' }),
      actions: [{ label: 'Cancel' }, { label: 'New campaign', kind: 'primary', onClick: close => { close(); nav.hooks.newCampaign && nav.hooks.newCampaign(); } }],
    });
    return;
  }
  const campSel = el('select', null, st.campaigns.map(c => el('option', { value: c.id, text: c.name, selected: c.id === st.activeCampaign })));
  const encSel = el('select');
  const nameIn = el('input', { type: 'text', placeholder: 'New encounter name', maxLength: 60 });
  const qty = el('input', { type: 'number', min: 1, max: 50, value: 1, inputMode: 'numeric' });
  const nameRow = el('label', null, 'Encounter name', nameIn);
  const fill = () => {
    const c = S.campaign(campSel.value);
    const sel = c.selEnc;
    encSel.replaceChildren(...c.encounters.map(e => el('option', { value: e.id, text: e.name, selected: e.id === sel })), el('option', { value: '__new', text: '＋ New encounter…', selected: !c.encounters.length }));
    nameRow.hidden = encSel.value !== '__new';
  };
  campSel.addEventListener('change', fill);
  encSel.addEventListener('change', () => { nameRow.hidden = encSel.value !== '__new'; if (!nameRow.hidden) nameIn.focus(); });
  fill();
  const body = el('div', { class: 'form' },
    el('p', { html: '<b></b>' }),
    st.campaigns.length > 1 ? el('label', null, 'Campaign', campSel) : null,
    el('label', null, 'Encounter', encSel), nameRow,
    el('label', null, 'How many?', qty));
  body.firstChild.firstChild.textContent = m.name + ' · CR ' + m.crl;
  modal({
    title: 'Add to encounter', body,
    actions: [{ label: 'Cancel' }, {
      label: 'Add', kind: 'primary', onClick: () => {
        const c = S.campaign(campSel.value);
        let enc;
        if (encSel.value === '__new') {
          const name = nameIn.value.trim();
          if (!name) { nameIn.focus(); return false; }
          enc = { id: S.uid(), name, creatures: [] };
          c.encounters.push(enc);
        } else enc = c.encounters.find(e => e.id === encSel.value);
        const n = Math.max(1, Math.min(50, parseInt(qty.value, 10) || 1));
        for (let i = 0; i < n; i++) enc.creatures.push(makeCreature(m, enc.creatures));
        c.selEnc = enc.id;
        S.get().activeCampaign = c.id;
        S.save();
        toast('Added ' + (n > 1 ? n + ' × ' : '') + m.name + ' to ' + enc.name);
        nav.rerender();
      },
    }],
  });
}
