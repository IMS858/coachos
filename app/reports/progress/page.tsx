import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createServiceClient } from "@/lib/supabase/server";
import { ClientProgressReport } from "@/components/clients/client-progress-report";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export default async function ProgressReportPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientId } = await searchParams;
  const svc = createServiceClient();

  const { data: clients } = await svc
    .from("profiles")
    .select("id, full_name")
    .eq("role", "client")
    .order("full_name", { ascending: true });

  const selected = clientId
    ? (clients ?? []).find((c) => c.id === clientId)
    : null;

  return (
    <AppShell expectedRole="owner">
      <div className="max-w-3xl mx-auto py-6 print-area">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link
            href="/reports"
            className="text-sm text-cream-faint hover:text-cream flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Reports
          </Link>
          {selected && <PrintButton label="Print / Save PDF" />}
        </div>

        {!selected ? (
          <>
            <h1 className="text-2xl font-semibold text-cream mb-1">
              Client Progress Report
            </h1>
            <p className="text-sm text-cream-faint mb-5">
              Pick a client to generate a printable progress report.
            </p>
            <div className="flex flex-col gap-2">
              {(clients ?? []).map((c) => (
                <Link key={c.id} href={`/reports/progress?client=${c.id}`}>
                  <Card className="hover:bg-navy-elev transition-colors">
                    <CardContent className="flex items-center gap-3 py-3">
                      <Avatar name={c.full_name} size="sm" />
                      <span className="text-cream">{c.full_name}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              {(!clients || clients.length === 0) && (
                <p className="text-sm text-cream-faint">No clients yet.</p>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Print header */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-semibold text-cream">
                    {selected.full_name}
                  </div>
                  <div className="text-sm text-cream-faint">
                    Progress Report · Innovative Movement Solutions
                  </div>
                </div>
                <div className="text-right text-xs text-cream-faint">
                  {new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            </div>

            <ClientProgressReport
              clientId={selected.id}
              clientName={selected.full_name}
            />

            <div className="mt-8 text-xs text-cream-faint text-center">
              IMS · 10625 Scripps Ranch Blvd, Suite D · (619) 937-1434 ·
              imsmethod.com
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
