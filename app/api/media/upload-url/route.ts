import {type NextRequest} from "next/server";
import {createServiceClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {authorizeStaffMediaClient,mediaReply} from "@/lib/media/staff-client";
import {parseStaffUpload} from "@/lib/media/staff-upload";
export async function POST(request:NextRequest){
 let input;try{input=parseStaffUpload(await smallJson(request,4096));}catch(cause){return mediaReply({error:cause instanceof Error?cause.message:"Invalid upload details"},400);}
 const auth=await authorizeStaffMediaClient(request,input.clientId);if(auth.error)return auth.error;
 const base=input.base??crypto.randomUUID(),path=input.clientId+"/"+base+(input.poster?"-poster":"")+"."+input.ext;
 const result=await createServiceClient().storage.from("client-media").createSignedUploadUrl(path);
 if(result.error||!result.data)return mediaReply({error:"Upload could not be prepared"},503);
 return mediaReply({path,base,token:result.data.token,signedUrl:result.data.signedUrl});
}
