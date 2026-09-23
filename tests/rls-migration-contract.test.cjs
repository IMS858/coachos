// Static guardrails for the checked-in SQL migrations. These are NOT authenticated RLS E2E tests.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const migration = (name) => fs.readFileSync(path.join(__dirname, "..", "packages/db/migrations", name), "utf8");

test("role helpers retain caller-scoped identity and exclude deleted staff", () => {
  const sql = migration("0020_fix_rls_recursion.sql");
  for (const helper of ["is_trainer", "is_owner"]) {
    const match = sql.match(new RegExp("CREATE OR REPLACE FUNCTION " + helper + "\\(\\).*?\\$\\$([\\s\\S]*?)\\$\\$;", "i"));
    assert.ok(match, helper + " must be defined in the RLS recursion fix");
    assert.match(match[0], /SECURITY DEFINER/i);
    assert.match(match[0], /SET search_path = public/i);
    assert.match(match[1], /id\s*=\s*auth\.uid\(\)/i);
    assert.match(match[1], /deleted_at\s+IS\s+NULL/i);
    assert.doesNotMatch(match[1], /raw_user_meta_data|user_metadata/i);
  }
});

test("client program RLS is both owner-scoped and publication-gated", () => {
  const sql = migration("0001_initial_schema.sql");
  const policy = sql.match(/CREATE POLICY programs_self_read ON programs[\s\S]*?;/i);
  assert.ok(policy, "client program SELECT policy must exist");
  assert.match(policy[0], /FOR SELECT TO authenticated/i);
  assert.match(policy[0], /client_id\s*=\s*auth\.uid\(\)/i);
  assert.match(policy[0], /status IN \('published', 'active', 'completed'\)/i);
  assert.doesNotMatch(policy[0], /draft/i);
});

test("message staff policy delegates to scoped helper, not recursive profiles lookup", () => {
  const sql = migration("0020_fix_rls_recursion.sql");
  const policy = sql.match(/CREATE POLICY messages_staff_all ON messages[\s\S]*?;/i);
  assert.ok(policy);
  assert.match(policy[0], /USING \(is_trainer\(\)\)/i);
  assert.match(policy[0], /WITH CHECK \(is_trainer\(\)\)/i);
  assert.doesNotMatch(policy[0], /SELECT\s+role\s+FROM\s+profiles/i);
});
