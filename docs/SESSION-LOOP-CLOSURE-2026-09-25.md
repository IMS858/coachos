# Session loop closure — September 25, 2026

Baseline: `b911c9a4dfc032fa228bc9988213bb124844055d`, quality gate #1136.

## Closed application path

Prepare reads the last completed session's actual debrief with its date and source link. Train shows prior performed dosage and the prior private exercise observation. `Use previous load` changes only the edited load: it never copies sets, repetitions, RPE or observations as new results. Rest timing is optional and does not record completion.

Review & close offers `Save & finish session`. It saves only changed exercise rows through the existing performance API, then saves session notes with an original-note compare-and-swap, then invokes the existing completion endpoint. A failed result or note save stops before the completion call. Rows already confirmed saved remain saved; retries do not recreate them. Missing results data blocks completion instead of acting like an empty workout. Blank exercises are not fabricated as performed.

Notes and exercise edits both participate in leave-page protection. During close, inputs are disabled and a synchronous lock prevents duplicate submissions. Responses require explicit `ok: true`, not merely HTTP 200.

This is an ordered multi-request workflow, **not** one database transaction across every result and note. Session completion + package debit/undo + its audit row are a separate atomic transaction. Ambiguous completion responses require checking the session before retrying.

## Hosted dependency discovered

Read-only inspection found no `public.set_session_completion` function in hosted IMS Supabase even though the application calls it. The broad older migration also includes Stripe operations; this pass does not activate that unrelated migration.

`0063_session_completion_rollout.sql` restores only the session-completion RPC, preserves the existing oldest-active-package selection and debit/undo behavior, adds active-account/assigned-coach scope and occurred-session validation, and commits its audit with the state change. Unknown package counters require reconciliation, not an invented zero. No active package remains an explicit counter exception and the completed-session page shows billing review is needed. Completion is not proof of payment.

Apply this migration only after the exact integrated head passes CI, and recheck the hosted function first to avoid replacing newer work. The migration itself updates no session, plan or payment records. No class booking, Stripe transaction, notification or payroll provider is enabled by it.

## Tests and acceptance

Unit tests execute ordered success, partial row failure, note conflict, ambiguous completion, invalid receipts, note snapshot validation and background-aware rest timing. The dedicated database test executes the exact migration in an isolated database, checks role denial, future/missed sessions, unknown counters, duplicate completion/undo, audit-failure rollback and concurrent duplicate completion on PostgreSQL CI.

Authenticated iPhone acceptance remains necessary: edit several results and debrief, finish once, inspect linked package usage, reopen the session, visit the next session's handoff, check two-tab note conflicts and test a lost network response. Never use live customers merely to exercise destructive test cases.

## Not included

No Vercel deploy, production promotion, class registration launch, QuickBooks access, payroll submission, Stripe charge, outreach, Vagaro change or fabricated assessment. Automatic branch previews remain disabled.
