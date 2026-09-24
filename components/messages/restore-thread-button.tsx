"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
export function RestoreThreadButton({ clientId }: { clientId: string }) {
  const router=useRouter(); const [saving,setSaving]=useState(false);
  async function restore(){setSaving(true);const r=await fetch(`/api/messages/${clientId}/archive`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({archived:false})});setSaving(false);if(r.ok)router.refresh();}
  return <Button size="sm" variant="secondary" disabled={saving} onClick={restore}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<RotateCcw className="h-4 w-4"/>}Restore</Button>;
}
