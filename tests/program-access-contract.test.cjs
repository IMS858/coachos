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
