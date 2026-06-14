import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "moderate" | "optimal"> = {
  draft: "moderate",
  published: "optimal",
  active: "optimal",
  archived: "neutral",
};

export default async function ProgramsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/programs");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) redirect("/dashboard");

  // Programs with client name
  const { data: programs } = await supabase
    .from("programs")
    .select("id, name, status, weeks, created_at, client_id")
    .order("created_at", { ascending: false });

  // Resolve client names
  const clientIds = Array.from(
    new Set((programs ?? []).map((p) => p.client_id))
  );
  let names: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", clientIds);
    names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Programs</h1>
          <p className="text-cream-faint text-sm">
            Generated training programs. Open one to review, edit, and publish to
            the client.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            {programs && programs.length > 0 ? (
              <div className="divide-y divide-divider">
                {programs.map((p) => (
                  <Link
                    key={p.id}
                    href={`/programs/${p.id}`}
                    className="flex items-center justify-between px-6 py-4 hover:bg-navy-elev transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-cream-faint shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-cream truncate">
                          {names[p.client_id] ?? "Client"} · {p.name}
                        </div>
                        <div className="text-xs text-cream-faint">
                          {p.weeks}-week program
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>
                        {p.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-cream-faint" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-cream-faint">
                  No programs yet. Generate one from a completed assessment.
                </p>
                <Link
                  href="/assessments"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm text-sky hover:underline"
                >
                  <Plus className="h-4 w-4" /> Go to assessments
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-lg border border-divider bg-navy-soft/50 p-4 text-sm text-cream-faint">
          <strong className="text-cream-dim">How it works:</strong> Complete a
          client assessment → generate a program from it → review and edit here →
          publish to make it visible to the client.
        </div>
      </div>
    </AppShell>
  );
}
