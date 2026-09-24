import { NextResponse } from "next/server";
import { IMS_MOBILE } from "@/lib/mobile/app-contract";
export async function GET(){
 return NextResponse.json({
  applinks:{apps:[],details:[{appID:`TEAMID.${IMS_MOBILE.bundleId}`,paths:["/dashboard*","/programs*","/workouts/log*","/book*","/progress*","/messages*","/account*"]}]}
 },{headers:{"Cache-Control":"public, max-age=300","Content-Type":"application/json"}});
}
