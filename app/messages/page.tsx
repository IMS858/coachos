import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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

  const convos = Array.from(convoMap.values()).sort((a, b) => {
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

        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-divider">
              {convos.length === 0 && (
                <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-blue-600/20 border border-sky-500/30">
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
