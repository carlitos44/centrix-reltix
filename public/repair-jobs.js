// Fictitious partner's app (craftsman or internet provider): reads its own jobs, reports status back through the connector.
// It shows exactly the fields reltix shared, so the data minimisation is visible.
import { $, api, esc, statusLabel, fmtSlot, onEvent } from './shared.js';

const { partners } = await api('GET', '/api/state');
let pid = new URLSearchParams(location.search).get('p') || 'p_heiz';
$('partner').innerHTML = partners.map((p) => `<option value="${p.id}"${p.id === pid ? ' selected' : ''}>${esc(p.name)} · ${esc(p.category)}</option>`).join('');
$('partner').onchange = () => { pid = $('partner').value; history.replaceState(null, '', `?p=${pid}`); render(); };

const LABELS = { tenant_name: 'Customer', tenant_phone: 'Phone', tenant_email: 'Email', address: 'Address', unit_label: 'Apartment', move_in_date: 'Move-in', postcode: 'Postcode' };

function actions(j, sell) {
  const btn = (status, label, primary = true) => `<button${primary ? ' class="primary"' : ''} data-status="${status}" data-job="${j.id}">${label}</button>`;
  if (sell) {
    if (j.status === 'received') return btn('accepted', 'Confirm contract') + btn('rejected', 'Decline', false);
    if (j.status === 'accepted') return btn('done', 'Line is active');
    return '';
  }
  if (j.status === 'received') return btn('accepted', 'Accept job') + btn('rejected', 'Decline', false);
  if (j.status === 'accepted') return btn('in_progress', 'Start repair');
  if (j.status === 'in_progress') return `<label for="note-${j.id}">What did you do?</label><textarea id="note-${j.id}">Replaced the worn part and tested. No further leak.</textarea>${btn('done', 'Mark as done')}`;
  if (j.status === 'done') return `<label for="amount-${j.id}">Invoice amount (€, incl. VAT)</label><input id="amount-${j.id}" type="number" min="0" value="${j.estimate?.max_eur ?? ''}">${btn('invoiced', 'Send invoice')}`;
  return '';
}

function fields(j) {
  const c = j.context || {};
  const out = [];
  if (j.slot) out.push(['When', fmtSlot(j.slot)]);
  if (j.offer) out.push(['Product', `${j.offer.product}, €${j.offer.monthly_price_eur}/month, from ${j.offer.start}`]);
  for (const [k, v] of Object.entries(c)) {
    if (k === 'diagnosis') out.push(['Problem', `${v.description}${v.summary ? ` · ${v.summary}` : ''}`]);
    else if (k === 'installations') { if (v.boiler) out.push(['Boiler', `${v.boiler.make} ${v.boiler.model}, ${v.boiler.installed}`]); }
    else out.push([LABELS[k] || k, typeof v === 'string' ? v : JSON.stringify(v)]);
  }
  if (j.estimate) out.push(['Your quote', `€${j.estimate.min_eur}–${j.estimate.max_eur}`]);
  if (!j.offer) out.push(['Access', j.access || 'Shown after you accept']);
  return out;
}

async function render() {
  const p = partners.find((x) => x.id === pid);
  const sell = p.mode === 'sell';
  $('name').textContent = sell ? 'Orders' : 'Jobs';
  const jobs = (await api('GET', `/mock/${pid}/jobs`)).reverse();
  $('jobs').innerHTML = jobs.length ? jobs.map((j) => `<article class="job"><span class="pill s-${j.status}">${statusLabel(j.status, j.offer && 'offer')}</span>
      <h3>${esc(j.offer ? `New ${j.offer.product} order` : j.context?.diagnosis?.label || 'Repair job')}</h3>
      <dl>${fields(j).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="row">${actions(j, sell)}</div></article>`).join('') : `<p class="note">No ${sell ? 'orders' : 'jobs'} yet.</p>`;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-status]');
  if (!b) return;
  b.disabled = true;
  const id = b.dataset.job;
  await api('POST', `/mock/${pid}/jobs/${id}/status`, {
    status: b.dataset.status,
    note: $(`note-${id}`)?.value,
    amount_eur: $(`amount-${id}`)?.value,
  }).catch((err) => b.insertAdjacentText('afterend', ` ${err.message}`));
  render();
});

onEvent((ev) => { if (ev.partner_id === pid || ev.type === 'system.reset') render().catch(console.error); });
render();
