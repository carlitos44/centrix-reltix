# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Tenants** of reltix-managed apartments in Aachen. Something in the home breaks (a leak, no heating, a crack in a wall). They want it fixed without filling in forms or chasing anyone, often on a phone, sometimes while the problem is happening.
- **reltix staff (building managers)**. They see every case with its diagnosis, price and payer, approve the ones above the owner's threshold, and fire lifecycle events such as a move-in.
- **Craftsman partners** (plumber, electrician, carpenter and interior finisher, heating). They get jobs with only the data their manifest asks for, accept, do the work and send the invoice.
- **Hackathon judges** (MAIN AI Hackathon, reltix track, 21/11/2026) watch a 3-minute end-to-end demo.

## Product Purpose

Centrix is reltix's property platform. A tenant reports a home problem by voice or chat to an AI repair assistant built on ElevenLabs. The assistant already knows the apartment, asks at most three questions, diagnoses the job, gets a price range from the matching craftsman, says who pays under German rental law, and books the visit. The tenant fills in zero forms. Success means a reported problem turns into a booked, priced, paid-for repair with the report and invoice back on the unit.

## Positioning

One conversation replaces the repair form, the phone tag and the "who pays?" dispute. The assistant works from real building data (installations, lease clauses, owner rules), and partners plug in through a generic connector manifest, so the same flow also delivers move-in offers such as internet.

## Operating Context

- Three roles, three screens: tenant portal (`/`), staff workspace (`/centrix.html`), craftsman partner app (`/partner.html`), plus a pitch view showing all three side by side (`/demo.html`).
- Plain Node.js server, no build step and no npm dependencies; ElevenLabs browser SDK from a CDN.
- Live updates via Server-Sent Events; the team's original site keeps some state in localStorage.

## Capabilities and Constraints

- Voice and text conversations with the AI assistant; it introduces itself as an AI.
- Who pays: the landlord by default (§ 535 BGB); the tenant only under a small-repair clause, up to the per-item cap.
- Owner approval above a threshold (for example €500).
- Emergencies (gas, water on electrics) get safety steps and 112, with no booking.
- Partners receive only their manifest's fields; the key-safe code is released only after the craftsman accepts.
- Demo accounts: Alex Rivera (PIN 2040), Jordan Lee (1070), Mira van Dijk (6200, manager). Sign-in must stay usable for judges through a quiet "Demo accounts" helper.
- UI and code in English.

## Brand Commitments

- Green is the main brand colour, with a matching palette around it (user, 20/11/2026, after rejecting the first direction round).
- Name, logo and photos may change ("complete redesign, better outcome than now").
- It must not feel corporate or cold.

## Evidence on Hand

- Fictional demo data only: two Aachen buildings (Musterstraße 12, Beispielhof 5), four units, five partners, illustrative prices including VAT.
- Two Unsplash apartment photos (credited in `public/credits.html`).
- No real customers, testimonials or metrics: none may be invented.

## Product Principles

1. Zero forms: the system fills things in; people only confirm.
2. Show the outcome, not the process: price, payer, craftsman and time, stated plainly.
3. Trust through visible privacy: say exactly what each party sees.
4. Honest AI: it says it is an AI and never invents prices, dates or approvals.
5. Warm and human, never corporate or cold.
