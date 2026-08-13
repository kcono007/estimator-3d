# ESTIMATOR1 — Leap 3D Estimator · M1: the takeoff + pricing engine

**Repo:** `C:\dev\Estimator3D` (this file lives in its root). **Spend: $0.** Nothing in this prompt
may spend money. If a step would spend, STOP and report — Kevin sets ceilings.

## What you are building (3 lines)
A deterministic TypeScript estimating engine: RoomGraph in → measured quantities → priced line
items out, with waste factors, Good/Better/Best tiers, O&P, and a source + trust label on every
number. Plus a one-page Next.js app: type room dimensions → itemized estimate. No scanning yet.

## The product rule (binds every line of code)
**AI proposes. Rules calculate. The contractor approves.** The engine is pure functions — no LLM
calls, no network, no randomness, no `Date.now()` inside calculations (effective dates are inputs).
A model never types a fact a machine can compute.

## Stack (decided — Kevin can overrule in one word)
Node 20+, TypeScript strict, Vitest, Next.js 14 (app router), npm. No paid services, no external
APIs, no databases in M1 — the web app calls the engine in-process.

## Structure
```
C:\dev\Estimator3D
├── CLAUDE.md            ← create it (short; house rules below apply)
├── ESTIMATOR1.md        ← this file; git mv to prompts\ when shipped
├── packages\engine\     ← the moat
│   ├── src\roomgraph.ts     RoomGraph v0 types
│   ├── src\takeoff.ts       quantities from geometry
│   ├── src\ratebook.ts      rate book load + validation
│   ├── src\estimate.ts      line items, tiers, O&P, totals
│   ├── src\ratebook.seed.json
│   └── test\                Vitest — acceptance AND rejection
└── apps\web\            ← minimal Next.js UI over the engine
```

## RoomGraph v0 (types in roomgraph.ts)
- `Space { id, name, width_ft, depth_ft, height_ft, openings: Opening[] }`
- `Opening { id, kind: 'door'|'window'|'opening', wall: 'N'|'S'|'E'|'W', width_ft, height_ft, sill_ft?, dimensionSource: DimSource }`
- `DimSource = 'measured' | 'manual' | 'inferred'` — every dimension carries one.
- Space-level `dimensionSource` too. Trust level of an estimate is DERIVED, never set by hand:
  all measured → `measurement-backed`; any manual/inferred → `preliminary`. (Field-verified and
  contract-ready arrive in later milestones with human sign-off.)

## Takeoff (takeoff.ts) — deterministic formulas
- `floorAreaSF`, `ceilingAreaSF`, `grossWallAreaSF`, `netWallAreaSF` (gross − openings),
  `perimeterLF` (minus door widths), counts by opening kind.
- Rejects impossible geometry with typed errors: non-positive dimensions; opening wider/taller
  than its wall; openings on one wall overlapping or exceeding wall length.

## Rate book (ratebook.ts + seed JSON)
Entry: `{ code, trade, name, unit, materialCostPerUnit, laborHoursPerUnit, wasteFactor,
tierMultipliers: {good, better, best}, source, effectiveDate }`.
- Validation rejects: missing/invalid effectiveDate, negative costs, wasteFactor < 0 or > 0.5,
  unknown unit. A rate book that fails validation never prices anything.
- Seed book: **flooring first, painting second** (first two trades) — LVP install, floor demo,
  underlayment, baseboard R&R, transitions; wall/ceiling paint, primer, drywall patch. All entries
  `source: "seed-v0-placeholder"`, `effectiveDate: "2026-08-08"`. Placeholder numbers, clearly named.

## Estimate (estimate.ts)
- Input: Space + selections `[{ code, qtyOverride? }]` + config `{ laborRatePerHour, opPct, tier }`.
- Quantity per line = takeoff formula unless `qtyOverride` (then `qtySource: 'manual'`, else `'measured'`).
- `material = qty × (1+waste) × unitCost × tierMultiplier`; `labor = qty × hrsPerUnit × laborRate`;
  O&P on (material+labor). Money in integer cents internally.
- Every line item carries: qty, unit, qtySource, wasteFactor, rate book source + effectiveDate.
  Estimate output carries derived trust level + the assumptions/exclusions list (config input).

## Web app (apps/web) — one page
Form: room W/D/H, add openings, pick line items (from seed book), labor rate, O&P, tier →
itemized estimate with trust badge, waste + source per line, totals. Every quantity displayed
names its source. Label visible in UI: "Placeholder pricing — not market rates."

## GATES — green before anything is called done
1. `npm test` green across engine — paste the real output in the close-out.
2. **Rejection tests are mandatory**: prove the engine REFUSES bad geometry, bad rate books, and
   an unknown item code. A gate that only tests acceptance is decoration.
3. Golden test: the 16×12×8 room (door 3×6.67 S; windows 4×3 N and E) yields floor 192 SF, net
   wall 404 SF (rounded), perimeter 53 LF — the same numbers the approved mockup shows.
4. `npx tsc --noEmit` clean.
5. Web app builds (`npm run build`) and renders an estimate locally — state what you verified by
   running it, and what you did not.

## Git discipline
- `git init` if this folder is not a repo. **Name every path you stage — `git add -A` and
  `git add .` are forbidden.** Commit engine, tests, web app, CLAUDE.md in logical commits.
- **No remote exists yet. Do not create one** — Kevin creates the GitHub repo himself in his own
  browser. Report "push pending — remote is Kevin's to create" rather than pushing nowhere.
- When shipped: `git mv ESTIMATOR1.md prompts\ESTIMATOR1.md` (create `prompts\`) in the final commit.

## The close-out report (Kevin's format — short)
1. What shipped, one line. 2. Gate output pasted (verified — you ran it and read it). 3. **What
M1 does NOT do:** no scanning, no 3D viewer, no AI, no GHL/CRM, no auth, no persistence, no PDF,
no licensed cost data, no Android, placeholder pricing only. 4. The next prompt (ESTIMATOR2: web
3D viewer of RoomGraph + tap-to-scope) named as queued. 5. End with the `# / What / Who / Status`
table. Kevin's rows: create GitHub remote + first push; add `C:\dev\Estimator3D` to
`C:\dev\Don\registry.json` (he adds it himself — never add it for him).

## Never
Report unverified work as done · assign the `verified` label to anything you did not run and read
· handle credentials · spend money · create accounts/remotes for Kevin · pad the report.
