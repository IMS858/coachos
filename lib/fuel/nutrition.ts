import {z} from 'zod';
import {blankPlan,shiftDate,type Targets,type FuelPlan} from './model';
import {measureSchema,measurementWarnings,type NutritionMeasurement} from './report';
export const NUTRITION_RULES='ims-adult-nutrition-draft-v1';
export const ACTIVITY={low:1.3,moderate:1.45,active:1.6} as const;
const answer=z.enum(['no','yes','unknown']);
export const nutritionIntakeSchema=z.object({age:z.number().int().min(18).max(78),height_cm:z.number().finite().min(120).max(230),equation_coefficient:z.enum(['female','male']),activity:z.enum(['low','moderate','active']),goal:z.enum(['maintenance','fat_loss','gain','performance']),training_days:z.number().int().min(0).max(7),diet:z.enum(['mixed','plant']),meals_per_day:z.enum(['3','4']),budget:z.enum(['standard','economy']),prep:z.enum(['quick','batch']),avoid:z.array(z.enum(['milk','soy','oats','banana','chicken','rice','broccoli','oil'])).max(8),other_food_restrictions:z.string().max(500),preferences:z.string().max(800),screen:z.object({pregnancy_or_breastfeeding:answer,eating_disorder_or_restrictive_history:answer,medical_nutrition_or_medication:answer,unexplained_symptoms_or_weight_change:answer,high_training_demand:answer}).strict(),food_reviewed:z.literal(true)}).strict();
export type NutritionIntake=z.infer<typeof nutritionIntakeSchema>;
export type NutritionNumbers={rules:string;rmr:number;maintenance:number;proposed:Targets;activityFactor:number;goalFactor:number;proteinPerKg:number;assumptions:string[]};
export function calculateNutrition(measurement:NutritionMeasurement,input:NutritionIntake,today:string):NutritionNumbers{
 const m=measureSchema.parse(measurement),i=nutritionIntakeSchema.parse(input);
 if(m.date>today)throw Error('A future test is not a measured baseline.');
 if(m.date<shiftDate(today,-90))throw Error('This baseline is over 90 days old. Confirm a current measurement before numeric drafting; the original report stays intact.');
 if(Object.values(i.screen).some(value=>value!=='no'))throw Error('Nutrition screening needs individual professional review. Use habit-led coaching or an appropriately qualified clinician/dietitian; no automated targets generated.');
 if(measurementWarnings(m).length)throw Error('Resolve conflicting measurement values before generating numeric targets. Do not silently replace the original.');
 const kg=m.weight_lb*0.45359237,bmi=kg/(i.height_cm/100)**2;
 // Conservative product eligibility gates, not diagnostic classifications or guarantees.
 if(bmi<18.5||bmi>40)throw Error('This client is outside the general-adult automated pathway. Individualized professional review is required.');
 if(m.body_fat_pct!==null&&m.body_fat_pct<(i.equation_coefficient==='female'?18:10)&&i.goal==='fat_loss')throw Error('The automated fat-loss pathway is not appropriate for this reported body-fat level. Review energy availability and goals individually.');
 const rmr=10*kg+6.25*i.height_cm-5*i.age+(i.equation_coefficient==='male'?5:-161),activityFactor=ACTIVITY[i.activity],maintenance=rmr*activityFactor,goalFactor=i.goal==='fat_loss'?0.9:i.goal==='gain'?1.05:1;
 const kcal=Math.round(maintenance*goalFactor/25)*25;
 if(kcal<Math.max(rmr,i.equation_coefficient==='female'?1500:1800)||kcal>4000)throw Error('The proposed energy target falls outside this conservative automated pathway. Review individually; the system will not silently clamp it.');
 const protein_g=Math.round(kg*1.6),fat_g=Math.round(kcal*0.3/9),carbs_g=Math.round((kcal-4*protein_g-9*fat_g)/4);
 if(carbs_g<130||protein_g*4/kcal>0.35)throw Error('Macro distribution needs individual review. No restricted diet was generated.');
 return {rules:NUTRITION_RULES,rmr:Math.round(rmr),maintenance:Math.round(maintenance),proposed:{kcal,protein_g,fat_g,carbs_g},activityFactor,goalFactor,proteinPerKg:1.6,assumptions:[
  'Estimated resting energy: Mifflin–St Jeor (10 × kg + 6.25 × cm − 5 × age + sex-specific coefficient). Not measured metabolism. https://pubmed.ncbi.nlm.nih.gov/2305711/',
  `Inputs: ${m.weight_lb} lb; ${i.height_cm} cm; age ${i.age}; ${i.equation_coefficient} equation coefficient. Body-fat and fat-free-mass readings remain baseline context, not muscle measurements or direct calorie requirements.`,
  `Coach-confirmed activity factor ${activityFactor}; maintenance estimate ${Math.round(maintenance)} kcal/day. Factor, 10% deficit / 5% surplus, eligibility cutoffs and 14-day review are product coaching heuristics, not validated individualized requirements.`,
  `Goal factor ${goalFactor}; rounded energy ${kcal} kcal. Proposed protein 1.6 g/kg body weight and fat 30% of energy; carbohydrate is the remainder. These starting rules require individual review, not automatic approval. Protein evidence: https://bjsm.bmj.com/content/52/6/376`,
  'No guaranteed fat loss, fixed 3,500-calorie prediction, body-fat classification diagnosis, supplement recommendation or calculated workout calorie credit. Training/rest targets start equal; adjust only after reviewed activity and response.',
 ]};
}
export function nutritionStrategy(name:string,m:NutritionMeasurement,i:NutritionIntake,n: NutritionNumbers,today:string):FuelPlan{
 const p=blankPlan(today);p.title=('Nutrition Draft · '+name).slice(0,120);p.mode='targets';p.goal=({maintenance:'Maintain / support recomposition',fat_loss:'Conservative fat-loss support',gain:'Gradual weight-gain support',performance:'Fuel training and recovery'})[i.goal];p.habits=['protein','fuel','water','sleep'];p.review_on=shiftDate(today,14);p.phases[0].training={...n.proposed};p.phases[0].rest={...n.proposed};p.phases[0].focus='A coach-reviewed starting proposal. Reassess reported energy, hunger, training performance, practical fit and weight trends; no automatic changes.';
 p.guidance=[`Bod Pod baseline: ${m.date}; weight ${m.weight_lb} lb; body fat ${m.body_fat_pct??'not recorded'}%; lean / fat-free mass ${m.lean_mass_lb??'not recorded'} lb. Source model: ${m.model_label||'not shown'}.`,
  ...n.assumptions,`Training context confirmed: ${i.training_days} days/week including outside training. No calendar-based rest inference.`,
  `Meal preference: ${i.diet}; ${i.meals_per_day} meals/day; ${i.budget} budget; ${i.prep} preparation. Preferences to discuss: ${i.preferences||'none entered'}.`,
  'Use only tolerated foods. Check actual labels, preparation states and cross-contact; the menu is not an allergy-safety or micronutrient-adequacy certification. Three sample rotations are options, not a requirement to eat every menu in one day.',
  'Review in two weeks, sooner for persistent fatigue, dizziness, excessive hunger, poor recovery or concerning symptoms. Seek appropriate professional advice; do not continue an automated deficit through symptoms. Plan a standardized Bod Pod retest with your coach; no projection is recorded as a result.',
  `Calculation version: ${NUTRITION_RULES}. Calorie/macro numbers are proposed estimates, not measured intake or expenditure.`].join('\n\n');return p;
}
