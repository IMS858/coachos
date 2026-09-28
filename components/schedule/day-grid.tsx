import Link from "next/link";
import {bookingHref,eventLanes,eventPosition,slotOccupied,wallMinutes,type CalendarEvent} from "@/lib/schedule/booking-context";
import {pacificDate} from "@/lib/time/pacific";
import "./schedule-grid.css";
const label=(minute:number)=>`${Math.floor(minute/60)%12||12}:${String(minute%60).padStart(2,"0")} ${minute<720?"AM":"PM"}`;
export function ScheduleDayGrid({date,trainers,events}:{date:string;trainers:{id:string;full_name:string}[];events:CalendarEvent[]}){
 const start=Math.min(270,...events.map(e=>pacificDate(new Date(e.startsAt))<date?0:Math.floor(wallMinutes(e.startsAt)/30)*30));
 const end=Math.min(1440,Math.max(1140,...events.map(e=>pacificDate(new Date(e.endsAt))>date?1440:Math.ceil(wallMinutes(e.endsAt)/30)*30)));
 const slots=Array.from({length:(end-start)/30},(_,i)=>start+i*30),height=(end-start)*1.6;
 return <section aria-label="Day calendar · Pacific time" className="schedule-calendar">
  <p className="schedule-calendar-help">Tap an open time to book. Open a session for one-occurrence or recurring controls. Blank space is not a guarantee of availability; conflicts are checked before saving.</p>
  <div className="schedule-day-grid" style={{gridTemplateColumns:`46px repeat(${Math.max(trainers.length,1)}, minmax(0,1fr))`}}>
   <div className="schedule-time-heading">PT</div>{trainers.map(trainer=><div key={trainer.id} className="schedule-coach-heading"><span>{trainer.full_name}</span></div>)}
   <div className="schedule-time-gutter" style={{height}}>{slots.map(minute=><span key={minute} style={{top:(minute-start)*1.6}}>{label(minute)}</span>)}</div>
   {trainers.map(trainer=>{const own=events.filter(e=>e.trainerId===trainer.id),lanes=eventLanes(own);return <div key={trainer.id} className="schedule-coach-column" style={{height}}>
    {slots.map(minute=>{const time=`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;return slotOccupied(own,trainer.id,date,minute)?<div aria-hidden="true" className="schedule-slot-line" key={minute} style={{top:(minute-start)*1.6}}/>:<Link prefetch={false} className="schedule-open-slot" key={minute} style={{top:(minute-start)*1.6}} href={bookingHref(date,time,trainer.id)} aria-label={`Book ${trainer.full_name}, ${date} at ${label(minute)} Pacific`}><span aria-hidden="true">+ {label(minute)}</span></Link>;})}
    {own.map(event=>{const position=eventPosition(event,date,start,end),lane=lanes.get(event.id)!;const style={top:position.top*1.6+2,height:Math.max(2,position.height*1.6-4),left:`calc(${lane.lane*100/lane.lanes}% + 3px)`,width:`calc(${100/lane.lanes}% - 6px)`};const className=`schedule-event schedule-event-${event.kind}${event.muted?" schedule-event-muted":""}`;const content=<><strong>{event.label}</strong><span>{new Date(event.startsAt).toLocaleTimeString("en-US",{timeZone:"America/Los_Angeles",hour:"numeric",minute:"2-digit"})}{event.recurring?" · ↻":""}</span><span>{event.detail}</span></>;return event.href?<Link key={event.id} prefetch={false} href={event.href} className={className} style={style} aria-label={`${event.label}, ${event.detail}`}>{content}</Link>:<div key={event.id} className={className} style={style}>{content}</div>;})}
   </div>;})}
   {!trainers.length&&<p className="p-4 text-sm">No available staff calendar.</p>}
  </div>
 </section>;
}
