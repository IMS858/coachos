"use client";
import {useEffect,useState} from "react";
import {remainingRestSeconds} from "@/lib/coaching/session-close";
export function SessionRestTimer({seconds}:{seconds:number}){
 const [deadline,setDeadline]=useState<number|null>(null),[remaining,setRemaining]=useState(seconds),[started,setStarted]=useState(false);
 useEffect(()=>{
  if(deadline===null)return;
  const tick=()=>{const left=remainingRestSeconds(deadline,Date.now());setRemaining(left);if(left===0)setDeadline(null);};
  const interval=window.setInterval(tick,250);document.addEventListener("visibilitychange",tick);
  return ()=>{window.clearInterval(interval);document.removeEventListener("visibilitychange",tick);};
 },[deadline]);
 const button="min-h-11 rounded-lg border border-divider bg-white px-3 text-xs font-semibold disabled:opacity-50";
 return <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-divider bg-surface-soft p-3" aria-label="Optional rest timer">
  <span className="mr-auto text-xs text-cream-dim">Rest timer · {seconds}s prescribed <span className="ml-2 font-semibold tabular-nums text-cream" aria-live="off">{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,"0")}</span></span>
  {deadline===null?<button type="button" className={button} onClick={()=>{const value=remaining>0?remaining:seconds;setRemaining(value);setStarted(true);setDeadline(Date.now()+value*1000);}}>{started&&remaining>0?"Resume rest":"Start rest"}</button>:<button type="button" className={button} onClick={()=>{setRemaining(remainingRestSeconds(deadline,Date.now()));setDeadline(null);}}>Pause rest</button>}
  <button type="button" className={button} onClick={()=>{setDeadline(null);setRemaining(seconds);setStarted(false);}}>Reset</button>
  {started&&remaining===0&&<span role="status" className="w-full text-xs text-sky">Rest timer finished. Resume when appropriate; nothing was logged automatically.</span>}
 </div>;
}
