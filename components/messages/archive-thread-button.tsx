"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ArchiveThreadButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function archive() {
    setSaving(true); setError(null);
    const res=await fetch(`/api/messages/${clientId}/archive`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({archived:true})});
    setSaving(false);
    if(!res.ok){setError("Could not clear this conversation from the inbox.");return;}
    router.push("/messages"); router.refresh();
  }
  return <div className="flex flex-col items-end gap-1"><Button variant="secondary" size="sm" onClick={archive} disabled={saving}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Archive className="h-4 w-4"/>}Clear from inbox</Button>{error&&<span className="text-xs text-status-limited">{error}</span>}</div>;
}
