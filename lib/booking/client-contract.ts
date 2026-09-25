import {ptWallClockToUtc} from "../recurring";
import {pacificDate} from "../time/pacific";

export const REQUEST_MINUTES = 60;
export const NOTICE_MINUTES = 60;
export const HORIZON_DAYS = 60;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export type RequestPayload = {request_id:string;scheduled_at:string;session_type:"training";note:string};
export type RequestReceipt = {ok:true;id:string;status:string;deduped:boolean};
export type AvailabilityReceipt = {ok:true;date:string;duration_minutes:60;slots:string[]};

export function validBookingDate(value:string):boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
export function studioSlots(date:string):string[] {
  if (!validBookingDate(date)) throw new Error("Choose a valid Pacific date.");
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  if (weekday === 0) return [];
  const [open,close] = weekday === 6 ? [8*60,13*60] : [6*60,19*60];
  const result:string[] = [];
  for (let minute=open;minute+REQUEST_MINUTES<=close;minute+=30) {
    result.push(String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0"));
  }
  return result;
}
export function parseRequestPayload(raw:unknown):RequestPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid training request.");
  const b = raw as Record<string,unknown>;
  if (Object.keys(b).some(k=>!["request_id","scheduled_at","session_type","note"].includes(k))) throw new Error("Unsupported request fields.");
  if (typeof b.request_id !== "string" || !UUID.test(b.request_id)) throw new Error("A valid request reference is required.");
  if (b.session_type !== "training") throw new Error("Client requests are training only.");
  if (typeof b.scheduled_at !== "string" || !validBookingDate(b.scheduled_at.slice(0,10)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(b.scheduled_at) || !Number.isFinite(Date.parse(b.scheduled_at))) throw new Error("A valid date with its time zone is required.");
  if (b.note !== undefined && (typeof b.note !== "string" || b.note.length>500)) throw new Error("Keep the note under 500 characters.");
  return {request_id:b.request_id,scheduled_at:new Date(b.scheduled_at).toISOString(),session_type:"training",note:typeof b.note==="string"?b.note.trim():""};
}
export function requestedInstant(date:string,time:string):string {
  if (!studioSlots(date).includes(time)) throw new Error("Choose a full 60-minute IMS training slot.");
  return ptWallClockToUtc(date,time).toISOString();
}
export function candidateSlots(date:string,now:Date):{time:string;start:number;end:number}[] {
  return studioSlots(date).map(time=>{
    const start = Date.parse(requestedInstant(date,time));
    return {time,start,end:start+REQUEST_MINUTES*60000};
  }).filter(slot=>slot.start>=now.getTime()+NOTICE_MINUTES*60000 && slot.start<=now.getTime()+HORIZON_DAYS*86400000);
}
export function parseAvailabilityReceipt(raw:unknown,date:string):AvailabilityReceipt {
  const b = raw as Partial<AvailabilityReceipt>|null;
  const allowed = studioSlots(date);
  if (!b || b.ok!==true || b.date!==date || b.duration_minutes!==60 || !Array.isArray(b.slots) || b.slots.some(s=>typeof s!=="string"||!allowed.includes(s)) || new Set(b.slots).size!==b.slots.length) throw new Error("Availability could not be verified. Please retry.");
  return b as AvailabilityReceipt;
}
export function parseRequestReceipt(raw:unknown,id:string):RequestReceipt {
  const b=raw as Partial<RequestReceipt>|null;
  if (!b || b.ok!==true || b.id!==id || !UUID.test(id) || typeof b.deduped!=="boolean" || !["requested","scheduled","confirmed","cancelled","completed","no_show","late_cancelled"].includes(b.status??"")) throw new Error("Request receipt was not confirmed. Retry the same request before changing it.");
  return b as RequestReceipt;
}
export const requestToday = (now = new Date()) => pacificDate(now);
