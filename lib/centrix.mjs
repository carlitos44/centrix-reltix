// centrix stand-in: one JSON file, an event log and the repair-case logic.
// Partners are reached only through the endpoints in their manifest (partners/*.json).
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';

const DB = process.env.CENTRIX_DB || 'data/db.json';
export const bus = new EventEmitter();
export const config = { origin: 'http://localhost:5174' };
export const JOB_STATES = ['received', 'accepted', 'scheduled', 'in_progress', 'done', 'invoiced', 'rejected', 'cancelled'];
export let db;
export let partners = [];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const now = () => new Date().toISOString();
function find(list, id, what) {
  const x = list.find((i) => i.id === id);
  if (!x) throw new HttpError(404, `${what} ${id} not found`);
  return x;
}
const partnerById = (id) => find(partners, id, 'partner');

export async function load(reset = false) {
  db = JSON.parse(await readFile(!reset && existsSync(DB) ? DB : 'data/seed.json', 'utf8'));
  const files = (await readdir('partners')).filter((f) => f.endsWith('.json'));
  partners = await Promise.all(files.map(async (f) => JSON.parse(await readFile(`partners/${f}`, 'utf8'))));
  await save();
}

// shortcut: rewrites the whole file on every change; fine for one demo process, use a real DB in production.
export const save = () => writeFile(DB, JSON.stringify(db, null, 2));

export function emit(type, data = {}) {
  const ev = { id: `ev_${db.events.length + 1}`, type, at: now(), ...data };
  db.events.push(ev);
  bus.emit('event', ev);
  return ev;
}

function setStatus(c, status, note) {
  c.status = status;
  c.history.push({ status, note, at: now() });
}

export function unitContext(unitId) {
  const unit = find(db.units, unitId, 'unit');
  const property = find(db.properties, unit.property_id, 'property');
  const tenant = find(db.contacts, unit.tenant_id, 'contact');
  const lease = find(db.leases, unit.lease_id, 'lease');
  const open_cases = db.cases.filter((c) => c.unit_id === unitId && !c.closed_at);
  return { unit, property, tenant, lease, open_cases };
}

export async function createCase({ unit_id, channel = 'portal', description }) {
  if (!description) throw new HttpError(400, 'description required');
  const { unit } = unitContext(unit_id);
  const c = {
    id: `case_${db.cases.length + 1}`, unit_id, property_id: unit.property_id, contact_id: unit.tenant_id,
    channel, description: String(description).slice(0, 2000), created_at: now(), history: [], messages: [],
  };
  setStatus(c, 'reported', `via ${channel}`);
  db.cases.push(c);
  emit('case.reported', { case_id: c.id, unit_id });
  await save();
  return c;
}

// Chat or voice transcript lines, so every channel shares the same case context.
export async function addMessage(caseId, { from, text, channel }) {
  if (!from || !text) throw new HttpError(400, 'from and text required');
  const c = find(db.cases, caseId, 'case');
  const m = { from, text: String(text).slice(0, 2000), channel: channel || c.channel, at: now() };
  c.messages.push(m);
  emit('case.message', { case_id: c.id, unit_id: c.unit_id, from });
  await save();
  return m;
}

export const matchPartner = (trade, postcode) => partners
  .filter((p) => p.triggers?.includes('case.diagnosed') && p.trades?.includes(trade) && p.service_area?.postcode_prefixes.some((x) => postcode.startsWith(x)))
  .sort((a, b) => b.framework_contract - a.framework_contract || b.rating - a.rating)[0];

// German rental law: the landlord pays repairs (§ 535 BGB). A valid small-repair clause makes the tenant pay
// items in their direct access up to the per-item cap; above the cap the landlord pays all of it.
export function whoPays(job, lease, estimate, tenantCaused) {
  if (tenantCaused) return { payer: 'tenant', reason: 'Damage caused by the tenant (craftsman confirms on site)' };
  const k = lease.kleinreparatur;
  if (k && job.kleinreparatur && estimate.max_eur <= k.max_per_item_eur) {
    return { payer: 'tenant', reason: `Small-repair clause in the lease (up to €${k.max_per_item_eur} per item)` };
  }
  return { payer: 'landlord', reason: "Demo policy routes this repair to the owner" };
}

const bookingsInFlight = new Set();

function assertDiagnosisEditable(repair) {
  if (repair.order_id || bookingsInFlight.has(repair.id) || repair.closed_at) {
    throw new HttpError(409, 'This case already has a booking or is closed. Keep the existing appointment.');
  }
}

