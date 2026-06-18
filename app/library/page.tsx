import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryGrid } from "@/components/library/library-grid";

/**
 * /library — exercise browser
 *
 * URL params (all optional):
 *   q                  search text
 *   category           mobility|strength|corrective|conditioning|recovery
 *   pattern            squat|hinge|push_horizontal|... (movement_pattern)
 *   joint              hip|shoulder|... (matches any of primary_joints)
 *   level              beginner|intermediate|advanced
 *   equipment          dumbbell|barbell|... (matches any of equipment)
 *   load               low_lumbar_load|... (matches any of load_descriptors)
 *   favorites_only     "1" to only show this trainer's favorites
 *   draft              "1" to include drafts (trainers/owner only)
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const params = await searchParams;
  const isStaff = viewerProfile?.role === "trainer" || viewerProfile?.role === "owner";
  const includeDrafts = isStaff && params.draft === "1";

  // Base query — uses the view so we get is_favorite per trainer
  let query = supabase
    .from("exercises_with_favorite")
    .select("*")
    .order("name", { ascending: true });

  if (!includeDrafts) query = query.eq("status", "published");
  if (params.category) query = query.eq("category", params.category);
  if (params.pattern) query = query.eq("movement_pattern", params.pattern);
  if (params.level) query = query.eq("level", params.level);
  if (params.joint) query = query.contains("primary_joints", [params.joint]);
  if (params.equipment) query = query.contains("equipment", [params.equipment]);
  if (params.load) query = query.contains("load_descriptors", [params.load]);
  if (params.favorites_only === "1") query = query.eq("is_favorite", true);

  // Search — Postgres full-text on name + cues
  if (params.q?.trim()) {
    const q = params.q.trim();
    query = query.or(
      `name.ilike.%${q}%,ims_label.ilike.%${q}%,slug.ilike.%${q}%`
    );
  }

  const { data: exercises } = await query.limit(200);

  // Stats for the header
  const totalShown = exercises?.length ?? 0;
  const drafts = (exercises ?? []).filter((e: any) => e.status === "draft").length;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
            <p className="text-sm text-cream-dim mt-1">
              {totalShown} exercise{totalShown === 1 ? "" : "s"}
              {drafts > 0 && (
                <span className="text-cream-faint">
                  {" "}
                  · {drafts} draft{drafts === 1 ? "" : "s"}
                </span>
              )}
            </p>
          </div>
          {isStaff && (
            <Link href="/library/new">
              <Button>
                <Plus className="h-4 w-4" />
                New exercise
              </Button>
            </Link>
          )}
        </div>

        <LibraryFilters initial={params} isStaff={isStaff} />

        <LibraryGrid exercises={exercises ?? []} isStaff={isStaff} />
      </div>
    </AppShell>
  );
}
