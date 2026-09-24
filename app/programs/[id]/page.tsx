import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LegacyProgramPage from "@/components/programs/legacy-program-page";
export const dynamic = "force-dynamic";
/** Keep all existing program links valid while quick drafts use their actual saved snapshots. */
export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const viewer = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (viewer.error || !viewer.data || viewer.data.deleted_at) notFound();
  const result = await db.from("programs").select("id,status,data,client_id").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Program could not be loaded.");
  if (!result.data) notFound();
  if (result.data.data?.source === "ims_library_program") {
    if (!["owner", "trainer"].includes(viewer.data.role) || result.data.status !== "draft") notFound();
    redirect(`/programs/${id}/library`);
  }
  return <LegacyProgramPage params={params}/>;
}
