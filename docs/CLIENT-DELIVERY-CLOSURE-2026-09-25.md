# Client delivery closure — implementation and acceptance

Baseline inspected: `a2047ce9b3852f4bde927a951d8a574df071d316`, quality gate #1148 passed. This changeset does not deploy, change hosted schema, publish programmes/exercises, send client messages, charge payments or activate classes.

## Connected workflow

My Plan always exposes SendToCoach, even without a published programme or assessment. A confirmed upload refreshes the page and appears in Form videos & coach feedback. Coach Action Center links to the exact submitted media record, so old queued clips remain reachable even beyond the profile's latest 20 submissions. The client profile and focused record page mount the same persisted thread with staff review controls. Playback is lazy and is authorized before a short-lived storage URL is signed. Preparing playback no longer writes a watched timestamp.

Finalizing feedback explicitly labels the text as client-visible. The UI preserves the draft on failure, disables edits while saving, validates the receipt, and refreshes only after confirmation. The database command locks the submitted media, validates active staff plus assigned-client scope, finalizes feedback and inserts its audit in one transaction. Identical retries are idempotent; a different finalized response cannot overwrite coaching history. A follow-up remains a new coaching message rather than a rewrite.

Client My Plan reads the saved response with the submission and review timestamps. Only awaiting_review records enter Action Center. The class-prep queue is rendered once through shared owner/trainer queues, while finance queries remain owner-only.

## Client navigation repair

Existing /sessions/:id links now dispatch clients to a read-only, own-appointment component before fetching staff notes or programme execution data. Requested slots are labeled awaiting coach confirmation, not confirmed. Staff still use the coaching workspace. The shared route policy allows client appointment detail to reach its ownership gate.

My Plan separates client submissions from coach demonstrations, preserves approved+visible exercise gating, removes duplicated programme links and shows per-section backend failures instead of fake empty states. No assessment is required for messaging or technique submissions.

## Privacy rollout — still staged

0066 adds review fields. New migration 0067 must follow it. 0067 removes direct authenticated/anonymous media-table mutation privileges (including TRUNCATE), adds a restrictive active/assigned media read guard, and prevents finalized feedback/identity rewrites. Reviewed exercise eligibility is required before client access to an exercise-associated media record. SQL review/archive commands are scoped and audited atomically. No record is physically deleted.

0068 blocks direct anonymous/authenticated Storage operations for the client-media bucket only, overriding broad legacy staff policies without changing other buckets. Server signing endpoints perform the account/client/assignment checks first. Already-issued bearer URLs last until expiry; this patch does not revoke them. Hosted rehearsal must exercise real signed uploads/playback before rollout; SQL tests do not emulate the Storage HTTP service.

Staff upload-url, file-save and demonstration-assignment endpoints share active owner/primary-trainer/client authorization. Staff file paths cannot impersonate from-client submissions. A saved upload is verified against Storage metadata and retains its upload identity for repeat saves. The dedicated send-video frontend's interrupted-upload recovery still needs physical-device acceptance.

Approved library demo assignment uses a narrow database command: explicit selection, visibility and safety checks, client-scoped lock, duplicate-safe inserts and an atomic audit. It does not publish a programme prescription. Repeated selections leave existing notes unchanged; concurrent calls add a single active demo. Notification delivery remains separate and existing notification providers are mocked in tests; none were invoked against real clients.

Read-only hosted inspection found no review_status column and no create_staff_session or cancel_recurring_series command. Relevant 0064–0068 changes must be rehearsed and applied before a frontend using them is released. Do not treat source CI as proof of hosted alignment.

## Verification

Tests execute real 0066+0067+0068 SQL using isolated PostgreSQL in CI (temporary databases under localhost ims_ci only), falling back to PGlite locally. Coverage includes active/other/deleted/missing/anonymous roles, restrictive policies versus inherited broad reads, unapproved demonstrations, queued-to-reviewed persistence, duplicate/concurrent reviews and assignments, mutation denials, archive scoping, direct Storage-policy bypass prevention and audit-failure rollback. API handler tests verify origin/auth failures, missing commands, malformed success receipts, denied signing, incomplete files and read-only playback. Frontend wiring checks are not physical iPhone acceptance.

## Still required before real-client launch

- Verify exact-head full CI, then isolated hosted schema rehearsal and controlled migration rollout; 0064/0065 booking commands need deeper transactional acceptance before activation.
- Authenticated owner/trainer/two-client browser acceptance: record MOV on iPhone, failed-network retry, feedback save, Action Center refresh, client feedback visibility, other-client denial and appointment navigation.
- Current source still has separate quick-program and generator publication gates. This patch does not release blocked generator content or claim quick drafts are delivered.
- Verify messaging notification delivery separately; feedback is available in-app and no email/push is claimed by review finalization.
- Audit all older/native Storage callers before 0068 rollout; existing browser signed-upload routes are preserved, not proof of native-app compatibility.
- No class registration, credit consumption, payroll submission, QuickBooks authorization retry or Vagaro migration in this pass.
