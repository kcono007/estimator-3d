# CLAUDE.md — Leap 3D Estimator

## The product rule (binds every line of code)
**AI proposes. Rules calculate. The contractor approves.**
A model never types a fact a machine can compute.

## Engine invariants (`packages/engine`)
The engine is **pure functions**. Inside `packages/engine/src`:
- No LLM calls. No network. No filesystem. No database.
- No randomness. No `Date.now()`, no `new Date()` with no argument — effective dates and
  "as of" dates are **inputs**, never ambient.
- Same input in → byte-identical output out, forever. There is a determinism test that proves it.
- Money is **integer cents** internally. Dollars only at the display edge.
- Every quantity carries a `qtySource`. Every price carries its rate book `source` +
  `effectiveDate`. A number with no provenance does not ship.
- Trust level is **derived**, never assigned by hand:
  all dimensions `measured` → `measurement-backed`; any `manual`/`inferred` → `preliminary`.

## Refuse loudly
Bad geometry, an invalid rate book, and an unknown item code must **throw typed errors**
(`GeometryError`, `RateBookError`, `EstimateError` — each with a `code`), never return a
guess, a zero, or a `null`. Rejection tests are as mandatory as acceptance tests.

## Pricing honesty
All seed pricing is `source: "seed-v0-placeholder"`. Any UI that shows it must say
**"Placeholder pricing — not market rates."** Do not replace it with numbers scraped from
anywhere; licensed cost data is a later, paid decision that is Kevin's to make.

## Stack
Node 20+, TypeScript strict, Vitest, Next.js 14 (app router), npm workspaces.
No paid services, no external APIs, no databases. The web app calls the engine in-process.

## Git discipline
- **Name every path you stage.** `git add -A` and `git add .` are forbidden.
- Do not create remotes or push. Kevin creates the GitHub repo himself.
- Shipped prompts live in `prompts\`.

## Layout
```
packages\engine\src\roomgraph.ts   RoomGraph v0 types + trust derivation
packages\engine\src\takeoff.ts     quantities from geometry (+ geometry rejection)
packages\engine\src\ratebook.ts    rate book load + validation
packages\engine\src\estimate.ts    line items, tiers, O&P, totals
packages\engine\src\ratebook.seed.json
apps\web\                          one-page Next.js UI over the engine
```
