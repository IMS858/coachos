import { AppShell } from "@/components/layout/app-shell";
import { CoachExerciseCatalog } from "@/components/library/coach-exercise-catalog";

export const dynamic = "force-dynamic";

/** Existing bookmarked catalog URL now opens the working exercise database. */
export default async function ExerciseCatalogPage({ searchParams }: { searchParams: Promise<{ client_id?: string; collection_id?: string }> }) {
  const params = await searchParams;
  return <AppShell><CoachExerciseCatalog clientId={params.client_id} collectionId={params.collection_id}/></AppShell>;
}
