import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseIdentityRequest, provisionMigrationClient, MigrationIdentityError, type IdentityAdmin, type IdentityDatabase} from "../lib/migration/provision-client";
function fixture() {
 const request = {record_id: randomUUID(), source_hash: "a".repeat(64), manifest_sha256: "b".repeat(64)};
 const reservation = {...request, ok: true, client_id: randomUUID(), email: "source@example.test", full_name: "Synthetic Source Client", status: "reserved"};
 const metadata = {ims_migration_record_id: request.record_id, ims_migration_source_hash: request.source_hash, ims_migration_manifest_sha256: request.manifest_sha256};
 const user = {id: reservation.client_id, email: reservation.email, app_metadata: metadata};
 let saved = false, created = 0, finalized = 0;
 const admin: IdentityAdmin = {
  getUserById: async () => saved ? {data: {user}, error: null} : {data: {user: null}, error: {status: 404, code: "user_not_found"}},
  createUser: async (attributes) => {created++; assert.equal(attributes.id, reservation.client_id); assert.equal(attributes.email_confirm, false); assert.equal("password" in attributes, false); assert.deepEqual(attributes.app_metadata, metadata); saved = true; return {data: {user}, error: null};},
 };
 const db: IdentityDatabase = {rpc: async (name) => name === "prepare_migration_client_identity" ? {data: reservation, error: null} : (finalized++, {data: {ok: true, record_id: request.record_id, client_id: reservation.client_id, status: "finalized", invitation_sent: false, deduped: false}, error: null})};
 return {request, reservation, user, admin, db, created: () => created, finalized: () => finalized};
}
test("request accepts only exact source identifiers, never a supplied contact or trainer", () => {
 const {request} = fixture(); assert.deepEqual(parseIdentityRequest(request), request);
 for (const value of [null, {}, {...request, email: "other@example.test"}, {...request, record_id: "wrong"}, {...request, source_hash: "no"}]) assert.throws(() => parseIdentityRequest(value), MigrationIdentityError);
});
test("source-bound new identity is created without password, confirmation or invitation and retry reuses it", async () => {
 const f = fixture(); const result = await provisionMigrationClient(f.db, f.admin, f.request); assert.equal(result.invitation_sent, false); assert.equal(result.status, "finalized");
 await provisionMigrationClient(f.db, f.admin, f.request); assert.equal(f.created(), 1);
});
test("database authorization or source refusal occurs before any admin account call", async () => {
 const f = fixture(); for (const code of ["42501", "23514", "40001"]) {f.db.rpc = async () => ({data: null, error: {code}}); await assert.rejects(provisionMigrationClient(f.db, f.admin, f.request), MigrationIdentityError);}
 assert.equal(f.created(), 0); assert.equal(f.finalized(), 0);
});
test("incomplete reservation cannot trigger auth creation", async () => {
 const f = fixture(); f.db.rpc = async () => ({data: {...f.reservation, source_hash: "c".repeat(64)}, error: null});
 await assert.rejects(provisionMigrationClient(f.db, f.admin, f.request), /incomplete/); assert.equal(f.created(), 0);
});
test("unknown lookup failures are not treated as a missing account", async () => {
 const f = fixture(); for (const code of ["unexpected_failure", "not_authorized"]) {f.admin.getUserById = async () => ({data: {user: null}, error: {status: 500, code}}); await assert.rejects(provisionMigrationClient(f.db, f.admin, f.request), /lookup/);}
 assert.equal(f.created(), 0);
});
test("concurrent duplicate creation recovers only the same reserved identity", async () => {
 const f = fixture(); let calls = 0;
 f.admin.getUserById = async () => ++calls === 1 ? {data: {user: null}, error: {status: 404, code: "user_not_found"}} : {data: {user: f.user}, error: null};
 f.admin.createUser = async () => ({data: {user: null}, error: {code: "email_exists", status: 422}});
 assert.equal((await provisionMigrationClient(f.db, f.admin, f.request)).client_id, f.reservation.client_id);
});
test("another account or untrusted metadata cannot be merged into source client", async () => {
 const f = fixture(); f.admin.getUserById = async () => ({data: {user: {...f.user, app_metadata: {}}}, error: null});
 await assert.rejects(provisionMigrationClient(f.db, f.admin, f.request), /does not match/); assert.equal(f.created(), 0); assert.equal(f.finalized(), 0);
});
test("finalization failure is pending, not success, and retry never creates another identity", async () => {
 const f = fixture(); const normal = f.db.rpc; f.db.rpc = async (name, args) => name.startsWith("finalize") ? {data: null, error: {code: "network"}} : normal(name, args);
 await assert.rejects(provisionMigrationClient(f.db, f.admin, f.request), /could not confirm/); assert.equal(f.created(), 1);
 f.db.rpc = normal; assert.equal((await provisionMigrationClient(f.db, f.admin, f.request)).status, "finalized"); assert.equal(f.created(), 1);
});
test("already-finalized source does not touch Auth Admin", async () => {
 const f = fixture(); f.reservation.status = "finalized"; f.admin.getUserById = async () => {throw Error("should not be called");};
 assert.equal((await provisionMigrationClient(f.db, f.admin, f.request)).deduped, true); assert.equal(f.created(), 0);
});
test("migration route checks origin, authenticated owner and bounded source body before service credentials", () => {
 const route = readFileSync("app/api/migration/clients/provision/route.ts", "utf8");
 assert.match(route, /getUser\(/); assert.match(route, /role !== "owner"/); assert.match(route, /profile\.data\.deleted_at/); assert.match(route, /smallJson\(request, 2048\)/); assert.match(route, /headers\.get\("origin"\)/);
 assert.ok(route.indexOf("profile.data.deleted_at") < route.indexOf("const service = createServiceClient()"));
 assert.doesNotMatch(route, /sendLoginInvite|inviteUserByEmail|generateLink|signUp|email_confirm:\s*true/);
});
