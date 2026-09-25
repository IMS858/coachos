# IMS Coach OS — Group Coaching Architecture
Status: staged on release/ims-unified-2026-09. Do not publish classes or apply staged class migrations until exact-head CI is green.

## Product model
Group coaching is a native Coach OS workflow:
template -> recurring series -> occurrence -> assigned coach plan -> booking/waitlist -> roster -> attendance -> delivery evidence -> client progress -> class intelligence.

## Hard boundaries
- New templates default private.
- Public class description is separate from coach programming IP.
- Class booking does not consume PT packages.
- Class access/credits are separate from PT packages.
- Credit ledger exists as immutable architecture but automatic consumption is not active.
- Client price never determines instructor compensation.
- Class compensation is owner-only and not calculated/submitted yet.
- Growth attribution is null unless explicitly recorded later.
- Class Intelligence is descriptive evidence, not a forecast or recommendation.

## Current staged migrations
0048 group classes
0049 recurring series + class access
0050 immutable credit ledger
0051 structured class programming
0052 delivery notes
0053 instructor compensation rules
0054 program assignment history
0055 growth attribution

## Experience
Client: Book -> Classes -> capacity/waitlist -> attendance appears in Progress.
Trainer: Today -> assigned class -> plan -> roster -> attendance -> delivery note.
Owner: Class Operations -> Class Intelligence -> IMS Operating System/capacity.

## Next after green
Apply migrations in order with hosted verification, then build entitlement transactions, class program multi-exercise editing/version approval, attendance reconciliation, payroll review integration, and explicit growth attribution workflow. Vercel remains frozen until the integrated release is green.
