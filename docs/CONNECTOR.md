# centrix partner connector — spec v0.1

One way for any service partner to plug into centrix: craftsmen who **deliver** a job (repairs) and providers who **sell** a service (internet, energy, insurance). A partner writes one manifest file and exposes three HTTP endpoints. centrix does the rest: it detects the moment, talks to the resident, collects consent and links the result to the unit.

Reference implementation in this repo: `lib/centrix.mjs` (centrix side), `lib/mock-partner.mjs` (partner side), manifests in `partners/`. The flow test (`npm test`) runs both partner types end to end.

## Principles

1. **centrix owns the resident.** Partners never contact the tenant before the tenant says yes, and never read the centrix database. Everything goes through this connector.
2. **Zero forms.** centrix fills every field from the property record. The resident only confirms.
3. **Data minimisation in two steps.** Before consent, a partner sees only its `eligibility_fields` (for example the postcode). After the resident explicitly agrees, it gets its `data_needed` fields, and nothing else. Every order carries a consent record.
4. **Same shape for every partner.** Adding a partner means adding a manifest, not changing centrix.

## 1. Manifest

One JSON file per partner (`partners/<name>.json`).

| Field | Required | Meaning |
|---|---|---|
| `id`, `name` | yes | Stable id and display name |
| `category` | yes | `craftsman`, `internet`, `energy`, `insurance`, … |
| `mode` | yes | `deliver` (a job is done at the property) or `sell` (a contract is signed) |
| `triggers` | yes | centrix events the partner wants, e.g. `tenant.move_in`, `case.diagnosed`, `contract.expiring` |
| `service_area.postcode_prefixes` | yes | Where the partner works |
| `trades` | deliver | Trades it covers: `plumbing`, `heating`, `electrical`, `carpentry` |
| `framework_contract`, `rating` | deliver | Used to rank partners for the same trade |
| `eligibility_fields` | sell | Fields it may see **before** consent, each with the reason |
| `data_needed` | yes | Fields it gets **after** consent, each with the reason. The reasons are shown to the resident |
| `data_after_acceptance` | optional | Sensitive fields released only once the partner accepts (e.g. key-safe `access`) |
| `endpoints` | yes | `quote`, `orders`, and `slots` for deliver partners |

Fields centrix can share: `tenant_name`, `tenant_email`, `tenant_phone`, `address`, `postcode`, `unit_label`, `move_in_date`, `meters`, `diagnosis`, `installations`. A field that is not in the manifest is never sent.

Example (sell): [`partners/fibrelink-rhein.json`](../partners/fibrelink-rhein.json). Example (deliver): [`partners/heizung-mueller.json`](../partners/heizung-mueller.json).

## 2. Events (the moment)

centrix emits events from its records. Payload, as in the reltix brief:

```json
{ "event": "tenant.move_in", "occurred_at": "2026-11-20T09:14:00Z", "unit_id": "unit_4b", "contact_id": "c_202", "data": { "move_in_date": "2026-12-01" } }
```

| Event | Source in centrix | Typical partners |
|---|---|---|
| `case.diagnosed` | The AI repair assistant classified a tenant's report | Craftsmen (deliver) |
| `tenant.move_in` | Lease start date | Internet, energy, insurance, moving |
| `tenant.move_out` | Notice received | Moving, cleaning, final meter readings |
| `contract.expiring` | Service contract end date | Energy, insurance |

For every event, centrix selects the partners whose `triggers`, `service_area` (and `trades`) match.

## 3. Endpoints the partner exposes

### `POST quote`

Deliver partner. centrix sends the job type and catalogue entry. The partner answers with its own price range.

```json
// request
{ "job_type": "leak_sink_trap", "job": { "trade": "plumbing", "hours": [0.5, 1], "parts_eur": [10, 40] } }
// response
{ "min_eur": 89, "max_eur": 153, "currency": "EUR", "includes": "call-out, labour, typical parts, incl. 19% VAT", "valid_until": "2026-11-27" }
```

Sell partner. centrix sends the event and the eligibility fields only. The partner answers with offers, or `eligible: false`.

```json
// request
{ "event": "tenant.move_in", "context": { "postcode": "52062", "move_in_date": "2026-12-01" } }
// response
{ "eligible": true, "offers": [ { "id": "fibre_500", "product": "Fibre 500", "monthly_price_eur": 34.99, "setup_fee_eur": 0, "min_term_months": 12, "start": "2026-12-01", "description": "500/100 Mbit/s, router included" } ] }
```

### `GET slots?job_type=…` (deliver only)

```json
[ { "start": "2026-11-23T08:00", "end": "2026-11-23T10:00" } ]
```

Demo slot strings represent local wall time in Europe/Amsterdam. The AI assistant offers these to the tenant during the call.

### `POST orders`

For repairs, send only after explaining the named contractor, time, requested fields and any access details shared after acceptance, and receiving explicit confirmation. A slot choice alone is insufficient.

```json
{
  "case_id": "case_1",
  "idempotency_key": "case_1",
  "slot": { "start": "2026-11-23T08:00", "end": "2026-11-23T10:00" },   // deliver
  "offer": { "id": "fibre_500", "product": "Fibre 500", "start": "2026-12-01" }, // sell
  "estimate": { "min_eur": 89, "max_eur": 153 },                       // deliver
  "context": { "tenant_name": "Lena Hoffmann", "address": "Musterstraße 12, 52062 Aachen", "unit_label": "2nd floor left" },
  "status_webhook": "https://centrix.example/connector/status"
}
// response
{ "order_id": "job_1", "status": "received" }
```

