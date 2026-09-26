"use client";
import {useEffect,useRef,useState} from "react";
import {Check,Loader2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {parseAccountDetails,confirmProfileReceipt} from "@/lib/account/profile-contract";
export function AccountProfileForm({initialName,initialPhone,email}:{initialName:string;initialPhone:string;email:string}){
  const lock=useRef(false);
  const [name,setName]=useState(initialName),[phone,setPhone]=useState(initialPhone),[baseline,setBaseline]=useState({name:initialName,phone:initialPhone});
  const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState<string|null>(null);
  const dirty=name!==baseline.name||phone!==baseline.phone;
  useEffect(()=>{
    if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return ()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  async function save(event:React.FormEvent){
    event.preventDefault();if(lock.current)return;
    let details;try{details=parseAccountDetails({full_name:name,phone});}catch(e){setError(e instanceof Error?e.message:"Check your details.");return;}
    lock.current=true;setBusy(true);setSaved(false);setError(null);
    try{
      const response=await fetch("/api/account",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({full_name:details.full_name,phone:details.phone??""})});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error||"Your changes were not confirmed saved.");
      const confirmed=confirmProfileReceipt(data,details);
      setName(confirmed.full_name);setPhone(confirmed.phone??"");setBaseline({name:confirmed.full_name,phone:confirmed.phone??""});setSaved(true);
    }catch(e){setError(e instanceof Error?e.message:"The connection failed. Your edits are still here.");}
    finally{lock.current=false;setBusy(false);}
  }
  return <form onSubmit={e=>void save(e)} className="space-y-3"><fieldset disabled={busy} className="space-y-3">
    <label htmlFor="acct-name" className="block text-sm font-medium">Name<Input id="acct-name" autoComplete="name" maxLength={120} required value={name} onChange={e=>{setName(e.target.value);setSaved(false);}} className="min-h-12 text-base"/></label>
    <label htmlFor="acct-phone" className="block text-sm font-medium">Phone<Input id="acct-phone" type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={e=>{setPhone(e.target.value);setSaved(false);}} className="min-h-12 text-base"/></label>
    <div><p className="text-sm font-medium">Sign-in email</p><p className="mt-1 break-all rounded-xl bg-surface-soft p-3 text-sm text-cream-dim">{email}</p><p className="mt-1 text-xs text-cream-faint">Ask IMS to change your sign-in address. This form only changes your name and phone.</p></div>
  </fieldset>
  {error&&<p role="alert" className="text-sm text-status-limited">{error}</p>}
  <Button type="submit" disabled={busy||!dirty||!name.trim()} className="min-h-12">{busy&&<Loader2 className="h-4 w-4 animate-spin"/>}Save changes</Button>
  {saved&&<p role="status" className="flex items-center gap-2 text-sm text-status-optimal"><Check className="h-4 w-4"/>Your changes are confirmed saved.</p>}
  </form>;
}
