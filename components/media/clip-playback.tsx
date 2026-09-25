"use client";
import {useRef,useState} from "react";
import Image from "next/image";
export function ClipPlayback({id,kind,title}:{id:string;kind:string;title:string}){
 const lock=useRef(false),[url,setUrl]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function open(){if(lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{const response=await fetch("/api/media/"+id,{cache:"no-store"});const data=await response.json().catch(()=>null);
   if(!response.ok||typeof data?.url!=="string"||!data.url.startsWith("https://"))throw new Error(data?.error||"Playback could not be prepared.");setUrl(data.url);
  }catch(cause){setError(cause instanceof Error?cause.message:"Playback unavailable.");}finally{setBusy(false);lock.current=false;}}
 return <div className="mt-3">
  {url?(kind==="image"?<Image src={url} alt={title} width={960} height={540} unoptimized className="max-h-96 w-full rounded-xl object-contain" onError={()=>{setError("This playback link expired or could not load. Reopen the clip to retry.");setUrl(null);}}/>:<video src={url} controls playsInline preload="metadata" aria-label={title} className="max-h-96 w-full rounded-xl bg-black" onError={()=>{setError("This playback link expired or could not load. Reopen the clip to retry.");setUrl(null);}}/>):<button type="button" disabled={busy} onClick={()=>void open()} className="inline-flex min-h-12 items-center rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-sky">{busy?"Preparing playback…":kind==="image"?"Open photo":"Open form video"}</button>}
  {error&&<p role="alert" className="mt-2 text-sm text-status-limited">{error}</p>}
 </div>;
}
