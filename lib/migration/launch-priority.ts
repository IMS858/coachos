import {matchMigrationClients, type DestinationClient, type SourceClient} from "./client-match";
export type LaunchSourceRecord={id:string;source_id:string;source_parent_id:string|null;source_payload:unknown;source_hash:string;reconciliation_status:string};
export type PriorityRow={sourceClientId:string;sourceRecordId:string|null;clientName:string;futureAppointments:number;jason:number;gabriel:number;otherTrainer:number;firstWall:string|null;lastWall:string|null;matchStatus:"matched"|"needs_review"|"unmatched";matchBasis:string[];destinationId:string|null;reviewPage:number|null};
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const fields=(row:LaunchSourceRecord)=>object(row.source_payload)&&object(row.source_payload.fields)?row.source_payload.fields:null;
function phones(value:unknown){if(typeof value!=="string")return[];const found=value.split(/\n/).map(v=>v.replace(/\D/g,"")).map(v=>v.length===11&&v.startsWith("1")?v.slice(1):v).filter(v=>/^\d{10}$/.test(v));return[...new Set(found)];}
export function launchPriority(rows:LaunchSourceRecord[],destination:DestinationClient[],today:string):{rows:PriorityRow[];orphanAppointments:number;invalidDates:number}{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new Error("Valid Pacific date required.");
 const clients=rows.filter(r=>r.source_payload&&r.source_parent_id===null&&fields(r)?.["Vagaro Client ID"]!==undefined);
 const clientOrder=[...clients].sort((a,b)=>a.source_id.localeCompare(b.source_id)||a.id.localeCompare(b.id));
 const source:SourceClient[]=clients.map(r=>{const f=fields(r)!;return{source_id:r.source_id,name:text(f["Source Name"]),email:text(f["Email"])||null,phones:phones(f["Phones"])}}).filter(r=>r.name);
 const matches=new Map(matchMigrationClients(source,destination).map(m=>[m.source_id,m]));
 const clientMap=new Map(clients.map(r=>[r.source_id,r]));
 const agg=new Map<string,{name:string,count:number;jason:number;gabriel:number;other:number;walls:string[]}>();
 let orphanAppointments=0,invalidDates=0;
 for(const row of rows){
  const f=fields(row);if(!f||f["Appointment ID"]===undefined)continue;
  const parent=row.source_parent_id??text(f["Vagaro Client ID candidate"]);
  if(!parent||!clientMap.has(parent)){orphanAppointments++;continue;}
  const date=text(f["Raw date"]),time=text(f["Raw time"]);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){invalidDates++;continue;}
  if(date<today)continue;
  const clientFields=fields(clientMap.get(parent)!)!;
  const item=agg.get(parent)??{name:text(clientFields["Source Name"])||text(f["Client Name"])||"Unknown client",count:0,jason:0,gabriel:0,other:0,walls:[]};
  item.count++;
  const trainer=text(f["Trainer"]);
  if(trainer==="Jason Patterson")item.jason++;else if(trainer==="Gabriel Madrid")item.gabriel++;else item.other++;
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(time))item.walls.push(date+"T"+time);
  agg.set(parent,item);
 }
 const output:PriorityRow[]=[];
 for(const [sourceClientId,item] of agg){
  const sourceRow=clientMap.get(sourceClientId)??null,match=matches.get(sourceClientId);
  item.walls.sort();
  const index=sourceRow?clientOrder.findIndex(r=>r.id===sourceRow.id):-1;
  output.push({sourceClientId,sourceRecordId:sourceRow?.id??null,clientName:item.name,futureAppointments:item.count,jason:item.jason,gabriel:item.gabriel,otherTrainer:item.other,firstWall:item.walls[0]??null,lastWall:item.walls.at(-1)??null,matchStatus:match?.status??"unmatched",matchBasis:match?.basis??[],destinationId:match?.destination_id??null,reviewPage:index>=0?Math.floor(index/25)+1:null});
 }
 output.sort((a,b)=>b.futureAppointments-a.futureAppointments||a.clientName.localeCompare(b.clientName));
 return{rows:output,orphanAppointments,invalidDates};
}
