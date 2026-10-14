/* ═══════════════════════════════════════════════════════════
   escape.js — HTML-escaping helper for innerHTML templates.
   Usage: `<div>${escapeHtml(customer.name)}</div>` for any field a
   staff member typed into a form, before it goes into innerHTML.
   ═══════════════════════════════════════════════════════════ */
const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
