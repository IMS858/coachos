import { safeMobileNextPath } from "@/lib/mobile/app-contract";

export type MobilePushKind = "coach_message"|"booking_confirmed"|"booking_declined"|"session_reminder"|"workout_ready";

export function mobilePushTarget(kind:MobilePushKind,ids:{clientId?:string;sessionId?:string;programId?:string}={}):string {
 switch(kind){
  case "coach_message": return safeMobileNextPath(ids.clientId ? `/messages/${ids.clientId}` : "/messages");
  case "booking_confirmed":
  case "booking_declined":
  case "session_reminder": return safeMobileNextPath(ids.sessionId ? `/sessions/${ids.sessionId}` : "/book");
  case "workout_ready": return safeMobileNextPath(ids.programId ? `/programs/${ids.programId}` : "/programs");
 }
}
export function mobilePushPayload(input:{kind:MobilePushKind;title:string;body:string;clientId?:string;sessionId?:string;programId?:string}){
 const target=mobilePushTarget(input.kind,input);
 return {aps:{alert:{title:input.title,body:input.body},sound:"default"},kind:input.kind,target};
}
