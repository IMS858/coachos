# Calendar booking controls — September 28 release

The document is the vertical scroll owner. The staff shell no longer creates a
second vertical scroller; the calendar has no fixed-width horizontal scroller or
touch-drag interception. Empty half-hour slots are real, keyboard-accessible
links to the existing session form, carrying the selected Pacific date, time and
trainer. Link prefetch is disabled per slot/event. Appointment placement uses
actual minutes and duration, not rounded half-hours; overlapping cards get lanes.
Classes and trainer blocks are visible availability context. Failed evidence
queries do not turn into empty calendars or apparent availability.

One booking form supports one-time training/assessment and recurring training.
The repeat editor supports 1–4 weekly day/time slots, every 1–4 weeks, an optional
end date and a first-eight-week preview. Saving is explicit, not triggered by
clicking a slot. Contact-only clients need no email or invitation. Completed-work
logging stays separate and uses the existing audited completion operation.

Standing bookings shows actual stored rules, not just a creation form. Coaches
can replace a rule's future schedule from an effective date or cancel remaining
future sessions. A replacement keeps client/trainer identity fixed and records
its predecessor. Previous/completed history remains unchanged. Future exceptions
block bulk replacement rather than being silently overwritten. Individual
rescheduling preserves the original recurring slot to prevent cron resurrection.
Owner administrative one-occurrence cancellation does not assess fees or send
messages. This is not a new cancellation/billing policy or a pause/resume system.

## Hosted contract

`0092_calendar_booking_controls.sql` adds the missing scheduling command layer:

- Caller-authenticated, assigned-client-scoped `execute_booking_command`.
- Immutable request receipts, optimistic revisions/timestamps and audited writes.
- Atomic, service-only `fill_recurring_window` for the configured scheduler.
- One-time `create_staff_session` uses the same receipts and closes its previous
  self-trainer/other-client assignment bypass. Exact retry cannot switch a
  scheduled command into a completed log or change note content.
- Cross-table conflict guards serialize scheduling changes and check overlapping
  sessions (trainer and client), classes (trainer) and trainer time blocks. They
  do not change pre-existing data. Status-only updates which keep an already
  occupied interval do not silently reconcile old overlaps.
- Direct authenticated recurring mutations are revoked; scoped reads remain.
  RLS stays enabled, and internal receipts are not directly exposed.

Rule edits and all resulting occurrence writes are one transaction: a conflict
rolls back the entire change. Spring DST gaps fail explicitly; the earlier
fall-back instant matches the existing Pacific application convention. The
rolling scheduler continues independent series and reports failures separately.
No schedule extension is run as part of migration application or QA.

A captured Vagaro occurrence remains an individual source-linked appointment.
An observed repeated pattern is NOT converted into a live repeat rule. Existing
imports, client identities, package balances, money and health records are not
changed by this release. The old bare DELETE recurring URL now fails closed and
requires the reviewed command rather than issuing an unaudited cancellation.

## Verification and limits

Behavioral tests cover slot context, exact-minute geometry, DST, previews,
request validation, lost-response retry and receipt identity. Isolated database
tests cover owner/assigned/unrelated/client/disabled personas, RLS and grants,
conflict rollback, end dates, exceptions, cancelled-slot preservation, direct
write protection, receipts and concurrent duplicate requests. CI remains the
full regression/lint/type/build/native simulator gate.

Responsive geometry and browser scroll tests use isolated synthetic fixtures,
not real clients or a signed-in production session. Physical iPhone/Safari and
real authenticated acceptance still require the latest preview. Do not promote
production or call mocked/local testing a live user acceptance pass.
