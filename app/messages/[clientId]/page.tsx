import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { MessageThread } from "@/components/messages/message-thread";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();
  if (!viewer) redirect("/login");

  // Clients may only open their own thread
  const isStaff = viewer.role === "owner" || viewer.role === "trainer";
  if (!isStaff && clientId !== user.id) redirect(`/messages/${user.id}`);

  // Client name
  const { data: clientProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", clientId)
    .single();
  if (!clientProfile) notFound();

  // Initial messages (oldest first for rendering)
  const { data: initial } = await supabase
    .from("messages")
    .select("id, client_id, sender_id, body, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .limit(200);

  // Names for every sender we might render (client + all staff)
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["owner", "trainer"]);
  const names: Record<string, string> = Object.fromEntries(
    [...(staff ?? []), clientProfile].map((p) => [p.id, p.full_name])
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          {isStaff && (
            <Link
              href="/messages"
              className="text-cream-faint hover:text-cream transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <Avatar name={clientProfile.full_name} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isStaff ? clientProfile.full_name : "Messages"}
            </h1>
            <p className="text-xs text-cream-faint">
              {isStaff
                ? "Direct thread — they see this in their app."
                : "Your coaches see this thread and reply here."}
            </p>
          </div>
        </div>

        <MessageThread
          clientId={clientId}
          viewerId={user.id}
          initialMessages={initial ?? []}
          names={names}
        />
      </div>
    </AppShell>
  );
}
