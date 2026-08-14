# ESTIMATOR2 — back this repo up, then close the gap to the mock Kevin chose

Run in `C:\dev\Estimator3D`. Stage paths by name; never `git add -A`.

**Kevin, 2026-08-14, verbatim:** *"W5 is the 3D Estimator that you were creating, this is separate
from the Leap 3D Estimator that Chatgpt is running, which I put the brakes on because I liked your
mock better. So please complete that project with me!"*

This repo is the one that continues. `C:\dev\Leap 3D Estimator` is ChatGPT's and is paused —
**do not read from it, do not merge it, do not reference it.**

---

## 0 · THIS REPO HAS NO GIT REMOTE. FIX THAT BEFORE WRITING ANY CODE.

`git remote -v` is **empty**. Five commits of work exist on one hard drive and nowhere else.

On 2026-08-06 Kevin's drive was compromised and everything not pushed was lost — that is written
into `C:\dev\Don\STATE.md` as a permanent record. **This is the same exposure, open right now, on
the project he just asked to finish.**

Kevin creates the empty repo in his browser (no description, no README, no .gitignore):
**https://github.com/new** → name it `estimator-3d` → Create.

Then, and only then:

```
git remote add origin https://github.com/kcono007/estimator-3d.git
git push -u origin master
```

Read the push output. **Do not proceed to section 1 until the push has succeeded** and you have
said so in plain words. If the repo does not exist yet, stop and say so — do not invent a URL.

## 1 · THE MOCK IS THE ACCEPTANCE TARGET

`mockup-v2.html` sits in this repo root and is the thing Kevin chose over the other build. Open it
in a browser and walk it before you touch the app. Its four screens are:

**Projects → What are we building? → Estimate → Proposal**

`apps/web/app/page.tsx` is **one page**. The mock is four. That gap is this order.

Build the flow the mock shows, over the existing engine. **The engine is the moat and it is
finished for M1 — do not rewrite it.** `packages/engine` stays pure: no network, no `Date.now()`,
no randomness, and `purity.test.ts` must stay green.

Ship in this order, committing and pushing each one:

1. **Projects** — a list, and a way to start a new one. Persistence: the simplest thing that
   survives a reload without a new dependency or a hosted service.
2. **What are we building?** — the intake that produces a room graph the engine already accepts.
   The golden room (16 × 12 × 8, door south, windows north and east) stays the seeded default.
3. **Estimate** — the priced lines the engine returns, each carrying **its source and its trust
   label**, exactly as the engine derives them. Never assign a trust level in the UI.
4. **Proposal** — the contractor-facing output. Printable from the browser (`window.print()` and a
   print stylesheet). **No PDF library, no service, no dependency.**

## 2 · THE THINGS THAT MUST STAY TRUE

- **Placeholder pricing stays labelled.** Every rate carries `source: "seed-v0-placeholder"`, and
  the proposal says so on its face. Kevin must never hand a customer a number that looks like a
  market rate and is not.
- **Trust level is derived, never assigned** — all `measured` → `measurement-backed`; any `manual`
  or `inferred` → `preliminary`.
- **Money is integer cents internally**, rounded to cents exactly once per line.
- Bad geometry, an invalid rate book and an unknown item code **throw typed errors** — never a
  guess, a zero or a null.

## 3 · TESTS

Extend the existing suites. Rejection-first: a project with no rooms refuses to produce an
estimate · an unknown item code throws rather than pricing at zero · the proposal refuses to render
without the placeholder-pricing notice · the trust label cannot be set from the UI layer.
The golden room's numbers (192 SF floor, 448 SF gross wall, 404 SF net, 53 LF perimeter) stay
locked by `golden.test.ts`.

## 4 · REPORT

The push output from section 0 first — that is the part that matters most today. Then: what
shipped, **what this does NOT do**, and the exact local URL Kevin opens. You may not assign the
`verified` lane to anything you did not run and read the output of.

## NOT AUTHORISED

Scanning or 3D capture · AI anywhere in the pricing path · CRM or GHL integration · auth · licensed
cost data · Android · any paid dependency or hosted service · rewriting `packages/engine` ·
reading from or merging `C:\dev\Leap 3D Estimator` · any repo other than `C:\dev\Estimator3D`.
