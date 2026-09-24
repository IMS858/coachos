# IMS Coach OS unified release

Status: integration candidate; **not approved for production or client migration**.
Prepared locally 2026-09-24. Public push and draft PR are pending explicit approval after automatic approval review blocked publication. Branch: `release/ims-unified-2026-09`.
Base: `041d14d69b288a3586aaa56c07900fd984a23e14` (`main` at integration).

This branch is the single review surface for the previously separate Coach OS
feature branches. A branch or successful build is not evidence that its code is
in production. The last production revision observed during the audit was
`41487409c0b89a9e2bccf8c5b779659714ee6bee`.

## Branch disposition

| PR | Work | Integration decision |
| --- | --- | --- |
| #17 | Platform reliability | Combined. Notification ledger migration staged only; reminder retry/window and transactional booking remain open. |
| #16 | Stripe integrity | Combined; undefined `paymentError` references repaired. Billing replay/refund correctness is still a release gate. |
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

Local validation (2026-09-24):

| Check | Result |
| --- | --- |
| Clean locked install | Pass (`npm ci`) |
| Regression suite under Node 20 | 38/38 pass (25 contracts/device tests + 13 cardio/integration tests) |
| Production build under Node 20 | Pass, including TypeScript |
| Standalone TypeScript | Pass |
| npm dependency audit | 0 known advisories in the locked graph |
| ESLint | 49 errors and 6 warnings remain across inherited code; tracked in IMS-014 |
| Authenticated browser / deployed API flows | Not verified; launch gate |

The Supabase dependency emits a Node 20 deprecation warning; runtime upgrade
verification belongs in IMS-014 before the production release.

The candidate adds
`npm test`, a checked-in lockfile, `.gitignore`, `npm ci` deployment installs and
CI production builds in addition to TypeScript and regression tests.
`npm run lint` now runs ESLint instead of the removed `next lint` command; existing
lint debt is reported, not hidden or disabled. It is not yet a required CI gate.

Tests use synthetic inputs. Static security-contract tests do not establish
live RLS isolation. A local production build does not verify provider settings,
webhook replay, deployed cron delivery, mobile navigation or authenticated journeys.
The environment's dependency-symlink build failure was resolved with a clean
`npm ci` in this worktree; no workaround to bypass type checking was introduced.

## Launch gates and next work

Track work in [RELEASE-BACKLOG.csv](RELEASE-BACKLOG.csv). The audit workbook holds
private migration reconciliation notes; do not copy client records into this
public repository. “Implemented, verify” means code exists here but the original
acceptance criteria are not yet fully satisfied.

1. **R0 — stabilize.** Reconcile all migration histories; test clean-database replay;
   make Stripe processing/refunds and session balance changes atomic; establish
   trainer conflict exclusion and reliable reminder retry/window behavior. Review
   public seed-data provenance. Run authenticated owner/trainer/client isolation
   and Stripe sandbox failure/replay tests. Resolve lint baseline and confirm a
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
