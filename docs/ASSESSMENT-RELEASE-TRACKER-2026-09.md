# IMS assessment release tracker — September 2026

This checklist is the release sequence. CI success proves compilation, not runtime behavior or clinical appropriateness. Do not merge or deploy until gates are verified.

## 1. Assessment studio UI — implementation complete, visual QA pending
- [x] Warm ivory/charcoal/sage assessment workspace and step progress
- [x] Cohesive ActivForce, VOLTRA, and combined review cards below the wizard
- [x] Responsive two-column objective testing layout, single-column mobile
- [x] Visible saving/unsaved/saved status, network failure handling
- [x] Confirm before navigating between wizard sections with unsaved edits
- [x] Remove service-role fallback for staff assessment reads
- [ ] Visual QA at 375px, 768px, 1280px and iOS Safari
- [ ] Keyboard, screen-reader and high-contrast form audit
- [ ] New assessment redirect, resume, reload, finish and stale-tab QA
- [x] Import-to-review refresh without manually reloading (browser QA pending)
- [x] Unsaved-change protection for section navigation and browser reload (in-app route QA pending)

## 2. Device-to-generator contract — next
- [ ] Golden synthetic VOLTRA export matches Python parser/summary (Coach OS regression suite added; cross-language parity pending)
- [x] Added synthetic approved-only, explicit ROM mode, isometric protocol, unit and side regression tests (CI verification pending)
- [x] Added regression test for historical assessments with no device fields (CI verification pending)
- [ ] Exercise names, dates and left/right remain accurate in generator input
- [x] Dynamic VOLTRA stays descriptive; added regression test (CI verification pending)
- [ ] Review exact Python objective-measure schema for ActivForce
- [ ] Test out-of-date, missing, unsupported and conflicting measurements

## 3. Security and data integrity
- [ ] Decide whether device readings require staff-only table rather than assessment JSON (complete assessments have client RLS read)
- [ ] Client, trainer and owner authorization tests
- [ ] Concurrency, idempotency, duplicate CSV and partial failure tests
- [x] Remove upstream error-body logging, require authenticated generator, archive private draft metadata and allowlist published program data (runtime access tests pending)
- [ ] Review service-role usage and private bucket policies
- [ ] Audit assessment and device retention requirements

## 4. Coach approval and PDF
- [ ] Edit exercise, dose, tempo and progression; save and reload
- [x] Implement reviewed PDF regeneration with private storage and optimistic concurrency (live PDF comparison pending)
- [x] Add dedicated reviewed publish endpoint; block generic publish bypass (authenticated E2E pending)
- [x] Enforce explicit client ownership and published-only PDF access in route (client-account E2E pending)
- [ ] Retry and rollback for failed generator, upload and publish steps

## 5. Synthetic end-to-end scenarios and release
- [ ] New client, returning client, mobility-focused and strength-focused
- [ ] Both devices, no devices, rejected measurements, pain constraints
- [ ] Real browser session with authorized synthetic test accounts
- [ ] CI, dependency audit, runtime smoke tests and release rollback
- [ ] Merge generator PR, Coach OS integration PR, then stacked premium UI PR after reconciliation
- [ ] Deploy to controlled environment; verify logs and client isolation

**Scope:** No VALD. Vagaro remains booking source of truth. No live device API claims. No production changes before these gates pass.

## Integration audit notes (latest)
- The Coach OS integration branch now includes dedicated regenerate and publish routes adapted from the stacked premium UI branch. Reconcile duplicate endpoint versions when stacking/merging PR #4; do not blindly overwrite the private-storage-column contract.
- Initial generator output is a draft and requires coach edits plus a reviewed regeneration before publication. Synthetic unit and TypeScript checks are not a full assessment-to-PDF test.
- **Release blocker:** completed assessments still embed raw ActivForce and VOLTRA data in assessments.data, which clients can read under current assessment RLS. Move raw records to a staff-only table or explicitly approve client visibility before production.
- **Release blocker:** run authenticated staff/client E2E against an isolated environment and verify generator deployment compatibility, private bucket, coach review, regenerated PDF and publication.
