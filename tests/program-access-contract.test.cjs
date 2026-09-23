// Static security contract for client program delivery and publication.
// No real users, client IDs, tokens, or measurements belong in this test.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("client PDF requires auth, ownership, and published-like status", () => {
  const source = read("app/api/programs/[id]/pdf/route.ts");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /if \(!user\).*401/);
  assert.match(source, /program\.client_id !== user\.id/);
  assert.match(source, /\["published", "active", "completed"\]\.includes\(program\.status\)/);
  assert.match(source, /program\.data\?\.pdf_mode === "coach"/);
  assert.match(source, /Cache-Control": "private, no-store"/);
});

test("client PDF never falls back to legacy base64 for non-staff", () => {
  const source = read("app/api/programs/[id]/pdf/route.ts");
  assert.match(source, /const encoded = isStaff \? program\.data\?\.pdf_base64 : null/);
});

test("publish requires staff, reviewed client PDF, no pending edits, and optimistic concurrency", () => {
  const source = read("app/api/programs/[id]/publish/route.ts");
  assert.match(source, /\["owner", "trainer"\]\.includes\(profile\.role\)/);
  assert.match(source, /record\.data\.pdf_mode !== "client"/);
  assert.match(source, /record\.data\.review_status !== "ready_to_publish"/);
  assert.match(source, /record\.coach_edits && Object\.keys\(record\.coach_edits\)\.length/);
  assert.match(source, /\.eq\("updated_at", record\.updated_at\)/);
});

test("published client JSON is an allowlist and clears private generator inputs", () => {
  const source = read("app/api/programs/[id]/publish/route.ts");
  const safeStart = source.indexOf("const safeData = {");
  const safeEnd = source.indexOf("};", safeStart);
  assert.ok(safeStart >= 0 && safeEnd > safeStart, "safeData allowlist must exist");
  const safe = source.slice(safeStart, safeEnd);
  for (const forbidden of ["structured_program", "assessment_summary", "request_payload", "objective_summary", "coach_edits", "device_measurements", "voltra_sessions"]) {
    assert.doesNotMatch(safe, new RegExp(forbidden));
  }
  assert.match(source, /request_payload: null/);
  assert.match(source, /objective_summary: null/);
});

test("generated program publishing is locked until explicit release and all canonical approvals", () => {
  const source = read("app/api/programs/[id]/publish/route.ts");
  assert.match(source, /IMS_GENERATOR_CLIENT_RELEASE_APPROVED !== "true"/);
  assert.match(source, /mappings\.length !== 423/);
  assert.match(source, /fourWeekStructureIssues\(record\.data\.structured_program\)/);
  assert.match(source, /approvedIds\.has\(m\.matched_exercise_id\)/);
});

test("exercise review approval requires confirmed canonical mapping", () => {
  const source = read("app/api/exercise-reviews/route.ts");
  assert.match(source, /canonical_exercise_queue/);
  assert.match(source, /\.eq\("mapping_status","coach_confirmed"\)/);
  assert.match(source, /primary_joints_confirmed/);
  assert.match(source, /contraindications_confirmed/);
});

test("canonical identity mapping does not automatically grant safety approval", () => {
  const source = read("app/api/exercise-reviews/canonical/route.ts");
  assert.match(source, /safety_approved:false/);
  assert.match(source, /review_notes\.trim\(\)\.length<15/);
});

test("published generator page offers stored client PDF and hides raw generator inputs", () => {
  const page = read("app/programs/[id]/page.tsx");
  assert.match(page, /pdf_client_url, pdf_coach_url/);
  assert.match(page, /\(program as any\)\.pdf_client_url/);
  assert.match(page, /\/api\/programs\/\$\{id\}\/pdf/);
  assert.match(page, /isStaff && generated\.assessment_summary/);
  assert.match(page, /!hasGenerated && !isImsGenerator/);
  const publish = read("app/api/programs/[id]/publish/route.ts");
  assert.match(publish, /pdf_client_url/);
  assert.match(publish, /request_payload: null/);
});

test("published client PDF is independent of coach draft mode and never serves coach PDF", () => {
  const route = read("app/api/programs/[id]/pdf/route.ts");
  assert.match(route, /if \(!isStaff && !program\.pdf_client_url\)/);
  assert.match(route, /const pdfPath = isStaff && program\.data\?\.pdf_mode === "coach"/);
  assert.match(route, /\? program\.pdf_coach_url : program\.pdf_client_url/);
  assert.doesNotMatch(route, /!isStaff && \(!program\.pdf_client_url \|\| program\.data\?\.pdf_mode === "coach"\)/);
  assert.match(route, /Cache-Control": "private, no-store"/);
});

test("assessment pipeline cannot drop cardio restrictions or infer surgical clearance", () => {
  const route = read("app/api/generate/route.ts");
  assert.match(route, /cardio_profile: generatorCardioProfile\(ct, conditioning\)/);
  assert.match(route, /includeUnverifiedSurgicalHistory\(/);
  assert.match(route, /generatorRichRestrictions\(a\.pain_map/);
  assert.match(route, /\.\.\.recommendedTrainingDays\(sessionsPerWeek\)/);
  assert.doesNotMatch(route, /\.\.\.\(ct\.primary_machine \?/);
});
