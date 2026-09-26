"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
export function LeadTouchButton({ leadId, contacted }: { leadId: string; contacted: boolean }) {
 const router=useRouter(); const [saving,setSaving]=useState(false); const [error,setError]=useState<string|null>(null);
 async function touch(){setSaving(true);setError(null);const r=await fetch(`/api/leads/${leadId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage:"contacted"})});setSaving(false);if(!r.ok){setError("Could not update lead.");return;}router.refresh();}
 if(contacted)return <span className="text-[11px] text-cream-faint">Contacted</span>;
 return <div className="flex flex-col items-end gap-1"><Button size="sm" variant="secondary" onClick={touch} disabled={saving}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}Mark contacted</Button>{error&&<span className="text-[10px] text-status-limited">{error}</span>}</div>;
}
