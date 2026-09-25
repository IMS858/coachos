import {CAPTURE_UUID} from "@/lib/exercises/capture";
export const COACH_MEDIA_MIME:Record<string,string>={mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"};
export function mediaObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid media request");return value as Record<string,unknown>;}
export function parseStaffUpload(value:unknown){
 const body=mediaObject(value);if(Object.keys(body).some(k=>!["client_id","ext","base","poster"].includes(k)))throw new Error("Unsupported upload fields");
 const clientId=body.client_id,ext=typeof body.ext==="string"?body.ext.toLowerCase():"mp4",base=body.base;
 if(typeof clientId!=="string"||!CAPTURE_UUID.test(clientId)||!Object.hasOwn(COACH_MEDIA_MIME,ext))throw new Error("Choose a client and a supported coaching-media format");
 if(base!==undefined&&(typeof base!=="string"||!CAPTURE_UUID.test(base)))throw new Error("Invalid upload reference");
 if(body.poster!==undefined&&typeof body.poster!=="boolean")throw new Error("Invalid poster option");
 if(body.poster===true&&(!base||!['jpg','jpeg','png','webp'].includes(ext)))throw new Error("A poster must be an image for the same upload reference");
 return {clientId,ext,base:typeof base==="string"?base:null,poster:body.poster===true};
}
export function parseStaffMediaSave(value:unknown){
 const b=mediaObject(value);if(Object.keys(b).some(k=>!["client_id","title","storage_path","poster_path","category","kind","note","duration_seconds"].includes(k)))throw new Error("Unsupported media fields");
 const clientId=b.client_id,path=b.storage_path;
 if(typeof clientId!=="string"||!CAPTURE_UUID.test(clientId)||typeof path!=="string")throw new Error("Valid client and uploaded file required");
 const parts=/^([^/]+)\/([0-9a-f-]+)\.(mp4|mov|webm|jpg|jpeg|png|webp)$/i.exec(path);
 if(!parts||parts[1]!==clientId||!CAPTURE_UUID.test(parts[2]))throw new Error("Uploaded file must belong to this client and this upload reference");
 const ext=parts[3].toLowerCase(),id=parts[2],kind=COACH_MEDIA_MIME[ext].startsWith("video/")?"video":"image";
 if(b.kind!==kind)throw new Error("Media kind does not match its file");
 if(typeof b.title!=="string"||b.title.trim().length<1||b.title.length>200)throw new Error("A title under 200 characters is required");
 if(b.note!=null&&(typeof b.note!=="string"||b.note.length>2000))throw new Error("Keep the note under 2,000 characters");
 if(typeof b.category!=="string"||!["mobility","strength","conditioning","general"].includes(b.category))throw new Error("Invalid coaching category");
 const poster=b.poster_path;if(poster!=null&&(typeof poster!=="string"||!['jpg','jpeg','png','webp'].some(e=>poster===clientId+"/"+id+"-poster."+e)))throw new Error("Poster must belong to the same upload");
 const duration=b.duration_seconds;if(duration!=null&&(typeof duration!=="number"||!Number.isFinite(duration)||duration<0||duration>7200))throw new Error("Invalid media duration");
 return {id,client_id:clientId,storage_path:path,poster_path:typeof poster==="string"?poster:null,title:b.title.trim(),note:typeof b.note==="string"?b.note.trim()||null:null,kind,category:b.category,duration_seconds:typeof duration==="number"?Math.round(duration):null,ext};
}
