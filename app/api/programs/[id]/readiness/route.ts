import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Read-only preflight for coach review. Never grants approval or publishes. */
export async function GET(
  _request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  const {id} = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
  return NextResponse.json({error: "Invalid program ID"}, {status: 400});
  }
  const supabase = await createClient();
  const {data: {user}} = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error: "Authentication required"}, {status: 401});
  const {data: profile, error: profileError} = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || !["owner","trainer"].includes(profile.role)) {
    return NextResponse.json({error: "Staff only"}, {status: 403});
  }
  // Caller-scoped RLS; never use the service-role client for a user-supplied ID.
  const {data: program, error} = await supabase.from("programs")
    .select("id,name,status,assessment_id,client_id,data,coach_edits,pdf_client_url")
    .eq("id",id).maybeSingle();
  if (error) return NextResponse.json({error: "Unable to load program"}, {status: 503});
  if (!program) return NextResponse.json({error: "Program not found"}, {status: 404});

  const generated = program.data?.source === "ims_generator";
  const quick = program.data?.source === "ims_library_program";
  const [mappingResult, reviewResult] = generated ? await Promise.all([
    supabase.from("canonical_exercise_queue").select("canonical_id,matched_exercise_id,mapping_status").limit(1000),
    supabase.from("exercise_reviews").select("exercise_id,safety_status").limit(1000),
  ]) : [{data:[],error:null},{data:[],error:null}];
  const approved = new Set((reviewResult.data ?? []).filter(r => r.safety_status === "approved").map(r => r.exercise_id));
  const catalogVerified = !mappingResult.error && !reviewResult.error
    && !!mappingResult.data && mappingResult.data.length === 423
    && mappingResult.data.every(row => row.mapping_status === "coach_confirmed"
      && !!row.matched_exercise_id && approved.has(row.matched_exercise_id));
  const assignmentResult = quick ? await supabase.from("program_exercises").select("id,sets,reps,load_prescription,rest_seconds,tempo,notes,exercises!inner(client_visible)").eq("program_id",id) : {data:[],error:null};
  const quickAssignments = assignmentResult.data ?? [];
  const quickPrescriptionComplete = !quick || (!assignmentResult.error && quickAssignments.length > 0 && quickAssignments.every((row:any) => row.sets && row.reps));
  const quickClientSafe = !quick || (!assignmentResult.error && quickAssignments.length > 0 && quickAssignments.every((row:any) => row.exercises?.client_visible === true));
  const checks = [
    {key:"draft_status",label:"Program is still a draft",ok:program.status === "draft"},
    {key:"client_assigned",label:"Client is assigned",ok:!!program.client_id},
    {key:"assessment_linked",label:quick ? "Assessment optional for quick programming" : "Assessment is linked",ok:quick || !!program.assessment_id},
    ...(quick ? [{key:"prescription_complete",label:"Every selected exercise has sets and reps",ok:quickPrescriptionComplete},{key:"client_safe_exercises",label:"Every prescribed exercise is client-visible",ok:quickClientSafe}] : []),
    {key:"structured_plan",label:"Structured generated program exists",ok:!generated || (!!program.data?.structured_program && typeof program.data.structured_program === "object" && !Array.isArray(program.data.structured_program))},
    {key:"client_pdf",label:"Client PDF exists",ok:!generated || !!program.pdf_client_url},
    {key:"client_pdf_mode",label:"Client-safe PDF mode",ok:!generated || program.data?.pdf_mode !== "coach"},
    {key:"coach_edits",label:"No unsynchronized coach edits",ok:!generated || !program.coach_edits || Object.keys(program.coach_edits).length === 0},
  ];
  const blockers = checks.filter(check => !check.ok).map(({key,label}) => ({key,label}));
  const releaseChecks = generated ? [
    {key:"review_signoff",label:"Coach marked the plan ready to publish",ok:program.data?.review_status === "ready_to_publish"},
    {key:"catalog_safety",label:"All canonical identities mapped to safety-approved exercises",ok:catalogVerified},
    {key:"release_gate",label:"Formal generator client-release sign-off enabled",ok:process.env.IMS_GENERATOR_CLIENT_RELEASE_APPROVED === "true"},
  ] : [];
  return NextResponse.json({
    program_id:program.id,
    program_name:program.name,
    source:generated?"ims_generator":quick?"ims_library_program":"manual",
    ready_for_coach_review:blockers.length===0,
    ready_for_client_release:false,
    release_checks:releaseChecks,
    release_blockers:releaseChecks.filter(check => !check.ok).map(({key,label}) => ({key,label})),
    checks,
    blockers,
    note:"Passing this preflight does not approve exercise safety or publish a plan. Use the separate coach review and release workflow.",
  },{headers:{"Cache-Control":"private, no-store"}});
}
