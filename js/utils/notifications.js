/* ═══════════════════════════════════════════════════════════
   notifications.js — Toast & Modal Utilities
   ═══════════════════════════════════════════════════════════ */
const Notify = (() => {
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  const toast = (title, message='', type='info', duration=3500) => {
    const container = document.getElementById('toast-container');
    if(!container) return;

    const el = document.createElement('div');
    el.className = `toast ${type} animate-slide`;
    el.innerHTML = `
      <div class="toast-icon ${type}">${icons[type]||icons.info}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
    `;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, duration);
  };

  const success = (title, msg, dur) => toast(title, msg, 'success', dur);
  const error   = (title, msg, dur) => toast(title, msg, 'error', 5000);
  const warning = (title, msg, dur) => toast(title, msg, 'warning', dur);
  const info    = (title, msg, dur) => toast(title, msg, 'info', dur);

  /* ── Sound ── */
  const beep = (freq=800, dur=100, vol=0.3) => {
    const settings = DB.getSettings();
    if(!settings.soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.start(); osc.stop(ctx.currentTime + dur/1000);
    } catch(e) {}
  };
  const soundNewOrder = () => { beep(880,80); setTimeout(()=>beep(1100,120),120); };
  const soundSuccess  = () => { beep(660,80); setTimeout(()=>beep(880,150),100); };
  const soundError    = () => { beep(300,200,0.4); };

  /* ── Confirm Dialog ── */
  const confirm = (title, message, opts={}) => {
    return new Promise(resolve => {
      const {
        confirmText='Confirmar', cancelText='Cancelar',
        confirmClass='btn-primary', icon='⚠️'
      } = opts;
      PizzaPos.ui.showModal(`
        <div class="modal-header"><div class="modal-title">${icon} ${title}</div></div>
        <div class="modal-body"><p style="color:var(--text-secondary)">${message}</p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal();window._confirmResolve(false)">${cancelText}</button>
          <button class="btn ${confirmClass}" onclick="PizzaPos.ui.closeModal();window._confirmResolve(true)">${confirmText}</button>
        </div>
      `);
      window._confirmResolve = resolve;
    });
  };

  /* ── Prompt Dialog ── */
  const prompt = (title, placeholder='', defaultVal='') => {
    return new Promise(resolve => {
      PizzaPos.ui.showModal(`
        <div class="modal-header"><div class="modal-title">${title}</div></div>
        <div class="modal-body">
          <input id="prompt-input" class="form-control" placeholder="${placeholder}" value="${defaultVal}" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="PizzaPos.ui.closeModal();window._promptResolve(null)">Cancelar</button>
          <button class="btn btn-primary" onclick="PizzaPos.ui.closeModal();window._promptResolve(document.getElementById('prompt-input').value)">Aceptar</button>
        </div>
      `);
      setTimeout(() => document.getElementById('prompt-input')?.focus(), 50);
      window._promptResolve = resolve;
    });
  };

  return { toast, success, error, warning, info, beep, soundNewOrder, soundSuccess, soundError, confirm, prompt };
})();
