// Small DOM helpers: element builder, modal popups, toast, confirm.
export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (k === 'style') n.style.cssText = v;
      else if (k in n && typeof v !== 'string') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
}

export const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

let modalCount = 0;
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
  const close = () => {
    document.removeEventListener('keydown', onKey);
    back.remove();
    modalCount--;
    if (!modalCount) document.body.classList.remove('no-scroll');
    onClose && onClose();
  };
  const onKey = e => { if (e.key === 'Escape' && back === [...document.querySelectorAll('.modal-back')].pop()) close(); };
  const head = el('div', { class: 'modal-head' }, el('h2', { text: title || '' }),
    el('button', { class: 'icon-btn', 'aria-label': 'Close', text: '✕', on: { click: close } }));
  const foot = actions.length ? el('div', { class: 'modal-foot' }, actions.map(a =>
    el('button', {
      class: 'btn ' + (a.kind || ''), text: a.label,
      on: { click: () => { const r = a.onClick ? a.onClick(close) : undefined; if (!a.keepOpen && r !== false) close(); } },
    }))) : null;
  box.append(head, el('div', { class: 'modal-body' }, body), foot);
  back.append(box);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  document.body.classList.add('no-scroll');
  modalCount++;
  const first = box.querySelector('input:not([type=checkbox]),select,textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, box };
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

export function confirmBox(message, okLabel = 'Delete') {
  return new Promise(res => {
    let done = false;
    const finish = v => { if (!done) { done = true; res(v); } };
    modal({
      title: 'Are you sure?', body: el('p', { text: message }),
      actions: [{ label: 'Cancel', onClick: () => finish(false) }, { label: okLabel, kind: 'danger', onClick: () => finish(true) }],
      onClose: () => finish(false),
    });
  });
}

// One-field popup (e.g. "name your encounter"). onSubmit(value) may return false to keep it open.
export function promptName({ title, label, value = '', okLabel = 'Save', onSubmit, extra, extraActions = [] }) {
  const input = el('input', { type: 'text', value, maxLength: 60, placeholder: label, 'aria-label': label });
  const body = el('div', { class: 'form' }, el('label', null, label, input), extra);
  const submit = close => {
    const v = input.value.trim();
    if (!v) { input.focus(); return false; }
    return onSubmit(v, close);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clickPrimary(); } });
  return modal({ title, body, actions: [...extraActions, { label: 'Cancel' }, { label: okLabel, kind: 'primary', onClick: submit }] });
}

export const fmtNum = n => n.toLocaleString('en-US');
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Press the primary button of the topmost popup (used for Enter-to-submit).
export function clickPrimary() {
  const m = [...document.querySelectorAll('.modal-back')].pop();
  const b = m && m.querySelector('.btn.primary');
  b && b.click();
}
