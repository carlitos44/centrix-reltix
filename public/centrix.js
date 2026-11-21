// centrix property-manager workspace: every repair case, the suggested next step, and the record it leaves on the unit.
import { $, api, esc, statusLabel, fmtSlot, fmtTime, onEvent } from './shared.js';

let selected = new URLSearchParams(location.search).get('case');
let st;

function nextStep(c) {
  if (c.status === 'awaiting_approval') {
    return `<div class="suggest"><strong>Suggested next step</strong><p>Approve ${esc(c.diagnosis.label)} with ${esc(c.partner_name)}, €${c.estimate.min_eur}–${c.estimate.max_eur}. It is above the owner's approval threshold, so the owner is informed.</p><button class="primary" data-approve="${c.id}">Approve and notify tenant</button></div>`;
  }
  if (c.kind === 'offer') {
    const t = { offered: 'Offer is in the tenant portal. Nothing to do: the tenant signs with one click.', ordered: 'Order sent to the partner. Waiting for the contract.', accepted: 'Contract signed and linked to the unit. Service starts on move-in day.', done: 'Service active. Closed.' }[c.status];
    return t ? `<div class="suggest"><strong>Next step</strong><p>${t}</p></div>` : '';
  }
  const text = {
    emergency: 'Emergency reported. Call the tenant now and alert the on-call service.',
    reported: 'The assistant is still talking to the tenant.',
    approved: 'Approved. Waiting for the tenant to pick a slot in the portal or on the call.',
    ordered: 'Order sent. Waiting for the craftsman to confirm.',
    accepted: 'Craftsman confirmed. Nothing to do.',
    in_progress: 'Repair in progress. Nothing to do.',
    done: 'Repair done. Waiting for the invoice.',
    invoiced: 'Closed. Invoice and report are on the unit record.',
    rejected: 'Craftsman declined. Pick another partner.',
  }[c.status];
  return text ? `<div class="suggest"><strong>Next step</strong><p>${text}</p></div>` : '';
}

const title = (c) => c.kind === 'offer' ? `Internet at move-in · ${c.offer?.product || `${c.offers.length} offers`}` : c.diagnosis?.label || c.description;

function renderList() {
  const cases = [...st.cases].reverse();
  $('cases').innerHTML = cases.length ? cases.map((c) => {
    const u = st.units.find((x) => x.id === c.unit_id);
    const t = st.contacts.find((x) => x.id === c.contact_id);
    const p = st.properties.find((x) => x.id === c.property_id);
    return `<button data-case="${c.id}" aria-current="${c.id === selected}"><span class="pill s-${c.status}">${statusLabel(c.status, c.kind)}</span>
      <strong>${esc(title(c))}</strong><span class="subtle">${esc(t.name)} · ${esc(u.label)}, ${esc(p.address.split(',')[0])}</span></button>`;
  }).join('') : '<p class="note">No cases yet. Report a problem in the tenant portal.</p>';
}