export async function diagnose(caseId, { job_type, urgency = 'normal', summary = '', tenant_caused = false }) {
  const c = find(db.cases, caseId, 'case');
  assertDiagnosisEditable(c);
  if (urgency === 'emergency') {
    c.diagnosis = { urgency, summary };
    setStatus(c, 'emergency', 'safety instructions given, no booking');
    emit('case.emergency', { case_id: c.id, unit_id: c.unit_id });
    await save();
    return c;
  }
  const job = db.job_catalogue[job_type];
  if (!job) throw new HttpError(400, `unknown job_type "${job_type}"; use one of: ${Object.keys(db.job_catalogue).join(', ')}`);
  const { property, lease } = unitContext(c.unit_id);
  const partner = matchPartner(job.trade, property.postcode);
  if (!partner) throw new HttpError(409, `no partner for ${job.trade} in ${property.postcode}`);
  const estimate = await call(partner, 'quote', { body: { job_type, job } });
  assertDiagnosisEditable(c);
  const payment = whoPays(job, lease, estimate, !!tenant_caused);
  const threshold = db.owner_rules[property.owner_id]?.approval_threshold_eur ?? 0;
  const needsApproval = payment.payer === 'landlord' && estimate.max_eur > threshold;
  Object.assign(c, {
    diagnosis: { job_type, trade: job.trade, label: job.label, urgency, summary, tenant_caused: !!tenant_caused },
    partner_id: partner.id, partner_name: partner.name, estimate, payment,
    approval: needsApproval ? null : {
      by: 'rule', at: now(),
      reason: payment.payer === 'tenant' ? 'tenant pays and confirms at booking' : `under owner threshold €${threshold}`,
    },
  });
  setStatus(c, needsApproval ? 'awaiting_approval' : 'approved', `${job.label} → ${partner.name}, €${estimate.min_eur}-${estimate.max_eur}`);
  emit('case.diagnosed', { case_id: c.id, unit_id: c.unit_id, partner_id: partner.id });
  await save();
  return c;
}

export async function approve(caseId, { by = 'property_manager' } = {}) {
  const c = find(db.cases, caseId, 'case');
  if (c.status !== 'awaiting_approval') throw new HttpError(409, `case is ${c.status}, not awaiting_approval`);
  c.approval = { by, at: now() };
  setStatus(c, 'approved', `approved by ${by}`);
  emit('case.approved', { case_id: c.id, unit_id: c.unit_id });
  await save();
  return c;
}

export async function slots(caseId) {
  const c = find(db.cases, caseId, 'case');
  if (!c.partner_id) throw new HttpError(409, 'case has no partner yet: diagnose first');
  return call(partnerById(c.partner_id), 'slots', { query: { job_type: c.diagnosis.job_type } });
}

export function bookingDisclosure(caseId) {
  const c = find(db.cases, caseId, 'case');
  const partner = partnerById(c.partner_id);
  const shared = pick(shareable(c, unitContext(c.unit_id)), partner.data_needed);
  return { contractor: partner.name, fields: Object.keys(shared), after_acceptance: Object.keys(partner.data_after_acceptance || {}) };
}

export async function book(caseId, { slot, channel = 'portal', consent_given } = {}) {
  const c = find(db.cases, caseId, 'case');
  if (c.status !== 'approved') throw new HttpError(409, `case is ${c.status}, must be approved before booking`);
  if (!slot?.start || !slot?.end) throw new HttpError(400, 'slot {start, end} required');
  if (consent_given !== true) throw new HttpError(400, 'Explicit permission to share the repair details and book the visit is required.');
  if (bookingsInFlight.has(caseId)) throw new HttpError(409, 'A booking is already being processed for this case.');
  bookingsInFlight.add(caseId);
  try {
    return await placeOrder(c, partnerById(c.partner_id), { slot, estimate: c.estimate }, channel, slot.start);
  } finally {
    bookingsInFlight.delete(caseId);
  }
}

// Everything centrix may share, by field name. A partner only ever gets the names in its manifest.
function shareable(c, ctx, data = {}) {
  return {
    tenant_name: ctx.tenant.name, tenant_phone: ctx.tenant.phone, tenant_email: ctx.tenant.email,
    address: ctx.property.address, postcode: ctx.property.postcode, unit_label: ctx.unit.label,
    move_in_date: data.move_in_date || ctx.tenant.move_in, meters: ctx.unit.meters,
    diagnosis: c.diagnosis && { ...c.diagnosis, description: c.description }, installations: ctx.property.installations,
  };
}
const pick = (all, fields) => Object.fromEntries(Object.keys(fields || {}).filter((k) => all[k] !== undefined).map((k) => [k, all[k]]));

// Data minimisation: the partner gets only the fields its manifest asks for, and the consent record lists them.
async function placeOrder(c, partner, extra, channel, note) {
  const shared = pick(shareable(c, unitContext(c.unit_id), c.trigger?.data), partner.data_needed);
  const consent = { data_shared: Object.keys(shared), given_at: now(), channel, contractor: partner.name, after_acceptance: extra.slot ? Object.keys(partner.data_after_acceptance || {}) : [] };
  const order = await call(partner, 'orders', {
    body: { case_id: c.id, idempotency_key: c.id, ...extra, context: shared, status_webhook: new URL('/connector/status', config.origin).href },
  });
  Object.assign(c, { ...extra, order_id: order.order_id, consent });
  setStatus(c, 'ordered', `${partner.name}${note ? `, ${note}` : ''}`);
  if (extra.slot && order.status === 'accepted') {
    setStatus(c, 'accepted', 'Appointment automatically confirmed by the demo contractor.');
  }
  emit('order.placed', { case_id: c.id, unit_id: c.unit_id, partner_id: partner.id, order_id: order.order_id });
  await save();
  return c;
}

