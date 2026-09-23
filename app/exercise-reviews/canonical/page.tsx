import {redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {CanonicalMappingWorkspace} from "@/components/exercises/canonical-mapping-workspace";
export const dynamic="force-dynamic";
export default async function CanonicalMappingPage(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login?next=/exercise-reviews/canonical");
 const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(!profile||!["owner","trainer"].includes(profile.role))redirect("/dashboard");
 const [{data:rows,error:rowError},{data:exercises,error:exerciseError}]=await Promise.all([
  supabase.from("canonical_exercise_queue").select("canonical_id,canonical_name,source_status,source_confidence,source_primary_joints,mapping_status,matched_exercise_id,review_notes,review_priority,review_priority_reason,exact_candidate_id,exact_candidate_name,exact_candidate_count,safety_data_gap").order("review_priority").order("canonical_id").limit(1000),
  supabase.from("exercises").select("id,name,ims_label,primary_joints").order("name").limit(1000),
 ]);
 return <AppShell><main className="mx-auto max-w-6xl space-y-6 pb-16">
 <Link href="/exercise-reviews" className="text-sm text-sky underline">← Back to Coach Review Center</Link>
 <header className="rounded-2xl border border-divider bg-navy-soft p-6"><p className="text-xs uppercase tracking-widest text-sky">IMS / Canonical source audit</p><h1 className="mt-2 text-3xl font-semibold text-cream">423-exercise mapping queue</h1><p className="mt-3 text-sm leading-6 text-cream-dim">Confirm which Coach OS exercise corresponds to each canonical source entry. The source workbook establishes names and grouping, not verified contraindications or clinical safety.</p></header>
 {rowError||exerciseError?<p role="alert" className="rounded-xl border border-divider p-5 text-sm text-status-limited">Could not load mapping queue. No changes can be saved.</p>:<CanonicalMappingWorkspace rows={rows??[]} exercises={exercises??[]} isOwner={profile.role==="owner"}/>}
 </main></AppShell>;
}
