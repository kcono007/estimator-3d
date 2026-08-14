# Leap 3D Estimator

**AI proposes. Rules calculate. The contractor approves.**

A deterministic estimating engine: a room's geometry in, measured quantities out, priced
line items out — with waste factors, Good/Better/Best tiers, overhead & profit, and a
source plus a trust label on every number.

> **Placeholder pricing — not market rates.** Every seed rate carries
> `source: "seed-v0-placeholder"`. Nothing in this repo is licensed cost data.

## Where it is

```
packages/engine    the moat — pure functions, no network, no clock, no randomness
apps/web           the four-screen flow over the engine
```

The app is four screens, matching the approved mockup:

**Projects → What are we building? → Estimate → Proposal**

Projects are saved in the browser's localStorage — no account, no server, no database,
and nothing leaves the machine. The proposal prints through the browser's own dialog
(**Save as PDF** there), with no PDF library and no service.

It does **not** do: scanning or 3D capture, AI anywhere in the pricing path, CRM/GHL,
auth, a server-side database, licensed cost data, or Android. Pricing is placeholder only.

## Run it

```bash
npm install
npm test          # engine — acceptance and rejection
npm run build     # engine (tsc) then web (next build)
npm run dev       # builds the engine, then serves the web app on :3000
```

Then open **http://localhost:3000** and name a project. Every new project is seeded with
the golden room from the approved mockup: 16 × 12 × 8, a door on the south wall, windows
north and east.

## The golden numbers

That room must always produce these, in the engine and on the page:

| Quantity | Value | Why |
| --- | --- | --- |
| Floor area | 192 SF | 16 × 12 |
| Gross wall | 448 SF | 2 × (16 + 12) × 8 |
| Net wall | 403.99 SF (404 rounded) | gross less 44.01 SF of openings |
| Perimeter | 53 LF | 56 gross, less the 3 ft door |

`packages/engine/test/golden.test.ts` locks them — for the test fixture *and* for
`approvedMockupRoom()`, the exact function the web app seeds new projects with, so the UI
cannot drift away from the gate.

## The rules the code lives under

- The engine is **pure**. No network, no `Date.now()`, no randomness — effective dates are
  inputs. `purity.test.ts` reads the source and fails if that slips.
- Money is **integer cents** internally; each line rounds to cents exactly once, from
  full-precision inputs.
- Trust level is **derived** from dimension sources, never assigned: all `measured` →
  `measurement-backed`; any `manual` or `inferred` → `preliminary`.
- Bad geometry, an invalid rate book, an unknown item code, a project with no rooms and a
  project with no scope all **throw typed errors**. They never return a guess, a zero, or
  a `null` — a $0 next to a project name would read as an answer.
- A proposal **refuses to build** without a pricing notice that actually says the numbers
  are not market rates, and it checks that before it prices anything.

Full house rules: [CLAUDE.md](CLAUDE.md). Shipped prompts: [prompts/](prompts).
