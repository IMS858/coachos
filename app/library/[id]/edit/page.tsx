import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ExerciseEditForm } from "@/components/library/exercise-edit-form";

export default async function EditExercisePage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") redirect("/dashboard");

  const { data: exercise } = await supabase
    .from("exercises")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!exercise) notFound();

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-3xl">
        <Link
          href={`/library/${exercise.slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-cream w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to exercise
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit: {exercise.ims_label || exercise.name}
          </h1>
          <p className="text-sm text-cream-dim mt-1">
            Coaching content, video, publish state.
          </p>
        </div>

        <ExerciseEditForm exercise={exercise as any} />
      </div>
    </AppShell>
  );
}
