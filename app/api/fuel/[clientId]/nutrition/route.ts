import {NextResponse,type NextRequest} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {smallJson} from '@/lib/media/request';
import {FUEL_UUID,fuelDate} from '@/lib/fuel/model';
import {fuelPlanSchema} from '@/lib/fuel/validation';
import {nutritionRequestSchema,validNutritionReceipt,type NutritionRequest} from '@/lib/fuel/nutrition-request';
import {calculateNutrition,nutritionStrategy,NUTRITION_RULES} from '@/lib/fuel/nutrition';
import {loadFoodFacts,foodKeys,menuEligibility,createMenus,attachMenu} from '@/lib/fuel/foods';
export const runtime='nodejs';export const maxDuration=45;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:NextRequest,{params}:{params:Promise<{clientId:string}>}){
 const {clientId}=await params;if(!FUEL_UUID.test(clientId))return reply({error:'Invalid client.'},400);if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin.'},403);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return reply({error:'Sign in required.'},401);const access=await db.rpc('fuel_can_access',{p_client:clientId,p_staff_only:true});if(access.error)return reply({error:'Nutrition authorization unavailable.'},503);if(access.data!==true)return reply({error:'Assigned active coach or owner required.'},403);
 let body:NutritionRequest;try{body=nutritionRequestSchema.parse(await smallJson(request,60000));if(new Set(body.sources.map(s=>s.id)).size!==body.sources.length)throw Error('Duplicate originals.');}catch{return reply({error:'Confirm the original results, required intake and review fields. Unknown screening answers cannot generate targets.'},400);}
 const [originals,person]=await Promise.all([db.from('fuel_source_documents').select('id,sha256').eq('client_id',clientId).in('id',body.sources.map(s=>s.id)),db.from('profiles').select('id,full_name,deleted_at').eq('id',clientId).maybeSingle()]);
 if(originals.error||person.error)return reply({error:'Source or client evidence unavailable.'},503);const originalRows=originals.data;if(!person.data||person.data.deleted_at||!originalRows||body.sources.some(s=>!originalRows.some(d=>d.id===s.id&&d.sha256===s.sha256)))return reply({error:'A source does not belong to this client or its checksum changed.'},403);
 const today=fuelDate();let calculation;try{calculation=calculateNutrition(body.measurement,body.intake,today);}catch(error){return reply({error:error instanceof Error?error.message:'Individual review required.'},422);}
 if(body.action==='propose'){
  let content=nutritionStrategy(person.data.full_name,body.measurement,body.intake,calculation,today),menuWarning=menuEligibility(body.intake),foodSources:unknown[]=[],menuSummary:unknown[]=[];
  if(!menuWarning){try{const facts=await loadFoodFacts(foodKeys(body.intake)),menu=createMenus(body.intake,calculation.proposed,facts);content=attachMenu(content,menu,facts);foodSources=facts;menuSummary=menu.summaries;}catch(error){menuWarning=error instanceof Error?error.message:'Food data unavailable. No menu numbers were invented.';}}
  if(menuWarning)content.guidance+='\n\nMeal generation incomplete: '+menuWarning+' Targets alone are not a complete meal plan.';
  const valid=fuelPlanSchema.safeParse(content);if(!valid.success)return reply({error:'Draft structure exceeds supported limits. Nothing saved.'},503);
  const recheck=await db.rpc('fuel_can_access',{p_client:clientId,p_staff_only:true});if(recheck.error||recheck.data!==true)return reply({error:'Client access changed.'},403);
  return reply({client_id:clientId,content:valid.data,calculation,foodSources,menuSummary,menuWarning,persisted:false});
 }
 if(body.request_id===body.measurement_request_id)return reply({error:'Separate measurement and strategy request identities are required.'},400);
 const sourceIds=body.sources.map(s=>s.id).sort().join(',');
 // Client-reviewed draft content is authoring input, not a provider-signed medical prescription.
 // Metadata states which values were confirmed; full source bytes remain immutable and private.
 const protocol=JSON.stringify({kind:'coach_confirmed_report_values',measurement:body.measurement,documents:body.sources,rules:NUTRITION_RULES,calculation_inputs:{age:body.intake.age,equation_method:body.intake.equation_method,height_cm:body.intake.height_cm,equation_coefficient:body.intake.equation_coefficient,activity:body.intake.activity,goal:body.intake.goal},screened_for_general_adult_path:true});
 const measurement={action:'record_body_comp',request_id:body.measurement_request_id,date:body.measurement.date,weight_lb:body.measurement.weight_lb,body_fat_pct:body.measurement.body_fat_pct,lean_mass_lb:body.measurement.lean_mass_lb,method:'bod_pod',source_kind:'source_transcription',source_reference:'documents:'+sourceIds,protocol,confirmed:true};
 const strategy={action:'save_plan',request_id:body.request_id,expected_revision:body.expected_revision,content:body.content,origin:'coach_authored',source_reference:NUTRITION_RULES};
 try{const saved=await db.rpc('save_fuel_nutrition_draft',{p_client:clientId,p_measure:measurement,p_plan:strategy,p_sources:body.sources});if(saved.error){const code=saved.error.code;return reply({error:['40001','23505'].includes(code)?'A version changed or a request ID was reused. Refresh; no partial baseline/strategy was committed.':code==='42501'?'Permission was not confirmed.':'Save unconfirmed. Retry this exact request; do not start a new baseline.'},['40001','23505'].includes(code)?409:code==='42501'?403:503);}if(!validNutritionReceipt(saved.data,body.request_id,body.measurement_request_id,clientId))return reply({error:'Incomplete receipt. Retry the same save.'},503);return reply(saved.data);}catch{return reply({error:'Save unconfirmed. Retry the exact request.'},503);}
}
