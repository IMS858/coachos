"use client";
import {useEffect,useRef} from "react";
import {usePathname} from "next/navigation";
import {clientUsageSurface,recordClientUsage} from "@/lib/usage/client-event";

/** Client-only, surface-level telemetry. Raw URLs and identifiers never leave the browser. */
export function UsageTracker(){
 const pathname=usePathname(),seen=useRef<Map<string,number>>(new Map());
 useEffect(()=>{if(!pathname)return;const surface=clientUsageSurface(pathname),now=Date.now(),last=seen.current.get(surface)??0;if(now-last<60_000)return;seen.current.set(surface,now);recordClientUsage("view",surface);},[pathname]);
 return null;
}
