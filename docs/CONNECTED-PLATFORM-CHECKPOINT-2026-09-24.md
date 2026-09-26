# IMS connected platform checkpoint — 2026-09-24

This closes the website / Coach OS / generator audit chapter and defines the release boundary for the next build.

## Connected systems
| System | Release work | Current verified boundary |
| --- | --- | --- |
| IMS website | IMS858/IMS-Website-5-17 PR #3, `e1e39093b3451a6dd7f3c99c034e40bd18dbef58` | Contact handoff repair is committed, 19 synthetic tests pass, exact-head preview READY. Production website remains on the older Web3Forms/Vagaro deployment. |
| Coach OS | IMS858/coachos PR #18, `a472122f2a0b17179c63482dbae8af56abdef6bd` | Website receiver, Communications, Leads, billing, scheduling and release work are committed. Exact-head quality gate passed; Vercel deployment was rate-limited, so this head is not live-verified. |
| Program generator | IMS858/program-generator PR #1, `8f72b934e34daa20574898e92016c3a1ad8fd1a4` | 121-commit generator release is preserved, regression CI passed and exact-head preview is READY. PR remains draft/unmerged. |
| Supabase | `hatcusqagwpmebzsbolw` | 423 canonical records; 27 coach-confirmed mappings, 396 pending, 0 approved canonical rows and 0 client-visible exercises at the checkpoint. Client publication remains fail-closed. |
| Vagaro | production booking source | Remains read-only/source-of-truth during migration audit. No booking cutover is implied by this checkpoint. |

## Intended connections
1. Public website contact -> first-party Resend acceptance -> authenticated server-to-server Coach OS inquiry intake.
2. Website booking -> Vagaro until explicit cutover; do not create a second live booking authority.
3. Website client login -> Coach OS.
4. Coach OS assessment/program studio -> authenticated generator service -> private draft -> coach review -> server-side publication gates -> client plan.
5. Coach OS Communications -> lead inquiry workflow before conversion; private client thread after conversion.

## Release rules
- A committed connection is not a production connection.
- A READY preview is not authenticated end-to-end acceptance.
- Website email acceptance, Coach OS inquiry recording and visitor acknowledgement are separate outcomes.
- Generator familiarity/attestation does not replace exercise-specific mapping and safety review.
- Never enable `IMS_GENERATOR_CLIENT_RELEASE_APPROVED` until the canonical mapping/safety and paired acceptance gates are complete.
- Do not switch booking away from Vagaro until schedule/package reconciliation and cutover are explicitly approved.

## Next build
Owner Action Center: one operational queue connecting Communications, Leads, booking/session exceptions, package renewals, payment failures and program readiness to the record where the owner resolves the issue.
