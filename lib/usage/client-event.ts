export const CLIENT_USAGE_EVENTS=["view","watch","book","message","complete"] as const;
export const CLIENT_USAGE_SURFACES=["dashboard","training","fuel","progress","messages","booking","classes","account","other"] as const;
export type ClientUsageEvent=typeof CLIENT_USAGE_EVENTS[number];
export type ClientUsageSurface=typeof CLIENT_USAGE_SURFACES[number];
export const CLIENT_USAGE_LABELS:Record<ClientUsageSurface,string>={dashboard:"Home",training:"Training",fuel:"Fuel",progress:"Progress",messages:"Coach messages",booking:"Booking",classes:"Classes",account:"Account",other:"Other"};
export function clientUsageSurface(pathname:string):ClientUsageSurface{
 const p=(pathname||"").split("?")[0].split("#")[0];
 if((CLIENT_USAGE_SURFACES as readonly string[]).includes(p))return p as ClientUsageSurface;
 if(p==="/dashboard"||p.startsWith("/dashboard/"))return "dashboard";
 if(p.startsWith("/plan")||p.startsWith("/library"))return "training";
 if(p.startsWith("/fuel"))return "fuel";
 if(p.startsWith("/progress"))return "progress";
 if(p.startsWith("/messages"))return "messages";
 if(p.startsWith("/book")||p.startsWith("/sessions"))return "booking";
 if(p.startsWith("/classes"))return "classes";
 if(p.startsWith("/account"))return "account";
 return "other";
}
export function recordClientUsage(event:ClientUsageEvent,surface:ClientUsageSurface){
 if(typeof window==="undefined"||typeof crypto==="undefined"||typeof crypto.randomUUID!=="function")return;
 void fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:crypto.randomUUID(),event,surface}),keepalive:true}).catch(()=>{});
}
