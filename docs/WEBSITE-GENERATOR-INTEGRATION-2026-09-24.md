# Paired website / Coach OS / generator release checkpoint

Inspected 2026-09-24. This pass uses read-only hosted queries and synthetic tests. No production mutations, promotion, real contact submissions, emails or payments were performed.

## Evidence, not inferred completion
| Component | Saved code at inspection | Production / preview evidence |
| --- | --- | --- |
| Coach OS | PR #18 draft, `release/ims-unified-2026-09`, parent `2121576d63e687aff74b4d4ac439494bc3cef6a8` | Production `coachos-opal.vercel.app` READY at `41487409c0b89a9e2bccf8c5b779659714ee6bee`, deployment `dpl_q9ia6KEDVvDt67VxXhWK2nzjtkyu` |
| Website | PR #3 `feature/direct-contact-email-2026-09`; handoff repair `e1e39093b3451a6dd7f3c99c034e40bd18dbef58` | `imsmethod.com` READY at `345e1adae7f49c928f5829ede54456a750c59801`, deployment `dpl_C8MZQXdsxb2wsMbwkf1RjaWyZ4PU`; production contact still posts to Web3Forms |
| Generator | PR #1 draft, `audit/fix-generator-reliability-2026-09`, `8f72b934e34daa20574898e92016c3a1ad8fd1a4`; 121 commits in PR | Exact-head regression run `35923051670` SUCCESS; preview `dpl_C5wTEMhm13wDA6JqGWtkkzHQVHVv` READY. GET `/api/version` from that preview returned an SSO redirect, not an app-level version verification |

Website main is `62556241640e723c1febb4107f3b010a11912944`, newer than its verified production deployment. The organic-growth website branch is separate from PR #3. Do not promote a branch merely because code was committed.

## Actual website flow today vs release intent
Production contact: website → Web3Forms. Production booking: website → Vagaro. Client login points to the older Coach OS production alias. No direct production inquiry-to-Coach-OS acceptance was demonstrated.

Release intent: website `/api/contact` → Resend studio acceptance → authenticated Coach OS intake → separate visitor acknowledgement. Acceptance is not confirmed delivery or a personal coach reply. Server-to-server sync uses only an explicit HTTPS endpoint and shared secret. Preview contact sending is off by default in the website repair.

## Receiver corrections in this patch
- Strict typed fields and a byte-limited request stream; no silent truncation of inquiry text.
- Provider ID retained as `inquiry_id`, stable replay dedupe and conflict response if reference/content disagree. Legacy payloads without an ID remain accepted using a deterministic fingerprint.
- Repeat inquiries append to the same uniquely matched lead without changing source, lifecycle, contact timestamp, client account or billing. In particular, a converted lead must not be reset to `new` just to light an inbox badge.
- Case-insensitive exact-email lookup escapes SQL pattern wildcards and refuses ambiguous matches.
- Optimistic note updates retry on contention rather than overwrite staff notes or concurrent inquiries.
- No outbound messages, account creation or migrations in the receiver.

## Still not a complete communications integration
- Inquiries remain reference-tagged lead notes, not a dedicated durable inbound-message table. A independent unread-inquiry state and deep-linked readable inquiry history should replace stage resets. Existing Communications stage filters do not guarantee visibility of a repeat inquiry on a converted/booked lead.
- First-record races involving different names/phones with the same email are not serialized by a database uniqueness constraint. The receiver detects ambiguity but does not claim globally exactly-once identity creation. Rehearse a dedicated inquiry ledger / atomic intake RPC in staging before calling ingestion lossless.
- Website sync is best effort after email provider acceptance; it logs an outcome/reference but has no durable auto-replay worker. Accepted emails needing reconciliation must be replayed with the same provider reference.
- Resend idempotency is a 24-hour provider window, not an unlimited dedupe guarantee.
- Direct Gmail replies and delivery/bounce events do not automatically become private client chat messages. No inbound email reply ingestion was verified.
- Rental inquiries, chatbot submissions, and Vagaro appointments are separate source paths, not silently included.

## Generator release remains gated
Read-only Supabase checkpoint: 423 canonical records; mapping status 27 coach_confirmed / 396 pending; approved canonical view 0; client-visible exercises 0. Preserve owner familiarity attestation separately from technical exercise mapping and exercise-specific safety review. Do not bypass `IMS_GENERATOR_CLIENT_RELEASE_APPROVED`, mapping/safety checks, reviewed PDF integrity or draft-only saves.

Paired app→generator authentication/configuration, live generator SHA behind the configured URL, version/protocol compatibility, hosted migration rehearsal, coach review and authorized synthetic end-to-end generation/publish refusal tests remain required. A READY Python preview plus a passing CI suite is not proof all live workflows work or all exercise mappings are complete.

## Verification
- Website patch includes 19 synthetic contact tests plus its own CI workflow.
- This patch includes 22 synthetic receiver tests in the existing Coach OS quality gate.
- Tests do not call real services, send email or change hosted records. Record exact-head CI/deployment results separately after the run completes.
