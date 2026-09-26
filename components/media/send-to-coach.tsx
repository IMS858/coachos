"use client";
import {useRef,useState,useEffect} from "react";
import {useRouter} from "next/navigation";
import Image from "next/image";
import {Video,Upload,Loader2,Check,X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {uploadWithProgress} from "@/lib/video";
/** Nothing uploads until the client presses Send. The original file is preserved. */
export function SendToCoach(){
 const router=useRouter(),camera=useRef<HTMLInputElement>(null),library=useRef<HTMLInputElement>(null),lock=useRef(false),uploaded=useRef<string|null>(null);
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<string|null>(null),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[pct,setPct]=useState(0),[error,setError]=useState<string|null>(null),[done,setDone]=useState<string|null>(null);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 function pick(value?:File){if(!value||busy)return;
  if(!/^(video\/(mp4|quicktime|webm)|image\/(jpeg|png|webp))$/.test(value.type)||value.size<=0||value.size>200*1024*1024){setError("Choose an MP4, MOV, WebM, JPG, PNG or WebP under 200 MB.");return;}
  setFile(value);setPreview(URL.createObjectURL(value));uploaded.current=null;setPct(0);setError(null);setDone(null);
 }
 function clear(){setPreview(null);setFile(null);uploaded.current=null;setPct(0);if(camera.current)camera.current.value="";if(library.current)library.current.value="";}
 async function send(){if(!file||lock.current)return;lock.current=true;setBusy(true);setError(null);setDone(null);
  try{
   if(!uploaded.current){const ext=file.name.split(".").pop()?.toLowerCase()||(file.type.startsWith("video/")?"mp4":"jpg");
    const prep=await fetch("/api/media/client-upload?ext="+encodeURIComponent(ext),{cache:"no-store"});const data=await prep.json();
    if(!prep.ok||!data.signedUrl||!data.path)throw new Error(data.error||"Could not start upload.");
    await uploadWithProgress(data.signedUrl,file,setPct);uploaded.current=data.path;
   }
   const response=await fetch("/api/media/client-upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({storage_path:uploaded.current,note,kind:file.type.startsWith("video/")?"video":"image"})});const data=await response.json();
   if(!response.ok||data?.ok!==true)throw new Error(data?.error||"Upload completed, but saving was not confirmed. Retry without choosing the file again.");
   setDone(data.notified===true?"Saved to your coaching record, awaiting coach review. An email notification was sent.":"Saved to your coaching record, awaiting coach review. Email notification was not confirmed.");
   clear();setNote("");router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Unable to send. Your selection is still here.");}finally{lock.current=false;setBusy(false);}
 }
 return <section className="flex flex-col gap-4 rounded-2xl border border-divider bg-white p-5" aria-label="Send form video to coach">
  <div><h3 className="text-lg font-semibold text-cream">Send your coach a video or photo</h3><p className="mt-1 text-sm leading-6 text-cream-dim">Record a movement for technique feedback, or upload an existing clip. Original file quality is preserved. Replies are not monitored for emergencies.</p></div>
  <input ref={camera} type="file" accept="video/*" capture="environment" hidden onChange={e=>pick(e.target.files?.[0])}/><input ref={library} type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp" hidden onChange={e=>pick(e.target.files?.[0])}/>
  {!file?<div className="flex flex-wrap gap-2"><Button type="button" onClick={()=>camera.current?.click()}><Video className="h-4 w-4"/>Record movement</Button><Button type="button" variant="secondary" onClick={()=>library.current?.click()}><Upload className="h-4 w-4"/>Upload existing</Button></div>:<>
   <div className="flex items-center justify-between gap-2"><p className="min-w-0 break-all text-sm">{file.name} · {(file.size/1024/1024).toFixed(1)} MB</p><button type="button" disabled={busy} onClick={clear} aria-label="Remove selected file" className="flex min-h-11 min-w-11 items-center justify-center"><X className="h-4 w-4"/></button></div>
   {preview&&(file.type.startsWith("video/")?<video src={preview} controls playsInline preload="metadata" className="max-h-72 w-full rounded-xl bg-black"/>:<Image width={960} height={540} unoptimized src={preview} alt="Selected coaching reference" className="max-h-72 w-full rounded-xl object-contain"/>)}
   <label className="text-sm font-medium">What should your coach look at?<textarea disabled={busy} maxLength={1000} rows={3} value={note} onChange={e=>setNote(e.target.value)} className="mt-2 w-full rounded-xl border border-divider p-3 text-base" placeholder="For example: squat from the side—please check my technique."/></label>
   {busy&&<progress aria-label="Upload progress" value={pct} max={100} className="w-full"/>}<Button type="button" onClick={()=>void send()} disabled={busy}>{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}{busy?`Saving ${pct}%`:"Send to coach"}</Button>
  </>}{error&&<p role="alert" className="text-sm text-status-limited">{error}</p>}{done&&<p role="status" className="flex gap-2 text-sm text-status-optimal"><Check className="h-4 w-4 shrink-0"/>{done}</p>}
 </section>;
}
