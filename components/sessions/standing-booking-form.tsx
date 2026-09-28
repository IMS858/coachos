"use client";
import {NewSessionForm} from "./new-session-form";
export function StandingBookingForm({clients,trainers,currentUserId,asOf}:{clients:{id:string;full_name:string;email:string}[];trainers:{id:string;full_name:string}[];currentUserId:string;asOf:string}){
 return <NewSessionForm initialMode="schedule" initialRepeat showModeToggle={false} clients={clients.map(c=>({...c,active_plans:[]}))} trainers={trainers} currentUserId={currentUserId} asOf={asOf}/>;
}
