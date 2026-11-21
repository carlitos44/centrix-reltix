// Fictitious craftsmen: stands in for each partner's own system. It implements the connector endpoints
// from partners/*.json and reports back only through the centrix status webhook.
import { readFile } from 'node:fs/promises';
import { db, save, HttpError, unitContext, partners } from './centrix.mjs';

const rates = JSON.parse(await readFile(new URL('../data/mock-partners.json', import.meta.url), 'utf8'));
const WINDOWS = [[8, 10], [10, 12], [14, 16]];

function rate(pid) {
  if (!rates[pid]) throw new HttpError(404, `mock partner ${pid} not found`);
  return rates[pid];
}

export function quote(pid, { job, event, context } = {}) {
  const r0 = rate(pid);
  // Sales partner (internet): eligibility by postcode, offers start on move-in day.
  if (r0.offers) {
    const eligible = r0.fibre_postcodes.includes(context?.postcode);
    return { eligible, offers: eligible ? r0.offers.map((o) => ({ ...o, start: context.move_in_date })) : [], reason: eligible ? `fibre available, triggered by ${event}` : 'no fibre at this address' };
  }
  if (!job?.hours || !job?.parts_eur) throw new HttpError(400, 'job {hours, parts_eur} required');
  const r = rate(pid);
  const price = (i) => Math.round(r.callout_eur + r.hourly_eur * job.hours[i] + job.parts_eur[i]);
  const valid = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  return { min_eur: price(0), max_eur: price(1), currency: 'EUR', includes: 'call-out, labour, typical parts, incl. 19% VAT', valid_until: valid };
}

// Next 4 free 2-hour windows on working days, local time (Europe/Berlin assumed).
export function slots(pid) {
  const windows = rate(pid).windows || WINDOWS;
  const taken = new Set(db.mock_partner_jobs.filter((j) => j.partner_id === pid && !['rejected', 'cancelled'].includes(j.status)).map((j) => j.slot?.start));
  const out = [];
  for (let i = 1; out.length < 4 && i < 14; i++) {
    const day = new Date(Date.now() + i * 864e5);
    if ([0, 6].includes(day.getDay())) continue;
    const ymd = day.toLocaleDateString('sv-SE');
    for (const [a, b] of windows) {
      const s = { start: `${ymd}T${String(a).padStart(2, '0')}:00`, end: `${ymd}T${String(b).padStart(2, '0')}:00` };
      if (!taken.has(s.start) && out.length < 4) out.push(s);
    }
  }
  return out;
}

export async function order(pid, { case_id, slot, offer, context, estimate, status_webhook, idempotency_key } = {}) {
  rate(pid);
  if (!case_id || !status_webhook || !(slot || offer)) throw new HttpError(400, 'case_id, status_webhook and a slot or offer required');
  const existing = db.mock_partner_jobs.find(job =>
    (slot && job.slot && job.case_id === case_id && !['rejected','cancelled'].includes(job.status)) ||
    (idempotency_key && job.partner_id === pid && job.idempotency_key === idempotency_key)
  );
  if (existing) {
    const sameSelection = slot
      ? existing.slot?.start === slot.start && existing.slot?.end === slot.end
      : existing.offer?.id === offer?.id;
    if (existing.partner_id !== pid || existing.case_id !== case_id || !sameSelection) {
      throw new HttpError(409, 'Order key was already used for a different booking.');
    }
    return { order_id: existing.id, status: existing.status };
  }
  if (slot && !slots(pid).some(window => window.start === slot.start && window.end === slot.end)) {
    throw new HttpError(409, 'That appointment is no longer available. Choose another offered slot.');
  }
  const nextJobNumber = db.mock_partner_jobs.reduce((max, job) => Math.max(max, Number(job.id.slice(4)) || 0), 0) + 1;
  const job = { id: `job_${nextJobNumber}`, partner_id: pid, case_id, idempotency_key, slot, offer, context, estimate, status_webhook, status: slot ? 'accepted' : 'received', received_at: new Date().toISOString() };
  const partner = partners.find(item => item.id === pid);
  if (slot && partner?.data_after_acceptance?.access) {
    const repair = db.cases.find(item => item.id === case_id);
    if (repair) job.access = unitContext(repair.unit_id).unit.access;
  }
  db.mock_partner_jobs.push(job);
  await save();
  return { order_id: job.id, status: job.status };
}

export const jobs = (pid) => (rate(pid), db.mock_partner_jobs.filter((j) => j.partner_id === pid));

// Partner taps a button in its app: update own job, then report to centrix.
export async function updateJob(pid, jobId, { status, note, amount_eur } = {}) {
  const job = jobs(pid).find((j) => j.id === jobId);
  if (!job) throw new HttpError(404, `job ${jobId} not found`);
  const documents = [];
  if (job.offer) {
    if (status === 'accepted') documents.push({ type: 'contract', name: `${job.offer.product} contract ${job.id}`, amount_eur: job.offer.monthly_price_eur, text: `${job.offer.product}, €${job.offer.monthly_price_eur}/month, ${job.offer.min_term_months} months, active from ${job.offer.start}` });
  } else if (status === 'done') documents.push({ type: 'repair_report', name: `Repair report ${job.id}`, text: note || 'Repair completed.' });
  if (status === 'invoiced' && !job.offer) {
    const amount = Math.round(+amount_eur || job.estimate?.max_eur || 0);
    documents.push({ type: 'invoice', name: `Invoice ${job.id}`, amount_eur: amount, text: `${job.context?.diagnosis?.label || 'Repair'}: €${amount} incl. VAT` });
  }
  const res = await fetch(job.status_webhook, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ order_id: job.id, event_id: job.id+'_'+status, status, note, documents }),
  });
  const reply = await res.json();
  if (!res.ok) throw new HttpError(res.status, reply.error || 'centrix rejected the status');
  job.status = status;
  if (reply.access) job.access = reply.access;
  await save();
  return job;
}
