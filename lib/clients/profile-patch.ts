/** Contact edits never provision or link a portal identity. */
export type ContactPatch = {full_name?: string; email?: string | null; phone?: string | null; avatar_url?: string | null};
export function parseContactPatch(body: unknown, contactOnly: boolean): ContactPatch {
 if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid profile request.");
 const row = body as Record<string, unknown>;
 const allowed = ["kind", "full_name", "email", "phone", "avatar_url"];
 if (row.kind !== "profile" || Object.keys(row).some(key => !allowed.includes(key)) || Object.keys(row).length < 2) throw new Error("Only contact details can be changed here.");
 const patch: ContactPatch = {};
 if (row.full_name !== undefined) {
  if (typeof row.full_name !== "string" || !row.full_name.trim() || row.full_name.trim().length > 200) throw new Error("Enter the client's full name.");
  patch.full_name = row.full_name.trim();
 }
 if (row.email !== undefined) {
  if (row.email !== null && typeof row.email !== "string") throw new Error("Enter a valid email or leave it blank.");
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  if (!email && !contactOnly) throw new Error("A portal account needs an email. Do not clear an existing sign-in address.");
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,63}$/.test(email))) throw new Error("Enter a valid email address.");
  patch.email = email || null;
 }
 for (const key of ["phone", "avatar_url"] as const) {
  if (row[key] === undefined) continue;
  if (row[key] !== null && typeof row[key] !== "string") throw new Error("Invalid contact field.");
  const value = typeof row[key] === "string" ? row[key].trim() : "";
  if (value.length > (key === "phone" ? 50 : 2048)) throw new Error("Contact field is too long.");
  if (key === "avatar_url" && value && !/^https:\/\//.test(value)) throw new Error("Photo URL must use HTTPS.");
  patch[key] = value || null;
 }
 return patch;
}
