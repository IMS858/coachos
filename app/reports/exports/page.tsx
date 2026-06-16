import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";

const EXPORTS = [
  { type: "members", title: "Members List", desc: "All clients with name, phone, and join date." },
  { type: "sessions", title: "Session History", desc: "Last 2,000 sessions with date, type, and status." },
];

export default function ExportsPage() {
  return (
    <AppShell expectedRole="owner">
      <div className="max-w-2xl mx-auto py-6">
        <Link href="/reports" className="text-sm text-cream-faint hover:text-cream flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <h1 className="text-2xl font-semibold text-cream mb-1">Exports</h1>
        <p className="text-sm text-cream-faint mb-6">
          Download CSV files — open in Excel, Google Sheets, or import to QuickBooks.
        </p>
        <div className="flex flex-col gap-3">
          {EXPORTS.map((e) => (
            <Card key={e.type}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1">
                  <div className="text-cream font-medium">{e.title}</div>
                  <div className="text-xs text-cream-faint">{e.desc}</div>
                </div>
                <a
                  href={`/api/reports/export?type=${e.type}`}
                  className="inline-flex items-center gap-1.5 text-sm text-sky hover:underline shrink-0"
                >
                  <Download className="h-4 w-4" /> Download CSV
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
