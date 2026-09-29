import {z} from 'zod';
export const CONNECTORS=['searchconsole','googleanalytics4','google_my_business'] as const;
export type Connector=typeof CONNECTORS[number];
export const SOURCE_LABELS:Record<Connector,string>={searchconsole:'Google Search Console',googleanalytics4:'Google Analytics 4',google_my_business:'Google Business Profile'};
export const ACQUISITION_RULES='ims-acquisition-v1';
export const ROW_LIMIT=1000;
export function validDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const time=Date.parse(value+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;}
export const day=z.string().refine(validDay,'Use a real calendar date.');
export function shiftDay(value:string,days:number){if(!validDay(value)||!Number.isSafeInteger(days))throw Error('Invalid date.');const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function reportWindow(today:string,days:7|28|90=28){const end=shiftDay(today,-3),start=shiftDay(end,1-days);return {start,end};}
export function priorWindow(start:string,end:string){if(!validDay(start)||!validDay(end)||end<start)throw Error('Invalid reporting window.');const days=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;return {start:shiftDay(start,-days),end:shiftDay(start,-1)};}
export function safeHost(value:string){const v=value.toLowerCase().trim();return v.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)&&!/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(v)?v:null;}
export function ownedPage(value:unknown,hosts:string[]):string|null{if(typeof value!=='string')return null;try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.includes(u.hostname.toLowerCase()))return null;u.search='';u.hash='';return u.toString();}catch{return null;}}
export type AcquisitionSource={connector:Connector;account_id:string;label:string;hosts:string[];brand_terms:string[];daily_sync:boolean;revision:number;updated_at:string};
export type QuerySpec={kind:string;period:'current'|'previous'|'profile';fields:string[];filters?:unknown[];note:string};
const searchMetrics=['search_type','clicks','impressions','position'];
const localMetrics=['impressions_desktop_maps','impressions_desktop_search','impressions_mobile_maps','impressions_mobile_search','call_clicks','website_clicks','direction_requests','business_bookings'];
/** Each report has its own grain. Never join these rows and then sum duplicated totals. */
export function querySpecs(connector:Connector):QuerySpec[]{
 if(connector==='searchconsole')return [
  {kind:'overview',period:'current',fields:['account_id',...searchMetrics],note:'Property-level metrics, split by search type. Query privacy exclusions are not a complete query inventory.'},
  {kind:'overview',period:'previous',fields:['account_id',...searchMetrics],note:'Previous equal-length period; do not combine with current totals.'},
  {kind:'queries',period:'current',fields:['query',...searchMetrics],filters:[['search_type','eq','web'],'and',['impressions','gte',10]],note:'Web search queries with at least 10 impressions. Filtered, privacy-limited query evidence, not total site demand.'},
  {kind:'pages',period:'current',fields:['page',...searchMetrics],filters:[['search_type','eq','web']],note:'Web-search page grouping. Page impressions can differ from property impressions. URL variants remain distinct.'},
 ];
 if(connector==='googleanalytics4')return [
  {kind:'overview',period:'current',fields:['account_id','sessions','totalusers','engaged_sessions','event_count','conversions'],note:'Property summary. Key events are GA4-configured events, not verified inquiries or clients. Total users is a distinct count.'},
  {kind:'overview',period:'previous',fields:['account_id','sessions','totalusers','engaged_sessions','event_count','conversions'],note:'Previous equal-length property period. Do not sum users across periods or breakdowns.'},
  {kind:'hosts',period:'current',fields:['hostname','sessions','engaged_sessions'],note:'Observed hostnames; a property name alone does not establish the website collecting data.'},
  {kind:'channels',period:'current',fields:['session_source_medium','sessions','engaged_sessions'],note:'Session-scoped acquisition, not first-user or person-level attribution.'},
  {kind:'pages',period:'current',fields:['hostname','landing_page','sessions','engaged_sessions'],note:'Landing-page evidence. These are not confirmed form submissions.'},
  {kind:'events',period:'current',fields:['event_name','event_count','conversions'],note:'Event names and reported key-event counts only. No event payloads, user IDs, email addresses or health data.'},
 ];
 return [
  {kind:'overview',period:'current',fields:['account_id',...localMetrics],note:'Profile interactions, not unique people across surfaces. Call clicks are not answered calls; direction requests are not visits.'},
  {kind:'overview',period:'previous',fields:['account_id',...localMetrics],note:'Previous equal-length location period. Profile bookings are not Coach OS session bookings.'},
  {kind:'profile',period:'profile',fields:['account_id','location_title','location_website_uri','location_primary_category_name','review_total_count','review_average_rating_total'],note:'Current profile metadata and lifetime review totals at retrieval, not reviews gained within the reporting period.'},
 ];
}
const scalar=z.union([z.string().max(2048),z.number().finite().nonnegative().max(1e12),z.null()]);
export const reportSchema=z.object({kind:z.string().max(30),period:z.enum(['current','previous','profile']),status:z.enum(['available','empty','unavailable','limited']),fields:z.array(z.string()).max(12),rows:z.array(z.record(scalar)).max(ROW_LIMIT),note:z.string().max(1500)}).strict();
export type AcquisitionReport=z.infer<typeof reportSchema>;
export const bundleSchema=z.object({version:z.literal(1),start:day,end:day,observed_at:z.string().datetime({offset:true}),reports:z.array(reportSchema).min(1).max(8)}).strict();
export type AcquisitionBundle=z.infer<typeof bundleSchema>;
const STRING_FIELDS=new Set(['account_id','search_type','query','page','hostname','landing_page','session_source_medium','event_name','location_title','location_website_uri','location_primary_category_name']);
export function validateBundle(value:unknown,connector:Connector,account:string,now=new Date()):AcquisitionBundle{
 const b=bundleSchema.parse(value);if(b.end<b.start||(Date.parse(b.end)-Date.parse(b.start))/86400000>89||b.end>=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(now)||Date.parse(b.observed_at)>now.getTime()+60000)throw Error('Invalid or future reporting window.');
 const specs=querySpecs(connector),seen=new Set<string>();
 for(const r of b.reports){const key=r.kind+':'+r.period,spec=specs.find(s=>s.kind===r.kind&&s.period===r.period);if(!spec||seen.has(key)||JSON.stringify(r.fields)!==JSON.stringify(spec.fields))throw Error('Unrecognized or repeated report grain.');seen.add(key);
  if((r.status==='empty'||r.status==='unavailable')&&r.rows.length||['available','limited'].includes(r.status)&&!r.rows.length)throw Error('Report status does not match its evidence.');
  const rowKeys=new Set<string>();
  for(const row of r.rows){if(Object.keys(row).some(k=>!spec.fields.includes(k)))throw Error('Unexpected report field.');
   for(const field of spec.fields){const value=row[field];if(value===undefined)throw Error('Missing report field must be explicitly unknown.');if(value!==null&&(STRING_FIELDS.has(field)?typeof value!=='string':typeof value!=='number'))throw Error('Metric types do not match their source.');}
   if(row.account_id!==undefined&&row.account_id!==null){const aliases=connector==='searchconsole'?[account,account.replace(/^sc-domain:/,'')]:[account];if(!aliases.includes(String(row.account_id)))throw Error('Source account mismatch.');}
   const dimensions=spec.fields.filter(f=>STRING_FIELDS.has(f));const identity=JSON.stringify(dimensions.map(f=>row[f]));if(rowKeys.has(identity))throw Error('Duplicate dimensions would inflate metrics.');rowKeys.add(identity);
   if(typeof row.clicks==='number'&&typeof row.impressions==='number'&&row.clicks>row.impressions)throw Error('Source metrics conflict; review instead of repairing.');
   if(typeof row.review_average_rating_total==='number'&&row.review_average_rating_total>5)throw Error('Invalid review rating.');
  }
 }
 return b;
}
export type Snapshot={id:string;connector:Connector;account_id:string;origin:'connector_import'|'manual_refresh'|'scheduled_refresh';payload:AcquisitionBundle;fingerprint:string;created_at:string};
export type AcquisitionTask={id:string;title:string;kind:string;evidence:string;snapshot_ids:string[];status:'planned'|'in_progress'|'done'|'dismissed';due_on:string|null;note:string;revision:number;updated_at:string};
export function reportOf(snapshot:Snapshot|undefined,kind:string,period:'current'|'previous'|'profile'='current'){return snapshot?.payload.reports.find(r=>r.kind===kind&&r.period===period);}
export function totalRow(snapshot:Snapshot|undefined,period:'current'|'previous'|'profile'='current'):Record<string,string|number|null>|null{const r=reportOf(snapshot,period==='profile'?'profile':'overview',period);if(!r||r.status!=='available')return null;const rows=snapshot?.connector==='searchconsole'?r.rows.filter(x=>x.search_type==='web'):r.rows;return rows?.length===1?rows[0]:null;}
export function metric(row:Record<string,unknown>|null|undefined,key:string){const n=row?.[key];return typeof n==='number'&&Number.isFinite(n)?n:null;}
export function ratio(n:number|null,d:number|null){return n!==null&&d!==null&&d>0?n/d:null;}
export function changePercent(current:number|null,previous:number|null){return current!==null&&previous!==null&&previous>0?(current-previous)/previous*100:null;}
export function brandedQuery(query:string,terms:string[]){const q=query.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();return terms.some(term=>{const t=term.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();return t.length>=3&&(' '+q+' ').includes(' '+t+' ');});}
export function trackedLink(raw:string,hosts:string[],campaign:string,source='google',medium='organic'){const safe=ownedPage(raw,hosts);if(!safe||![campaign,source,medium].every(v=>/^[a-z0-9_-]{1,64}$/.test(v)))throw Error('Use a verified website and simple tracking labels.');const u=new URL(safe);u.searchParams.set('utm_source',source);u.searchParams.set('utm_medium',medium);u.searchParams.set('utm_campaign',campaign);return u.toString();}
export const acquisitionCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('source_options'),request_id:z.string().uuid(),connector:z.enum(CONNECTORS),expected_revision:z.number().int().positive(),daily_sync:z.boolean(),brand_terms:z.array(z.string().trim().min(3).max(80)).min(1).max(20),confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('save_task'),request_id:z.string().uuid(),task_id:z.string().uuid().nullable(),expected_revision:z.number().int().nonnegative(),title:z.string().trim().min(5).max(160),kind:z.enum(['measurement','seo','local','conversion','campaign_draft']),evidence:z.string().trim().min(15).max(2000),snapshot_ids:z.array(z.string().uuid()).min(1).max(3),status:z.enum(['planned','in_progress','done','dismissed']),due_on:day.nullable(),note:z.string().max(2000)}).strict(),
]);
export type AcquisitionCommand=z.infer<typeof acquisitionCommandSchema>;
export function validAcquisitionReceipt(value:unknown,command:AcquisitionCommand){if(!value||typeof value!=='object')return false;const r=value as Record<string,unknown>;return r.ok===true&&r.request_id===command.request_id&&r.action===command.action&&Number.isSafeInteger(r.revision)&&Number(r.revision)>0&&typeof r.deduped==='boolean';}
