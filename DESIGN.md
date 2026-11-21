# Design

Centrix, reltix's tenant platform. One stylesheet: `public/centrix.css`. Direction: forest green and apricot (chosen by Carlos, 20/11/2026), warm and calm, never corporate.

## Colour

| Token | Value | Use |
|---|---|---|
| `--forest-700` | `#1F5136` | Shell: header band, hero panel, primary buttons, user chat bubbles |
| `--forest-800/900` | `#173D29` / `#10291C` | Hover, headings |
| `--leaf` | `#3FA66B` | Progress only: case track, progress bars, tool-done ticks |
| `--mint`, `--mint-50`, `--ground` | `#E3F2E8`, `#F1F8F3`, `#F5F8F4` | Secondary buttons, quiet surfaces, page background |
| `--apricot` | `#F2A65A` | The one next action per view (talk to the assistant, start a call, open repair cases) |
| `--apricot-100` / ink | `#FCE9D4` / `#3D2408` | Waiting states (reported, needs approval), staff "next step" box |
| `--danger` / `-100` | `#C2412D` / `#FBE4DF` | Emergency, declined |
| `--muted`, `--line` | `#4A5D51`, `#D5E6DA` | Secondary text, borders |

Rule: apricot appears once per view. Leaf never carries text.

## Type

Bricolage Grotesque (headings, tight tracking) and Figtree (UI text), from Google Fonts. Tabular numerals for prices and times. No uppercase eyebrows above headings; category labels in cards are small mint chips.

## Shape and depth

Radius 10 / 14 / 22px. White panels with a 1px green-tinted line and a soft, low shadow. Icons: drawn line SVGs, 1.9 stroke.

## Motion

Exponential ease-out `cubic-bezier(.16,1,.3,1)`, 160-220ms for UI. Hero content rises in a short stagger; chat messages rise with a light blur-in; pills change colour smoothly; buttons press to 0.97. Signature: the case track (Reported, Diagnosed, Booked, Done, Invoiced) fills in leaf green over 700ms as the case moves, updated in place by `assistant.js`. `prefers-reduced-motion` turns all of it off.

## Pages

Tenant portal (`/`), staff cases (`/centrix.html`), craftsman app (`/partner.html`), pitch view with all three (`/demo.html`). Sign-in keeps a collapsed "Demo accounts" helper; no other demo wording is visible.
