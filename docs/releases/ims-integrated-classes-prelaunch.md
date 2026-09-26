# Integrated IMS private coaching + group coaching checkpoint

This release preserves the native class system, including class templates, recurring rules, occurrence-linked coach programs, class access products, immutable credit evidence, delivery notes, instructor compensation rules, program assignments, explicit growth-source fields, Class Intelligence and Today/Schedule/Capacity integrations.

Class Operations now links an owner-only Launch Control page. Inventory counts are exact permitted source counts, never a readiness score or accounting/valuation statement. Missing tables and query failures are unavailable, not zero.

## Important launch boundary
Registration remains PRELAUNCH. The initial booking/cancellation prototype is retained for historical tests but is not an authorized runtime path after the final migration. The client API returns an explicit prelaunch response, and authenticated execution of the database booking/cancellation functions is revoked. Client catalog cards show planned capacity, never fictional available seats from client-scoped RLS.

Do not re-enable these functions with a UI flag. A reviewed follow-up must implement reciprocal PT/class coach/room/client conflict protection, capacity and cancellation locking, stable immutable enrollment identity, explicit cancellation/entitlement rules, bounded waitlist offers and consent, atomic attendance/audit/credit handling, concurrency tests, and explicit owner launch approval. Creating a template does not fulfill those checks.

Client Progress and Classes use an own-account class-participation allowlist. Recorded attendance is counted only for completed past occurrences with plausible attendance timestamps. It stays separate from PT totals, exercise prescriptions, class credits, revenue and payroll. Private class programs, delivery notes and instructor compensation never go to the client projection.

## Migration consolidation
The conflicting session guardrail migration was renamed from 0048_session_execution_guardrails.sql to 0056_session_execution_guardrails.sql WITHOUT changing its SQL. Class migrations 0048_group_classes through 0055 retain their existing numbers. A new regression test rejects duplicate numeric prefixes.

Dependencies:
- 0046 program decision notes
- 0047 session exercise performance
- 0048–0055 native class schema
- 0056 session performance privacy, audited writes and safe client history
- 0057 class prelaunch permissions, active-account boundaries and safe class participation

The session subsystem can be applied as 0046 + 0047 + 0056 in one verified transaction; class subsystem as 0048–0055 + 0057 in one verified transaction. Never expose 0047 raw client rows without 0056. Never launch the initial class booking functions without 0057/future reviewed replacement. Recheck hosted migration history before either operation.

Source commits, passing CI, hosted schema, verified browser behavior and a Vercel deployment are separate release states. No document or configuration count makes any unverified state green.
