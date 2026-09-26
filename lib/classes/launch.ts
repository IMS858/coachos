/** Authoring exists; booking launch is an independent, explicit release decision. */
export const CLASS_BOOKING_ENABLED = false;
export const CLASS_PHASE = "prelaunch" as const;
export type InventoryEvidence = {state:"available";count:number}|{state:"unavailable";count:null};
export function inventoryEvidence(query:{error:unknown;count:number|null}):InventoryEvidence {
 if(query.error||query.count===null||!Number.isSafeInteger(query.count)||query.count<0)return {state:"unavailable",count:null};
 return {state:"available",count:query.count};
}
export function inventoryLabel(evidence:InventoryEvidence):string{return evidence.state==="unavailable"?"Unavailable":String(evidence.count);}
export const CLASS_LAUNCH_GATES = [
 {key:"publication",title:"Publish the specific class date",detail:"Publishing a template must not automatically release every recurring date. Each occurrence needs a deliberate launch state."},
 {key:"conflicts",title:"Protect coach, room and participant time",detail:"Class and private-session writes must share conflict protection, tested in both directions and under concurrent requests."},
 {key:"seats",title:"Verify seats and waitlist offers",detail:"Capacity, cancellation and promotion need one locked transaction. A waitlist offer is not automatic consent to a booking."},
 {key:"access",title:"Choose class pricing and entitlement",detail:"Decide complimentary, pay-in-person or class access rules explicitly. Class credits never default to private-training packages."},
 {key:"attendance",title:"Review attendance and delivery evidence",detail:"Attendance changes need actual class time, authorized coaches, optimistic concurrency and atomic audit. One class taught is not one payroll session per attendee."},
 {key:"release",title:"Verify the exact release and approve launch",detail:"Hosted migrations, role tests, phone QA and explicit owner launch approval are separate from having source code or configuration records."},
] as const;
export interface ClassParticipation {
 enrollment_id:string;occurrence_id:string;class_name:string;category:string;starts_at:string;ends_at:string;
 enrollment_status:string;class_status:string;attendance_marked_at:string|null;
}
export function participationSummary(rows:ClassParticipation[],asOf:string){
 const now=Date.parse(asOf);if(!Number.isFinite(now))throw new Error("Valid evidence timestamp required.");
 const unique=[...new Map(rows.map(row=>[row.occurrence_id,row])).values()];
 let attended=0,needsReview=0;
 for(const row of unique){
  if(row.enrollment_status!=="attended")continue;
  const start=Date.parse(row.starts_at),end=Date.parse(row.ends_at),marked=row.attendance_marked_at?Date.parse(row.attendance_marked_at):NaN;
  if(row.class_status==="completed"&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end<=now&&Number.isFinite(marked)&&marked>=start&&marked<=now)attended++;
  else needsReview++;
 }
 return {attended,needsReview,loadedOccurrences:unique.length};
}
