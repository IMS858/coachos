import {ptWallClockToUtc} from "@/lib/recurring";
import {PACIFIC,pacificDate} from "@/lib/time/pacific";

export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function calendarDate(value:unknown):value is string{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(`${value}T12:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export function clockTime(value:unknown):value is string{return typeof value==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
export function calendarHref(date:string,trainer="all"):string{
 const params=new URLSearchParams();if(calendarDate(date))params.set("date",date);if(trainer==="all"||UUID.test(trainer))params.set("trainer",trainer);return "/schedule?"+params.toString();
}
export function bookingHref(date:string,time:string,trainerId:string):string{
 if(!calendarDate(date)||!clockTime(time)||!UUID.test(trainerId))throw Error("Invalid calendar slot");
 return "/sessions/new?"+new URLSearchParams({mode:"schedule",date,time,trainer_id:trainerId,from:"schedule"}).toString();
}
export function bookingWallClock(date?:string,time?:string,now=new Date()):string{
 if(calendarDate(date)&&clockTime(time)){ptWallClockToUtc(date,time);return `${date}T${time}`;}
 const next=new Date(Math.ceil((now.getTime()+1)/3600000)*3600000);
 const fallback=new Intl.DateTimeFormat("en-GB",{timeZone:PACIFIC,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(next);
 return `${calendarDate(date)?date:pacificDate(next)}T${fallback}`;
}
export function wallMinutes(iso:string):number{
 const d=new Date(iso);if(!Number.isFinite(d.getTime()))throw Error("Invalid calendar instant");
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:PACIFIC,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d).map(p=>[p.type,p.value]));return Number(parts.hour)*60+Number(parts.minute);
}
export type CalendarEvent={id:string;trainerId:string;startsAt:string;endsAt:string;label:string;detail:string;href:string|null;kind:"session"|"class"|"block";muted?:boolean;recurring?:boolean};
export function eventPosition(event:CalendarEvent,date:string,startMinute:number,endMinute:number){
 const start=pacificDate(new Date(event.startsAt))<date?0:wallMinutes(event.startsAt),end=pacificDate(new Date(event.endsAt))>date?1440:wallMinutes(event.endsAt);
 return {top:Math.max(0,start-startMinute),height:Math.max(1,Math.min(end,endMinute)-Math.max(start,startMinute)),start,end};
}
/** Treat intervals as half-open: an appointment ending at 10 leaves 10 available. */
export function slotOccupied(events:CalendarEvent[],trainerId:string,date:string,minute:number):boolean{
 return events.some(event=>event.trainerId===trainerId&&!event.muted&&eventPosition(event,date,0,1440).start<=minute&&eventPosition(event,date,0,1440).end>minute);
}
/** Overlaps stay individually selectable rather than stacking invisibly. */
export function eventLanes(events:CalendarEvent[]):Map<string,{lane:number;lanes:number}>{
 const result=new Map<string,{lane:number;lanes:number}>();let group:CalendarEvent[]=[],ends:number[]=[];
 function finish(){const count=ends.length;for(const event of group)result.get(event.id)!.lanes=count;group=[];ends=[];}
 for(const event of [...events].sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id))){const start=Date.parse(event.startsAt);if(group.length&&ends.every(end=>end<=start))finish();let lane=ends.findIndex(end=>end<=start);if(lane<0)lane=ends.length;ends[lane]=Date.parse(event.endsAt);group.push(event);result.set(event.id,{lane,lanes:1});}finish();return result;
}
