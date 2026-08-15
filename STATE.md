# STATE — Estimator3D, where it actually is

**Last updated 2026-08-15 by the Cowork session (Don).**

| | |
|---|---|
| HEAD (2026-08-15) | `340c964` — test(engine): walk the four screens end to end; docs; ship ESTIMATOR2 |
| branch | `master`, level with origin — **it has a remote now** |

## Which repo this is — and which one it is not

**This is Don's build.** `C:\dev\Leap 3D Estimator` is **ChatGPT's** version and it is **PAUSED** —
Kevin put the brakes on it because he preferred this mock. **Never read from it, merge it, or
reference it.** It is also one of the two repos on this disk with **no remote at all** (the other is
`C:\dev\KAIROS`), and both are Kevin's to fix, not a session's — a session never creates a repo or a
remote for him.

## What shipped

Four screens, each in its own commit, in order:

1. **Projects**, with persistence that survives a reload
2. **What are we building?**
3. **Estimate**
4. **Proposal**, printable from the browser

Then `340c964` — a test that **walks all four end to end**, plus docs. That is the state: the spine
exists and something proves it holds together.

## Open

Kevin is waiting on "the 3D estimator to be complete", and nobody has said in one place what
*complete* means for it. The next honest step is not more building — it is **running
`npm run dev`, walking the four screens as a user, and reporting what a user cannot yet finish.**
A feature list written from the code would be a session grading its own homework.

## What this file does not cover

The paused ChatGPT build, anything about pricing (that is `hitw-estimator`), and what any window is
currently doing.
