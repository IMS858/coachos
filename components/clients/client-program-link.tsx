import Link from "next/link";
import { Dumbbell, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
const tones: Record<string, "neutral" | "moderate" | "optimal"> = { draft: "moderate", published: "optimal", active: "optimal" };
export async function ClientProgramLink({ clientId }: { clientId: string }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: viewer, error: authError } = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (authError || !viewer || viewer.deleted_at || !["owner", "trainer"].includes(viewer.role)) return null;
  const { data: programs, error } = await db.from("programs").select("id,name,status,weeks,data,created_at").eq("client_id", clientId).or("data->>source.is.null,data->>source.neq.ims_exercise_set").order("created_at", { ascending: false });
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Dumbbell className="h-5 w-5 text-sky"/>Training programs</CardTitle></CardHeader><CardContent className="p-0">
    {error ? <p role="alert" className="p-5 text-sm text-status-limited">Programs could not be loaded. Refresh to retry.</p> : programs?.length ? <div className="divide-y divide-divider">{programs.map(program => <Link key={program.id} href={`/programs/${program.id}${program.status === "draft" && program.data?.source === "ims_library_program" ? "/library" : ""}`} className="flex min-h-20 items-center justify-between gap-3 px-5 py-3 hover:bg-surface"><div><h3 className="text-sm font-semibold text-cream">{program.name}</h3><p className="mt-1 text-xs text-cream-faint">{program.data?.source === "ims_library_program" ? "Quick programming · open prescription" : `${program.weeks}-week program`}</p></div><div className="flex items-center gap-2"><Badge tone={tones[program.status] ?? "neutral"}>{program.status}</Badge><ChevronRight className="h-4 w-4 text-cream-faint"/></div></Link>)}</div> : <div className="p-5"><p className="text-sm text-cream-dim">No training program yet. Exercise selections are saved separately above.</p><Link href={`/library?client_id=${clientId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Start with your exercise library →</Link></div>}
  </CardContent></Card>;
}
