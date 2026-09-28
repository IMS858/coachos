import {calendarDate,clockTime,UUID} from "./booking-context";
import {buildSeriesOccurrences,type RecurringSlot} from "@/lib/recurring";
export type SeriesFields={client_id:string;trainer_id:string;start_date:string;end_date:string|null;interval_weeks:number;duration_minutes:number;slots:RecurringSlot[];location:string;notes:string};
export type BookingCommand=({action:"create_series"}&SeriesFields)|({action:"replace_series";series_id:string;expected_revision:number}&SeriesFields)|{action:"cancel_series";series_id:string;expected_revision:number}|{action:"reschedule";session_id:string;expected_updated_at:string;scheduled_at:string;duration_minutes:number}|{action:"cancel_occurrence";session_id:string;expected_updated_at:string};
export type ConfirmedBookingCommand=BookingCommand&{confirmed:true;reason:string};
export type BookingEnvelope={request_id:string;command:ConfirmedBookingCommand};
export type BookingReceipt={ok:true;request_id:string;action:BookingCommand["action"];series_id?:string;session_id?:string;created?:number;cancelled?:number;deduped:boolean;charged:false};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function id(v:unknown):v is string{return typeof v==="string"&&UUID.test(v);}
function int(v:unknown,min:number,max:number):v is number{return typeof v==="number"&&Number.isInteger(v)&&v>=min&&v<=max;}
export function parseBookingEnvelope(value:unknown):BookingEnvelope{
 if(!record(value)||Object.keys(value).some(k=>!['request_id','command'].includes(k))||!id(value.request_id)||!record(value.command))throw Error("Valid booking request identity required.");
 const c=value.command,base=['action','confirmed','reason'];
 if(c.confirmed!==true||typeof c.reason!=="string"||c.reason.trim().length<5||c.reason.length>1000)throw Error("Confirm the booking scope and reason before saving.");
 let keys=base;
 if(c.action==='create_series'||c.action==='replace_series'){
  keys=[...base,'client_id','trainer_id','start_date','end_date','interval_weeks','duration_minutes','slots','location','notes',...(c.action==='replace_series'?['series_id','expected_revision']:[])];
  if(!id(c.client_id)||!id(c.trainer_id)||!calendarDate(c.start_date)||!(c.end_date===null||calendarDate(c.end_date)&&c.end_date>=c.start_date))throw Error("Valid client, trainer and date range required.");
  if(!int(c.interval_weeks,1,4)||!int(c.duration_minutes,15,180))throw Error("Choose a 1–4 week interval and 15–180 minute duration.");
  if(typeof c.location!=="string"||c.location.length>200||typeof c.notes!=="string"||c.notes.length>4000)throw Error("Location or notes exceed the booking limit.");
  if(!Array.isArray(c.slots)||c.slots.length<1||c.slots.length>4||c.slots.some(s=>!record(s)||Object.keys(s).length!==2||!int(s.weekday,0,6)||!clockTime(s.time)))throw Error("Choose 1–4 valid weekly slots.");
  if(new Set(c.slots.map(s=>`${s.weekday}:${s.time}`)).size!==c.slots.length)throw Error("Two weekly slots are identical.");
  if(c.action==='replace_series'&&(!id(c.series_id)||!int(c.expected_revision,1,1000000)))throw Error("Refresh the standing booking before editing.");
 }else if(c.action==='cancel_series'){
  keys=[...base,'series_id','expected_revision'];if(!id(c.series_id)||!int(c.expected_revision,1,1000000))throw Error("Refresh the standing booking before cancelling.");
 }else if(c.action==='reschedule'||c.action==='cancel_occurrence'){
  keys=[...base,'session_id','expected_updated_at',...(c.action==='reschedule'?['scheduled_at','duration_minutes']:[])];
  if(!id(c.session_id)||typeof c.expected_updated_at!=="string"||!Number.isFinite(Date.parse(c.expected_updated_at)))throw Error("Refresh the session before changing it.");
  if(c.action==='reschedule'&&(typeof c.scheduled_at!=="string"||!Number.isFinite(Date.parse(c.scheduled_at))||!int(c.duration_minutes,1,480)))throw Error("Choose a valid time and duration.");
 }else throw Error("Unsupported booking action.");
 if(Object.keys(c).some(k=>!keys.includes(k)))throw Error("Unsupported booking fields.");
 return value as BookingEnvelope;
}
export function validBookingReceipt(value:unknown,request:BookingEnvelope):value is BookingReceipt{
 if(!record(value)||value.ok!==true||value.request_id!==request.request_id||value.action!==request.command.action||typeof value.deduped!=="boolean"||value.charged!==false)return false;
 if(['reschedule','cancel_occurrence'].includes(request.command.action))return id(value.session_id)&&value.session_id===(request.command as {session_id:string}).session_id;
 return id(value.series_id)&&int(value.created,0,10000)&&int(value.cancelled,0,10000);
}
export function recurringPreview(fields:SeriesFields,now:Date){
 return buildSeriesOccurrences({slots:fields.slots,startDate:fields.start_date,endDate:fields.end_date,intervalWeeks:fields.interval_weeks,now});
}
