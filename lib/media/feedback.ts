import {CAPTURE_UUID} from "@/lib/exercises/capture";
export type MediaViewer={id:string;role:string;deleted_at:string|null};
export function mayAccessMedia(viewer:MediaViewer,clientId:string,primaryTrainerId:string|null):boolean{
 if(viewer.deleted_at)return false;
 return viewer.role==="owner"||(viewer.role==="trainer"&&primaryTrainerId===viewer.id)||(viewer.role==="client"&&clientId===viewer.id);
}
export function parseFeedback(value:unknown):string{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid feedback request");
 const body=value as Record<string,unknown>;
 if(Object.keys(body).some(k=>k!=="feedback")||typeof body.feedback!=="string"||body.feedback.length>2000||body.feedback.trim().length<2)throw new Error("Feedback must be 2–2,000 characters.");
 return body.feedback.trim();
}
export function confirmedMediaAction(value:unknown,id:string,action:"review"|"archive"){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Action receipt missing");
 const row=value as Record<string,unknown>,date=action==="review"?row.reviewed_at:row.archived_at;
 if(row.ok!==true||row.id!==id||!CAPTURE_UUID.test(id)||typeof date!=="string"||!Number.isFinite(Date.parse(date))||typeof row.deduped!=="boolean"||(action==="review"&&row.review_status!=="reviewed"))throw new Error("Action receipt invalid");
 return {ok:true,id,deduped:row.deduped,...(action==="review"?{review_status:"reviewed",reviewed_at:date}:{archived_at:date})};
}
