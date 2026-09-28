import {blankPlan, emptyTargets, FUEL_UUID, shiftDate, validDate, type BodyComp, type FuelPlan, type PlanVersion, type Release} from "@/lib/fuel/model";

export const BUILD_MODES = ["quick", "bod_pod", "performance"] as const;
export type BuildMode = typeof BUILD_MODES[number];
export type BuildKind = "fuel" | "training" | "both";
export type BuildAssessment = {id:string; client_id:string; assessment_date:string; updated_at:string; status:string; data:unknown};
export type BuildEvidence = {
  clientId:string; name:string; asOf:string; capturedAt:string;
  body:BodyComp[]; assessment:BuildAssessment|null;
  latest:PlanVersion|null; release:Release|null;
  upcoming:{id:string; scheduled_at:string; status:string; session_type:string}[];
  performance:{exercise_name:string; performed_at:string; load_performed:string|null; reps_completed:string|null; rpe_actual:number|null}[];
  unavailable:string[];
};
export type BuildInputs = {mode:BuildMode; goal:string; start:string; reviewOn:string; trainingDays:number|null; preferences:string; meals:string; grocery:string; guidance:string};
export function object(value:unknown):Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function text(value:unknown):string{return typeof value==="string"?value.trim():"";}
export function assessmentContext(assessment:BuildAssessment|null){
  const data=object(assessment?.data),goals=object(data.goals),summary=object(data.summary),health=object(data.health),lifestyle=object(data.lifestyle);
  const raw=summary.recommended_sessions_per_week||goals.target_sessions_per_week;
  const days=typeof raw==="number"?raw:typeof raw==="string"&&/^[1-5]$/.test(raw.trim())?Number(raw):null;
  return {goal:text(goals.primary),trainingDays:days!==null&&Number.isInteger(days)&&days>=1&&days<=5?days:null,
    restrictions:[text(health.injuries_current),text(health.surgeries),text(summary.red_flags)].filter(Boolean),
    lifestyle:[text(lifestyle.occupation),text(lifestyle.sleep_quality),text(lifestyle.stress_level)].filter(Boolean),
    strength:object(data.strength_markers),cardio:object(data.cardio_tolerance)};
}
/** A home BIA reading must never silently become the Bod Pod baseline. */
export function latestBodPod(evidence:Pick<BuildEvidence,"body"|"asOf">):BodyComp|null{
  return [...evidence.body].filter(row=>row.method==="bod_pod"&&validDate(row.recorded_at)&&row.recorded_at<=evidence.asOf)
    .sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)||b.id.localeCompare(a.id))[0]??null;
}
/** Assessment fields are a review candidate, not an automatically recorded measurement. */
export function assessmentBodPodCandidate(assessment:BuildAssessment|null,asOf:string){
  if(!assessment)return null;const body=object(object(assessment.data).body_comp);
  if(body.method!=="bod_pod")return null;
  const number=(value:unknown,max:number)=>{if(value===null||value===undefined||typeof value==="string"&&!value.trim())return null;const n=typeof value==="number"?value:typeof value==="string"&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())?Number(value):NaN;return Number.isFinite(n)&&n>=0&&n<=max?n:null;};
  return {date:validDate(body.tested_on)&&body.tested_on<=asOf?body.tested_on:"",weight:number(body.weight_lbs,999),fat:number(body.body_fat_pct,100),lean:number(body.lean_mass_lbs,999),sourceReference:`assessment:${assessment.id}; body_comp fields — review original test`};
}
export function buildMode(value:unknown,hasBodPod=false):BuildMode{return BUILD_MODES.includes(value as BuildMode)?value as BuildMode:hasBodPod?"bod_pod":"quick";}
export function buildKind(value:unknown):BuildKind{return value==="training"||value==="both"?value:"fuel";}
export function buildBlocker(evidence:BuildEvidence,mode:BuildMode):string|null{
  if(evidence.unavailable.includes("Fuel versions"))return "Existing Fuel versions could not be checked. Refresh before creating another draft.";
  if(mode==="bod_pod"&&!latestBodPod(evidence))return "Record a real Bod Pod test first, or choose Quick Start. No measurement will be invented.";
  if(mode==="performance"&&!evidence.assessment)return "Add a client assessment first, or choose Quick Start. A body-composition result alone is not a performance assessment.";
  return null;
}
/** Structure only. Never calculate energy, macros, medical clearance or measured progress. */
export function composeFuelStrategy(evidence:BuildEvidence,input:BuildInputs):{content:FuelPlan;origin:"coach_authored";sourceReference:string}{
  if(!FUEL_UUID.test(evidence.clientId))throw Error("A real client is required. Samples cannot be assigned.");
  const blocker=buildBlocker(evidence,input.mode);if(blocker)throw Error(blocker);
  if(!validDate(input.start)||!validDate(input.reviewOn)||input.reviewOn<input.start)throw Error("Choose valid start and review dates.");
  if(input.goal.trim().length<3||input.goal.length>1000)throw Error("Confirm this client's goal (3–1000 characters).");
  if(input.trainingDays!==null&&(!Number.isInteger(input.trainingDays)||input.trainingDays<1||input.trainingDays>5))throw Error("Use 1–5 coached training days or leave frequency unassigned.");
  if([input.preferences,input.meals,input.grocery,input.guidance].some(value=>typeof value!=="string"||value.length>1500))throw Error("Keep each coaching note within 1500 characters.");
  const plan=blankPlan(input.start),baseline=latestBodPod(evidence);
  plan.title="Fuel Strategy · "+evidence.name.slice(0,95);plan.goal=input.goal.trim();plan.review_on=input.reviewOn;
  plan.habits=["fuel","water","sleep"];
  plan.phases[0].focus=input.mode==="quick"?"Establish a repeatable food, hydration and recovery routine. Review what fits your week with your coach.":input.mode==="bod_pod"?"Support the agreed body-composition goal while reviewing training quality and recovery. Compare future Bod Pod tests with the same method; do not treat scale change as measured fat change.":"Coordinate fueling, recovery and the agreed training demands. Review actual performance and client-reported habits before changing the strategy.";
  plan.guidance=["Agree on a practical routine with your coach. Report what happened; unreported habits are not failures.",
    input.trainingDays===null?"Training frequency is not assigned. Confirm independent training as well as IMS sessions.":`Coach-confirmed training context: ${input.trainingDays} day${input.trainingDays===1?"":"s"} per week. Other activity is not inferred from calendar gaps.`,
    "Training/rest-day calorie and macro targets are unassigned. A Bod Pod reading is body-composition evidence, not a measured daily calorie requirement.",
    input.preferences.trim()?"Coach-entered food preferences / agreed accommodations: "+input.preferences.trim():"Confirm food preferences, allergies and relevant referral needs with your coach before choosing foods or targets.",
    input.guidance.trim()].filter(Boolean).join("\n\n");
  plan.meals=input.meals.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,10).map(name=>({name:name.slice(0,120),day:"either",serving:"Coach-entered meal idea. Agree on portions, ingredients and any substitutions before use.",ingredients:[],swaps:"",targets:emptyTargets()}));
  plan.grocery=input.grocery.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,30).map(s=>s.slice(0,200));
  // Structural references only: private health, pain and performance notes never enter a released strategy.
  const refs=["ims_client_build_v1",`mode:${input.mode}`,`as_of:${evidence.asOf}`];
  if(input.mode!=="quick"&&baseline)refs.push(`body_comp:${baseline.id}`);
  if(evidence.assessment)refs.push(`assessment:${evidence.assessment.id}`);
  return {content:plan,origin:"coach_authored",sourceReference:refs.join("; ")};
}
export function initialBuildInputs(evidence:BuildEvidence,mode:BuildMode):BuildInputs{
  const context=assessmentContext(evidence.assessment);
  return {mode,goal:context.goal,start:evidence.asOf,reviewOn:shiftDate(evidence.asOf,14),trainingDays:context.trainingDays,preferences:"",meals:"",grocery:"",guidance:""};
}
/** Deliberately has no client ID, body metrics, persistence action or release path. */
export function sampleFuelStrategy(today:string):FuelPlan{
  const plan=blankPlan(today);plan.title="SAMPLE — Fuel Strategy";plan.goal="Illustrative habit-led coaching layout. Not assigned to anyone and not an individualized prescription.";
  plan.habits=["fuel","water","sleep"];plan.review_on=shiftDate(today,14);
  plan.phases[0].focus="Build a repeatable routine for busy weeks. Decide the first practical habit together, then review reported energy, training and barriers.";
  plan.guidance="Example execution: plan tomorrow's food before a busy day, make hydration convenient, and protect a consistent sleep routine. Discuss food preferences, allergies and medical nutrition needs before adapting any example. No calorie targets, body-composition readings or exercise clearance are implied.";
  plan.meals=["A repeatable breakfast","A packable lunch","An easy dinner","A training-day food option"].map(name=>({name,day:"either",serving:"Example planning slot: select familiar, tolerated foods and coach-reviewed portions. This is a framework, not a calculated menu.",ingredients:[],swaps:"",targets:emptyTargets()}));
  plan.grocery=["Foods chosen for the agreed breakfast","Ingredients for a packable lunch","Ingredients for an easy dinner","A convenient option for training days"];
  return plan;
}