`context` holds exactly the manifest's `data_needed` fields.

## 4. Status webhook (partner → centrix)

`POST /connector/status`, one endpoint for every partner.

```json
{ "order_id": "job_1", "event_id": "job_1_done", "status": "done", "note": "Replaced trap seal", "documents": [ { "type": "repair_report", "name": "Repair report job_1", "text": "…" } ] }
// response
{ "ok": true, "access": "Key safe at the entrance, code 4711" }   // access only on "accepted", only if the manifest asks for it
```

States, shared by both modes:

```
received → accepted → scheduled → in_progress → done → invoiced
        ↘ rejected                                   ↘ (sell: closed at done)
any → cancelled
```

- Deliver: the case closes at `invoiced`. Typical documents: `repair_report` at `done`, `invoice` (with `amount_eur`) at `invoiced`.
- Sell: `accepted` means the contract is signed (document `contract`), `done` means the service is active. The case closes at `done`.

Every document is stored on the unit in centrix and shown to the tenant and the property manager.

## 5. Consent and privacy

- **Consent record** stored on every order:
  ```json
  { "data_shared": ["tenant_name", "tenant_email", "address", "unit_label", "move_in_date"], "given_at": "2026-11-20T09:21:00Z", "channel": "portal" }
  ```
- Before consent: only `eligibility_fields`. After consent: only `data_needed`. After acceptance: only `data_after_acceptance`.
- The resident sees, in plain words, which fields go to which partner before clicking.
- The voice and chat assistant says it is an AI (EU AI Act transparency).
- GDPR basis: performance of the lease (repairs, Art. 6(1)(b)) and consent for sold services (Art. 6(1)(a)).

## 6. What stays in centrix (not the partner's job)

- Picking the partner: trade, area, framework contract, rating.
- Who pays: the landlord by default (§ 535 BGB). The tenant pays only under a valid small-repair clause, for fixtures in their direct access, up to the per-item cap. Above the cap the landlord pays all of it.
- Owner approval: above the owner's threshold, the property manager approves in centrix before booking.
- Emergencies (gas, water on electrics): safety instructions, no booking.

## 7. Onboarding a new partner

1. Write the manifest: category, mode, triggers, area, fields with reasons.
2. Implement `quote`, `orders` (and `slots` for deliver).
3. Call the status webhook on every change, with documents.
4. Run the flow test against your endpoints.

Example: an energy provider for `contract.expiring` needs a manifest with `mode: "sell"`, `eligibility_fields: { postcode, meters }` and `data_needed: { tenant_name, tenant_email, address, meters }`. No centrix code changes.

## 8. Assumptions and production gaps

The demo runs partners as local mocks. Before production:

- **Authentication:** one API key per partner and HMAC-signed webhooks. Not implemented in the demo.
- **Reliability:** idempotency keys on `orders`, retries with backoff on webhooks.
- **Rejection:** if a partner declines, centrix should offer the job to the next partner. The demo stops at `rejected`.
- **Grouping:** several tenants reporting the same building fault should become one job. Not implemented yet.
- **Data:** the property record holds what a manager really has (installations from service reports, lease clauses, meter numbers). It does not hold tenants' own energy or internet contracts.

## 8. Retry and handoff rules

- A repair booking request needs explicit permission. The booking disclosure
  exposes field names and the contractor before the resident is asked to agree.
- Use the case ID as the order idempotency key. On a network timeout, repeat
  the same order body and key. The demo partner returns the existing order for
  the same case and slot. A conflicting slot under the same key returns 409.
- If the slot has been taken, the order returns 409. Refresh availability and
  ask the resident to confirm a new slot.
- Give each status event a stable event ID. If delivery times out, retry the
  same event and body with backoff. Centrix acknowledges an exact replay
  without duplicating the invoice or timeline entry. Reusing an ID with
  different content returns 409.
- The demo uses local wall times. A production partner must send ISO timestamps
  with offsets and an IANA time zone, and agree on the handling of clock changes.
- For production, authenticate partner requests, verify callbacks against the
  assigned partner, and persist idempotency records transactionally. The current
  loopback demo does not implement those production controls.

### Adding a second heating contractor

Give the contractor its own manifest ID, the heating trade, coverage, the
fields it needs, and its quote, slot, and order endpoints. Use the same
status webhook. Set contract preference and rating in the manifest, rather
than hard-coding a company name in the voice agent. The shipped plumbing and
internet manifests are additional examples of the same connector pattern.

### Verified second heating partner

The same radiator-fault intake routes Wyck Townhouse to Heizung Müller GmbH
and Céramique Apartments to Maas Heat Service (demo). Coverage is declared in
their manifests. Maas Heat publishes nine-to-eleven and one-to-three time
windows and requests fault details without equipment records or access notes.
Both accept the same order schema and report completion and invoice through
the same callback. The assistant and booking workflow are shared.

Run `node test/flow.test.mjs` to check both routes in an isolated database. The
test verifies partner selection, distinct availability, disclosed fields,
automatic confirmation, partner completion, and linked invoice and report.
