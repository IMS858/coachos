import {researchInstructions,researchOutputJsonSchema,validateResearchOutput,type ResearchSettings} from './research-engine';
const API='https://api.openai.com/v1/responses';
const RESPONSE_ID=/^resp_[A-Za-z0-9_-]{1,160}$/;
export function researchProviderReady(){return process.env.GROWTH_RESEARCH_ENABLED==='true'&&Boolean(process.env.GROWTH_RESEARCH_API_KEY);}
export function researchModel(){return process.env.GROWTH_RESEARCH_MODEL||'gpt-5.6-terra';}
async function boundedJson(response:Response){if(!response.ok)throw Error('provider_unavailable');if(!response.body)throw Error('provider_empty');const reader=response.body.getReader();let size=0;const parts:Uint8Array[]=[];try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>1000000){await reader.cancel();throw Error('provider_oversized');}parts.push(x.value);}}finally{reader.releaseLock();}return JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<string,any>;}
/** Only fixed OpenAI endpoints. No client records, consumer contacts or business private notes enter this request. */
export async function beginResearch(config:ResearchSettings,excluded:string[],today:string){
 if(!researchProviderReady())throw Error('provider_not_configured');
 return boundedJson(await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${process.env.GROWTH_RESEARCH_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:researchModel(),background:true,store:true,instructions:researchInstructions(config,excluded,today),input:'Research public organizations and return only source-backed opportunities.',tools:[{type:'web_search',search_context_size:'medium'}],tool_choice:'required',max_tool_calls:6,max_output_tokens:6500,include:['web_search_call.action.sources'],text:{format:{type:'json_schema',name:'ims_growth_opportunities',strict:true,schema:researchOutputJsonSchema}}}),cache:'no-store',signal:AbortSignal.timeout(20000)}));
}
export async function readResearch(id:string,cancel=false){if(!RESPONSE_ID.test(id))throw Error('invalid_provider_identity');if(!process.env.GROWTH_RESEARCH_API_KEY)throw Error('provider_not_configured');return boundedJson(await fetch(API+'/'+encodeURIComponent(id)+(cancel?'/cancel':'?include[]=web_search_call.action.sources'),{method:cancel?'POST':'GET',headers:{Authorization:`Bearer ${process.env.GROWTH_RESEARCH_API_KEY}`},cache:'no-store',signal:AbortSignal.timeout(18000)}));}
export function researchResponseIdentity(value:Record<string,any>){if(!RESPONSE_ID.test(value.id))throw Error('invalid_provider_identity');return value.id as string;}
export function safeProviderFailure(value:Record<string,any>){const code=typeof value.error?.code==='string'?value.error.code.toLowerCase():'';if(/quota|billing|credit/.test(code))return 'provider_billing_or_quota';if(/rate|limit/.test(code))return 'provider_rate_limit';if(/model|access|permission/.test(code))return 'provider_model_access';if(/invalid|request|parameter/.test(code))return 'provider_invalid_request';if(value.status==='incomplete')return 'provider_incomplete';return 'provider_failed';}
export function completedResearch(response:Record<string,any>,config:ResearchSettings,today:string){
 if(response.status!=='completed'||!Array.isArray(response.output))throw Error('provider_incomplete');
 const urls:string[]=[],texts:string[]=[];let searchCalls=0;
 for(const item of response.output){if(item.type==='web_search_call'){searchCalls++;for(const s of item.action?.sources??[])if(typeof s.url==='string')urls.push(s.url);}if(item.type==='message')for(const part of item.content??[]){if(part.type==='refusal')throw Error('provider_refused');if(part.type==='output_text'&&typeof part.text==='string')texts.push(part.text);for(const a of part.annotations??[])if(a.type==='url_citation'&&typeof a.url==='string')urls.push(a.url);}}
 if(!searchCalls||searchCalls>6||!urls.length)throw Error('source_provenance_unavailable');
 const result=validateResearchOutput(JSON.parse(texts.join('')),urls,config,today);
 const tokens=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=2000000?Number(n):null;
 return {...result,usage:{input_tokens:tokens(response.usage?.input_tokens),output_tokens:tokens(response.usage?.output_tokens),search_calls:searchCalls}};
}
