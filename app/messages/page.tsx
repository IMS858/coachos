import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MessageCircle, Inbox, Target, Users, Archive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LeadTouchButton } from "@/components/leads/lead-touch-button";
import { loadLeadWorkspace } from "@/lib/leads/queries";
import { sourceLabel } from "@/lib/leads/workspace";
import { allCatalogPages } from "@/lib/exercises/catalog";
import { actionableMessages, type StaffUnreadMessage } from "@/lib/messages/actionable";

export const dynamic = "force-dynamic";
export default async function MessagesPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: viewer, error: viewerError } = await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if (viewerError || !viewer || viewer.deleted_at) redirect("/login");
  if (viewer.role === "client") redirect(`/messages/${user.id}`);
  if (!["owner","trainer"].includes(viewer.role)) redirect("/dashboard");
  const assignedQ = viewer.role === "trainer" ? await db.from("clients").select("id").eq("primary_trainer_id",user.id) : { data: null, error: null };
  if (assignedQ.error) throw new Error("Assigned client conversations could not be loaded.");
  const scopedIds = viewer.role === "trainer" ? (assignedQ.data ?? []).map((row:any)=>row.id) : null;
  const effectiveIds = scopedIds?.length ? scopedIds : ["00000000-0000-0000-0000-000000000000"];
  const growth = viewer.role === "owner" ? await loadLeadWorkspace(db) : null;
  let recentQuery = db.from("messages").select("id,client_id,sender_id,body,created_at,read_at").order("created_at",{ascending:false}).order("id").limit(500);
  if (viewer.role === "trainer") recentQuery = recentQuery.in("client_id",effectiveIds);
  const [recentQ, unreadRows, clients, profiles, states] = await Promise.all([
    recentQuery,
    allCatalogPages<StaffUnreadMessage>((from,to) => { let q=db.from("messages").select("id,client_id,sender_id,body,created_at,read_at",{count:"exact"}).is("read_at",null).order("id").range(from,to); if(viewer.role==="trainer") q=q.in("client_id",effectiveIds); return q; }),
    allCatalogPages<{ id:string }>((from,to) => { let q=db.from("clients").select("id",{count:"exact"}).order("id").range(from,to); if(viewer.role==="trainer") q=q.in("id",effectiveIds); return q; }),
    allCatalogPages<{ id:string;full_name:string }>((from,to) => { let q=db.from("profiles").select("id,full_name",{count:"exact"}).eq("role","client").is("deleted_at",null).order("id").range(from,to); if(viewer.role==="trainer") q=q.in("id",effectiveIds); return q; }),
    allCatalogPages<{ client_id:string;archived_at:string|null }>((from,to) => { let q=db.from("message_thread_state").select("client_id,archived_at",{count:"exact"}).order("client_id").range(from,to); if(viewer.role==="trainer") q=q.in("client_id",effectiveIds); return q; }),
  ]);
  if (recentQ.error) throw new Error("Communications could not be loaded. Please refresh.");
  const names = new Map(profiles.map(profile => [profile.id,profile.full_name]));
  const unread = actionableMessages(unreadRows,states).filter(message => names.has(message.client_id));
  const unreadCounts = new Map<string,number>();
  for (const message of unread) unreadCounts.set(message.client_id,(unreadCounts.get(message.client_id) ?? 0) + 1);
  type Conversation = { clientId:string; last?:{ body:string;created_at:string;fromClient:boolean }; unread:number };
  const map = new Map<string,Conversation>();
  for (const client of clients) if (names.has(client.id)) map.set(client.id,{clientId:client.id,unread:unreadCounts.get(client.id) ?? 0});
  for (const message of recentQ.data ?? []) {
    const conversation = map.get(message.client_id);
    if (conversation && !conversation.last) conversation.last = {body:message.body,created_at:message.created_at,fromClient:message.sender_id === message.client_id};
  }
  // An incoming unread message after an archive timestamp is actionable again.
  const archived = new Set(states.filter(state => state.archived_at && !unreadCounts.has(state.client_id)).map(state => state.client_id));
  const conversations = [...map.values()].filter(conversation => !archived.has(conversation.clientId)).sort((a,b) => {
    if (a.last && b.last) return b.last.created_at.localeCompare(a.last.created_at);
    if (a.last) return -1;
    if (b.last) return 1;
    return (names.get(a.clientId) ?? "").localeCompare(names.get(b.clientId) ?? "");
  });
  const inquiries = viewer.role === "owner" ? [...(growth?.open ?? [])].sort((a,b) => b.updated_at.localeCompare(a.updated_at)).slice(0,5) : [];
  const date = (iso:string) => new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric"}).format(new Date(iso));
  return <AppShell><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-sky">Communications</p><h1 className="mt-1 text-3xl font-bold text-cream">Inbox</h1><p className="mt-2 text-sm text-cream-dim">{viewer.role === "trainer" ? "Your assigned client conversations and unread coaching messages." : "Client conversations and current inquiries. Historical contacts stay in Contacts."}</p></div><Link href="/messages/archived" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-cream"><Archive className="h-4 w-4"/>Archived</Link></header>
    <section aria-label="Communication overview" className={"grid gap-3 "+(viewer.role==="owner"?"grid-cols-3":"grid-cols-2")}><div className="rounded-2xl border border-divider bg-white p-4"><Inbox className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{unread.length}</p><p className="text-xs text-cream-faint">Incoming unread messages</p></div><div className="rounded-2xl border border-divider bg-white p-4"><Users className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{conversations.filter(conversation => conversation.last).length}</p><p className="text-xs text-cream-faint">Recent active conversations</p></div>{viewer.role === "owner" && <Link href="/leads" className="rounded-2xl border border-sky/20 bg-sky/5 p-4"><Target className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{growth?.open.length ?? 0}</p><p className="text-xs text-cream-faint">Current inquiries →</p></Link>}</section>
    <nav aria-label="Communication workspaces" className="flex flex-wrap gap-2"><span className="rounded-full bg-sky px-4 py-3 text-xs font-semibold text-white">Client conversations</span>{viewer.role === "owner" && <><Link href="/leads" className="rounded-full border border-divider bg-white px-4 py-3 text-xs font-semibold text-cream">New business</Link><Link href="/contacts" className="rounded-full border border-divider bg-white px-4 py-3 text-xs font-semibold text-cream">Contacts</Link></>}</nav>
    {viewer.role === "owner" && inquiries.length > 0 && <section className="overflow-hidden rounded-2xl border border-divider bg-white"><div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4"><h2 className="font-semibold text-cream">Current inquiries</h2><Link href="/leads" className="min-h-11 py-3 text-xs font-semibold text-sky">View pipeline →</Link></div><div className="divide-y divide-divider">{inquiries.map(lead => <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><Link href="/leads" className="min-w-0 flex-1"><p className="text-sm font-semibold text-cream">{lead.full_name}</p><p className="mt-1 text-xs text-cream-faint">{lead.interest ?? "Inquiry"} · {sourceLabel(lead.source)}</p></Link><LeadTouchButton leadId={lead.id} contacted={Boolean(lead.last_contacted_at)}/></div>)}</div></section>}
    <section aria-label="Client conversations" className="overflow-hidden rounded-2xl border border-divider bg-white"><div className="divide-y divide-divider">{conversations.length === 0 && <div className="flex flex-col items-center gap-3 px-6 py-12 text-center"><MessageCircle className="h-7 w-7 text-sky"/><h2 className="font-semibold text-cream">No active conversations.</h2><p className="text-sm text-cream-dim">Archived history is preserved. Open a client profile to start a conversation.</p></div>}{conversations.map(conversation => <Link key={conversation.clientId} href={`/messages/${conversation.clientId}`} className="flex items-center gap-3 px-4 py-4 transition hover:bg-surface sm:px-6"><Avatar name={names.get(conversation.clientId) ?? "Client"}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-cream">{names.get(conversation.clientId)}</span>{conversation.unread > 0 && <Badge tone="moderate">{conversation.unread} new</Badge>}</div><p className="mt-1 truncate text-xs text-cream-faint">{conversation.last ? `${conversation.last.fromClient ? "" : "Staff: "}${conversation.last.body}` : "Open conversation"}</p></div><span className="shrink-0 text-xs text-cream-faint">{conversation.last ? date(conversation.last.created_at) : ""}</span><ChevronRight className="h-4 w-4 shrink-0 text-cream-faint"/></Link>)}</div></section>
    <p className="text-xs leading-5 text-cream-faint">Conversation previews use the latest 500 messages. Incoming unread counts are checked separately; older history remains inside each client thread. Research candidates and historical contacts are not counted as new inquiries.</p>
  </main></AppShell>;
}
