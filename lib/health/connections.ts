export type WearableProvider="apple_health"|"whoop"|"garmin"|"fitbit"|"oura"|"hume"|"coros"|"withings"|"other";
export type ConnectionStatus="not_connected"|"pending"|"connected"|"stale"|"revoked"|"error";
export type DataConnection={id:string;client_id:string;provider:WearableProvider;transport:string;status:ConnectionStatus;granted_categories:string[];last_synced_at:string|null;connected_at:string|null};
export const PROVIDERS:{id:WearableProvider;label:string;route:"native"|"cloud"|"bridge";description:string}[]=[
 {id:"apple_health",label:"Apple Health / Watch",route:"native",description:"Native iPhone connection for activity, sleep, workouts and weight you choose to share."},
 {id:"whoop",label:"WHOOP",route:"cloud",description:"Cloud wearable connection for WHOOP-provided recovery, sleep, strain and workouts."},
 {id:"garmin",label:"Garmin",route:"cloud",description:"Cloud wearable connection for Garmin activity, sleep, body and daily evidence."},
 {id:"fitbit",label:"Fitbit",route:"cloud",description:"Cloud wearable connection for Fitbit activity, sleep, body and daily evidence."},
 {id:"oura",label:"Oura",route:"cloud",description:"Cloud wearable connection for sleep, activity and provider metrics."},
 {id:"hume",label:"Hume",route:"bridge",description:"Use Hume through Apple Health when available; preserve Hume as the source of weight/body trend evidence."},
 {id:"coros",label:"COROS",route:"cloud",description:"Cloud wearable connection for training and recovery evidence."},
 {id:"withings",label:"Withings",route:"cloud",description:"Cloud connection for weight/body and supported health evidence."},
];
export const CATEGORY_LABELS:Record<string,string>={steps:"Steps",active_energy:"Active energy",exercise_minutes:"Exercise",sleep:"Sleep",weight:"Weight",workouts:"Workouts",hrv:"HRV",resting_hr:"Resting HR",provider_recovery:"Provider recovery",provider_strain:"Provider strain"};
export function connectionState(connection:DataConnection|undefined,now=Date.now()){
 if(!connection)return{label:"Not connected",current:false};
 if(connection.status!=="connected")return{label:connection.status.replaceAll("_"," "),current:false};
 const age=connection.last_synced_at?now-Date.parse(connection.last_synced_at):Infinity;
 return Number.isFinite(age)&&age<=72*3600000?{label:"Connected · current",current:true}:{label:"Connected · stale",current:false};
}
