export type AppointmentPreflight={status:"ready"|"hold";reason:string|null};
export function appointmentPreflight(startIso:string,durationMinutes:number):AppointmentPreflight{
 const start=Date.parse(startIso);
 if(!Number.isFinite(start)||!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>480)return {status:"hold",reason:"Invalid reviewed appointment"};
 return {status:"ready",reason:null};
}
