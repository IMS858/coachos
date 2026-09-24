import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

/** Record the authenticated IMS owner's source-catalog attestation.
 * This is evidence of owner review of canonical exercise names and familiarity,
 * NOT a crosswalk, contraindication certification or client publication gate.
 */
export async function POST(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Log in as the IMS owner."},{status:401});
 const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(profile?.role!=="owner")return NextResponse.json({error:"Only the IMS owner may attest to the full source catalog."},{status:403});
 const {data:queue,error:readError}=await supabase.from("canonical_exercise_queue").select("canonical_id").order("canonical_id").limit(1000);
 if(readError||!queue||queue.length!==423)return NextResponse.json({error:"Catalog size changed or cannot be read. Review exceptions before signing off."},{status:409});
 const ids=queue.map(x=>x.canonical_id);
 if(new Set(ids).size!==ids.length)return NextResponse.json({error:"Duplicate canonical IDs; attestation blocked."},{status:409});
 const {data:previous}=await supabase.from("exercise_catalog_attestations").select("id,reviewed_canonical_ids,reviewed_at").eq("reviewed_by",user.id).order("reviewed_at",{ascending:false}).limit(1).maybeSingle();
 if(previous&&JSON.stringify(previous.reviewed_canonical_ids)===JSON.stringify(ids))return NextResponse.json({ok:true,reviewed_count:ids.length,already_recorded:true,reviewed_at:previous.reviewed_at});
 const {data,error}=await supabase.from("exercise_catalog_attestations").insert({
  reviewed_by:user.id,reviewed_canonical_ids:ids,
  statement:"IMS owner confirms personal review and familiarity with all 423 canonical source exercises. This attestation does not verify 604 library mappings, AI-written safety tags, individual contraindications, dosage, or client-specific medical suitability.",
  scope:"canonical_source_identity_and_familiarity"
 }).select("reviewed_at").single();
 if(error)return NextResponse.json({error:"Could not save owner attestation."},{status:500});
 return NextResponse.json({ok:true,reviewed_count:ids.length,reviewed_at:data.reviewed_at,safety_approved:false,client_visible_unchanged:true});
}
