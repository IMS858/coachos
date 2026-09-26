# Vagaro evidence run — September 25, 2026

## Execution receipt: PARTIAL HOSTED STAGING

Batch: `7dec2291-3a2e-4daf-bad8-2005ab6666a9`.
Source file SHA-256: `eff3311483af05cf9e59a8086240e73cc2a6783902a0a8aab56e261f09de5455`.
Source date: September 24, 2026. The workbook does not establish an exact capture time; the existing batch end-of-day timestamp must not be treated as a verified observation time.

All 1,501 evidence records were parsed and evaluated locally, preserving source sheet, row, original fields, original types, parent identity and payload checksum:

| Evidence | Local records | Confirmed hosted | Still pending hosted |
| --- | ---: | ---: | ---: |
| Clients | 328 | 250 | 78 |
| Appointments | 854 | 0 | 854 |
| Observed recurring patterns | 62 | 0 | 62 |
| Packages | 9 | 0 | 9 |
| Memberships | 7 | 7 | 0 |
| Transaction lines | 241 | 0 | 241 |
| Total | 1501 | 257 | 1244 |

The first two successful source chunks were committed to migration evidence only, with an audit record in the same transaction. The audit identifies administrative connector execution, not an impersonated application login. A subsequent source write and a destination refresh were blocked by connector safety checks. Hosted operations stopped; no alternate access route was attempted. Do not report all records as hosted or reconciled.

No operational client, session, plan, payment, credit or subscription was created in this run. No invitation, message, charge, Vercel deployment or authentication-email change occurred. Production baseline repair and authenticated acceptance are not completed by this data run.

## Destination preflight / freshness

Successful read-only preflight at `2026-09-26T02:46:46.225626+00:00`: 22 operational clients, 26 sessions, no future active sessions at that instant, 16 active plans, no payment rows; target batch was draft with zero records before these writes.

A fresh detailed destination snapshot was blocked. Local client comparisons therefore use the earlier 22-client snapshot retained in the conversation and are **proposals requiring refresh**, not final identity approval. Staff mapping uses the owner's explicit clarification: Madrid is the trainer, Filkey is a separate client/property manager. The current contact email and the last verified authentication email remain different; no login change was performed.

## Client crosswalk

- 15 unique contact + full-name proposals.
- 4 name-only reviews.
- 2 contact matches with different names, held rather than merged.
- 2 shared household-contact records, held rather than merged.
- 1 staff/customer-namespace record requiring separate handling.
- 304 with no destination candidate in the earlier snapshot. These are not automatically new accounts or active leads.

The prior matcher accepted a unique email OR phone without considering source-side household sharing or a different full name. This run adds full-roster source contact checks, full-name corroboration, malformed-email rejection, duplicate identity checks and many-source/one-destination protection. Sanitized regression tests execute the matcher. A matched return value remains a proposal, not approval to import.

## Schedule dry-run

854 distinct captured appointments: 606 Jason and 248 Gabriel. At the stated reference instant, the captured dataset contains 44 past and 810 future appointments. The future subset concerns **24** source client candidates (27 across the entire captured calendar): 11 contact-supported proposals, 8 without a destination candidate, 3 name-only, 1 name discrepancy and 1 shared-contact review.

Across all 854 appointments, 486 rows have contact-supported client proposals, 164 lack a destination candidate, 113 require shared-contact review, 54 name-only review and 37 name-discrepancy review.

**All 854 remain HOLD, not ready for operational import.** The workbook explicitly labels duration as inferred from calendar geometry, source timezone as unverified and appointment client IDs as candidates. A fresh destination collision check and explicit import approval are also outstanding. The existing schedule dry-run helper does not establish these missing facts and was not used as import authorization.

No same-trainer overlap was found using the captured 60-minute geometry. One appointment has a 90-minute service title but 60-minute geometry: this produces a conditional 30-minute overlap if the service-title duration is correct. This is unresolved evidence, not a verified collision or a clean-calendar claim.

62 observed patterns are not 62 verified recurring series. Only three pattern rows contain viewed rule descriptions, covering two rule descriptions; series IDs and exception coverage remain incomplete. Do not generate uncaptured future occurrences from pattern inference.

## Package and financial evidence

Nine package records include four Outstanding rows displaying 51 sessions and $4,350 in package value. Actual eligible consumption, shared owners and authoritative remaining balances are unresolved. Prior owner statements are preserved separately from source balances; neither is silently substituted for the other.

Seven source memberships sum to $5,685/month in contractual source prices. This is not collected revenue and no recurring billing was activated.

241 transaction lines represent 231 parent transaction IDs. Seven parents have multiple lines, which must not be collapsed. Two negative refund lines and two associated positive lines marked refunded must be retained without double subtraction. The source UI action labelled Refund is not proof of a refund. Invoice/IOU and package allocations are not automatically fresh cash or current receivables.

An internal audit discrepancy remains: all 241 transaction quantity cells are 1, but the audit-summary quantity claim is 239. Do not silently fix or reconcile it. Current debt, cash credit and authoritative remaining sessions are unknown, not zero.

## Portable review output

A private editable XLSX contains Client Crosswalk, Calendar Review, Calendar Conflicts, Package Review, Membership Review, Transaction Evidence, Series Evidence, Staff Mapping and Run Summary. Owner-input fields are distinct from preserved source fields. Edits do not sync or authorize writes. A launch-priority CSV focuses on the 24 future-calendar client candidates.

The private evidence bundle includes the original source workbook, all raw source records, supplementary audit evidence, provisional crosswalk, calendar holds, financial review, checksums, verification results and partial-execution receipt. Raw customer data is not committed to this repository.

## Outstanding gate

Resume only through authorized access after the connector block is resolved; first verify the exact saved chunk identities and payload hashes to avoid duplicates. Refresh destination evidence, verify source time/duration/client/series facts, review client matches, and obtain explicit operational import approval. Staging, identity proposals, successful CI and owner-editable spreadsheets are not proof of a production cutover.
