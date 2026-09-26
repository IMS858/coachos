"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {CalendarPlus,Loader2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {addCalendarDays} from "@/lib/time/pacific";
import {parseAvailabilityReceipt,parseRequestReceipt,requestedInstant,requestToday,type AvailabilityReceipt,type RequestPayload,type RequestReceipt} from "@/lib/booking/client-contract";

export function BookingForm(){
  const router=useRouter();
  const sequence=useRef(0),lock=useRef(false),attempt=useRef<RequestPayload|null>(null);
  const [date,setDate]=useState(""),[time,setTime]=useState(""),[note,setNote]=useState("");
  const [availability,setAvailability]=useState<AvailabilityReceipt|null>(null),[loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null);
  const [confirmed,setConfirmed]=useState<{receipt:RequestReceipt;when:string}|null>(null);
  useEffect(()=>()=>{sequence.current++;},[]);
  useEffect(()=>{
    if(!busy&&!uncertain)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return ()=>window.removeEventListener("beforeunload",warn);
  },[busy,uncertain]);
  async function loadAvailability(value:string){
    const request=++sequence.current;
    setDate(value);setTime("");setAvailability(null);setError(null);setLoading(Boolean(value));
    if(!value)return;
    try{
      const response=await fetch("/api/sessions/availability?date="+encodeURIComponent(value),{cache:"no-store"});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error||"Availability is unavailable. Please retry.");
      const result=parseAvailabilityReceipt(data,value);
      if(request===sequence.current)setAvailability(result);
    }catch(cause){if(request===sequence.current)setError(cause instanceof Error?cause.message:"Availability is unavailable.");}
    finally{if(request===sequence.current)setLoading(false);}
  }
  async function submit(event:React.FormEvent){
    event.preventDefault();if(lock.current)return;
    let payload=attempt.current;
    if(!uncertain){
      if(!availability||availability.date!==date||!availability.slots.includes(time)||loading)return;
      try{payload={request_id:crypto.randomUUID(),scheduled_at:requestedInstant(date,time),session_type:"training",note:note.trim()};}
      catch(cause){setError(cause instanceof Error?cause.message:"Choose a valid Pacific slot.");return;}
      attempt.current=payload;
    }
    if(!payload)return;
    lock.current=true;setBusy(true);setError(null);
    try{
      const response=await fetch("/api/sessions/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>null);
      if(!response.ok){
        if(data?.saved===false&&!uncertain){setUncertain(false);attempt.current=null;setAvailability(null);setTime("");}
        else setUncertain(true);
        setError(data?.error||"The save was not confirmed. Retry this same request.");return;
      }
      const receipt=parseRequestReceipt(data,payload.request_id);
      setConfirmed({receipt,when:payload.scheduled_at});setUncertain(false);attempt.current=null;router.refresh();
    }catch(cause){setUncertain(true);setError(cause instanceof Error?cause.message:"Connection interrupted. Retry the same request before changing it.");}
    finally{lock.current=false;setBusy(false);}
  }
  const inputClass="min-h-12 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky disabled:opacity-60";
  const locked=busy||uncertain;
  if(confirmed)return <Card><CardContent className="space-y-3 pt-5"><h2 role="status" className="text-xl font-semibold text-cream">{confirmed.receipt.status==="requested"?"Request saved — awaiting coach confirmation":"Your request is recorded"}</h2><p className="text-sm text-cream-dim">{new Date(confirmed.when).toLocaleString("en-US",{timeZone:"America/Los_Angeles",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"})}</p><p className="text-sm leading-6 text-cream-dim">A saved request is not a confirmed booking, payment or package deduction. Your coach will confirm the session separately.</p><Link href={"/sessions/"+confirmed.receipt.id} className="inline-flex min-h-12 items-center font-semibold text-sky">View current request status →</Link><Button type="button" variant="secondary" onClick={()=>{setConfirmed(null);setDate("");setTime("");setNote("");setAvailability(null);}}>Request another time</Button></CardContent></Card>;
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5 text-sky"/>Request training</CardTitle></CardHeader><CardContent>
    <form onSubmit={event=>void submit(event)} className="space-y-4">
      <fieldset disabled={locked} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><label htmlFor="booking-date" className="text-sm font-medium">Date · Pacific<input id="booking-date" type="date" required min={requestToday()} max={addCalendarDays(requestToday(),60)} value={date} onChange={e=>void loadAvailability(e.target.value)} className={inputClass}/></label>
        <label htmlFor="booking-time" className="text-sm font-medium">Time · Pacific<select id="booking-time" required disabled={locked||loading||!availability} value={time} onChange={e=>setTime(e.target.value)} className={inputClass}><option value="">{loading?"Checking coach calendar…":!date?"Choose a date first":!availability?"Verify availability first":availability.slots.length?"Choose a checked time":"No available times"}</option>{availability?.slots.map(slot=>{const h=Number(slot.slice(0,2));return <option key={slot} value={slot}>{h%12||12}:{slot.slice(3)} {h<12?"AM":"PM"}</option>;})}</select></label></div>
        {date&&!loading&&!availability&&<Button type="button" variant="secondary" onClick={()=>void loadAvailability(date)}>Retry availability</Button>}
        <p className="rounded-xl bg-surface-soft p-3 text-sm">Personal Training · 60 minutes · all times shown in Pacific time</p>
        {availability?.slots.length===0&&<p role="status" className="text-sm text-cream-dim">No checked times are available for this date. Choose another date or message your coach. Sundays are by appointment.</p>}
        <label htmlFor="booking-note" className="block text-sm font-medium">Note · optional<textarea id="booking-note" rows={2} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} className={inputClass} placeholder="Anything your coach should know?"/></label>
      </fieldset>
      {error&&<p role="alert" className="rounded-xl border border-status-limited/30 p-3 text-sm text-status-limited">{error}</p>}
      {uncertain&&<p className="text-sm leading-6 text-cream-dim">Your save status is uncertain. Details are held so retrying uses the same reference and cannot create a second request. Keep this page open until the result is confirmed.</p>}
      <Button type="submit" disabled={busy||(!uncertain&&(loading||!availability||!time))} className="min-h-12 w-full">{busy?<><Loader2 className="h-4 w-4 animate-spin"/>Saving request…</>:uncertain?"Retry the same request":"Send training request"}</Button>
      <p className="text-xs leading-5 text-cream-faint">Times are checked against Coach OS records, not Vagaro. Your request still requires coach confirmation until the source calendar is reconciled.</p><Link href="/messages" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Ask your coach about scheduling →</Link>
    </form>
  </CardContent></Card>;
}
