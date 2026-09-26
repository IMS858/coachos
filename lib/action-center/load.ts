import type { SupabaseClient } from "@supabase/supabase-js";
import { readCompleteEvidence } from "@/lib/migration/complete-read";
import { loadLeadWorkspace } from "@/lib/leads/queries";
import { loadStaffUnreadMessages } from "@/lib/messages/actionable";
import { mediaReviewHref } from "@/lib/media/review-links";
import { packageBalanceEvidence, packageBalanceLabel } from "@/lib/plans/package-balance";

export type ActionRow = { key: string; title: string; meta: string; href: string };
export type ActionQueue = {
  id: string; title: string; label: string; href: string; empty: string;
  status: "ready" | "unavailable"; rows: ActionRow[]; total: number | null;
};
type Row = { id: string; [key: string]: any };
type Evidence<T> = { status: "ready"; value: T } | { status: "unavailable"; value: null };
const CAP = 20;
const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;
export function actionDate(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Date needs review";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
async function capture<T>(source: string, read: () => PromiseLike<T>): Promise<Evidence<T>> {
  try {
    const value = await read();
    if (value === null || value === undefined) throw new Error("Missing source result");
    return { status: "ready", value };
  } catch (error) {
    // Record only source identity and a safe database code, never client data or SQL details.
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unavailable";
    console.warn("Action Center source unavailable", source, /^[A-Za-z0-9_]{1,16}$/.test(code) ? code : "unavailable");
    return { status: "unavailable", value: null };
  }
}
function queue(config: Omit<ActionQueue, "status" | "rows" | "total">, source: Evidence<ActionRow[]>): ActionQueue {
  return source.status === "ready"
    ? { ...config, status: "ready", rows: source.value.slice(0, CAP), total: source.value.length }
    : { ...config, status: "unavailable", rows: [], total: null };
}

/** Authenticated RLS client only. Each independent queue fails visibly, never as zero. */
export async function loadActionCenter(db: SupabaseClient, viewer: { id: string; role: "owner" | "trainer" }, now = new Date()) {
  if (!viewer.id || !["owner", "trainer"].includes(viewer.role)) throw new Error("Active staff context required");
  if (!Number.isFinite(now.getTime())) throw new Error("Valid observation time required");
  const owner = viewer.role === "owner";
  const read = (table: string, columns: string, filter: (q: any) => any = q => q) => readCompleteEvidence<Row>((from, to) =>
    filter(db.from(table).select(columns, { count: "exact" })).order("id").range(from, to));
  const clients = await capture("clients", () => read("clients", "id,primary_trainer_id,status,last_session_at", q => owner ? q : q.eq("primary_trainer_id", viewer.id)));
  const ids = clients.status === "ready" ? clients.value.map(row => row.id) : [];
  const idSet = new Set(ids);
  async function clientScoped(table: string, columns: string, filter: (q: any) => any) {
    if (owner) return read(table, columns, filter);
    if (clients.status !== "ready") throw new Error("Assigned roster unavailable");
    const rows: Row[] = [];
    // Scope before pagination; unassigned rows cannot hide the trainer's first 20 actions.
    for (let offset = 0; offset < ids.length; offset += 100) {
      rows.push(...await read(table, columns, q => filter(q).in("client_id", ids.slice(offset, offset + 100))));
    }
    return rows;
  }
  const [programs, requests, classes, media, messages] = await Promise.all([
    capture("programs", () => clientScoped("programs", "id,name,client_id,status,trainer_id,data,updated_at", q =>
      q.eq("status", "draft").or("data->>source.is.null,data->>source.neq.ims_exercise_set"))),
    capture("requests", () => read("sessions", "id,client_id,trainer_id,scheduled_at,session_type", q => {
      q = q.eq("status", "requested"); return owner ? q : q.eq("trainer_id", viewer.id);
    })),
    capture("classes", () => read("class_occurrences", "id,trainer_id,starts_at,status,class_program_id", q => {
      q = q.gte("starts_at", now.toISOString()).lte("starts_at", new Date(now.getTime() + 7 * 86400000).toISOString()).neq("status", "cancelled").is("class_program_id", null);
      return owner ? q : q.eq("trainer_id", viewer.id);
    })),
    capture("media", () => clientScoped("client_media", "id,client_id,title,note,created_at,review_status", q => q.eq("review_status","awaiting_review").is("archived_at", null))),
    capture("messages", async () => {
      if (!owner && clients.status !== "ready") throw new Error("Assigned roster unavailable");
      const rows = await loadStaffUnreadMessages(db);
      return rows.filter(row => owner || idSet.has(row.client_id));
    }),
  ]);
  // Owner-only sources are not even queried for trainers.
  const ownerSources = owner ? await Promise.all([
    capture("leads", () => loadLeadWorkspace(db)),
    capture("payments", () => read("payments", "id,client_id,status,description,created_at", q => q.in("status", ["failed", "pending"]))),
    capture("packages", () => read("plans", "id,client_id,tier,custom_label,total_sessions,sessions_used,current_session_number,expires_at", q => q.eq("status", "active").eq("kind", "package"))),
  ]) : null;
  const nameIds = new Set<string>(ids);
  for (const source of [programs, requests, media, messages, ...(ownerSources ? [ownerSources[1], ownerSources[2]] : [])]) {
    if (source.status === "ready") for (const row of source.value) if (typeof row.client_id === "string") nameIds.add(row.client_id);
  }
  const names = await capture("client names", async () => {
    const all = [...nameIds], map = new Map<string, string>();
    for (let offset = 0; offset < all.length; offset += 100) {
      const rows = await read("profiles", "id,full_name", q => q.in("id", all.slice(offset, offset + 100)));
      for (const row of rows) map.set(row.id, text(row.full_name, "Client name unavailable"));
    }
    return map;
  });
  const name = (id: unknown) => names.status === "ready" ? names.value.get(String(id)) ?? "Client name unavailable" : "Client name unavailable";
  const map = async <T,>(key: string, source: Evidence<T[]>, transform: (value: T[]) => ActionRow[]) => source.status === "ready"
    ? capture(key, async () => transform(source.value)) : { status: "unavailable" as const, value: null };
  const configs = [
    { id: "requests", title: "Booking requests", label: "Booking requests", href: "/schedule", empty: "No pending training requests in your verified scope." },
    { id: "messages", title: "Unread communications", label: "Unread messages", href: "/messages", empty: "No incoming messages need attention in your verified scope." },
    { id: "form-video-actions", title: "Client form videos", label: "Form videos", href: "/clients", empty: "No client form videos are awaiting review in your verified scope." },
    { id: "programs", title: "Programs awaiting work", label: "Draft programs", href: "/programs", empty: "No draft programs need attention. Exercise sets remain on client profiles." },
    { id: "classes", title: "Classes needing a delivery plan", label: "Class prep", href: "/classes/manage", empty: "No classes without a delivery plan found in the next 7 days." },
    { id: "quiet", title: "Clients going quiet", label: "Quiet clients", href: "/clients", empty: "No active clients in your verified scope are currently flagged." },
  ];
  const values = await Promise.all([
    map("request presentation", requests, rows => rows.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at))).map(row => ({ key: row.id, title: name(row.client_id), meta: actionDate(row.scheduled_at), href: "/schedule" }))),
    map("message presentation", messages, rows => rows.map(row => ({ key: row.id, title: name(row.client_id), meta: text(row.body, "Message text unavailable").slice(0, 90), href: "/messages/" + row.client_id }))),
    map("media presentation", media, rows => rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map(row=>({key:row.id,title:name(row.client_id),meta:text(row.note,"Technique clip awaiting feedback"),href:mediaReviewHref(row.id)}))),
    map("program presentation", programs, rows => rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(row => ({ key: row.id, title: text(row.name, "Draft program"), meta: name(row.client_id), href: "/programs/" + row.id }))),
    map("class presentation", classes, rows => rows.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).map(row => ({ key: row.id, title: "Class plan not assigned", meta: actionDate(row.starts_at), href: "/classes/manage/" + row.id }))),
    map("client continuity", clients, rows => rows.filter(row => row.status === "active" && (!row.last_session_at || !Number.isFinite(Date.parse(row.last_session_at)) || Date.parse(row.last_session_at) < now.getTime() - 14 * 86400000)).map(row => ({ key: row.id, title: name(row.id), meta: !row.last_session_at ? "No completed session recorded" : !Number.isFinite(Date.parse(row.last_session_at)) ? "Last session date needs review" : "14+ days since recorded session", href: "/clients/" + row.id }))),
  ]);
  const queues = configs.map((config, i) => queue(config, values[i]));
  if (ownerSources) {
    const [growth, payments, packages] = ownerSources;
    const leadRows = growth.status === "ready" ? await capture("lead presentation", async () => growth.value.untouched.map(row => ({ key: row.id, title: text(row.full_name, "Inquiry name unavailable"), meta: text(row.interest, "Current inquiry"), href: "/leads" }))) : { status: "unavailable" as const, value: null };
    const paymentRows = await map("payment presentation", payments, rows => rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(row => ({ key: row.id, title: text(row.description, "IMS payment"), meta: text(row.status, "Status needs review"), href: row.client_id ? "/clients/" + row.client_id : "/reports/operations" })));
    const packageRows = await map("package presentation", packages, rows => rows.flatMap(row => {
      const evidence = packageBalanceEvidence(row);
      if (evidence.status === "known" && evidence.remaining > 2) return [];
      return [{ key: row.id, title: name(row.client_id), meta: text(row.custom_label, "Session package") + " · " + packageBalanceLabel(evidence), href: "/clients/" + row.client_id }];
    }));
    queues.push(
      queue({ id: "leads", title: "New inquiries needing first contact", label: "First contact", href: "/leads", empty: "No current inquiries need first contact. Historical contacts are separate." }, leadRows),
      queue({ id: "payments", title: "Payment exceptions", label: "Payments", href: "/reports/operations", empty: "No failed or pending payment records found. This is not a receivables statement." }, paymentRows),
      queue({ id: "packages", title: "Package renewals and balance review", label: "Renewals / review", href: "/clients", empty: "No low or unknown active package counters found." }, packageRows),
    );
  }
  return { queues, namesUnavailable: names.status !== "ready", observedAt: now.toISOString() };
}
