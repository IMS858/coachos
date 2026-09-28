/** Server orchestration only. Source fields come from an owner-authorized database reservation,
 * never the request body. This path cannot send invites, confirm contact ownership or create billing.
 */
export type IdentityRequest = {record_id: string; source_hash: string; manifest_sha256: string};
export type IdentityReceipt = IdentityRequest & {client_id: string; status: "finalized"; ok: true; invitation_sent: false; deduped: boolean};
type Failure = {code?: string; status?: number; message?: string};
type Result = {data: unknown; error: Failure | null};
type AuthUser = {id: string; email?: string; app_metadata: Record<string, unknown>};
type AuthResult = {data: {user: AuthUser | null}; error: Failure | null};
export type IdentityDatabase = {rpc: (name: string, args: Record<string, string>) => PromiseLike<Result>};
export type IdentityAdmin = {
 getUserById: (id: string) => Promise<AuthResult>;
 createUser: (attributes: {id: string; email: string; email_confirm: false; user_metadata: {full_name: string}; app_metadata: Record<string, string>}) => Promise<AuthResult>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export class MigrationIdentityError extends Error {
 constructor(message: string, readonly status: number) {super(message); this.name = "MigrationIdentityError";}
}
export function parseIdentityRequest(value: unknown): IdentityRequest {
 const row = object(value);
 if (!row || Object.keys(row).length !== 3 || typeof row.record_id !== "string" || !UUID.test(row.record_id)
  || typeof row.source_hash !== "string" || !HASH.test(row.source_hash)
  || typeof row.manifest_sha256 !== "string" || !HASH.test(row.manifest_sha256)) {
  throw new MigrationIdentityError("Source record, source hash and batch manifest are required. Contact fields cannot be supplied here.", 400);
 }
 return {record_id: row.record_id, source_hash: row.source_hash, manifest_sha256: row.manifest_sha256};
}
function databaseFailure(error: Failure): never {
 if (error.code === "42501") throw new MigrationIdentityError("Active owner access is required.", 403);
 if (error.code === "P0002") throw new MigrationIdentityError("Source record was not found.", 404);
 if (["22023", "23514", "23505", "40001"].includes(error.code ?? "")) {
  throw new MigrationIdentityError("Source identity is missing, shared, already mapped, held or changed. Resolve the exception rather than guessing or merging accounts.", 409);
 }
 throw new MigrationIdentityError("Identity storage could not confirm this step. Retry the same source record; do not create another account.", 503);
}
export async function provisionMigrationClient(db: IdentityDatabase, admin: IdentityAdmin, input: IdentityRequest): Promise<IdentityReceipt> {
 const request = parseIdentityRequest(input);
 const args = {p_record_id: request.record_id, p_source_hash: request.source_hash, p_manifest_sha256: request.manifest_sha256};
 const prepared = await db.rpc("prepare_migration_client_identity", args);
 if (prepared.error) databaseFailure(prepared.error);
 const q = object(prepared.data);
 if (!q || q.ok !== true || q.record_id !== request.record_id || q.source_hash !== request.source_hash || q.manifest_sha256 !== request.manifest_sha256
  || typeof q.client_id !== "string" || !UUID.test(q.client_id) || typeof q.email !== "string" || !/^[^\s@]+@[^\s@]+\.[a-z]{2,63}$/.test(q.email)
  || typeof q.full_name !== "string" || !q.full_name.trim() || !["reserved", "finalized"].includes(String(q.status))) {
  throw new MigrationIdentityError("Reservation receipt was incomplete. No account creation was attempted.", 503);
 }
 const base = {...request, client_id: q.client_id, ok: true as const, status: "finalized" as const, invitation_sent: false as const};
 if (q.status === "finalized") return {...base, deduped: true};
 const metadata = {ims_migration_record_id: request.record_id, ims_migration_source_hash: request.source_hash, ims_migration_manifest_sha256: request.manifest_sha256};
 let found: AuthResult;
 try {found = await admin.getUserById(q.client_id);}
 catch {throw new MigrationIdentityError("Auth lookup was interrupted. Reservation is saved; no new account was attempted.", 503);}
 if (found.error && !(found.error.status === 404 && found.error.code === "user_not_found")) {
  throw new MigrationIdentityError("Auth lookup could not be confirmed. Reservation is saved; no new account was attempted.", 503);
 }
 if (!found.data.user) {
  if (!found.error) throw new MigrationIdentityError("Auth lookup returned no definitive result. Retry the same reservation.", 503);
  try {
   const created = await admin.createUser({id: q.client_id, email: q.email, email_confirm: false, user_metadata: {full_name: q.full_name}, app_metadata: metadata});
   // A timeout or concurrent retry may have created the reserved ID already. Re-read that ID only;
   // never search-and-merge by a household email and never delete an account on uncertain failure.
   found = created.error || !created.data.user ? await admin.getUserById(q.client_id) : created;
  } catch {throw new MigrationIdentityError("Account creation outcome is not confirmed. Retry the same reserved identity; no invitation was sent by this path.", 503);}
 }
 const user = found.data.user;
 if (found.error || !user) throw new MigrationIdentityError("Account creation is not confirmed. Retry the same source record; no invitation was sent by this path.", 503);
 if (user.id !== q.client_id || user.email?.toLowerCase() !== q.email || Object.entries(metadata).some(([key, value]) => user.app_metadata?.[key] !== value)) {
  throw new MigrationIdentityError("Auth identity does not match this source reservation. No profile was merged or overwritten.", 409);
 }
 const finalized = await db.rpc("finalize_migration_client_identity", args);
 if (finalized.error) databaseFailure(finalized.error);
 const result = object(finalized.data);
 if (!result || result.ok !== true || result.record_id !== request.record_id || result.client_id !== q.client_id || result.status !== "finalized" || result.invitation_sent !== false || typeof result.deduped !== "boolean") {
  throw new MigrationIdentityError("Client import receipt is incomplete. Retry the same reservation; do not assume the client was imported.", 503);
 }
 return {...base, deduped: result.deduped};
}
