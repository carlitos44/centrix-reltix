// End-to-end check: report → diagnosis → approval → slots → booking → partner accepts → done → invoice on the unit.
// Usage: npm test   (starts its own server on port 5199 with a temporary DB file)
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const PORT = 5199;
const base = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['server.mjs'], {
  env: { ...process.env, PORT, CENTRIX_DB: join(tmpdir(), `centrix-test-${Date.now()}.json`) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok) => server.stdout.once('data', ok));

async function api(method, path, body) {
  const res = await fetch(base + path, body ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { method });
  const data = await res.json();
  return { status: res.status, data };
}
const ok = async (...a) => { const r = await api(...a); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };

try {
  await ok('POST', '/api/reset', {});

  // 1. Leak under the sink: plumbing, landlord pays (no small-repair item), under €500 → auto-approved.
  const ctx = await ok('GET', '/api/units/unit_4b/context');
  assert.equal(ctx.tenant.name, 'Alex Rivera');
  let c = await ok('POST', '/api/cases', { unit_id: 'unit_4b', channel: 'voice', description: 'Kitchen sink leaking under the cabinet' });
  await ok('POST', `/api/cases/${c.id}/messages`, { from: 'tenant', text: 'It drips from the pipe under the sink.' });
  c = await ok('POST', `/api/cases/${c.id}/diagnosis`, { job_type: 'leak_sink_trap', summary: 'Loose or worn sink trap seal' });
  assert.equal(c.status, 'approved');
  assert.equal(c.partner_id, 'p_heiz', 'framework partner preferred');
  assert.equal(c.payment.payer, 'landlord');
  assert.ok(c.estimate.min_eur < c.estimate.max_eur);

  const slots = await ok('GET', `/api/cases/${c.id}/slots`);
  assert.equal(slots.length, 4);
  const disclosure=await ok('GET', `/api/cases/${c.id}/booking-disclosure`);
  assert.equal(disclosure.contractor,'Heizung Müller GmbH');
  assert.ok(disclosure.fields.includes('tenant_phone'));
  assert.deepEqual(disclosure.after_acceptance,['access']);
  assert.equal((await api('POST', `/api/cases/${c.id}/book`, {slot:slots[0]})).status,400);
  const competing = await Promise.all(slots.slice(0,2).map(slot =>
    api('POST', `/api/cases/${c.id}/book`, { slot, channel:'voice', consent_given:true })
  ));
  assert.deepEqual(competing.map(result=>result.status).sort(),[200,409]);
  c = competing.find(result=>result.status===200).data;
  assert.equal(c.status, 'accepted');
  assert.deepEqual(c.consent.data_shared, ['tenant_name', 'tenant_phone', 'address', 'unit_label', 'diagnosis', 'installations']);

  // The demo partner accepts repairs immediately and releases access with confirmation.
  const [job] = await ok('GET', '/mock/p_heiz/jobs');
  assert.equal(job.case_id, c.id);
  assert.equal(job.status, 'accepted');
  const repeatOrder = await ok('POST', '/mock/p_heiz/orders', {
    idempotency_key:c.id, case_id:c.id, slot:c.slot, status_webhook:base+'/connector/status'
  });
  assert.equal(repeatOrder.order_id,job.id);
  const legacyReplay=await ok('POST','/mock/p_heiz/orders',{
    case_id:c.id,slot:c.slot,status_webhook:base+'/connector/status'
  });
  assert.equal(legacyReplay.order_id,job.id);
  assert.equal((await api('POST',`/api/cases/${c.id}/diagnosis`,{job_type:'radiator_cold'})).status,409);
  assert.equal((await api('POST',`/api/cases/${c.id}/book`,{slot:slots[2],consent_given:true})).status,409);
  assert.equal((await ok('GET','/mock/p_heiz/jobs')).length,1);
  assert.match(job.access, /Key safe/);
  assert.ok(!(await ok('GET', `/api/cases/${c.id}/slots`)).some(slot=>slot.start===c.slot.start), 'booked slot no longer offered');
  await ok('POST', `/mock/p_heiz/jobs/${job.id}/status`, { status: 'done', note: 'Replaced trap seal, no further leak.' });
  await ok('POST', `/mock/p_heiz/jobs/${job.id}/status`, { status: 'invoiced', amount_eur: 128 });

  await ok('POST', `/mock/p_heiz/jobs/${job.id}/status`, { status: 'invoiced', amount_eur: 128 });
  assert.equal((await api('POST', `/mock/p_heiz/jobs/${job.id}/status`, {status:'invoiced',amount_eur:129})).status,409);
  const st = await ok('GET', '/api/state');
  const done = st.cases.find((x) => x.id === c.id);
  assert.equal(done.status, 'invoiced');
  assert.ok(done.closed_at);
  const docs = st.documents.filter((d) => d.unit_id === 'unit_4b').map((d) => d.type);
  assert.deepEqual(docs, ['repair_report', 'invoice']);

  // 2. Dripping tap: small-repair clause → tenant pays, no owner approval.
  let tap = await ok('POST', '/api/cases', { unit_id: 'unit_4b', description: 'Bathroom tap drips' });
  tap = await ok('POST', `/api/cases/${tap.id}/diagnosis`, { job_type: 'tap_dripping' });
  assert.equal(tap.payment.payer, 'tenant');
  assert.equal(tap.status, 'approved');

  // Same job without a small-repair clause in the lease → landlord pays.
  let tap2 = await ok('POST', '/api/cases', { unit_id: 'unit_2a', description: 'Kitchen tap drips' });
  tap2 = await ok('POST', `/api/cases/${tap2.id}/diagnosis`, { job_type: 'tap_dripping' });
  assert.equal(tap2.payment.payer, 'landlord');

  // 3. Boiler failure: estimate above the €500 threshold → manager must approve before booking.
  let heat = await ok('POST', '/api/cases', { unit_id: 'unit_3a', description: 'No heating, radiators cold' });
  heat = await ok('POST', `/api/cases/${heat.id}/diagnosis`, { job_type: 'no_heating_boiler', urgency: 'urgent' });
  assert.equal(heat.status, 'awaiting_approval');
  const early = await api('POST', `/api/cases/${heat.id}/book`, { slot: slots[1] });
  assert.equal(early.status, 409, 'booking blocked before approval');
  heat = await ok('POST', `/api/cases/${heat.id}/approve`, {});
  assert.equal(heat.status, 'approved');

  // Same diagnosis, same connector, two heating partners selected by coverage.
  for (const {unit,partner,startHour} of [
    {unit:'unit_4b',partner:'p_heiz',startHour:'10:00'},
    {unit:'unit_01',partner:'p_maas_heat',startHour:'09:00'}
  ]) {
    let repair = await ok('POST','/api/cases',{unit_id:unit,description:'A radiator is cold'});
    repair = await ok('POST',`/api/cases/${repair.id}/diagnosis`,{job_type:'radiator_cold',summary:'Radiator valve inspection'});
    assert.equal(repair.partner_id,partner);
    const disclosure = await ok('GET',`/api/cases/${repair.id}/booking-disclosure`);
    assert.equal(disclosure.contractor,repair.partner_name);
    const [slot] = await ok('GET',`/api/cases/${repair.id}/slots`);
    assert.ok(slot.start.endsWith(startHour));
    repair = await ok('POST',`/api/cases/${repair.id}/book`,{slot,consent_given:true});
    assert.equal(repair.status,'accepted');
    const queue = await ok('GET',`/mock/${partner}/jobs`);
    const job = queue.find(item=>item.case_id===repair.id);
    assert.ok(job);
    if (partner==='p_maas_heat') {
      assert.equal(job.context.installations,undefined);
      assert.equal(job.access,undefined);
    }
    await ok('POST',`/mock/${partner}/jobs/${job.id}/status`,{status:'done',note:'Replaced the valve and restored heating.'});
    await ok('POST',`/mock/${partner}/jobs/${job.id}/status`,{status:'invoiced',amount_eur:125});
    const result = await ok('GET','/api/state');
    assert.equal(result.cases.find(item=>item.id===repair.id).status,'invoiced');
    assert.deepEqual(result.documents.filter(doc=>doc.case_id===repair.id).map(doc=>doc.type),['repair_report','invoice']);
  }
  console.log('Same heating repair reached completion and invoice through both partner manifests.');

  // 4. Emergency: no booking flow.
  let gas = await ok('POST', '/api/cases', { unit_id: 'unit_01', description: 'Smells of gas in the hallway' });
  gas = await ok('POST', `/api/cases/${gas.id}/diagnosis`, { urgency: 'emergency', summary: 'Possible gas leak' });
  assert.equal(gas.status, 'emergency');

  // 5. Move-in → internet: a second partner type, plugged in by manifest only.
  const trig = await ok('POST', '/api/trigger', { event: 'tenant.move_in', unit_id: 'unit_4b', data: { move_in_date: '2026-12-01' } });
  assert.equal(trig.offers.length, 1);
  let offer = trig.offers[0];
  assert.equal(offer.partner_id, 'p_fibre');
  assert.equal(offer.status, 'offered');
  assert.equal(offer.offers[1].start, '2026-12-01', 'offer starts on move-in day');
  assert.equal((await api('POST', `/api/cases/${offer.id}/accept`, { offer_id: 'nope' })).status, 400);
  offer = await ok('POST', `/api/cases/${offer.id}/accept`, { offer_id: 'fibre_500', channel: 'portal' });
  assert.equal(offer.status, 'ordered');
  assert.deepEqual(offer.consent.data_shared, ['tenant_name', 'tenant_email', 'address', 'unit_label', 'move_in_date']);
  let [fjob] = await ok('GET', '/mock/p_fibre/jobs');
  assert.equal(fjob.context.tenant_phone, undefined, 'internet partner never gets the phone number');
  fjob = await ok('POST', `/mock/p_fibre/jobs/${fjob.id}/status`, { status: 'accepted' });
  assert.equal(fjob.access, undefined, 'no key-safe code for a sales partner');
  await ok('POST', `/mock/p_fibre/jobs/${fjob.id}/status`, { status: 'done', note: 'Line active from 2026-12-01' });
  const st2 = await ok('GET', '/api/state');
  assert.ok(st2.cases.find((x) => x.id === offer.id).closed_at, 'sold service closes when active');
  assert.ok(st2.documents.some((d) => d.case_id === offer.id && d.type === 'contract'));
  assert.equal((await api('POST', '/api/trigger', { event: 'tenant.party' })).status, 400);

  // Bad input is rejected at the boundary.
  assert.equal((await api('POST', '/api/cases', { unit_id: 'unit_4b' })).status, 400);
  assert.equal((await api('POST', '/api/cases', { unit_id: 'nope', description: 'x' })).status, 404);
  assert.equal((await api('POST', '/connector/status', { order_id: job.id, status: 'teleported' })).status, 400);

  console.log('flow test: all checks passed');
} finally {
  server.kill();
}