export const TRIGGERS = ['tenant.move_in', 'tenant.move_out', 'contract.expiring', 'case.reported'];

// A centrix event (e.g. a move-in). Every partner whose manifest subscribes to it and covers the postcode is asked
// for offers, with only its eligibility fields. Each answer becomes an offer case the tenant accepts in one click.
export async function trigger({ event, unit_id, data = {} } = {}) {
  if (!TRIGGERS.includes(event)) throw new HttpError(400, `event must be one of: ${TRIGGERS.join(', ')}`);
  const ctx = unitContext(unit_id);
  const ev = emit(event, { unit_id, contact_id: ctx.tenant.id, data });
  const offers = [];
  for (const p of partners.filter((x) => x.triggers?.includes(event) && x.mode === 'sell' && x.service_area?.postcode_prefixes.some((pre) => ctx.property.postcode.startsWith(pre)))) {
    const c = { id: `case_${db.cases.length + 1}`, kind: 'offer', unit_id, property_id: ctx.property.id, contact_id: ctx.tenant.id, channel: 'portal', created_at: now(), history: [], messages: [], partner_id: p.id, partner_name: p.name, category: p.category, trigger: { event, event_id: ev.id, data } };
    const quote = await call(p, 'quote', { body: { event, context: pick(shareable(c, ctx, data), p.eligibility_fields) } });
    if (!quote.eligible || !quote.offers?.length) continue;
    Object.assign(c, { description: `${p.category} for ${event.replace('tenant.', '').replace('_', '-')}`, offers: quote.offers });
    setStatus(c, 'offered', `${quote.offers.length} offer(s) from ${p.name}`);
    db.cases.push(c);
    emit('case.offered', { case_id: c.id, unit_id, partner_id: p.id });
    offers.push(c);
  }
  await save();
  return { event: ev, offers };
}

export async function acceptOffer(caseId, { offer_id, channel = 'portal' } = {}) {
  const c = find(db.cases, caseId, 'case');
  if (c.status !== 'offered') throw new HttpError(409, `case is ${c.status}, not offered`);
  const offer = c.offers.find((o) => o.id === offer_id);
  if (!offer) throw new HttpError(400, `offer ${offer_id} not in this case`);
  return placeOrder(c, partnerById(c.partner_id), { offer }, channel, offer.product);
}

// Status webhook every partner calls. Access details are released only once the partner accepts.
export async function partnerStatus({ order_id, status, note, documents = [], event_id } = {}) {
  if (!JOB_STATES.includes(status)) throw new HttpError(400, `status must be one of: ${JOB_STATES.join(', ')}`);
  const c = db.cases.find((x) => x.order_id === order_id);
  if (!c) throw new HttpError(404, `order ${order_id} not found`);
  const partner = partnerById(c.partner_id);
  const releaseAccess = status === 'accepted' && partner.data_after_acceptance?.access;
  const reply = { ok: true, access: releaseAccess ? unitContext(c.unit_id).unit.access : undefined };
  if (event_id) {
    if (typeof event_id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(event_id) || ['__proto__','constructor','prototype'].includes(event_id)) throw new HttpError(400, 'Invalid event ID.');
    c.partner_events ??= {};
    const fingerprint = JSON.stringify([status,note,documents]);
    if (Object.hasOwn(c.partner_events,event_id)) {
      if (c.partner_events[event_id] !== fingerprint) throw new HttpError(409, 'Event ID was already used for a different update.');
      return reply;
    }
    c.partner_events[event_id] = fingerprint;
  }
  setStatus(c, status, note);
  for (const d of documents) {
    db.documents.push({ id: `doc_${db.documents.length + 1}`, unit_id: c.unit_id, case_id: c.id, type: d.type, name: d.name, amount_eur: d.amount_eur, text: d.text, at: now() });
  }
  // A sold service is finished when it is active ("done"); a delivered job when it is invoiced.
  if (['invoiced', 'rejected', 'cancelled'].includes(status) || (partner.mode === 'sell' && status === 'done')) c.closed_at = now();
  emit(`job.${status}`, { case_id: c.id, unit_id: c.unit_id, partner_id: c.partner_id });
  await save();
  return reply;
}

async function call(partner, op, { body, query } = {}) {
  const url = new URL(partner.endpoints[op], config.origin);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const options = { signal: AbortSignal.timeout(8000) };
  if (body) Object.assign(options,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  let res;
  try { res = await fetch(url,options); }
  catch (error) {
    if (error.name==='TimeoutError') {
      throw new HttpError(504,op==='orders'
        ? 'Contractor response timed out. Retry the same slot before requesting a different one.'
        : 'The contractor did not respond in time. Try again.');
    }
    throw new HttpError(502,'Could not reach the contractor.');
  }
  if (res.status === 409) {
    const reply = await res.json();
    throw new HttpError(409, reply.error || 'The contractor could not reserve this slot.');
  }
  if (!res.ok) throw new HttpError(502, `partner ${partner.id} ${op} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
