# IMS Coach OS unified release

Status: integration candidate; **not approved for production or client migration**.
Published with owner approval on 2026-09-24 as [draft PR #18](https://github.com/IMS858/coachos/pull/18). Branch: `release/ims-unified-2026-09`.
Base: `041d14d69b288a3586aaa56c07900fd984a23e14` (`main` at integration).

This branch is the single review surface for the previously separate Coach OS
feature branches. A branch or successful build is not evidence that its code is
in production. The last production revision observed during the audit was
`41487409c0b89a9e2bccf8c5b779659714ee6bee`.

## Branch disposition

| PR | Work | Integration decision |
| --- | --- | --- |
| #17 | Platform reliability | Combined. Transactional reminder ledger and trainer exclusion migration staged; live rehearsal remains open. |
| #16 | Stripe integrity | Combined; undefined `paymentError` references repaired. Transactional replay/refund replacement added in stabilization; Stripe sandbox verification remains a gate. |
| #15 | Website lead sync | Combined with exact proxy exemption. Shared-secret authentication retained. |
| #14 / #13 | OAuth, reset and branded login | Combined; duplicate state and input attributes removed. Providers remain configuration-controlled. |
| #12 | App design system | Chosen as the shared light surface / blue accent / dark navigation design. |
| #10 | Program assignment schema | Combined with live column names. Removed private-to-shared note fallback and conflicting trainer ownership restriction. Draft picker aligned with edit restrictions. |
| #8 | Visual assessment / program workflow | Combined. Draft save/resume, assessment deferral and preview improvements retained. |
| #7 / #6 / #5 | Client training hub and video experience | Combined into one plan page. History, booking, progress, messages and assigned videos share navigation. Safety review uses server-only lookup scoped to the caller's assignments. |
| #4 | Older premium UI | Reconciled selectively: recovered interactive program studio, publish button and private-artifact migration files. Kept current light design, newer API security, current CI and private-PDF publication checks. Older backend implementations intentionally superseded. |
| #2 | Consultation entry | Combined with booking validation and escaped notification content. |
| #1 | Historical dependency patch | Superseded. Do not merge its stale application baseline. Current dependency resolution is locked and audited. |
| #3 / #9 / #11 | Generator integration, workout history, client UI | Already incorporated in main; preserved. Original squashed histories were not replayed. |
| Generator-gates audit branch | Early integration hardening | Reconciled with newer caller-scoped reads and private artifacts. Explicit secure generator destination, request-size cap and no-store response added without restoring older JSON/PDF storage. |
| Old integrated-UI preview branch | Earlier #3 preview | Same tree/head as the earlier integration branch; superseded by main and this release. |

Do not individually merge the old feature PRs after this candidate: review their
unique work here. Original PRs are left open until the unified candidate is
accepted. No branches were deleted or force-pushed.

## Resulting experience

- One IMS visual system: light work surfaces, legible blue actions, dark navigation,
  consistent program studio panels and restored browser zoom.
- Coach program workflow: inspect weeks/days, edit prescription, save draft,
  regenerate private client PDF, then request publication through existing safety
  and release checks. Editing is disabled during save/render requests.
- Client plan: workout history, booking, messages, progress and approved assigned
  videos. Owned published program detail links now reach the page's ownership
  checks instead of being redirected by a blanket staff-only prefix.
- Program assignment uses the live `position`, `load_prescription` and `notes`
  columns. Instructions are explicitly client-visible. Nonempty legacy
  `notes_trainer` requests are rejected, never copied into shared notes. A separate
  private assignment-note feature remains future work.
- Dashboard buttons now lead to real homework and messaging destinations; they
  no longer imply that a click recorded completion or scheduled a reassessment.
- Machine endpoints reach their own signature, bearer-secret or intake-token
  authentication. The bypass is an exact route allowlist, not an API-wide bypass.
- Recurring times preserve Pacific wall time across DST changes. Ambiguous fall
  times use the first occurrence; nonexistent spring times fail explicitly.

## Verification

The first unified commit `fc4942b0f8435d4b5fc7832171ab222adacf9053` passed GitHub
run `35962375864` and reached Vercel READY as `dpl_GaABgDapxcddAnM3sf6QmWccX198`.
Production was not promoted. See [STABILIZATION-2026-09.md](STABILIZATION-2026-09.md)
for the subsequent reliability changes, test evidence and remaining gates.

The release pipeline now requires locked installation, database/regression tests,
zero-warning lint, a production build and standalone TypeScript validation.
The isolated CI database uses synthetic data; no test connects to production.
Static contract tests and isolated database tests do not establish complete live
RLS isolation or provider configuration. Authenticated role journeys remain open.

## Launch gates and next work

Track work in [RELEASE-BACKLOG.csv](RELEASE-BACKLOG.csv). The audit workbook holds
private migration reconciliation notes; do not copy client records into this
public repository. “Implemented, verify” means code exists here but the original
acceptance criteria are not yet fully satisfied.

1. **R0 — stabilize.** Reconcile all migration histories; test clean-database replay;
   rehearse the new transactional billing, session and trainer-conflict migrations;
   verify reminder scheduling and delivery. Review
   public seed-data provenance. Run authenticated owner/trainer/client isolation
   and Stripe sandbox failure/replay tests. Confirm a
   successful Vercel preview for this exact commit.
2. **R1 — staff pilot.** Exercise both coaches' schedules, recurring changes,
   package usage/undo, requests, assessment save/resume, PDF regeneration,
   messaging and recovery flows. Verify OAuth/reset configuration and mobile
   keyboard/zoom/modal behavior. Keep generator client release held until exercise
   mapping and safety approvals satisfy the existing gates.
3. **R2 — client pilot.** Run a small explicitly selected pilot using reconciled
   records. Verify owned PDFs, assigned media, workouts, balance explanations and
   support flows; check private data never reaches another client.
4. **R3 — cutover.** Rehearse the Vagaro import with owner-confirmed package and
   recurring corrections, reconcile totals and exceptions, and demonstrate exports
   and rollback. Only then decide a production promotion and source-system cutoff.

## Paired generator release

The Python generator is a separate deployable repository. Pair this candidate
with `IMS858/program-generator` draft PR #1, audit head
`8f72b934e34daa20574898e92016c3a1ad8fd1a4`, after integrated contract verification.
Its observed production revision remained `b9b552f078a97ea530922af79e30de15b731650f`.
Do not assume merging Coach OS deploys the generator. Service URL and secret must
be explicitly configured. Client publication flag remains held until approved.

## Database and release boundaries

No live database migrations, account records, payments, email sends, Vagaro edits,
main-branch merges or production promotions were performed during consolidation.
Private-PDF and coach-artifact SQL recovered from #4 is historical source material,
not a declaration that the repository can yet reproduce the entire live schema.
The numbered and timestamped migration histories still require reconciliation.
The notification ledger introduced by #17 also needs verified deployment before
reminders can run. Do not blindly apply all SQL directories to production.

At audit time many preview attempts were blocked by Vercel deployment quotas.
Treat quota errors separately from compilation errors; inspect the exact candidate's
status rather than repeatedly redeploying. Keep production and database rollback
instructions ready before promotion.
