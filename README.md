# Leap 3D Estimator

**AI proposes. Rules calculate. The contractor approves.**

A deterministic estimating engine: a room's geometry in, measured quantities out, priced
line items out — with waste factors, Good/Better/Best tiers, overhead & profit, and a
source plus a trust label on every number.

> **Placeholder pricing — not market rates.** Every seed rate carries
> `source: "seed-v0-placeholder"`. Nothing in this repo is licensed cost data.

## Milestone 1 (this repo, today)

```
packages/engine    the moat — pure functions, no network, no clock, no randomness
apps/web           one Next.js page over the engine
```

M1 does **not** do: scanning, 3D viewing, AI, CRM/GHL, auth, persistence, PDF export,
licensed cost data, or Android. Pricing is placeholder only.

## Run it

```bash
npm install
npm test          # engine — acceptance and rejection
npm run build     # engine (tsc) then web (next build)
npm run dev       # builds the engine, then serves the web app on :3000
```

The web app opens on the golden room from the approved mockup: 16 × 12 × 8 with a door on
the south wall and windows north and east.

## The golden numbers

That room must always produce these, in the engine and on the page:

| Quantity | Value | Why |
| --- | --- | --- |
| Floor area | 192 SF | 16 × 12 |
| Gross wall | 448 SF | 2 × (16 + 12) × 8 |
| Net wall | 403.99 SF (404 rounded) | gross less 44.01 SF of openings |
| Perimeter | 53 LF | 56 gross, less the 3 ft door |

`packages/engine/test/golden.test.ts` locks them.

## The rules the code lives under

- The engine is **pure**. No network, no `Date.now()`, no randomness — effective dates are
  inputs. `purity.test.ts` reads the source and fails if that slips.
- Money is **integer cents** internally; each line rounds to cents exactly once, from
  full-precision inputs.
- Trust level is **derived** from dimension sources, never assigned: all `measured` →
  `measurement-backed`; any `manual` or `inferred` → `preliminary`.
- Bad geometry, an invalid rate book, and an unknown item code **throw typed errors**.
  They never return a guess, a zero, or a `null`.

Full house rules: [CLAUDE.md](CLAUDE.md). Shipped prompts: [prompts/](prompts).
