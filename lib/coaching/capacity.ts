import {addCalendarDays,pacificWeek} from "@/lib/time/pacific";
import {ptWallClockToUtc} from "@/lib/recurring";

type Interval={start:number;end:number};
export type AvailabilityRule={trainer_id:string;weekday:number;start_time:string;end_time:string;active:boolean};
export type TimeBlock={trainer_id:string;starts_at:string;ends_at:string};
export type CapacitySession={trainer_id:string;scheduled_at:string;duration_minutes:number;status:string};

function merge(intervals:Interval[]):Interval[]{
 const sorted=intervals.filter(i=>i.end>i.start).sort((a,b)=>a.start-b.start),out:Interval[]=[];
 for(const item of sorted){const last=out[out.length-1];if(!last||item.start>last.end)out.push({...item});else last.end=Math.max(last.end,item.end);}
 return out;
}
function overlap(a:Interval,b:Interval){return Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));}
function minutes(ms:number){return Math.round(ms/60000);}
function ruleInterval(rule:AvailabilityRule,startDate:string):Interval{
 const date=addCalendarDays(startDate,rule.weekday),start=ptWallClockToUtc(date,rule.start_time.slice(0,5)).getTime(),end=ptWallClockToUtc(date,rule.end_time.slice(0,5)).getTime();
 return {start,end};
}
export type TrainerCapacity={trainer_id:string;declared_minutes:number;blocked_minutes:number;usable_minutes:number;booked_minutes:number;open_minutes:number;booked_sessions:number;outside_declared_sessions:number};

export function buildTrainerCapacity(now:Date,rules:AvailabilityRule[],blocks:TimeBlock[],sessions:CapacitySession[]):TrainerCapacity[]{
 const week=pacificWeek(now),startMs=week.start.getTime(),endMs=week.end.getTime(),ids=[...new Set([...rules.map(r=>r.trainer_id),...blocks.map(b=>b.trainer_id),...sessions.map(s=>s.trainer_id)])];
 return ids.map(trainer_id=>{
  const availability=merge(rules.filter(r=>r.trainer_id===trainer_id&&r.active).map(r=>ruleInterval(r,week.startDate)));
  const declared=availability.reduce((n,i)=>n+i.end-i.start,0);
  const blockIntervals=merge(blocks.filter(b=>b.trainer_id===trainer_id).map(b=>({start:Math.max(startMs,Date.parse(b.starts_at)),end:Math.min(endMs,Date.parse(b.ends_at))})).filter(i=>i.end>i.start));
  const blocked=blockIntervals.reduce((sum,b)=>sum+availability.reduce((n,a)=>n+overlap(a,b),0),0);
  const usable=Math.max(0,declared-blocked);
  const bookedRows=sessions.filter(s=>s.trainer_id===trainer_id&&["scheduled","confirmed","completed"].includes(s.status)).map(s=>({start:Date.parse(s.scheduled_at),end:Date.parse(s.scheduled_at)+Number(s.duration_minutes||0)*60000}));
  const bookedIntervals=merge(bookedRows.map(s=>({start:Math.max(startMs,s.start),end:Math.min(endMs,s.end)})).filter(i=>i.end>i.start));
  const booked=bookedIntervals.reduce((sum,b)=>sum+availability.reduce((n,a)=>n+overlap(a,b),0),0);
  const outside=bookedRows.filter(s=>!availability.some(a=>s.start>=a.start&&s.end<=a.end)).length;
  return {trainer_id,declared_minutes:minutes(declared),blocked_minutes:minutes(blocked),usable_minutes:minutes(usable),booked_minutes:minutes(booked),open_minutes:minutes(Math.max(0,usable-booked)),booked_sessions:bookedRows.length,outside_declared_sessions:outside};
 });
}
