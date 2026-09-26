// Fuel & Performance: descriptive coaching evidence, never an automatic prescription.
export const FUEL_VERSION = 1;
export const FUEL_TZ = "America/Los_Angeles";
export const FUEL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HABITS = ["protein", "fuel", "water", "steps", "sleep", "training"] as const;
export type Habit = typeof HABITS[number];
export type DayType = "training" | "rest" | "unclassified";
export type HabitState = "met" | "missed" | "not_due" | null;
export type Targets = {kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null};
export type Phase = {name: string; start: string; end: string; focus: string; training: Targets; rest: Targets};
export type Meal = {name: string; day: "training" | "rest" | "either"; serving: string; ingredients: string[]; swaps: string; targets: Targets};
export type FuelPlan = {schema_version: 1; title: string; goal: string; start: string; end: string; event_date: string | null; mode: "habits" | "targets"; habits: string[]; phases: Phase[]; meals: Meal[]; grocery: string[]; guidance: string; review_on: string | null};
export type Daily = {day_type: DayType; habits: Record<Habit, HabitState>; weight_lb: number | null; steps: number | null; sleep_hours: number | null; energy: number | null; hunger: number | null; note: string};
export type Checkin = {hardest_moment: string; barriers: string; training: "stronger" | "same" | "flat" | "not_reported"; symptoms: string; upcoming: string; next_step: string; contact_requested: boolean; energy: number | null; hunger: number | null; sleep: number | null};
export type Journal = {id: string; client_id: string; kind: "daily" | "weekly"; entry_date: string; revision: number; payload: Daily | Checkin; plan_version_id: string | null; created_at: string};
export type PlanVersion = {id: string; client_id: string; revision: number; content: FuelPlan; origin: "coach_authored" | "source_transcription" | "ai_proposed"; source_reference: string; created_at: string};
export type Release = {id: string; client_id: string; version_id: string | null; sequence: number; reason: string; created_at: string};
export type Review = {id: string; client_id: string; entry_id: string; note: string; disposition: "reviewed" | "contact" | "referral"; created_at: string};
export type BodyComp = {id: string; recorded_at: string; weight_lb: number | null; body_fat_pct: number | null; lean_mass_lb: number | null; method: string};
export function fuelDate(now = new Date()): string {return new Intl.DateTimeFormat("en-CA", {timeZone: FUEL_TZ}).format(now);}
export function validDate(value: unknown): value is string {if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(value + "T12:00:00Z"); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;}
export function shiftDate(date: string, days: number): string {if (!validDate(date) || !Number.isInteger(days)) throw Error("Invalid calendar date."); const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);}
export function emptyTargets(): Targets {return {kcal:null,protein_g:null,carbs_g:null,fat_g:null};}
export function blankPlan(start: string, template: "habits" | "academy" = "habits"): FuelPlan {
 const end = shiftDate(start, template === "academy" ? 167 : 27);
 const phases = template === "academy" ? [["Foundation",0,27],["Push",28,90],["Diet break",91,104],["Second push",105,146],["Perform",147,167]] as const : [["Foundation",0,27]] as const;
 return {schema_version:1,title:template === "academy" ? "Academy Fuel & Performance" : "Fuel & Performance",goal:"",start,end,event_date:null,mode:"habits",habits:[],phases:phases.map(([name,from,to])=>({name,start:shiftDate(start,from),end:shiftDate(start,to),focus:"",training:emptyTargets(),rest:emptyTargets()})),meals:[],grocery:[],guidance:"",review_on:null};
}
export function targetWarnings(target: Targets): string[] {
 const {kcal,protein_g,carbs_g,fat_g}=target;
 if ([kcal,protein_g,carbs_g,fat_g].some(value=>value===null)) return [];
 const calculated=4*protein_g!+4*carbs_g!+9*fat_g!, difference=Math.round((calculated-kcal!)*10)/10;
 return difference === 0 ? [] : [`Listed energy ${kcal} kcal; 4/4/9 macro arithmetic ${calculated} kcal (${difference>0?"+":""}${difference}). Review rounding/source differences; original values are unchanged.`];
}
export function planWarnings(plan: FuelPlan): string[] {
 return plan.phases.flatMap(p=>[...targetWarnings(p.training).map(s=>`${p.name}, training: ${s}`),...targetWarnings(p.rest).map(s=>`${p.name}, rest: ${s}`)]).concat(plan.meals.flatMap(m=>targetWarnings(m.targets).map(s=>`${m.name}: ${s}`)));
}
export function phaseForDate(plan: FuelPlan, date: string): Phase | null {
 if (!validDate(date) || date<plan.start || date>plan.end) return null;
 const phases=plan.phases.filter(p=>p.start<=date&&p.end>=date);return phases.length===1?phases[0]:null;
}
export function dailyTargets(plan: FuelPlan, date: string, day: DayType): Targets | null {
 const phase=phaseForDate(plan,date);return !phase||plan.mode!=="targets"||day==="unclassified"?null:phase[day];
}
export function latestJournal(rows: Journal[]): Journal[] {
 const byKey=new Map<string,Journal>();
 for(const row of rows){const key=`${row.client_id}|${row.kind}|${row.entry_date}`,previous=byKey.get(key);if(!previous||row.revision>previous.revision)byKey.set(key,row);}
 return [...byKey.values()].sort((a,b)=>b.entry_date.localeCompare(a.entry_date));
}
export function adherence(rows: Journal[], start: string, end: string, clientId: string) {
 const daily=latestJournal(rows).filter(r=>r.client_id===clientId&&r.kind==="daily"&&r.entry_date>=start&&r.entry_date<=end);
 return {loggedDays:daily.length,habits:HABITS.map(habit=>{let met=0,missed=0,notDue=0;for(const row of daily){const state=(row.payload as Daily).habits[habit];if(state==="met")met++;if(state==="missed")missed++;if(state==="not_due")notDue++;}return {habit,met,missed,notDue,reported:met+missed,percent:met+missed?Math.round(100*met/(met+missed)):null};})};
}
export function weightAverage(rows: Journal[], start: string, end: string, clientId: string) {
 const samples=latestJournal(rows).filter(r=>r.client_id===clientId&&r.kind==="daily"&&r.entry_date>=start&&r.entry_date<=end).map(r=>(r.payload as Daily).weight_lb).filter((v):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0);
 return {samples:samples.length,average:samples.length>=3?Math.round(samples.reduce((a,b)=>a+b,0)/samples.length*10)/10:null};
}
export function confirmedTrainingContext(sessions: {scheduled_at:string;status:string;session_type:string}[], date: string): boolean {
 // A missing booking never means rest: remote/self-directed training may not be in this calendar.
 return sessions.some(s=>s.session_type==="training"&&["scheduled","confirmed","completed"].includes(s.status)&&Number.isFinite(Date.parse(s.scheduled_at))&&fuelDate(new Date(s.scheduled_at))===date);
}
export function pendingCheckins(entries: Journal[], reviews: Review[]): Journal[] {const reviewed=new Set(reviews.map(r=>r.entry_id));return latestJournal(entries).filter(r=>r.kind==="weekly"&&!reviewed.has(r.id));}
export function bodyCompWarning(row: BodyComp): string | null {
 if(row.weight_lb===null||row.lean_mass_lb===null||row.body_fat_pct===null)return "Some measurement fields were not recorded.";
 const implied=row.weight_lb*(1-row.body_fat_pct/100);
 return Math.abs(implied-row.lean_mass_lb)>1?"Reported body-composition fields differ by more than rounding. Review the source; no value was replaced.":null;
}
