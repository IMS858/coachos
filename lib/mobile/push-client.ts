import { createServiceClient } from "@/lib/supabase/server";import { sendIosPush } from "@/lib/mobile/apns";import type { MobilePushKind } from "@/lib/mobile/push";
export async function pushClient(userId:string,event:{kind:MobilePushKind;title:string;body:string;clientId?:string;sessionId?:string;programId?:string}){
 const svc=createServiceClient();const {data,error}=await svc.from("mobile_devices").select("id,push_token").eq("user_id",userId).eq("platform","ios").eq("enabled",true);
 if(error)return {ok:false,reason:"device_lookup_failed",sent:0};
 if(!data?.length)return {ok:true,reason:"no_registered_devices",sent:0};
 let sent=0,failed=0;for(const d of data){const result=await sendIosPush({token:d.push_token,...event});if(result.ok)sent++;else{failed++;if("status" in result&&(result.status===400||result.status===410))await svc.from("mobile_devices").update({enabled:false,updated_at:new Date().toISOString()}).eq("id",d.id);}}
 return {ok:failed===0,sent,failed};
}