function renderDetail() {
  const c = st.cases.find((x) => x.id === selected);
  if (!c) return;
  const u = st.units.find((x) => x.id === c.unit_id);
  const p = st.properties.find((x) => x.id === c.property_id);
  const t = st.contacts.find((x) => x.id === c.contact_id);
  const docs = st.documents.filter((d) => d.case_id === c.id);
  const unitDocs = st.documents.filter((d) => d.unit_id === c.unit_id);
  const rows = (pairs) => `<dl>${pairs.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  $('detail').innerHTML = `
    <span class="pill s-${c.status}">${statusLabel(c.status, c.kind)}</span>
    <h2>${esc(title(c))}</h2>
    <p class="subtle">${c.id} · ${esc(t.name)} · ${esc(u.label)}, ${esc(p.address)} · ${c.trigger ? `triggered by ${esc(c.trigger.event)}` : `via ${esc(c.channel)}`}</p>
    ${nextStep(c)}
    ${c.kind === 'offer' ? `<section><h3>Offer from ${esc(c.partner_name)}</h3>${rows([
      ['Moment', `${c.trigger.event}, ${c.trigger.data.move_in_date || ''}`],
      ['Eligibility check', 'postcode and move-in date only, before any consent'],
      ['Offers', c.offers.map((o) => `${o.product} €${o.monthly_price_eur}/month`).join(' · ')],
      ['Chosen', c.offer && `${c.offer.product}, €${c.offer.monthly_price_eur}/month from ${c.offer.start}`],
    ])}</section>` : `<section><h3>Diagnosis and cost</h3>${rows([
      ['Tenant said', c.description], ['Summary', c.diagnosis?.summary], ['Urgency', c.diagnosis?.urgency],
      ['Craftsman', c.partner_name], ['Estimate', c.estimate && `€${c.estimate.min_eur}–${c.estimate.max_eur} (partner quote)`],
      ['Who pays', c.payment && `${c.payment.payer}: ${c.payment.reason}`],
      ['Approval', c.approval && `${c.approval.by}${c.approval.reason ? `, ${c.approval.reason}` : ''}`], ['Appointment', fmtSlot(c.slot)],
    ])}</section>`}
    ${c.consent ? `<section><h3>Data shared with the craftsman</h3>${rows([['Fields', c.consent.data_shared.join(', ')], ['Consent', `${fmtTime(c.consent.given_at)} via ${c.consent.channel}`], ['Access details', c.kind === 'offer' ? 'not shared, not needed for this service' : ['accepted', 'in_progress', 'done', 'invoiced'].includes(c.status) ? 'released after acceptance' : 'held back until the craftsman accepts']])}</section>` : ''}
    <section><h3>Timeline</h3><ol class="timeline">${c.history.map((h) => `<li><time>${fmtTime(h.at)}</time><span><strong>${statusLabel(h.status, c.kind)}</strong>${h.note ? ` · ${esc(h.note)}` : ''}</span></li>`).join('')}</ol></section>
    ${c.messages.length ? `<section><h3>Conversation</h3><div class="chat-log">${c.messages.map((m) => `<div class="msg ${m.from === 'tenant' ? 'user' : 'agent'}">${esc(m.text)}</div>`).join('')}</div></section>` : ''}
    ${docs.length ? `<section><h3>Documents from the craftsman</h3>${rows(docs.map((d) => [d.type.replace('_', ' '), `${d.name}${d.amount_eur ? ` · €${d.amount_eur}` : ''} · ${d.text || ''}`]))}</section>` : ''}
    <section><h3>Unit record · ${esc(u.label)}</h3>${rows([
      ['Building', `${p.address}, built ${p.building_year}, ${p.heating}`],
      ['Installations', Object.entries(p.installations).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : [v.make, v.model, v.installed].filter(Boolean).join(' ')}`).join(' · ')],
      ['Documents on unit', unitDocs.map((d) => d.name).join(', ') || 'none'],
    ])}</section>`;
}

async function refresh() {
  st = await api('GET', '/api/state');
  if (!selected && st.cases.length) selected = st.cases.at(-1).id;
  renderList();
  renderDetail();
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.case) { selected = b.dataset.case; renderList(); renderDetail(); }
  if (b.dataset.approve) { b.disabled = true; await api('POST', `/api/cases/${b.dataset.approve}/approve`, { by: 'Mira van Dijk (building manager)' }); }
  if (b.id === 'moveIn') {
    const r = await api('POST', '/api/trigger', { event: 'tenant.move_in', unit_id: 'unit_4b', data: { move_in_date: '2026-12-01' } });
    $('eventStatus').textContent = r.offers.length ? `${r.offers.length} partner(s) answered: ${r.offers.map((o) => o.partner_name).join(', ')}` : 'No partner covers this moment.';
    if (r.offers[0]) { selected = r.offers[0].id; refresh(); }
  }
  if (b.id === 'reset' && confirmReset()) { selected = null; await api('POST', '/api/reset', {}); refresh(); }
});

// Plain inline check instead of a browser confirm dialog.
function confirmReset() {
  const b = $('reset');
  if (b.dataset.armed) return true;
  b.dataset.armed = '1';
  b.textContent = 'Click again to reset';
  setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset demo'; }, 3000);
  return false;
}

onEvent(() => refresh().catch(console.error));
refresh();
