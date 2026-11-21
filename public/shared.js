// Helpers shared by the tenant portal, centrix and the craftsman app.
export const $ = (id) => document.getElementById(id);

export async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABELS = {
  reported: 'Reported', offered: 'Offer waiting for tenant', awaiting_approval: 'Waiting for approval', approved: 'Approved, ready to book', ordered: 'Awaiting contractor confirmation',
  received: 'Sent to craftsman', accepted: 'Craftsman confirmed', scheduled: 'Scheduled', in_progress: 'Repair in progress',
  done: 'Repair done', invoiced: 'Closed, invoice received', rejected: 'Craftsman declined', cancelled: 'Cancelled', emergency: 'Emergency',
};
const OFFER_LABELS = { offered: 'Offer waiting for tenant', ordered: 'Order sent', received: 'Order sent', accepted: 'Contract signed', done: 'Service active', rejected: 'Declined' };
export const statusLabel = (s, kind) => (kind === 'offer' && OFFER_LABELS[s]) || LABELS[s] || s;

// Manifest field names in plain words, for consent texts.
const FIELD_WORDS = { tenant_name: 'your name', tenant_email: 'your email', tenant_phone: 'your phone number', address: 'your address', unit_label: 'which apartment', move_in_date: 'your move-in date', postcode: 'your postcode' };
export const fieldWords = (f) => FIELD_WORDS[f] || f.replaceAll('_', ' ');

export function fmtSlot(slot) {
  if (!slot) return '';
  const d = new Date(slot.start);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${day}, ${slot.start.slice(11, 16)}–${slot.end.slice(11, 16)}`;
}

export const fmtTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Live updates from centrix (Server-Sent Events).
export function onEvent(fn) {
  new EventSource('/api/events').onmessage = (e) => fn(JSON.parse(e.data));
}
