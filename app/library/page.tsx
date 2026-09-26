import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryGrid } from "@/components/library/library-grid";
import { CoachExerciseCatalog } from "@/components/library/coach-exercise-catalog";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: viewerProfile, error: profileError } = await supabase.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profileError || !viewerProfile || viewerProfile.deleted_at) redirect("/login");
  const params = await searchParams;
  const isStaff = ["owner", "trainer"].includes(viewerProfile.role);
  if (isStaff && params.view !== "media") {
    return <AppShell><CoachExerciseCatalog clientId={params.client_id} collectionId={params.collection_id}/></AppShell>;
  }

  // Preserve the existing media/details browser as a secondary destination.
  let query = supabase.from("exercises_with_favorite").select("*").order("name").order("id");
  if (!isStaff || params.draft !== "1") query = query.eq("status", "published");
  if (!isStaff) query = query.eq("client_visible", true);
  if (params.category) query = query.eq("category", params.category);
  if (params.pattern) query = query.eq("movement_pattern", params.pattern);
  if (params.level) query = query.eq("level", params.level);
  if (params.joint) query = query.contains("primary_joints", [params.joint]);
  if (params.equipment) query = query.contains("equipment", [params.equipment]);
  if (params.load) query = query.contains("load_descriptors", [params.load]);
  if (params.favorites_only === "1") query = query.eq("is_favorite", true);
  const result = await query.limit(1000);
  const term = params.q?.trim().toLowerCase();
  const exercises = (result.data ?? []).filter(e => !term || [e.name,e.ims_label,e.slug].some(v => typeof v === "string" && v.toLowerCase().includes(term)));
  return <AppShell><main className="flex flex-col gap-6">
    <header><h1 className="text-3xl font-bold text-cream">{isStaff ? "Exercise media & details" : "Exercise library"}</h1><p className="mt-2 text-sm text-cream-dim">{exercises.length} matching records{result.data?.length === 1000 ? " · display limited to 1,000 records" : ""}</p>{isStaff && <Link href="/library" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Back to your full source library →</Link>}</header>
    <LibraryFilters initial={{ ...params, view: "media" }} isStaff={isStaff}/>
    {result.error ? <p role="alert" className="rounded-xl border border-status-limited p-4">Exercise media could not be loaded. Refresh to retry.</p> : <LibraryGrid exercises={exercises as never} isStaff={isStaff}/>}
  </main></AppShell>;
}
