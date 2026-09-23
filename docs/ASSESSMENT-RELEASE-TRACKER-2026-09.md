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
- [ ] Import-to-review live refresh without manually reloading
- [ ] Unsaved-change protection on browser navigation and reload

## 2. Device-to-generator contract — next
- [ ] Golden synthetic VOLTRA export matches Python parser/summary
- [ ] Explicit approved-only filtering, protocol and unit tests
- [ ] Historical assessment data with no device fields remains valid
- [ ] Exercise names, dates and left/right remain accurate in generator input
- [ ] No automatic 1RM or isometric inference from dynamic VOLTRA reps
- [ ] Review exact Python objective-measure schema for ActivForce
- [ ] Test out-of-date, missing, unsupported and conflicting measurements

## 3. Security and data integrity
- [ ] Decide whether device readings require staff-only table rather than assessment JSON (complete assessments have client RLS read)
- [ ] Client, trainer and owner authorization tests
- [ ] Concurrency, idempotency, duplicate CSV and partial failure tests
- [ ] Confirm no PHI in logs, generator errors or public program data
- [ ] Review service-role usage and private bucket policies
- [ ] Audit assessment and device retention requirements

## 4. Coach approval and PDF
- [ ] Edit exercise, dose, tempo and progression; save and reload
- [ ] Regenerate PDF; compare against reviewed structured program
- [ ] Publish only a valid reviewed draft with current PDF
- [ ] Client can retrieve published PDF, not draft/private coach artifacts
- [ ] Retry and rollback for failed generator, upload and publish steps

## 5. Synthetic end-to-end scenarios and release
- [ ] New client, returning client, mobility-focused and strength-focused
- [ ] Both devices, no devices, rejected measurements, pain constraints
- [ ] Real browser session with authorized synthetic test accounts
- [ ] CI, dependency audit, runtime smoke tests and release rollback
- [ ] Merge generator PR, Coach OS integration PR, then stacked premium UI PR after reconciliation
- [ ] Deploy to controlled environment; verify logs and client isolation

**Scope:** No VALD. Vagaro remains booking source of truth. No live device API claims. No production changes before these gates pass.
