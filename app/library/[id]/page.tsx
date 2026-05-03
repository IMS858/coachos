import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Star, Edit3, Plus, AlertCircle, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExerciseDetailActions } from "@/components/library/exercise-detail-actions";

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
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
  const isStaff =
    viewerProfile?.role === "trainer" || viewerProfile?.role === "owner";

  const { data: exercise } = await supabase
    .from("exercises_with_favorite")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!exercise) notFound();

  // Load regression/progression details
  const relatedIds = [
    ...(exercise.regression_ids ?? []),
    ...(exercise.progression_ids ?? []),
  ];
  const { data: relatedExercises } = relatedIds.length > 0
    ? await supabase
        .from("exercises")
        .select("id, name, ims_label, slug, level, category")
        .in("id", relatedIds)
    : { data: [] };

  const regressions = (relatedExercises ?? []).filter((r: any) =>
    exercise.regression_ids.includes(r.id)
  );
  const progressions = (relatedExercises ?? []).filter((r: any) =>
    exercise.progression_ids.includes(r.id)
  );

  const hasPlaceholderCues = (exercise.coaching_cues ?? []).some((c: string) =>
    c.includes("[JASON: rewrite]")
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-cream w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">
                {exercise.ims_label || exercise.name}
              </h1>
              {exercise.status === "draft" && <Badge tone="moderate">Draft</Badge>}
              {!exercise.client_visible && exercise.status === "published" && (
                <Badge tone="neutral">Trainer-only</Badge>
              )}
            </div>
            {exercise.ims_label && (
              <p className="text-sm text-cream-dim mt-0.5">{exercise.name}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <Badge tone={categoryTone(exercise.category)}>
                {capitalize(exercise.category)}
              </Badge>
              {exercise.movement_pattern !== "none" && (
                <span className="text-xs text-cream-faint">
                  {prettyPattern(exercise.movement_pattern)}
                </span>
              )}
              <span className="text-xs text-cream-faint">·</span>
              <span className="text-xs text-cream-faint">{capitalize(exercise.level)}</span>
            </div>
          </div>

          <ExerciseDetailActions
            exerciseId={exercise.id}
            initialFavorite={exercise.is_favorite}
            slug={exercise.slug}
            isStaff={isStaff}
          />
        </div>

        {hasPlaceholderCues && isStaff && (
          <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-4 py-3 text-sm text-status-limited flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Coaching cues are placeholders — rewrite before publishing.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left col — video + cues */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <VideoPanel exercise={exercise} />

            <Card>
              <CardHeader>
                <CardTitle>Coaching cues</CardTitle>
              </CardHeader>
              <CardContent>
                {(exercise.coaching_cues ?? []).length > 0 ? (
                  <ul className="space-y-2">
                    {exercise.coaching_cues.map((cue: string, i: number) => {
                      const isPlaceholder = cue.includes("[JASON: rewrite]");
                      return (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm ${
                            isPlaceholder ? "text-cream-faint italic" : "text-cream-dim"
                          }`}
                        >
                          <span className="text-cream-faint mt-1">•</span>
                          <span>{cue.replace("[JASON: rewrite] ", "")}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-cream-faint italic">No cues yet.</p>
                )}
              </CardContent>
            </Card>

            {(exercise.common_mistakes ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-status-moderate" />
                    Common mistakes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {exercise.common_mistakes.map((m: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-cream-dim">
                        <span className="text-status-moderate mt-1">•</span>
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {exercise.programming_notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Programming notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-cream-dim whitespace-pre-wrap">
                    {exercise.programming_notes}
                  </p>
                </CardContent>
              </Card>
            )}

            {exercise.contraindications && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-status-limited" />
                    Contraindications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-cream-dim whitespace-pre-wrap">
                    {exercise.contraindications}
                  </p>
                  <p className="text-xs text-cream-faint mt-3 italic">
                    These notes guide trainer decisions. They are not medical advice.
                    When in doubt, defer to the client's clinical care team.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Anatomy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Joints">
                  <ChipRow values={exercise.primary_joints ?? []} format={prettyEnum} />
                </Row>
                <Row label="Muscles">
                  <ChipRow values={exercise.primary_muscles ?? []} format={prettyEnum} />
                </Row>
                <Row label="Equipment">
                  <ChipRow values={exercise.equipment ?? []} format={prettyEnum} />
                </Row>
              </CardContent>
            </Card>

            {(exercise.load_descriptors ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Load profile</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChipRow
                    values={exercise.load_descriptors}
                    format={prettyEnum}
                  />
                  <p className="text-xs text-cream-faint mt-3 italic">
                    Descriptive — about loading characteristics, not safety claims.
                  </p>
                </CardContent>
              </Card>
            )}

            {(exercise.system_tags ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">System tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChipRow values={exercise.system_tags} format={prettyEnum} />
                </CardContent>
              </Card>
            )}

            {(regressions.length > 0 || progressions.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Variations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {regressions.length > 0 && (
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
                        Regressions
                      </div>
                      {regressions.map((r: any) => (
                        <Link
                          key={r.id}
                          href={`/library/${r.slug}`}
                          className="block text-sm text-cream-dim hover:text-sky-light"
                        >
                          ← {r.ims_label || r.name}
                        </Link>
                      ))}
                    </div>
                  )}
                  {progressions.length > 0 && (
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
                        Progressions
                      </div>
                      {progressions.map((p: any) => (
                        <Link
                          key={p.id}
                          href={`/library/${p.slug}`}
                          className="block text-sm text-cream-dim hover:text-sky-light"
                        >
                          → {p.ims_label || p.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* --------------------------- bits --------------------------- */

function VideoPanel({ exercise }: { exercise: any }) {
  const hasBunnyVideo =
    exercise.video_provider === "bunny" && exercise.video_id;

  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-navy-deep flex items-center justify-center">
        {hasBunnyVideo ? (
          <iframe
            src={`https://iframe.mediadelivery.net/embed/${
              process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID ?? "LIBRARY_ID"
            }/${exercise.video_id}?autoplay=false&preload=false`}
            loading="lazy"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            className="w-full h-full"
          />
        ) : (
          <div className="text-cream-faint flex flex-col items-center gap-3 py-12">
            <div className="text-sm">Video pending</div>
            <div className="text-xs">
              Record demo, paste Bunny Stream GUID into the exercise editor.
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-cream-faint mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipRow({
  values,
  format,
}: {
  values: string[];
  format: (v: string) => string;
}) {
  if (values.length === 0) return <span className="text-cream-faint italic text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="text-xs px-2 py-0.5 rounded-full bg-navy-elev border border-divider text-cream-dim"
        >
          {format(v)}
        </span>
      ))}
    </div>
  );
}

function categoryTone(c: string): any {
  switch (c) {
    case "mobility": return "sky";
    case "strength": return "optimal";
    case "corrective": return "moderate";
    case "conditioning": return "limited";
    default: return "neutral";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettyPattern(p: string): string {
  return p.split("_").map(capitalize).join(" ");
}

function prettyEnum(s: string): string {
  return s.split("_").map(capitalize).join(" ");
}
