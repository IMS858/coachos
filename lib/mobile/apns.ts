import crypto from "node:crypto";
import { mobilePushPayload, type MobilePushKind } from "@/lib/mobile/push";

type PushInput={token:string;kind:MobilePushKind;title:string;body:string;clientId?:string;sessionId?:string;programId?:string};
function b64url(v:string|Buffer){return Buffer.from(v).toString("base64url");}
function apnsJwt(){const team=process.env.APPLE_TEAM_ID,keyId=process.env.APPLE_KEY_ID,raw=process.env.APPLE_APNS_PRIVATE_KEY;if(!team||!keyId||!raw)return null;const key=raw.replace(/\\n/g,"\n");const header=b64url(JSON.stringify({alg:"ES256",kid:keyId}));const payload=b64url(JSON.stringify({iss:team,iat:Math.floor(Date.now()/1000)}));const input=`${header}.${payload}`;const sig=crypto.sign("sha256",Buffer.from(input),{key,dsaEncoding:"ieee-p1363"});return `${input}.${b64url(sig)}`;}
export async function sendIosPush(input:PushInput){
 const jwt=apnsJwt();const topic=process.env.APPLE_BUNDLE_ID||"com.imsfitness.app";if(!jwt)return {ok:false as const,reason:"apns_not_configured"};
 const host=process.env.APPLE_APNS_ENV==="sandbox"?"https://api.sandbox.push.apple.com":"https://api.push.apple.com";
 try{const res=await fetch(`${host}/3/device/${encodeURIComponent(input.token)}`,{method:"POST",headers:{authorization:`bearer ${jwt}`,"apns-topic":topic,"apns-push-type":"alert","apns-priority":"10","content-type":"application/json"},body:JSON.stringify(mobilePushPayload(input)),cache:"no-store"});const text=await res.text();return res.ok?{ok:true as const}:{ok:false as const,status:res.status,reason:text||"apns_rejected"};}catch{return {ok:false as const,reason:"apns_unreachable"};}
}
