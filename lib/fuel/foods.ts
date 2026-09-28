import type {FuelPlan,Meal,Targets} from './model';
import type {NutritionIntake} from './nutrition';
// Exact USDA descriptions, not AI nutrient guesses. Values are loaded at runtime from SR Legacy.
export const FOOD_SPECS={
 oats:{description:'Cereals, oats, regular and quick, not fortified, dry',query:'oats regular quick dry',label:'Oats, dry',max:100,min:25,step:5},
 yogurt:{description:'Yogurt, Greek, plain, nonfat',query:'Yogurt Greek plain nonfat',label:'Plain nonfat Greek yogurt',max:350,min:100,step:25},
 banana:{description:'Bananas, raw',query:'Bananas raw',label:'Banana, peeled',max:180,min:70,step:10},
 chicken:{description:'Chicken, broilers or fryers, breast, meat only, cooked, roasted',query:'Chicken breast meat only cooked roasted',label:'Chicken breast, cooked roasted meat only',max:220,min:80,step:10},
 tofu:{description:'Tofu, raw, firm, prepared with calcium sulfate',query:'Tofu raw firm calcium sulfate',label:'Firm tofu, drained, as-packaged weight',max:300,min:100,step:20},
 rice:{description:'Rice, white, long-grain, regular, enriched, cooked',query:'Rice white long-grain regular enriched cooked',label:'Long-grain white rice, cooked',max:350,min:80,step:10},
 broccoli:{description:'Broccoli, cooked, boiled, drained, without salt',query:'Broccoli cooked boiled drained without salt',label:'Broccoli, cooked and drained',max:250,min:100,step:25},
 oil:{description:'Oil, olive, salad or cooking',query:'Oil olive salad cooking',label:'Olive oil',max:20,min:0,step:2},
} as const;
export type FoodKey=keyof typeof FOOD_SPECS;
export type FoodFact={key:FoodKey;fdcId:number;description:string;source:string;retrievedAt:string;per100:Required<Targets>};
export function parseFoodFact(key:FoodKey,row:unknown):FoodFact{
 const r=row as {fdcId?:number;dataType?:string;description?:string;foodNutrients?:{nutrientId?:number;nutrientName?:string;unitName?:string;value?:number}[]};
 if(!r||!Number.isSafeInteger(r.fdcId)||r.dataType!=='SR Legacy'||r.description?.toLowerCase()!==FOOD_SPECS[key].description.toLowerCase()||!Array.isArray(r.foodNutrients))throw Error('Exact USDA food not available. No nutrient value was guessed.');
 const number=(id:number,unit:string)=>{const rows=r.foodNutrients!.filter(n=>n.nutrientId===id&&n.unitName?.toLowerCase()===unit.toLowerCase());if(rows.length!==1||!Number.isFinite(rows[0].value)||rows[0].value!<0)throw Error('Required USDA nutrients are unavailable.');return rows[0].value!;};
 const per100={kcal:number(1008,'kcal'),protein_g:number(1003,'g'),carbs_g:number(1005,'g'),fat_g:number(1004,'g')};
 if(per100.kcal>1000||[per100.protein_g,per100.carbs_g,per100.fat_g].some(v=>v>100))throw Error('Unexpected food nutrient basis.');
 return {key,fdcId:r.fdcId!,description:r.description!,source:`https://fdc.nal.usda.gov/food-details/${r.fdcId}/nutrients`,retrievedAt:new Date().toISOString(),per100};
}
export async function loadFoodFacts(keys:FoodKey[]):Promise<FoodFact[]>{
 if(!process.env.USDA_FDC_API_KEY)throw Error('USDA food data is not configured. Targets can be proposed, but no calculated menu is claimed.');
 return Promise.all([...new Set(keys)].map(async key=>{
  const response=await fetch('https://api.nal.usda.gov/fdc/v1/foods/search',{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':process.env.USDA_FDC_API_KEY!},body:JSON.stringify({query:FOOD_SPECS[key].query,dataType:['SR Legacy'],pageSize:50}),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('USDA food data unavailable. Retry later; no meal nutrition was invented.');
  const raw=await response.text();if(raw.length>1000000)throw Error('Food response exceeds limit.');const payload=JSON.parse(raw);
  const matches=Array.isArray(payload.foods)?payload.foods.filter((row:{description?:string})=>row.description?.toLowerCase()===FOOD_SPECS[key].description.toLowerCase()):[];
  if(matches.length!==1)throw Error('An exact food entry was not uniquely available. Use the manual meal editor rather than an approximate match.');return parseFoodFact(key,matches[0]);
 }));
}
type Portion={key:FoodKey;grams:number};
type MenuSlot={name:string;items:Portion[]};
export function foodKeys(input:NutritionIntake):FoodKey[]{return input.diet==='plant'?['oats','banana','tofu','rice','broccoli','oil']:['oats','yogurt','banana','chicken','rice','broccoli','oil'];}
export function menuEligibility(input:NutritionIntake):string|null{
 if(input.other_food_restrictions.trim())return 'Additional food restrictions need manual meal review. Numeric targets are separate; an automated menu is withheld.';
 const keys=foodKeys(input);for(const avoid of input.avoid){if(keys.includes(avoid as FoodKey)||avoid==='milk'&&keys.includes('yogurt')||avoid==='soy'&&keys.includes('tofu'))return 'A restriction conflicts with this initial food library. Use the meal editor for reviewed alternatives; no automatic allergy swap was made.';}
 return null;
}
export function sumPortions(portions:Portion[],facts:FoodFact[]):Targets{
 const sum={kcal:0,protein_g:0,carbs_g:0,fat_g:0};for(const p of portions){const fact=facts.find(f=>f.key===p.key);if(!fact)throw Error('Missing food composition.');for(const key of Object.keys(sum) as (keyof Targets)[])sum[key]+=Number(fact.per100[key])*p.grams/100;}return Object.fromEntries(Object.entries(sum).map(([k,v])=>[k,Math.round(v*10)/10])) as Targets;
}
/** Bounded portions are fitted to a proposal; residuals remain visible, never relabeled a perfect match. */
export function createMenus(input:NutritionIntake,target:Targets,facts:FoodFact[]):{meals:Meal[];grocery:string[];summaries:{rotation:number;totals:Targets;energyDifference:number;proteinDifference:number}[];notes:string[]}{
 const blocked=menuEligibility(input);if(blocked)throw Error(blocked);const protein:FoodKey=input.diet==='plant'?'tofu':'chicken';
 const slots:MenuSlot[]=[{name:input.diet==='plant'?'Savory tofu breakfast + oats':'Yogurt, oats + banana',items:input.diet==='plant'?[{key:'tofu',grams:180},{key:'oats',grams:50},{key:'banana',grams:100}]:[{key:'yogurt',grams:200},{key:'oats',grams:50},{key:'banana',grams:100}]},{name:input.prep==='quick'?'Simple protein + rice bowl':'Batch-prep protein + rice bowl',items:[{key:protein,grams:140},{key:'rice',grams:180},{key:'broccoli',grams:150},{key:'oil',grams:10}]},{name:'Protein plate + rice and vegetables',items:[{key:protein,grams:140},{key:'rice',grams:180},{key:'broccoli',grams:150},{key:'oil',grams:10}]}];
 if(input.meals_per_day==='4'){slots.push({name:input.diet==='plant'?'Tofu snack plate':'Yogurt snack',items:[{key:input.diet==='plant'?'tofu':'yogurt',grams:150}]});}
 const all=slots.flatMap(s=>s.items),score=()=>{const v=sumPortions(all,facts);return ['kcal','protein_g','carbs_g','fat_g'].reduce((a,k)=>{const key=k as keyof Targets;return a+((v[key]!-target[key]!)/Math.max(target[key]!,20))**2;},0);};
 let best=score();for(let pass=0;pass<80;pass++){let changed=false;for(const p of all){const spec=FOOD_SPECS[p.key];let chosen=p.grams;const before=p.grams;for(const direction of [-1,1]){const g=before+direction*spec.step;if(g<spec.min||g>spec.max)continue;p.grams=g;const cost=score();if(cost<best-0.0000001){best=cost;chosen=g;changed=true;}}p.grams=chosen;}if(!changed)break;}
 const totals=sumPortions(all,facts),energyDifference=Math.round(totals.kcal!-target.kcal!),proteinDifference=Math.round(totals.protein_g!-target.protein_g!);
 if(Math.abs(energyDifference)>target.kcal!*0.12||Math.abs(proteinDifference)>target.protein_g!*0.25)throw Error('This small food library cannot fit the proposed targets with practical portions. Targets are preserved; choose additional reviewed foods in the manual editor.');
 const meals:Meal[]=slots.map((slot,index)=>({name:`Sample day · ${slot.name}`.slice(0,120),day:'either',serving:`Meal ${index+1}. Weigh foods in the exact preparation state named. Amounts are estimates for coach review; do not assume substitute foods have identical nutrition.`,ingredients:slot.items.filter(p=>p.grams>0).map(p=>`${p.grams} g ${FOOD_SPECS[p.key].label} (USDA FDC ${facts.find(f=>f.key===p.key)!.fdcId})`),swaps:'Discuss a tolerated alternative with your coach and recalculate portions. No allergy-safe or nutritionally equivalent substitution is asserted.',targets:sumPortions(slot.items,facts)}));
 const amounts=new Map<FoodKey,number>();for(const p of all)amounts.set(p.key,(amounts.get(p.key)??0)+p.grams*3);
 const grocery=[...amounts].filter(([,g])=>g>0).map(([key,g])=>`${Math.round(g)} g ${FOOD_SPECS[key].label} — 3 repetitions of sample day; shopping raw weights differ from cooked portions.`);
 return {meals,grocery,summaries:[{rotation:1,totals,energyDifference,proteinDifference}],notes:[`Sample day totals ${totals.kcal} kcal, protein ${totals.protein_g} g, carbs ${totals.carbs_g} g, fat ${totals.fat_g} g. Differences vs proposed targets: ${energyDifference>=0?'+':''}${energyDifference} kcal; ${proteinDifference>=0?'+':''}${proteinDifference} g protein. Do not silently change targets to match.`,input.budget==='economy'?'Economy prep: reuse ingredients and compare unit prices; no live price estimate is claimed.':'Choose practical package sizes and review brand labels.',input.prep==='batch'?'Batch-prep selected foods using safe handling and storage instructions. The grocery list covers three sample days.':'Quick prep: use matching plain cooked foods and ready-to-eat options; sauces and added ingredients change the estimates.','This is one complete sample day, repeatable three times, not a varied seven-day diet or micronutrient adequacy assessment.']};
}
export function attachMenu(plan:FuelPlan,menu:ReturnType<typeof createMenus>,facts:FoodFact[]){return {...plan,meals:menu.meals,grocery:menu.grocery,guidance:plan.guidance+'\n\n'+menu.notes.join('\n')+'\nFood sources (per 100 g, USDA SR Legacy; retrieved '+facts[0]?.retrievedAt.slice(0,10)+'):\n'+facts.map(f=>`${f.key}: ${f.source}`).join('\n')};}
