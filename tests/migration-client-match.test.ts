import test from "node:test";
import assert from "node:assert/strict";
import { matchMigrationClients } from "../lib/migration/client-match";

test("unique valid contact plus full name is a proposal; name-only needs review", () => {
  const results = matchMigrationClients([
    { source_id: "a", name: "Alex North", email: " ALEX@example.com " },
    { source_id: "b", name: "Taylor West" },
  ], [
    { id: "1", name: "Alex North", email: "alex@example.com" },
    { id: "2", name: "Taylor West" },
  ]);
  assert.equal(results[0].status, "matched");
  assert.ok(results[0].basis.includes("contact_proposal_not_approval"));
  assert.equal(results[1].status, "needs_review");
  assert.deepEqual(results[1].basis, ["name_only"]);
});

test("shared destination contact never picks one destination", () => {
  const [result] = matchMigrationClients([{ source_id: "a", name: "Alex North", email: "shared@example.com" }],
    [{ id: "1", name: "Alex North", email: "shared@example.com" }, { id: "2", name: "Sam North", email: "shared@example.com" }]);
  assert.equal(result.status, "needs_review");
  assert.equal(result.destination_id, null);
});

test("two matching contacts do not merge a different household member", () => {
  const [result] = matchMigrationClients([
    { source_id: "a", name: "Morgan South", email: "family@example.com", phones: ["8585550101"] },
  ], [{ id: "1", name: "Casey South", email: "family@example.com", phone: "8585550101" }]);
  assert.equal(result.status, "needs_review");
  assert.equal(result.destination_id, null);
  assert.ok(result.basis.includes("name_difference"));
});

test("shared source household contact holds parent and child", () => {
  const results = matchMigrationClients([
    { source_id: "parent", name: "Alex North", email: "shared@example.com" },
    { source_id: "child", name: "Sam North", email: "shared@example.com" },
  ], [{ id: "1", name: "Alex North", email: "shared@example.com" }]);
  assert.ok(results.every((row) => row.status === "needs_review" && row.destination_id === null));
  assert.ok(results.every((row) => row.basis.includes("shared_source_contact")));
});

test("malformed emails and empty placeholders are not contact evidence", () => {
  const [result] = matchMigrationClients([{ source_id: "a", name: "Alex North", email: "alex@example.com123" }],
    [{ id: "1", name: "Alex North", email: "alex@example.com123" }]);
  assert.equal(result.status, "needs_review");
  assert.deepEqual(result.basis, ["name_only"]);
});

test("country prefix and repeated phone fields normalize without duplicate-person inference", () => {
  const [result] = matchMigrationClients([
    { source_id: "a", name: "  Alex   North ", phones: ["+1 (858) 555-0101", "8585550101"] },
  ], [{ id: "1", name: "alex north", phone: "858-555-0101" }]);
  assert.equal(result.status, "matched");
});

test("duplicate source IDs fail closed", () => {
  const results = matchMigrationClients([
    { source_id: "a", name: "Alex North", email: "alex@example.com" },
    { source_id: "a", name: "Alex North", email: "alex@example.com" },
  ], [{ id: "1", name: "Alex North", email: "alex@example.com" }]);
  assert.ok(results.every((row) => row.status === "needs_review" && row.destination_id === null));
});

test("separate contact paths cannot merge multiple source identities", () => {
  const results = matchMigrationClients([
    { source_id: "a", name: "Alex North", email: "alex@example.com" },
    { source_id: "b", name: "Alex North", phones: ["8585550101"] },
  ], [{ id: "1", name: "Alex North", email: "alex@example.com", phone: "8585550101" }]);
  assert.ok(results.every((row) => row.status === "needs_review" && row.destination_id === null));
  assert.ok(results.every((row) => row.basis.includes("multiple_source_claims")));
});

test("ambiguous full names and conflicting email/phone candidates are held", () => {
  const destinations = [
    { id: "1", name: "Alex North", email: "alex@example.com", phone: "8585550101" },
    { id: "2", name: "Alex North", email: "other@example.com", phone: "8585550102" },
  ];
  const [nameOnly, conflict] = matchMigrationClients([
    { source_id: "a", name: "Alex North" },
    { source_id: "b", name: "Alex North", email: "alex@example.com", phones: ["8585550102"] },
  ], destinations);
  assert.deepEqual(nameOnly.basis, ["ambiguous_name"]);
  assert.deepEqual(conflict.basis, ["conflicting_contact"]);
  assert.equal(nameOnly.destination_id, null);
  assert.equal(conflict.destination_id, null);
});
