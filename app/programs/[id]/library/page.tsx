import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { LibraryDraftEditor } from "@/components/programs/library-draft-editor";
export const dynamic = "force-dynamic";
export default async function LibraryProgramDraft({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error || !me.data || me.data.deleted_at || !["owner", "trainer"].includes(me.data.role)) notFound();
  const result = await db.from("programs").select("id,name,client_id,status,data,updated_at").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Program draft could not be loaded.");
  if (!result.data || result.data.status !== "draft" || result.data.data?.source !== "ims_library_program") notFound();
  const program = result.data;
  return <AppShell><main className="mx-auto w-full max-w-4xl space-y-5 pb-12">
    <Link href={`/clients/${program.client_id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">← Client programming workspace</Link>
    <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/70">IMS / Quick programming</p><h1 className="mt-2 text-3xl font-bold">{program.name}</h1><p className="mt-2 text-sm text-white/80">Private draft · your saved exercise selection and prescriptions</p></header>
    <LibraryDraftEditor programId={program.id} data={program.data} updatedAt={program.updated_at}/>
  </main></AppShell>;
}
