import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { allCatalogPages, exerciseSetIds, isExerciseSet, UUID, type CatalogExercise, type CatalogClient, type SavedExerciseSet } from "@/lib/exercises/catalog";
import { CATALOG_COLUMNS } from "@/lib/exercises/collections-server";
import { ExerciseCatalogBrowser } from "@/components/library/exercise-catalog-browser";
import { AddExercisePanel } from "@/components/library/add-exercise-panel";

export async function CoachExerciseCatalog({ clientId, collectionId }: { clientId?: string; collectionId?: string }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/library");
  const { data: me, error: authError } = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (authError || !me || me.deleted_at || !["owner", "trainer"].includes(me.role)) redirect("/dashboard");

  let rows: CatalogExercise[] = [];
  let clients: CatalogClient[] = [];
  let initialSet: SavedExerciseSet | null = null;
  let error: string | null = null;
  try {
    const [sourceRows, clientRows, profileRows] = await Promise.all([
      allCatalogPages<CatalogExercise>((from, to) => db.from("canonical_exercise_queue").select(CATALOG_COLUMNS, { count: "exact" }).order("canonical_id").range(from, to)),
      allCatalogPages<{ id: string }>((from, to) => db.from("clients").select("id", { count: "exact" }).order("id").range(from, to)),
      allCatalogPages<CatalogClient>((from, to) => db.from("profiles").select("id,full_name", { count: "exact" }).eq("role", "client").is("deleted_at", null).order("id").range(from, to)),
    ]);
    rows = sourceRows.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name) || a.canonical_id.localeCompare(b.canonical_id));
    const ids = new Set(clientRows.map(row => row.id));
    clients = profileRows.filter(row => ids.has(row.id)).sort((a, b) => a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id));
    if (collectionId) {
      if (!UUID.test(collectionId)) throw new Error("Invalid saved exercise set.");
      const result = await db.from("programs").select("id,name,client_id,status,data,updated_at").eq("id", collectionId).maybeSingle();
      if (result.error) throw new Error("The saved exercise set could not be loaded.");
      const set = result.data;
      if (!set || set.status !== "draft" || !isExerciseSet(set.data)) throw new Error("This draft exercise set is no longer available.");
      if (!clients.some(c => c.id === set.client_id)) throw new Error("The client profile for this set is unavailable.");
      initialSet = { id: set.id, name: set.name, client_id: set.client_id, updated_at: set.updated_at,
        canonical_ids: exerciseSetIds(set.data), note: typeof set.data.note === "string" ? set.data.note : "" };
    } else if (clientId && !clients.some(c => c.id === clientId)) {
      throw new Error("That client profile is unavailable. Open the library from an existing client.");
    }
  } catch (cause) { error = cause instanceof Error ? cause.message : "Exercise workspace is unavailable."; }
  if (error) return <main className="mx-auto w-full max-w-6xl space-y-4 pb-16"><h1 className="text-3xl font-bold text-cream">Exercise Library</h1><div role="alert" className="rounded-2xl border border-status-limited/40 bg-white p-6 text-cream">{error} No selections or approvals were changed.</div><Link href="/library" className="inline-flex min-h-11 items-center text-sky underline">Reload the library</Link></main>;
  return <div className="space-y-5"><div className="flex justify-end"><AddExercisePanel clients={clients}/></div><ExerciseCatalogBrowser exercises={rows} clients={clients} initialClientId={clientId ?? ""} initialSet={initialSet} /></div>;
}
