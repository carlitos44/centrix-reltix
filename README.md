# Centrix: Plug a Partner into Centrix

MAIN AI Hackathon 2026, reltix track. A resident reports a fault by voice or text to a live ElevenLabs agent; Centrix finds the right contractor through one partner connector, books a slot with the resident's consent, and the report and invoice land in the same case for the building manager.

**Video:** see `media/` (or the link in the submission).

```bash
echo ELEVENLABS_API_KEY=your_key > .env
node scripts/agent.mjs
node server.mjs
```

Then open http://127.0.0.1:5174/ (pitch view: http://127.0.0.1:5174/demo.html).

## What this build does

Centrix is a local property-management demo for the Reltix challenge, “Plug a Partner into Centrix.” A resident reports a fault to a live ElevenLabs voice or text assistant. Centrix identifies the contractor by trade and property coverage, presents appointment slots, and asks the resident for permission to share the listed details before booking. The simulated contractor automatically confirms an available slot. The contractor can record completed work and send a sample invoice. The report and invoice appear in the same case for the building manager.

- The assistant detects English, Dutch, Spanish, or German without a language picker. A goodbye ends the session and clears the on-screen transcript. Case history remains in local storage on the server.
- The tenant’s Previous requests view contains active appointments, closed requests, and drafts. Messages contains correspondence with management.
- Mira’s Requests includes the case timeline, booking permission, completion note, and linked invoice.
- Both heating contractors use the same connector. Heizung Müller serves the fictional Wyck Townhouse property. Maas Heat Service serves the fictional Céramique Apartments property, with different availability and fewer requested data fields.
- The backend prevents a second active contractor job for the same repair and deduplicates repeated order and callback requests.

## Run the project

Use Node.js 20.12 or later. No npm install is required. Clone the repo and run all commands from its folder.

1. Create a local `.env` file containing `ELEVENLABS_API_KEY=...`. Keep the value local.
2. Run `node scripts/agent.mjs` to provision the demo agent and its tools in your ElevenLabs account. The setup details are in `START-HERE.txt`.
3. Run `node server.mjs`. It defaults to Maastricht time (`TZ=Europe/Amsterdam`).
4. Open `http://127.0.0.1:5174/`. Demo accounts are Alex Rivera (2040), Jordan Lee (1070), Mira van Dijk (6200), and Noor Bakker (4310); they are also listed under "Demo accounts" on the sign-in screen.
5. For the pitch, `http://127.0.0.1:5174/demo.html` shows tenant, staff and contractor side by side.

## Look and feel

One stylesheet, `public/centrix.css`, styles every page. Forest green is the main colour, leaf green shows progress, apricot marks the single next action on each screen. Headings use Bricolage Grotesque, text uses Figtree. Each repair in Previous requests and Mira's Requests shows a progress track (Reported, Diagnosed, Booked, Done, Invoiced). Visible demo wording was removed; only the sign-in helper names the demo accounts. Details in `DESIGN.md`.

## Submission and verification

- `DEMO-RUNBOOK.txt` gives the recording sequence from a spoken radiator report to Mira opening the invoice.
- `docs/CONNECTOR.md` defines the partner manifest, quote and availability endpoints, order payload, status callback, consent, and retries.
- `node test/flow.test.mjs` runs the automated checks on an isolated database. Both heating contractors passed the same radiator-fault flow through confirmation, completion, and invoice. The suite also checks missing consent, competing bookings, repeated orders, repeated invoice callbacks, emergency routing, and the move-in internet example.
- Live ElevenLabs text and the local browser role flows were tested separately. A spoken demo recording is a separate submission artifact and is not included.

ElevenLabs is live. Both contractors, their calendars, and their invoices are simulated. The Node server binds to loopback and uses synthetic data. The hosted static Centrix site is a separate build. A production deployment would require server-side role authorization, persistent storage, and authenticated partner callbacks.

## Source map

| Area | Files |
|---|---|
| Resident voice and text assistant | `public/assistant.js`, `scripts/agent.mjs` |
| Portal views and synchronization | `public/index.html`, `public/app.js`, `public/manager.js`, `public/bridge.js` |
| Visual design and pitch view | `public/centrix.css`, `public/logo.svg`, `public/demo.html`, `DESIGN.md` |
| Cases, consent, orders and callbacks | `server.mjs`, `lib/centrix.mjs` |
| Contractor portal and mock calendars | `public/partner.html`, `public/repair-jobs.js`, `lib/mock-partner.mjs`, `data/mock-partners.json` |
| Partner configuration and tests | `partners/`, `data/seed.json`, `test/flow.test.mjs` |

The repo includes sample fixtures. It excludes the API key, agent provisioning state, and local case database.
