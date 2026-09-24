import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MessageCircle, Inbox, Target, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

// Always fetch live data so newly-created records appear immediately.
export const dynamic = "force-dynamic";


/**
 * /messages — staff see every client conversation, sorted by most recent.
 * Clients land directly in their own thread.
 */
export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!viewer) redirect("/login");
  if (viewer.role === "client") redirect(`/messages/${user.id}`);

  const { count: newLeads } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("stage", "new");

  // Recent messages (covers list ordering + unread counts + previews)
  const { data: recent } = await supabase
    .from("messages")
    .select("client_id, sender_id, body, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(500);

  // All clients so staff can start a conversation with anyone
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, status");
  const clientIds = (clientRows ?? []).map((c) => c.id);
  let names: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", clientIds);
    names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
  }

  const { data: threadStates } = await supabase.from("message_thread_state").select("client_id, archived_at");
  const archived = new Set((threadStates ?? []).filter((s) => s.archived_at).map((s) => s.client_id));

  // Build conversation summaries
  type Convo = {
    clientId: string;
    last?: { body: string; created_at: string; fromClient: boolean };
    unread: number;
  };
  const convoMap = new Map<string, Convo>();
  for (const id of clientIds) convoMap.set(id, { clientId: id, unread: 0 });
  for (const m of recent ?? []) {
    const c = convoMap.get(m.client_id);
    if (!c) continue;
    if (!c.last) {
      c.last = {
        body: m.body,
        created_at: m.created_at,
        fromClient: m.sender_id === m.client_id,
      };
    }
    if (m.sender_id === m.client_id && m.read_at === null) c.unread += 1;
  }

  const totalUnread = Array.from(convoMap.values()).reduce((n, c) => n + c.unread, 0);
  const activeConversations = Array.from(convoMap.values()).filter((c) => c.last).length;

  const convos = Array.from(convoMap.values()).filter((c) => !archived.has(c.clientId)).sort((a, b) => {
    if (a.last && !b.last) return -1;
    if (!a.last && b.last) return 1;
    if (a.last && b.last)
      return a.last.created_at < b.last.created_at ? 1 : -1;
    return (names[a.clientId] ?? "").localeCompare(names[b.clientId] ?? "");
  });

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-sm text-cream-dim mt-1">
            Real-time conversations with clients.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3"><div className="rounded-2xl border border-divider bg-white p-4"><Inbox className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{totalUnread}</p><p className="text-xs text-cream-faint">Unread client messages</p></div><div className="rounded-2xl border border-divider bg-white p-4"><Users className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{activeConversations}</p><p className="text-xs text-cream-faint">Active conversations</p></div><Link href="/leads" className="rounded-2xl border border-sky/20 bg-sky/5 p-4 transition hover:border-sky/50"><Target className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{newLeads ?? 0}</p><p className="text-xs text-cream-faint">New inquiries / leads →</p></Link></div>

        <div className="flex gap-2 overflow-x-auto"><span className="whitespace-nowrap rounded-full bg-sky px-3 py-2 text-xs font-semibold text-white">Client conversations</span><Link href="/leads" className="whitespace-nowrap rounded-full border border-divider bg-white px-3 py-2 text-xs font-semibold text-cream-dim hover:border-sky/40">Inquiries & leads</Link></div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-divider">
              {convos.length === 0 && (
                <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky/10 to-sky-light/10 border border-sky/30">
                    <MessageCircle className="h-6 w-6 text-sky-light" />
                  </div>
                  <p className="text-cream font-medium">No conversations yet.</p>
                  <p className="text-sm text-cream-faint max-w-sm">
                    Add a client and their thread appears here automatically.
                  </p>
                </div>
              )}
              {convos.map((c) => (
                <Link
                  key={c.clientId}
                  href={`/messages/${c.clientId}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-navy-elev transition-colors"
                >
                  <Avatar name={names[c.clientId] ?? "?"} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-cream truncate">
                        {names[c.clientId] ?? "Client"}
                      </span>
                      {c.unread > 0 && (
                        <Badge tone="moderate">{c.unread} new</Badge>
                      )}
                    </div>
                    <div className="text-xs text-cream-faint truncate mt-0.5">
                      {c.last
                        ? `${c.last.fromClient ? "" : "You: "}${c.last.body}`
                        : "No messages yet — start the conversation"}
                    </div>
                  </div>
                  <div className="text-xs text-cream-faint shrink-0">
                    {c.last ? fmt(c.last.created_at) : ""}
                  </div>
                  <ChevronRight className="h-4 w-4 text-cream-faint shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
